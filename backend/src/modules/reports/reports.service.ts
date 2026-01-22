import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
  constructor(
    @InjectRepository(Collection)
    private readonly collectionRepository: Repository<Collection>,
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

  async getSummary(query: ReportQueryDto): Promise<SummaryReport> {
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

    const totalAmount = parseFloat(result.totalAmount) || 0;
    const receivedCount = parseInt(result.receivedCount) || 0;

    return {
      period: { from: from.toISOString(), to: to.toISOString() },
      totalCollections: parseInt(result.totalCollections) || 0,
      totalAmount,
      pendingCount: parseInt(result.pendingCount) || 0,
      receivedCount,
      cancelledCount: parseInt(result.cancelledCount) || 0,
      averageAmount: receivedCount > 0 ? totalAmount / receivedCount : 0,
    };
  }

  async getByMachine(query: ReportQueryDto): Promise<{
    period: { from: string; to: string };
    data: MachineReport[];
    totals: { collectionsCount: number; totalAmount: number };
  }> {
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
      totalAmount: parseFloat(r.totalAmount) || 0,
      averageAmount:
        parseInt(r.collectionsCount) > 0
          ? parseFloat(r.totalAmount) / parseInt(r.collectionsCount)
          : 0,
    }));

    const totals = data.reduce(
      (acc, item) => ({
        collectionsCount: acc.collectionsCount + item.collectionsCount,
        totalAmount: acc.totalAmount + item.totalAmount,
      }),
      { collectionsCount: 0, totalAmount: 0 },
    );

    return {
      period: { from: from.toISOString(), to: to.toISOString() },
      data,
      totals,
    };
  }

  async getByDate(query: ReportQueryDto): Promise<{
    period: { from: string; to: string };
    data: DateReport[];
    totals: { collectionsCount: number; totalAmount: number };
  }> {
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
      totalAmount: parseFloat(r.totalAmount) || 0,
    }));

    const totals = data.reduce(
      (acc, item) => ({
        collectionsCount: acc.collectionsCount + item.collectionsCount,
        totalAmount: acc.totalAmount + item.totalAmount,
      }),
      { collectionsCount: 0, totalAmount: 0 },
    );

    return {
      period: { from: from.toISOString(), to: to.toISOString() },
      data,
      totals,
    };
  }

  async getByOperator(query: ReportQueryDto): Promise<{
    period: { from: string; to: string };
    data: OperatorReport[];
    totals: { collectionsCount: number; totalAmount: number };
  }> {
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
      totalAmount: parseFloat(r.totalAmount) || 0,
    }));

    const totals = data.reduce(
      (acc, item) => ({
        collectionsCount: acc.collectionsCount + item.collectionsCount,
        totalAmount: acc.totalAmount + item.totalAmount,
      }),
      { collectionsCount: 0, totalAmount: 0 },
    );

    return {
      period: { from: from.toISOString(), to: to.toISOString() },
      data,
      totals,
    };
  }

  async getTodaySummary(): Promise<{ pending: number; todayAmount: number; monthAmount: number }> {
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

    return {
      pending,
      todayAmount: parseFloat(todayResult?.total) || 0,
      monthAmount: parseFloat(monthResult?.total) || 0,
    };
  }
}
