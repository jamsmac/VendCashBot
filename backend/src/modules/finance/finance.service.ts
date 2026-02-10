import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { BankDeposit } from './entities/bank-deposit.entity';
import { Collection, CollectionStatus } from '../collections/entities/collection.entity';

@Injectable()
export class FinanceService {
    constructor(
        @InjectRepository(BankDeposit)
        private readonly depositRepository: Repository<BankDeposit>,
        @InjectRepository(Collection)
        private readonly collectionRepository: Repository<Collection>,
        private readonly dataSource: DataSource,
    ) { }

    async createDeposit(
        userId: string,
        data: { amount: number; notes?: string; date: string },
    ) {
        const deposit = this.depositRepository.create({
            amount: data.amount,
            notes: data.notes,
            depositDate: new Date(data.date),
            createdById: userId,
        });
        return this.depositRepository.save(deposit);
    }

    async findAllDeposits() {
        return this.depositRepository.find({
            order: { depositDate: 'DESC' },
            relations: ['createdBy'],
        });
    }

    async getBalance() {
        // Use a transaction to ensure consistent snapshot of both sums
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction('REPEATABLE READ');

        try {
            // 1. Sum up all RECEIVED collections — use COALESCE for precision
            const { totalReceived } = await queryRunner.manager
                .createQueryBuilder(Collection, 'collection')
                .select('COALESCE(SUM(collection.amount), 0)::numeric', 'totalReceived')
                .where('collection.status = :status', { status: CollectionStatus.RECEIVED })
                .getRawOne();

            // 2. Sum up all DEPOSITS
            const { totalDeposited } = await queryRunner.manager
                .createQueryBuilder(BankDeposit, 'deposit')
                .select('COALESCE(SUM(deposit.amount), 0)::numeric', 'totalDeposited')
                .getRawOne();

            await queryRunner.commitTransaction();

            // Convert string results from PostgreSQL numeric type to numbers
            const received = Number(totalReceived) || 0;
            const deposited = Number(totalDeposited) || 0;
            const balance = Math.round((received - deposited) * 100) / 100;

            return {
                received: Math.round(received * 100) / 100,
                deposited: Math.round(deposited * 100) / 100,
                balance,
            };
        } catch (error) {
            await queryRunner.rollbackTransaction();
            throw error;
        } finally {
            await queryRunner.release();
        }
    }
}
