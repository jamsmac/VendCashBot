import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository, IsNull } from 'typeorm';
import { Invite } from './entities/invite.entity';
import { UserRole } from '../users/entities/user.entity';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class InvitesService {
  constructor(
    @InjectRepository(Invite)
    private readonly inviteRepository: Repository<Invite>,
    private readonly configService: ConfigService,
  ) {}

  private generateCode(): string {
    return uuidv4().substring(0, 8);
  }

  async create(createdById: string, role: UserRole): Promise<Invite> {
    if (role === UserRole.ADMIN) {
      throw new BadRequestException('Cannot create invite for admin role');
    }

    const expirationHours = this.configService.get<number>('app.inviteExpirationHours') || 24;
    const invite = this.inviteRepository.create({
      code: this.generateCode(),
      role,
      createdById,
      expiresAt: new Date(Date.now() + expirationHours * 60 * 60 * 1000),
    });

    return this.inviteRepository.save(invite);
  }

  async findByCode(code: string): Promise<Invite | null> {
    return this.inviteRepository.findOne({
      where: { code },
      relations: ['createdBy'],
    });
  }

  async findByCodeOrFail(code: string): Promise<Invite> {
    const invite = await this.findByCode(code);
    if (!invite) {
      throw new NotFoundException('Invite not found');
    }
    return invite;
  }

  async findAll(createdById?: string): Promise<Invite[]> {
    const query = this.inviteRepository.createQueryBuilder('invite')
      .leftJoinAndSelect('invite.createdBy', 'createdBy')
      .leftJoinAndSelect('invite.usedBy', 'usedBy')
      .orderBy('invite.createdAt', 'DESC');

    if (createdById) {
      query.andWhere('invite.createdById = :createdById', { createdById });
    }

    return query.getMany();
  }

  async findPending(): Promise<Invite[]> {
    return this.inviteRepository.find({
      where: { usedById: IsNull() },
      relations: ['createdBy'],
      order: { createdAt: 'DESC' },
    });
  }

  async markAsUsed(inviteId: string, usedById: string): Promise<Invite> {
    const invite = await this.inviteRepository.findOne({ where: { id: inviteId } });
    if (!invite) {
      throw new NotFoundException('Invite not found');
    }

    if (invite.usedById) {
      throw new BadRequestException('Invite already used');
    }

    if (invite.isExpired) {
      throw new BadRequestException('Invite has expired');
    }

    invite.usedById = usedById;
    invite.usedAt = new Date();

    return this.inviteRepository.save(invite);
  }

  async delete(id: string): Promise<void> {
    const invite = await this.inviteRepository.findOne({ where: { id } });
    if (!invite) {
      throw new NotFoundException('Invite not found');
    }

    if (invite.usedById) {
      throw new BadRequestException('Cannot delete used invite');
    }

    await this.inviteRepository.delete(id);
  }

  async validateInvite(code: string): Promise<{ valid: boolean; role?: UserRole; error?: string }> {
    const invite = await this.findByCode(code);

    if (!invite) {
      return { valid: false, error: 'Invite not found' };
    }

    if (invite.isUsed) {
      return { valid: false, error: 'Invite already used' };
    }

    if (invite.isExpired) {
      return { valid: false, error: 'Invite has expired' };
    }

    return { valid: true, role: invite.role };
  }
}
