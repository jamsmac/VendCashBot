import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    ManyToOne,
    JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('bank_deposits')
export class BankDeposit {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column('decimal', { precision: 15, scale: 2 })
    amount: number;

    @Column({ name: 'deposit_date' })
    depositDate: Date;

    @Column({ type: 'text', nullable: true })
    notes: string;

    @ManyToOne(() => User)
    @JoinColumn({ name: 'created_by_id' })
    createdBy: User;

    @Column({ name: 'created_by_id' })
    createdById: string;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;
}
