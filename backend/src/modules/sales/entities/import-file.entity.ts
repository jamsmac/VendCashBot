import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('import_files')
export class ImportFile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ name: 'batch_id', type: 'varchar', length: 50 })
  batchId: string;

  @Column({ name: 'original_name', type: 'varchar', length: 255 })
  originalName: string;

  @Column({ name: 'telegram_file_id', type: 'varchar', length: 255 })
  telegramFileId: string;

  @Column({ name: 'telegram_message_id', type: 'int', nullable: true })
  telegramMessageId: number;

  @Column({ name: 'file_size', type: 'int', nullable: true })
  fileSize: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
