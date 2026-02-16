import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
  Logger,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository, Between, DataSource } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { Collection, CollectionStatus, CollectionSource } from './entities/collection.entity';
import { CollectionHistory } from './entities/collection-history.entity';
import { MachinesService } from '../machines/machines.service';
import { Machine } from '../machines/entities/machine.entity';
import { TelegramService } from '../../telegram/telegram.service';
import { CreateCollectionDto } from './dto/create-collection.dto';
import { ReceiveCollectionDto } from './dto/receive-collection.dto';
import { EditCollectionDto } from './dto/edit-collection.dto';
import { BulkCreateCollectionDto } from './dto/bulk-create-collection.dto';
import { BulkCancelCollectionDto } from './dto/bulk-cancel-collection.dto';
import { CollectionQueryDto } from './dto/collection-query.dto';
import {
  startOfDayTashkent,
  endOfDayTashkent,
} from '../../common/utils/timezone';

// Distance threshold in meters — collections beyond this are flagged as suspicious
const DISTANCE_WARNING_THRESHOLD = 50;

@Injectable()
export class CollectionsService {
  private readonly logger = new Logger(CollectionsService.name);
  private readonly duplicateCheckMinutes: number;

  /**
   * Calculate distance between two GPS coordinates using Haversine formula
   * @returns distance in meters
   */
  private calculateDistanceMeters(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const R = 6371000; // Earth's radius in meters
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  constructor(
    @InjectRepository(Collection)
    private readonly collectionRepository: Repository<Collection>,
    @InjectRepository(CollectionHistory)
    private readonly historyRepository: Repository<CollectionHistory>,
    private readonly machinesService: MachinesService,
    @Inject(forwardRef(() => TelegramService))
    private readonly telegramService: TelegramService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
  ) {
    this.duplicateCheckMinutes = this.configService.get<number>('app.duplicateCheckMinutes') || 30;
  }

  // Invalidate reports cache when collection data changes
  private async invalidateReportsCache(): Promise<void> {
    const cacheKeys = [
      'report:summary',
      'report:by-machine',
      'report:by-date',
      'report:by-operator',
      'report:today-summary',
    ];
    for (const key of cacheKeys) {
      await this.cacheManager.del(key);
    }
  }

  async create(dto: CreateCollectionDto, operatorId: string): Promise<Collection> {
    // Verify machine exists
    const machine = await this.machinesService.findByIdOrFail(dto.machineId);

    // Ensure collectedAt is a Date object
    const collectedAt = dto.collectedAt instanceof Date ? dto.collectedAt : new Date(dto.collectedAt);

    // Check for duplicates (same machine within configured time window)
    const windowMs = this.duplicateCheckMinutes * 60 * 1000;
    const windowBefore = new Date(collectedAt.getTime() - windowMs);
    const windowAfter = new Date(collectedAt.getTime() + windowMs);

    const duplicate = await this.collectionRepository.findOne({
      where: {
        machineId: dto.machineId,
        collectedAt: Between(windowBefore, windowAfter),
        status: CollectionStatus.COLLECTED,
      },
    });

    if (duplicate && !dto.skipDuplicateCheck) {
      throw new BadRequestException({
        code: 'DUPLICATE_COLLECTION',
        message: `Collection for this machine exists within ${this.duplicateCheckMinutes} minutes`,
        existingCollectionId: duplicate.id,
      });
    }

    // Calculate distance between operator's GPS and machine location
    let distanceFromMachine: number | undefined;
    if (
      dto.latitude != null && dto.longitude != null &&
      machine.latitude != null && machine.longitude != null
    ) {
      distanceFromMachine = Math.round(
        this.calculateDistanceMeters(
          dto.latitude, dto.longitude,
          Number(machine.latitude), Number(machine.longitude),
        ) * 100,
      ) / 100; // round to 2 decimal places

      if (distanceFromMachine > DISTANCE_WARNING_THRESHOLD) {
        this.logger.warn(
          `Collection distance warning: operator ${operatorId} is ${distanceFromMachine}m from machine ${dto.machineId} (threshold: ${DISTANCE_WARNING_THRESHOLD}m)`,
        );
      }
    }

    const collection = this.collectionRepository.create({
      machineId: dto.machineId,
      operatorId,
      collectedAt,
      latitude: dto.latitude,
      longitude: dto.longitude,
      distanceFromMachine,
      source: dto.source || CollectionSource.REALTIME,
      notes: dto.notes,
    });

    const saved = await this.collectionRepository.save(collection);
    await this.invalidateReportsCache();

    // Notify managers about new collection (async, don't block)
    this.notifyManagersAsync(saved.id, distanceFromMachine).catch((err) => {
      this.logger.warn(`Failed to notify managers: ${err.message}`);
    });

    return saved;
  }

  /**
   * Notify managers about a new collection asynchronously
   */
  private async notifyManagersAsync(collectionId: string, distanceFromMachine?: number): Promise<void> {
    const collection = await this.findByIdOrFail(collectionId);
    if (collection.machine && collection.operator) {
      await this.telegramService.notifyManagersAboutNewCollection(
        collection.machine.name,
        collection.operator.name,
        collection.collectedAt,
        distanceFromMachine,
      );
    }
  }

  async bulkCreate(dto: BulkCreateCollectionDto, operatorId: string): Promise<{
    created: number;
    failed: number;
    errors: { index: number; error: string }[];
    collections: Collection[];
  }> {
    const results = {
      created: 0,
      failed: 0,
      errors: [] as { index: number; error: string }[],
      collections: [] as Collection[],
    };

    // Pre-load all machines to avoid N+1 queries
    const machineIds = [...new Set(dto.collections.map(c => c.machineId).filter(Boolean))] as string[];
    const machineCodes = [...new Set(dto.collections.map(c => c.machineCode).filter(Boolean))] as string[];

    const machineMap = new Map<string, Machine>();
    const codeToMachineMap = new Map<string, Machine>();

    // Batch load machines by ID (parallel)
    if (machineIds.length > 0) {
      const machines = await Promise.all(
        machineIds.map(id => this.machinesService.findById(id)),
      );
      machineIds.forEach((id, idx) => {
        if (machines[idx]) {
          machineMap.set(id, machines[idx]);
        }
      });
    }

    // Batch load machines by code (parallel)
    if (machineCodes.length > 0) {
      const machines = await Promise.all(
        machineCodes.map(code => this.machinesService.findByCode(code)),
      );
      machineCodes.forEach((code, idx) => {
        if (machines[idx]) {
          codeToMachineMap.set(code, machines[idx]);
        }
      });
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      for (let i = 0; i < dto.collections.length; i++) {
        const item = dto.collections[i];
        try {
          // Look up machine from pre-loaded cache
          let machine;
          if (item.machineId) {
            machine = machineMap.get(item.machineId);
          } else if (item.machineCode) {
            machine = codeToMachineMap.get(item.machineCode);
          }

          if (!machine) {
            throw new Error('Machine not found');
          }

          const collection = queryRunner.manager.create(Collection, {
            machineId: machine.id,
            operatorId,
            collectedAt: new Date(item.collectedAt),
            amount: item.amount,
            status: item.amount ? CollectionStatus.RECEIVED : CollectionStatus.COLLECTED,
            receivedAt: item.amount ? new Date() : undefined,
            managerId: item.amount ? operatorId : undefined,
            source: dto.source || CollectionSource.MANUAL_HISTORY,
            notes: item.notes,
            locationId: item.locationId,
          });

          const saved = await queryRunner.manager.save(collection);
          results.collections.push(saved);
          results.created++;
        } catch (error: unknown) {
          results.failed++;
          const message = error instanceof Error ? error.message : 'Unknown error';
          results.errors.push({ index: i, error: message });
        }
      }

      await queryRunner.commitTransaction();

      if (results.created > 0) {
        await this.invalidateReportsCache();
      }
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }

    return results;
  }

  async findAll(query: CollectionQueryDto): Promise<{ data: Collection[]; total: number }> {
    const qb = this.collectionRepository
      .createQueryBuilder('collection')
      .leftJoinAndSelect('collection.machine', 'machine')
      .leftJoinAndSelect('collection.operator', 'operator')
      .leftJoinAndSelect('collection.manager', 'manager');

    // Filters
    if (query.status) {
      qb.andWhere('collection.status = :status', { status: query.status });
    }

    if (query.machineId) {
      qb.andWhere('collection.machineId = :machineId', { machineId: query.machineId });
    }

    if (query.operatorId) {
      qb.andWhere('collection.operatorId = :operatorId', { operatorId: query.operatorId });
    }

    if (query.source) {
      qb.andWhere('collection.source = :source', { source: query.source });
    }

    if (query.from) {
      qb.andWhere('collection.collectedAt >= :from', { from: startOfDayTashkent(query.from) });
    }

    if (query.to) {
      qb.andWhere('collection.collectedAt <= :to', { to: endOfDayTashkent(query.to) });
    }

    // Sorting - whitelist allowed fields to prevent SQL injection
    const allowedSortFields = ['collectedAt', 'amount', 'status', 'receivedAt', 'createdAt'];
    const sortBy = query.sortBy && allowedSortFields.includes(query.sortBy) ? query.sortBy : 'collectedAt';
    const sortOrder = query.sortOrder === 'ASC' ? 'ASC' : 'DESC';
    qb.orderBy(`collection.${sortBy}`, sortOrder);

    // Pagination
    const page = query.page || 1;
    const limit = query.limit || 20;
    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();

    return { data, total };
  }

  async findPending(): Promise<Collection[]> {
    return this.collectionRepository.find({
      where: { status: CollectionStatus.COLLECTED },
      relations: ['machine', 'operator'],
      order: { collectedAt: 'DESC' },
    });
  }

  async findById(id: string): Promise<Collection | null> {
    return this.collectionRepository.findOne({
      where: { id },
      relations: ['machine', 'operator', 'manager'],
    });
  }

  async findByIdOrFail(id: string): Promise<Collection> {
    const collection = await this.findById(id);
    if (!collection) {
      throw new NotFoundException('Collection not found');
    }
    return collection;
  }

  async receive(id: string, managerId: string, dto: ReceiveCollectionDto): Promise<Collection> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // First lock the row without relations (FOR UPDATE doesn't work with LEFT JOIN)
      const lockedCollection = await queryRunner.manager.findOne(Collection, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });

      if (!lockedCollection) {
        throw new NotFoundException('Collection not found');
      }
      if (lockedCollection.status !== CollectionStatus.COLLECTED) {
        throw new BadRequestException('Collection is not in collected status');
      }

      // Now load with relations for the response
      const collection = await queryRunner.manager.findOne(Collection, {
        where: { id },
        relations: ['machine', 'operator', 'manager'],
      });

      if (!collection) {
        throw new NotFoundException('Collection not found');
      }

      // Store old values for audit logging
      const oldStatus = collection.status;
      const oldAmount = collection.amount;

      collection.managerId = managerId;
      collection.amount = dto.amount;
      collection.receivedAt = new Date();
      collection.status = CollectionStatus.RECEIVED;
      if (dto.notes) {
        collection.notes = dto.notes;
      }

      const saved = await queryRunner.manager.save(collection);

      // Create audit records for receive operation
      const historyStatus = queryRunner.manager.create(CollectionHistory, {
        collectionId: id,
        changedById: managerId,
        fieldName: 'status',
        oldValue: oldStatus,
        newValue: CollectionStatus.RECEIVED,
        reason: 'Collection received by manager',
      });
      await queryRunner.manager.save(historyStatus);

      const historyAmount = queryRunner.manager.create(CollectionHistory, {
        collectionId: id,
        changedById: managerId,
        fieldName: 'amount',
        oldValue: oldAmount?.toString() || undefined,
        newValue: dto.amount.toString(),
        reason: 'Initial amount set on receive',
      });
      await queryRunner.manager.save(historyAmount);

      await queryRunner.commitTransaction();
      await this.invalidateReportsCache();
      return saved;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async edit(id: string, userId: string, dto: EditCollectionDto): Promise<Collection> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Lock the row first, then verify status before loading relations
      const lockedCollection = await queryRunner.manager.findOne(Collection, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });

      if (!lockedCollection) {
        throw new NotFoundException('Collection not found');
      }
      if (lockedCollection.status !== CollectionStatus.RECEIVED) {
        throw new BadRequestException('Can only edit received collections');
      }

      // Now load with relations for the response
      const collection = await queryRunner.manager.findOne(Collection, {
        where: { id },
        relations: ['machine', 'operator', 'manager'],
      });

      if (!collection) {
        throw new NotFoundException('Collection not found');
      }

      // Log history within transaction
      if (dto.amount !== undefined && dto.amount !== collection.amount) {
        const history = queryRunner.manager.create(CollectionHistory, {
          collectionId: id,
          changedById: userId,
          fieldName: 'amount',
          oldValue: collection.amount?.toString(),
          newValue: dto.amount.toString(),
          reason: dto.reason,
        });
        await queryRunner.manager.save(history);
        collection.amount = dto.amount;
      }

      // Update notes if provided
      if (dto.notes !== undefined && dto.notes !== collection.notes) {
        const notesHistory = queryRunner.manager.create(CollectionHistory, {
          collectionId: id,
          changedById: userId,
          fieldName: 'notes',
          oldValue: collection.notes || '',
          newValue: dto.notes,
          reason: dto.reason,
        });
        await queryRunner.manager.save(notesHistory);
        collection.notes = dto.notes;
      }

      const saved = await queryRunner.manager.save(collection);
      await queryRunner.commitTransaction();
      await this.invalidateReportsCache();
      return saved;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async cancel(id: string, userId: string, reason?: string): Promise<Collection> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // First lock the row without relations (FOR UPDATE doesn't work with LEFT JOIN)
      const lockedCollection = await queryRunner.manager.findOne(Collection, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });

      if (!lockedCollection) {
        throw new NotFoundException('Collection not found');
      }
      if (lockedCollection.status === CollectionStatus.CANCELLED) {
        throw new BadRequestException('Collection is already cancelled');
      }

      // Now load with relations for the response
      const collection = await queryRunner.manager.findOne(Collection, {
        where: { id },
        relations: ['machine', 'operator', 'manager'],
      });

      if (!collection) {
        throw new NotFoundException('Collection not found');
      }

      // Log history within transaction
      const history = queryRunner.manager.create(CollectionHistory, {
        collectionId: id,
        changedById: userId,
        fieldName: 'status',
        oldValue: collection.status,
        newValue: CollectionStatus.CANCELLED,
        reason: reason || 'Cancelled by user',
      });
      await queryRunner.manager.save(history);

      collection.status = CollectionStatus.CANCELLED;

      const saved = await queryRunner.manager.save(collection);
      await queryRunner.commitTransaction();
      await this.invalidateReportsCache();
      return saved;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async bulkCancel(
    dto: BulkCancelCollectionDto,
    userId: string,
  ): Promise<{
    cancelled: number;
    failed: number;
    errors: { id: string; error: string }[];
    total: number;
  }> {
    // Safety check: when using filters, at least one filter must be specified
    // to prevent accidentally cancelling ALL collections
    if (dto.useFilters) {
      const hasAnyFilter = dto.status || dto.machineId || dto.operatorId || dto.source || dto.from || dto.to;
      if (!hasAnyFilter) {
        throw new BadRequestException('At least one filter must be specified when using useFilters');
      }
    }

    const results = {
      cancelled: 0,
      failed: 0,
      errors: [] as { id: string; error: string }[],
      total: 0,
    };

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      let collectionIds: string[];

      if (dto.useFilters) {
        const qb = queryRunner.manager
          .createQueryBuilder(Collection, 'collection')
          .select('collection.id');

        qb.andWhere('collection.status != :cancelledStatus', {
          cancelledStatus: CollectionStatus.CANCELLED,
        });

        if (dto.status) {
          qb.andWhere('collection.status = :status', { status: dto.status });
        }
        if (dto.machineId) {
          qb.andWhere('collection.machineId = :machineId', { machineId: dto.machineId });
        }
        if (dto.operatorId) {
          qb.andWhere('collection.operatorId = :operatorId', { operatorId: dto.operatorId });
        }
        if (dto.source) {
          qb.andWhere('collection.source = :source', { source: dto.source });
        }
        if (dto.from) {
          qb.andWhere('collection.collectedAt >= :from', { from: startOfDayTashkent(dto.from) });
        }
        if (dto.to) {
          qb.andWhere('collection.collectedAt <= :to', { to: endOfDayTashkent(dto.to) });
        }

        const rows = await qb.getRawMany();
        collectionIds = rows.map((r: { collection_id: string }) => r.collection_id);
      } else {
        collectionIds = dto.ids || [];
      }

      results.total = collectionIds.length;

      if (collectionIds.length === 0) {
        await queryRunner.commitTransaction();
        return results;
      }

      for (const id of collectionIds) {
        try {
          const collection = await queryRunner.manager.findOne(Collection, {
            where: { id },
            lock: { mode: 'pessimistic_write' },
          });

          if (!collection) {
            results.failed++;
            results.errors.push({ id, error: 'Collection not found' });
            continue;
          }

          if (collection.status === CollectionStatus.CANCELLED) {
            results.failed++;
            results.errors.push({ id, error: 'Already cancelled' });
            continue;
          }

          const history = queryRunner.manager.create(CollectionHistory, {
            collectionId: id,
            changedById: userId,
            fieldName: 'status',
            oldValue: collection.status,
            newValue: CollectionStatus.CANCELLED,
            reason: dto.reason || 'Bulk cancellation',
          });
          await queryRunner.manager.save(history);

          collection.status = CollectionStatus.CANCELLED;
          await queryRunner.manager.save(collection);

          results.cancelled++;
        } catch (error: unknown) {
          results.failed++;
          const message = error instanceof Error ? error.message : 'Unknown error';
          results.errors.push({ id, error: message });
        }
      }

      await queryRunner.commitTransaction();

      if (results.cancelled > 0) {
        await this.invalidateReportsCache();
      }
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }

    return results;
  }

  async remove(id: string, userId: string): Promise<{ success: boolean }> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const collection = await queryRunner.manager.findOne(Collection, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });

      if (!collection) {
        throw new NotFoundException('Collection not found');
      }

      // Log deletion in history before removing
      const history = queryRunner.manager.create(CollectionHistory, {
        collectionId: id,
        changedById: userId,
        fieldName: 'status',
        oldValue: collection.status,
        newValue: 'deleted',
        reason: 'Deleted by admin',
      });
      await queryRunner.manager.save(history);

      // Delete history records first (FK constraint), then collection
      await queryRunner.manager.delete(CollectionHistory, { collectionId: id });
      await queryRunner.manager.remove(collection);

      await queryRunner.commitTransaction();
      await this.invalidateReportsCache();
      return { success: true };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async getHistory(id: string): Promise<CollectionHistory[]> {
    return this.historyRepository.find({
      where: { collectionId: id },
      relations: ['changedBy'],
      order: { createdAt: 'DESC' },
    });
  }

  async countByMachine(machineId: string): Promise<number> {
    return this.collectionRepository.count({ where: { machineId } });
  }

  async findByOperator(operatorId: string, date?: Date): Promise<Collection[]> {
    const query = this.collectionRepository
      .createQueryBuilder('collection')
      .leftJoinAndSelect('collection.machine', 'machine')
      .where('collection.operatorId = :operatorId', { operatorId });

    if (date) {
      // Convert date to Tashkent day boundaries in UTC
      const dateStr = date.toISOString().split('T')[0];
      const start = startOfDayTashkent(dateStr);
      const end = endOfDayTashkent(dateStr);

      query.andWhere('collection.collectedAt BETWEEN :start AND :end', {
        start,
        end,
      });
    }

    return query.orderBy('collection.collectedAt', 'DESC').getMany();
  }

  async checkDuplicate(machineId: string, collectedAt: Date): Promise<Collection | null> {
    const windowMs = this.duplicateCheckMinutes * 60 * 1000;
    const windowBefore = new Date(collectedAt.getTime() - windowMs);
    const windowAfter = new Date(collectedAt.getTime() + windowMs);

    return this.collectionRepository
      .createQueryBuilder('collection')
      .leftJoinAndSelect('collection.machine', 'machine')
      .leftJoinAndSelect('collection.operator', 'operator')
      .where('collection.machineId = :machineId', { machineId })
      .andWhere('collection.collectedAt BETWEEN :windowBefore AND :windowAfter', {
        windowBefore,
        windowAfter,
      })
      .andWhere('collection.status != :cancelled', {
        cancelled: CollectionStatus.CANCELLED,
      })
      .getOne();
  }
}
