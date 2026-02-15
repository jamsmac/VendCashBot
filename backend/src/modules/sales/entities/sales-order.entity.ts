import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Machine } from '../../machines/entities/machine.entity';

export enum PaymentMethod {
  CASH = 'cash',
  CARD = 'card',
}

export enum PaymentStatus {
  PAID = 'paid',
  REFUNDED = 'refunded',
}

@Entity('sales_orders')
@Index(['machineCode', 'orderDate'])
@Index(['paymentMethod', 'orderDate'])
@Index(['importBatchId'])
export class SalesOrder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'order_number', type: 'varchar', length: 100, nullable: true })
  orderNumber: string;

  @Column({ name: 'product_name', type: 'varchar', length: 255, nullable: true })
  productName: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  flavor: string;

  @Column({
    name: 'payment_method',
    type: 'enum',
    enum: PaymentMethod,
  })
  paymentMethod: PaymentMethod;

  @Column({
    name: 'payment_status',
    type: 'enum',
    enum: PaymentStatus,
    default: PaymentStatus.PAID,
  })
  paymentStatus: PaymentStatus;

  @Column({ name: 'machine_code', type: 'varchar', length: 50 })
  machineCode: string;

  @ManyToOne(() => Machine, { nullable: true })
  @JoinColumn({ name: 'machine_id' })
  machine: Machine;

  @Column({ name: 'machine_id', type: 'uuid', nullable: true })
  machineId: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  address: string;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  price: number;

  @Column({ name: 'order_date', type: 'timestamp' })
  orderDate: Date;

  @Column({ name: 'import_batch_id', type: 'varchar', length: 50 })
  importBatchId: string;

  @Column({ name: 'imported_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  importedAt: Date;
}
