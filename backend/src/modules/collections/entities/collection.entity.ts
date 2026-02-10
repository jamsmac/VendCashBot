import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Machine } from '../../machines/entities/machine.entity';
import { MachineLocation } from '../../machines/entities/machine-location.entity';

export enum CollectionStatus {
  COLLECTED = 'collected',
  RECEIVED = 'received',
  CANCELLED = 'cancelled',
}

export enum CollectionSource {
  REALTIME = 'realtime',
  MANUAL_HISTORY = 'manual_history',
  EXCEL_IMPORT = 'excel_import',
}

@Entity('collections')
export class Collection {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Machine)
  @JoinColumn({ name: 'machine_id' })
  machine: Machine;

  @Column({ name: 'machine_id' })
  machineId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'operator_id' })
  operator: User;

  @Column({ name: 'operator_id' })
  operatorId: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'manager_id' })
  manager: User;

  @Column({ name: 'manager_id', nullable: true })
  managerId: string;

  @Column({ name: 'collected_at', type: 'timestamp' })
  collectedAt: Date;

  @Column({ name: 'received_at', type: 'timestamp', nullable: true })
  receivedAt: Date;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  amount: number;

  @Column({
    type: 'enum',
    enum: CollectionStatus,
    default: CollectionStatus.COLLECTED,
  })
  status: CollectionStatus;

  @Column({
    type: 'enum',
    enum: CollectionSource,
    default: CollectionSource.REALTIME,
  })
  source: CollectionSource;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ type: 'decimal', precision: 10, scale: 8, nullable: true })
  latitude: number;

  @Column({ type: 'decimal', precision: 11, scale: 8, nullable: true })
  longitude: number;

  @ManyToOne(() => MachineLocation, { nullable: true })
  @JoinColumn({ name: 'location_id' })
  location: MachineLocation;

  @Column({ name: 'location_id', nullable: true })
  locationId: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
