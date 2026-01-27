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
import { TelegramService } from '../../telegram/telegram.service';
import { CreateCollectionDto } from './dto/create-collection.dto';
import { ReceiveCollectionDto } from './dto/receive-collection.dto';
import { EditCollectionDto } from './dto/edit-collection.dto';
import { BulkCreateCollectionDto } from './dto/bulk-create-collection.dto';
import { CollectionQueryDto } from './dto/collection-query.dto';

@Injectable()
export class CollectionsService {
  private readonly logger = new Logger(CollectionsService.name);
  private readonly duplicateCheckMinutes: number;

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
    await this.machinesService.findByIdOrFail(dto.machineId);

    // Check for duplicates (same machine within configured time window)
    const windowMs = this.duplicateCheckMinutes * 60 * 1000;
    const windowBefore = new Date(dto.collectedAt.getTime() - windowMs);
    const windowAfter = new Date(dto.collectedAt.getTime() + windowMs);

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

    const collection = this.collectionRepository.create({
      machineId: dto.machineId,
      operatorId,
      collectedAt: dto.collectedAt,
      latitude: dto.latitude,
      longitude: dto.longitude,
      source: dto.source || CollectionSource.REALTIME,
      notes: dto.notes,
    });

    const saved = await this.collectionRepository.save(collection);
    await this.invalidateReportsCache();

    // Notify managers about new collection (async, don't block)
    this.notifyManagersAsync(saved.id).catch((err) => {
      this.logger.warn(`Failed to notify managers: ${err.message}`);
    });

    return saved;
  }

  /**
   * Notify managers about a new collection asynchronously
   */
  private async notifyManagersAsync(collectionId: string): Promise<void> {
    const collection = await this.findByIdOrFail(collectionId);
    if (collection.machine && collection.operator) {
      await this.telegramService.notifyManagersAboutNewCollection(
        collection.machine.name,
        collection.operator.name,
        collection.collectedAt,
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

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      for (let i = 0; i < dto.collections.length; i++) {
        const item = dto.collections[i];
        try {
          // Validate machine exists
          let machine;
          if (item.machineId) {
            machine = await this.machinesService.findById(item.machineId);
          } else if (item.machineCode) {
            machine = await this.machinesService.findByCode(item.machineCode);
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
      qb.andWhere('collection.collectedAt >= :from', { from: query.from });
    }

    if (query.to) {
      qb.andWhere('collection.collectedAt <= :to', { to: query.to });
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
      // First lock the row without relations
      await queryRunner.manager.findOne(Collection, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });

      // Now load with relations
      const collection = await queryRunner.manager.findOne(Collection, {
        where: { id },
        relations: ['machine', 'operator', 'manager'],
      });

      if (!collection) {
        throw new NotFoundException('Collection not found');
      }
      if (collection.status !== CollectionStatus.RECEIVED) {
        throw new BadRequestException('Can only edit received collections');
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
      const collection = await queryRunner.manager.findOne(Collection, {
        where: { id },
        relations: ['machine', 'operator', 'manager'],
        lock: { mode: 'pessimistic_write' },
      });

      if (!collection) {
        throw new NotFoundException('Collection not found');
      }
      if (collection.status === CollectionStatus.CANCELLED) {
        throw new BadRequestException('Collection is already cancelled');
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

  async getHistory(id: string): Promise<CollectionHistory[]> {
    return this.historyRepository.find({
      where: { collectionId: id },
      relations: ['changedBy'],
      order: { createdAt: 'DESC' },
    });
  }

  async findByOperator(operatorId: string, date?: Date): Promise<Collection[]> {
    const query = this.collectionRepository
      .createQueryBuilder('collection')
      .leftJoinAndSelect('collection.machine', 'machine')
      .where('collection.operatorId = :operatorId', { operatorId });

    if (date) {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      query.andWhere('collection.collectedAt BETWEEN :start AND :end', {
        start: startOfDay,
        end: endOfDay,
      });
    }

    return query.orderBy('collection.collectedAt', 'DESC').getMany();
  }

  async checkDuplicate(machineId: string, collectedAt: Date): Promise<Collection | null> {
    const windowMs = this.duplicateCheckMinutes * 60 * 1000;
    const windowBefore = new Date(collectedAt.getTime() - windowMs);
    const windowAfter = new Date(collectedAt.getTime() + windowMs);

    return this.collectionRepository.findOne({
      where: {
        machineId,
        collectedAt: Between(windowBefore, windowAfter),
      },
      relations: ['machine', 'operator'],
    });
  }
}
