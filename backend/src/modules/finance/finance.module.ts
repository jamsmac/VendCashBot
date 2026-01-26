import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';
import { BankDeposit } from './entities/bank-deposit.entity';
import { Collection } from '../collections/entities/collection.entity';

@Module({
    imports: [TypeOrmModule.forFeature([BankDeposit, Collection])],
    controllers: [FinanceController],
    providers: [FinanceService],
})
export class FinanceModule { }
