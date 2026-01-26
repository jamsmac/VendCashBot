import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async create(createUserDto: CreateUserDto): Promise<User> {
    const existing = await this.userRepository.findOne({
      where: { telegramId: createUserDto.telegramId },
    });

    if (existing) {
      throw new ConflictException('User with this Telegram ID already exists');
    }

    const user = this.userRepository.create(createUserDto);
    return this.userRepository.save(user);
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
    Object.assign(user, updateUserDto);
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
}
