import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from './entities/user.entity';
import { UserModule, ROLE_DEFAULT_MODULES, AppModule } from './entities/user-module.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(UserModule)
    private readonly userModuleRepository: Repository<UserModule>,
  ) {}

  async create(createUserDto: CreateUserDto): Promise<User> {
    const existing = await this.userRepository.findOne({
      where: { telegramId: createUserDto.telegramId },
    });

    if (existing) {
      throw new ConflictException('User with this Telegram ID already exists');
    }

    const user = this.userRepository.create(createUserDto);
    try {
      return await this.userRepository.save(user);
    } catch (error: unknown) {
      // Handle race condition: unique constraint violation on telegramId
      if (error instanceof Error && 'code' in error && (error as Record<string, unknown>).code === '23505') {
        throw new ConflictException('User with this Telegram ID already exists');
      }
      throw error;
    }
  }

  async findAll(role?: UserRole, includeInactive = false): Promise<User[]> {
    const query = this.userRepository.createQueryBuilder('user');

    if (role) {
      query.andWhere('user.role = :role', { role });
    }

    if (!includeInactive) {
      query.andWhere('user.isActive = :isActive', { isActive: true });
    }

    return query.orderBy('user.createdAt', 'DESC').getMany();
  }

  async findById(id: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { id } });
  }

  async findByIdOrFail(id: string): Promise<User> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async findByTelegramId(telegramId: number): Promise<User | null> {
    return this.userRepository.findOne({ where: { telegramId } });
  }

  async update(id: string, updateUserDto: UpdateUserDto): Promise<User> {
    const user = await this.findByIdOrFail(id);

    // Explicitly pick allowed fields to prevent mass assignment
    if (updateUserDto.name !== undefined) user.name = updateUserDto.name;
    if (updateUserDto.telegramUsername !== undefined) user.telegramUsername = updateUserDto.telegramUsername;
    if (updateUserDto.telegramFirstName !== undefined) user.telegramFirstName = updateUserDto.telegramFirstName;
    if (updateUserDto.phone !== undefined) user.phone = updateUserDto.phone;
    if (updateUserDto.isActive !== undefined) user.isActive = updateUserDto.isActive;

    return this.userRepository.save(user);
  }

  async deactivate(id: string): Promise<User> {
    const user = await this.findByIdOrFail(id);
    user.isActive = false;
    return this.userRepository.save(user);
  }

  async activate(id: string): Promise<User> {
    const user = await this.findByIdOrFail(id);
    user.isActive = true;
    return this.userRepository.save(user);
  }

  async getOperators(): Promise<User[]> {
    return this.findAll(UserRole.OPERATOR);
  }

  async getManagers(): Promise<User[]> {
    return this.userRepository.find({
      where: [
        { role: UserRole.MANAGER, isActive: true },
        { role: UserRole.ADMIN, isActive: true },
      ],
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Find all active users with specified roles
   * Used for notifications
   */
  async findAllActive(roles: UserRole[]): Promise<User[]> {
    return this.userRepository.find({
      where: roles.map((role) => ({ role, isActive: true })),
    });
  }

  async deleteById(id: string): Promise<void> {
    await this.userRepository.delete(id);
  }

  // ========== Module permissions ==========

  /**
   * Get all modules a user has access to (role defaults + custom grants)
   */
  async getUserModules(userId: string): Promise<string[]> {
    const user = await this.findByIdOrFail(userId);

    // Role defaults
    const roleDefaults = ROLE_DEFAULT_MODULES[user.role] || [];

    // Custom grants from DB
    const customGrants = await this.userModuleRepository.find({
      where: { userId },
      select: ['module'],
    });
    const customModules = customGrants.map((g) => g.module);

    // Combine and deduplicate
    return [...new Set([...roleDefaults, ...customModules])];
  }

  /**
   * Get only custom (non-default) module grants for a user
   */
  async getCustomModules(userId: string): Promise<string[]> {
    const grants = await this.userModuleRepository.find({
      where: { userId },
      select: ['module'],
    });
    return grants.map((g) => g.module);
  }

  /**
   * Set custom module grants for a user.
   * Only stores modules that are NOT already in the role defaults.
   */
  async setUserModules(userId: string, modules: string[], grantedBy: string): Promise<string[]> {
    const user = await this.findByIdOrFail(userId);

    // Filter out modules that are already in role defaults
    const roleDefaults = new Set(ROLE_DEFAULT_MODULES[user.role] || []);
    const customModules = modules.filter((m) => !roleDefaults.has(m as AppModule));

    // Delete existing custom grants
    await this.userModuleRepository.delete({ userId });

    // Insert new custom grants
    if (customModules.length > 0) {
      const entities = customModules.map((module) =>
        this.userModuleRepository.create({
          userId,
          module,
          grantedBy,
        }),
      );
      await this.userModuleRepository.save(entities);
    }

    // Return full module list
    return [...new Set([...Array.from(roleDefaults), ...customModules])];
  }
}
