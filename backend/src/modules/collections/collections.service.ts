import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, LessThan, MoreThan } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { Collection, CollectionStatus, CollectionSource } from './entities/collection.entity';
import { CollectionHistory } from './entities/collection-history.entity';
import { MachinesService } from '../machines/machines.service';
import { CreateCollectionDto } from './dto/create-collection.dto';
import { ReceiveCollectionDto } from './dto/receive-collection.dto';
import { EditCollectionDto } from './dto/edit-collection.dto';
import { BulkCreateCollectionDto } from './dto/bulk-create-collection.dto';
import { CollectionQueryDto } from './dto/collection-query.dto';

@Injectable()
export class CollectionsService {
  constructor(
    @InjectRepository(Collection)
    private readonly collectionRepository: Repository<Collection>,
    @InjectRepository(CollectionHistory)
    private readonly historyRepository: Repository<CollectionHistory>,
    private readonly machinesService: MachinesService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

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

    // Check for duplicates (same machine within 30 minutes)
    const thirtyMinutesAgo = new Date(dto.collectedAt.getTime() - 30 * 60 * 1000);
    const thirtyMinutesAfter = new Date(dto.collectedAt.getTime() + 30 * 60 * 1000);

    const duplicate = await this.collectionRepository.findOne({
      where: {
        machineId: dto.machineId,
        collectedAt: Between(thirtyMinutesAgo, thirtyMinutesAfter),
        status: CollectionStatus.COLLECTED,
      },
    });

    if (duplicate && !dto.skipDuplicateCheck) {
      throw new BadRequestException({
        code: 'DUPLICATE_COLLECTION',
        message: 'Collection for this machine exists within 30 minutes',
        existingCollectionId: duplicate.id,
      });
    }

    const collection = this.collectionRepository.create({
      machineId: dto.machineId,
      operatorId,
      collectedAt: dto.collectedAt,
      source: dto.source || CollectionSource.REALTIME,
      notes: dto.notes,
    });

    const saved = await this.collectionRepository.save(collection);
    await this.invalidateReportsCache();
    return saved;
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

        const collectionData = {
          machineId: machine.id,
          operatorId,
          collectedAt: new Date(item.collectedAt),
          amount: item.amount,
          status: item.amount ? CollectionStatus.RECEIVED : CollectionStatus.COLLECTED,
          receivedAt: item.amount ? new Date() : undefined,
          managerId: item.amount ? operatorId : undefined,
          source: dto.source || CollectionSource.MANUAL_HISTORY,
          notes: item.notes,
        };

        const collection = this.collectionRepository.create(collectionData);
        const saved = await this.collectionRepository.save(collection);
        results.collections.push(saved);
        results.created++;
      } catch (error: any) {
        results.failed++;
        results.errors.push({ index: i, error: error.message });
      }
    }

    if (results.created > 0) {
      await this.invalidateReportsCache();
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
    const collection = await this.findByIdOrFail(id);

    if (collection.status !== CollectionStatus.COLLECTED) {
      throw new BadRequestException('Collection is not in collected status');
    }

    collection.managerId = managerId;
    collection.amount = dto.amount;
    collection.receivedAt = new Date();
    collection.status = CollectionStatus.RECEIVED;
    if (dto.notes) {
      collection.notes = dto.notes;
    }

    const saved = await this.collectionRepository.save(collection);
    await this.invalidateReportsCache();
    return saved;
  }

  async edit(id: string, userId: string, dto: EditCollectionDto): Promise<Collection> {
    const collection = await this.findByIdOrFail(id);

    if (collection.status !== CollectionStatus.RECEIVED) {
      throw new BadRequestException('Can only edit received collections');
    }

    // Log history
    if (dto.amount !== undefined && dto.amount !== collection.amount) {
      await this.historyRepository.save({
        collectionId: id,
        changedById: userId,
        fieldName: 'amount',
        oldValue: collection.amount?.toString(),
        newValue: dto.amount.toString(),
        reason: dto.reason,
      });
      collection.amount = dto.amount;
    }

    const saved = await this.collectionRepository.save(collection);
    await this.invalidateReportsCache();
    return saved;
  }

  async cancel(id: string, userId: string, reason?: string): Promise<Collection> {
    const collection = await this.findByIdOrFail(id);

    if (collection.status === CollectionStatus.CANCELLED) {
      throw new BadRequestException('Collection is already cancelled');
    }

    // Log history
    await this.historyRepository.save({
      collectionId: id,
      changedById: userId,
      fieldName: 'status',
      oldValue: collection.status,
      newValue: CollectionStatus.CANCELLED,
      reason,
    });

    collection.status = CollectionStatus.CANCELLED;
    const saved = await this.collectionRepository.save(collection);
    await this.invalidateReportsCache();
    return saved;
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
    const thirtyMinutesAgo = new Date(collectedAt.getTime() - 30 * 60 * 1000);
    const thirtyMinutesAfter = new Date(collectedAt.getTime() + 30 * 60 * 1000);

    return this.collectionRepository.findOne({
      where: {
        machineId,
        collectedAt: Between(thirtyMinutesAgo, thirtyMinutesAfter),
      },
      relations: ['machine', 'operator'],
    });
  }
}
