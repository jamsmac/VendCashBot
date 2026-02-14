import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum UserRole {
  OPERATOR = 'operator',
  MANAGER = 'manager',
  ADMIN = 'admin',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'telegram_id', type: 'bigint', unique: true })
  telegramId: number;

  @Column({ name: 'telegram_username', nullable: true, length: 100 })
  telegramUsername: string;

  @Column({ name: 'telegram_first_name', nullable: true, length: 255 })
  telegramFirstName: string;

  @Column({ length: 255 })
  name: string;

  @Column({ nullable: true, length: 20 })
  phone: string;

  @Column({ type: 'enum', enum: UserRole })
  role: UserRole;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'deactivated_at', type: 'timestamp', nullable: true })
  deactivatedAt: Date;

  @Column({ name: 'deactivated_by', nullable: true })
  deactivatedBy: string;

  @Column({ name: 'deactivation_reason', type: 'text', nullable: true })
  deactivationReason: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
