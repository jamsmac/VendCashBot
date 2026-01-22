import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Collection } from './collection.entity';

@Entity('collection_history')
export class CollectionHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Collection)
  @JoinColumn({ name: 'collection_id' })
  collection: Collection;

  @Column({ name: 'collection_id' })
  collectionId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'changed_by' })
  changedBy: User;

  @Column({ name: 'changed_by' })
  changedById: string;

  @Column({ name: 'field_name', length: 50 })
  fieldName: string;

  @Column({ name: 'old_value', type: 'text', nullable: true })
  oldValue: string;

  @Column({ name: 'new_value', type: 'text', nullable: true })
  newValue: string;

  @Column({ type: 'text', nullable: true })
  reason: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
