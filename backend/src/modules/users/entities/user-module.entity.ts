import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
  Index,
} from 'typeorm';
import { User } from './user.entity';

/** Available application modules for permission control */
export enum AppModule {
  DASHBOARD = 'dashboard',
  COLLECTIONS = 'collections',
  REPORTS = 'reports',
  SALES = 'sales',
  MACHINES = 'machines',
  SETTINGS = 'settings',
  USERS = 'users',
}

/** All module keys */
export const ALL_MODULES = Object.values(AppModule);

/** Default modules per role (not stored in DB, computed at runtime) */
export const ROLE_DEFAULT_MODULES: Record<string, AppModule[]> = {
  admin: [...ALL_MODULES],
  manager: [AppModule.DASHBOARD, AppModule.COLLECTIONS, AppModule.REPORTS],
  operator: [AppModule.COLLECTIONS],
};

@Entity('user_modules')
@Unique(['userId', 'module'])
@Index(['userId'])
export class UserModule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'varchar', length: 50 })
  module: string;

  @Column({ name: 'granted_by', type: 'uuid', nullable: true })
  grantedBy: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'granted_by' })
  grantedByUser: User;

  @CreateDateColumn({ name: 'granted_at' })
  grantedAt: Date;
}
