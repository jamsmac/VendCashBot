import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BankDeposit } from './entities/bank-deposit.entity';
import { Collection } from '../collections/entities/collection.entity';

@Injectable()
export class FinanceService {
    constructor(
        @InjectRepository(BankDeposit)
        private readonly depositRepository: Repository<BankDeposit>,
        @InjectRepository(Collection)
        private readonly collectionRepository: Repository<Collection>,
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
        // 1. Sum up all RECEIVED collections
        const { totalReceived } = await this.collectionRepository
            .createQueryBuilder('collection')
            .select('SUM(collection.amount)', 'totalReceived')
            .where('collection.status = :status', { status: 'received' })
            .getRawOne();

        // 2. Sum up all DEPOSITS
        const { totalDeposited } = await this.depositRepository
            .createQueryBuilder('deposit')
            .select('SUM(deposit.amount)', 'totalDeposited')
            .getRawOne();

        const received = parseFloat(totalReceived || '0');
        const deposited = parseFloat(totalDeposited || '0');
        const balance = received - deposited;

        return {
            received,
            deposited,
            balance,
        };
    }
}
