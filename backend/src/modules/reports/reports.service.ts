import { Injectable, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { Collection, CollectionStatus } from '../collections/entities/collection.entity';
import { MachineStatus } from '../machines/entities/machine.entity';
import { ReportQueryDto } from './dto/report-query.dto';

export interface SummaryReport {
  period: { from: string; to: string };
  totalCollections: number;
  totalAmount: number;
  pendingCount: number;
  receivedCount: number;
  cancelledCount: number;
  averageAmount: number;
}

export interface MachineReport {
  machine: { id: string; code: string; name: string };
  collectionsCount: number;
  totalAmount: number;
  averageAmount: number;
}

export interface DateReport {
  date: string;
  collectionsCount: number;
  totalAmount: number;
}

export interface OperatorReport {
  operator: { id: string; name: string; telegramUsername: string };
  collectionsCount: number;
  totalAmount: number;
}

@Injectable()
export class ReportsService {
  private readonly CACHE_TTL = 60000; // 1 minute cache for reports
  private readonly DASHBOARD_CACHE_TTL = 30000; // 30 seconds for dashboard
  private static readonly MAX_CACHE_KEYS = 200; // Prevent unbounded growth
  // Track active cache keys for reliable invalidation without Redis pattern matching
  private readonly activeCacheKeys = new Set<string>();

  /**
   * Track a cache key with upper bound to prevent memory leak.
   * When limit is reached, old keys are pruned (they'll expire naturally in Redis).
   */
  private trackCacheKey(key: string): void {
    if (this.activeCacheKeys.size >= ReportsService.MAX_CACHE_KEYS) {
      // Remove oldest entries (Set preserves insertion order)
      const iterator = this.activeCacheKeys.values();
      const halfSize = Math.floor(ReportsService.MAX_CACHE_KEYS / 2);
      for (let i = 0; i < halfSize; i++) {
        const oldest = iterator.next().value;
        if (oldest) this.activeCacheKeys.delete(oldest);
      }
    }
    this.activeCacheKeys.add(key);
  }

  constructor(
    @InjectRepository(Collection)
    private readonly collectionRepository: Repository<Collection>,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  private getDateRange(query: ReportQueryDto): { from: Date; to: Date } {
    const now = new Date();
    let from: Date;
    let to: Date;

    if (query.from && query.to) {
      from = new Date(query.from);
      to = new Date(query.to);
      to.setHours(23, 59, 59, 999);
    } else {
      // Default to current month
      from = new Date(now.getFullYear(), now.getMonth(), 1);
      to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    }

    return { from, to };
  }

  private getCacheKey(prefix: string, query: ReportQueryDto): string {
    return `report:${prefix}:${query.from || 'default'}:${query.to || 'default'}`;
  }

  async getSummary(query: ReportQueryDto): Promise<SummaryReport> {
    const cacheKey = this.getCacheKey('summary', query);
    const cached = await this.cacheManager.get<SummaryReport>(cacheKey);
    if (cached) return cached;

    const { from, to } = this.getDateRange(query);

    const result = await this.collectionRepository
      .createQueryBuilder('collection')
      .leftJoin('collection.machine', 'machine')
      .select([
        'COUNT(*) as "totalCollections"',
        'COALESCE(SUM(CASE WHEN collection.status = :received THEN collection.amount ELSE 0 END), 0) as "totalAmount"',
        'COUNT(CASE WHEN collection.status = :collected THEN 1 END) as "pendingCount"',
        'COUNT(CASE WHEN collection.status = :received THEN 1 END) as "receivedCount"',
        'COUNT(CASE WHEN collection.status = :cancelled THEN 1 END) as "cancelledCount"',
      ])
      .where('collection.collectedAt BETWEEN :from AND :to', { from, to })
      .andWhere('machine.status = :machineStatus', { machineStatus: MachineStatus.APPROVED })
      .setParameters({
        collected: CollectionStatus.COLLECTED,
        received: CollectionStatus.RECEIVED,
        cancelled: CollectionStatus.CANCELLED,
      })
      .getRawOne();

    const totalAmount = Math.round(Number(result.totalAmount) * 100) / 100 || 0;
    const receivedCount = parseInt(result.receivedCount) || 0;

    const report: SummaryReport = {
      period: { from: from.toISOString(), to: to.toISOString() },
      totalCollections: parseInt(result.totalCollections) || 0,
      totalAmount,
      pendingCount: parseInt(result.pendingCount) || 0,
      receivedCount,
      cancelledCount: parseInt(result.cancelledCount) || 0,
      averageAmount: receivedCount > 0 ? totalAmount / receivedCount : 0,
    };

    this.trackCacheKey(cacheKey);
    await this.cacheManager.set(cacheKey, report, this.CACHE_TTL);
    return report;
  }

  async getByMachine(query: ReportQueryDto): Promise<{
    period: { from: string; to: string };
    data: MachineReport[];
    totals: { collectionsCount: number; totalAmount: number };
  }> {
    const cacheKey = this.getCacheKey('by-machine', query);
    const cached = await this.cacheManager.get<{
      period: { from: string; to: string };
      data: MachineReport[];
      totals: { collectionsCount: number; totalAmount: number };
    }>(cacheKey);
    if (cached) return cached;

    const { from, to } = this.getDateRange(query);

    const results = await this.collectionRepository
      .createQueryBuilder('collection')
      .leftJoin('collection.machine', 'machine')
      .select([
        'machine.id as "machineId"',
        'machine.code as "machineCode"',
        'machine.name as "machineName"',
        'COUNT(*) as "collectionsCount"',
        'COALESCE(SUM(collection.amount), 0) as "totalAmount"',
      ])
      .where('collection.collectedAt BETWEEN :from AND :to', { from, to })
      .andWhere('collection.status = :status', { status: CollectionStatus.RECEIVED })
      .andWhere('machine.status = :machineStatus', { machineStatus: MachineStatus.APPROVED })
      .groupBy('machine.id')
      .addGroupBy('machine.code')
      .addGroupBy('machine.name')
      .orderBy('"totalAmount"', 'DESC')
      .getRawMany();

    const data: MachineReport[] = results.map((r) => ({
      machine: { id: r.machineId, code: r.machineCode, name: r.machineName },
      collectionsCount: parseInt(r.collectionsCount) || 0,
      totalAmount: Math.round(Number(r.totalAmount) * 100) / 100 || 0,
      averageAmount:
        parseInt(r.collectionsCount) > 0
          ? Math.round((Number(r.totalAmount) / parseInt(r.collectionsCount)) * 100) / 100
          : 0,
    }));

    const totals = data.reduce(
      (acc, item) => ({
        collectionsCount: acc.collectionsCount + item.collectionsCount,
        totalAmount: acc.totalAmount + item.totalAmount,
      }),
      { collectionsCount: 0, totalAmount: 0 },
    );

    const report = {
      period: { from: from.toISOString(), to: to.toISOString() },
      data,
      totals,
    };

    this.trackCacheKey(cacheKey);
    await this.cacheManager.set(cacheKey, report, this.CACHE_TTL);
    return report;
  }

  async getByDate(query: ReportQueryDto): Promise<{
    period: { from: string; to: string };
    data: DateReport[];
    totals: { collectionsCount: number; totalAmount: number };
  }> {
    const cacheKey = this.getCacheKey('by-date', query);
    const cached = await this.cacheManager.get<{
      period: { from: string; to: string };
      data: DateReport[];
      totals: { collectionsCount: number; totalAmount: number };
    }>(cacheKey);
    if (cached) return cached;

    const { from, to } = this.getDateRange(query);

    const results = await this.collectionRepository
      .createQueryBuilder('collection')
      .leftJoin('collection.machine', 'machine')
      .select([
        'DATE(collection.collectedAt) as date',
        'COUNT(*) as "collectionsCount"',
        'COALESCE(SUM(collection.amount), 0) as "totalAmount"',
      ])
      .where('collection.collectedAt BETWEEN :from AND :to', { from, to })
      .andWhere('collection.status = :status', { status: CollectionStatus.RECEIVED })
      .andWhere('machine.status = :machineStatus', { machineStatus: MachineStatus.APPROVED })
      .groupBy('DATE(collection.collectedAt)')
      .orderBy('date', 'DESC')
      .getRawMany();

    const data: DateReport[] = results.map((r) => ({
      date: r.date,
      collectionsCount: parseInt(r.collectionsCount) || 0,
      totalAmount: Math.round(Number(r.totalAmount) * 100) / 100 || 0,
    }));

    const totals = data.reduce(
      (acc, item) => ({
        collectionsCount: acc.collectionsCount + item.collectionsCount,
        totalAmount: acc.totalAmount + item.totalAmount,
      }),
      { collectionsCount: 0, totalAmount: 0 },
    );

    const report = {
      period: { from: from.toISOString(), to: to.toISOString() },
      data,
      totals,
    };

    this.trackCacheKey(cacheKey);
    await this.cacheManager.set(cacheKey, report, this.CACHE_TTL);
    return report;
  }

  async getByOperator(query: ReportQueryDto): Promise<{
    period: { from: string; to: string };
    data: OperatorReport[];
    totals: { collectionsCount: number; totalAmount: number };
  }> {
    const cacheKey = this.getCacheKey('by-operator', query);
    const cached = await this.cacheManager.get<{
      period: { from: string; to: string };
      data: OperatorReport[];
      totals: { collectionsCount: number; totalAmount: number };
    }>(cacheKey);
    if (cached) return cached;

    const { from, to } = this.getDateRange(query);

    const results = await this.collectionRepository
      .createQueryBuilder('collection')
      .leftJoin('collection.operator', 'operator')
      .leftJoin('collection.machine', 'machine')
      .select([
        'operator.id as "operatorId"',
        'operator.name as "operatorName"',
        'operator.telegramUsername as "operatorUsername"',
        'COUNT(*) as "collectionsCount"',
        'COALESCE(SUM(collection.amount), 0) as "totalAmount"',
      ])
      .where('collection.collectedAt BETWEEN :from AND :to', { from, to })
      .andWhere('collection.status = :status', { status: CollectionStatus.RECEIVED })
      .andWhere('machine.status = :machineStatus', { machineStatus: MachineStatus.APPROVED })
      .groupBy('operator.id')
      .addGroupBy('operator.name')
      .addGroupBy('operator.telegramUsername')
      .orderBy('"totalAmount"', 'DESC')
      .getRawMany();

    const data: OperatorReport[] = results.map((r) => ({
      operator: {
        id: r.operatorId,
        name: r.operatorName,
        telegramUsername: r.operatorUsername,
      },
      collectionsCount: parseInt(r.collectionsCount) || 0,
      totalAmount: Math.round(Number(r.totalAmount) * 100) / 100 || 0,
    }));

    const totals = data.reduce(
      (acc, item) => ({
        collectionsCount: acc.collectionsCount + item.collectionsCount,
        totalAmount: acc.totalAmount + item.totalAmount,
      }),
      { collectionsCount: 0, totalAmount: 0 },
    );

    const report = {
      period: { from: from.toISOString(), to: to.toISOString() },
      data,
      totals,
    };

    this.trackCacheKey(cacheKey);
    await this.cacheManager.set(cacheKey, report, this.CACHE_TTL);
    return report;
  }

  async getTodaySummary(): Promise<{ pending: number; todayAmount: number; monthAmount: number }> {
    const cacheKey = 'report:today-summary';
    const cached = await this.cacheManager.get<{ pending: number; todayAmount: number; monthAmount: number }>(cacheKey);
    if (cached) return cached;

    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    // Pending count - only for approved machines
    const pending = await this.collectionRepository
      .createQueryBuilder('collection')
      .leftJoin('collection.machine', 'machine')
      .where('collection.status = :status', { status: CollectionStatus.COLLECTED })
      .andWhere('machine.status = :machineStatus', { machineStatus: MachineStatus.APPROVED })
      .getCount();

    const todayResult = await this.collectionRepository
      .createQueryBuilder('collection')
      .leftJoin('collection.machine', 'machine')
      .select('COALESCE(SUM(collection.amount), 0)', 'total')
      .where('collection.collectedAt BETWEEN :from AND :to', {
        from: startOfDay,
        to: endOfDay,
      })
      .andWhere('collection.status = :status', { status: CollectionStatus.RECEIVED })
      .andWhere('machine.status = :machineStatus', { machineStatus: MachineStatus.APPROVED })
      .getRawOne();

    const monthResult = await this.collectionRepository
      .createQueryBuilder('collection')
      .leftJoin('collection.machine', 'machine')
      .select('COALESCE(SUM(collection.amount), 0)', 'total')
      .where('collection.collectedAt BETWEEN :from AND :to', {
        from: startOfMonth,
        to: endOfMonth,
      })
      .andWhere('collection.status = :status', { status: CollectionStatus.RECEIVED })
      .andWhere('machine.status = :machineStatus', { machineStatus: MachineStatus.APPROVED })
      .getRawOne();

    const result = {
      pending,
      todayAmount: Math.round(Number(todayResult?.total) * 100) / 100 || 0,
      monthAmount: Math.round(Number(monthResult?.total) * 100) / 100 || 0,
    };

    // Short TTL for today summary
    this.trackCacheKey(cacheKey);
    await this.cacheManager.set(cacheKey, result, this.DASHBOARD_CACHE_TTL);
    return result;
  }

  // Invalidate all tracked cache keys
  async invalidateCache(): Promise<void> {
    const keysToDelete = [...this.activeCacheKeys];
    this.activeCacheKeys.clear();
    for (const key of keysToDelete) {
      await this.cacheManager.del(key);
    }
  }
}
