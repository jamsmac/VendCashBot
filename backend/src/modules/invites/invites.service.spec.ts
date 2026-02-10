import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository, DataSource } from 'typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { InvitesService } from './invites.service';
import { Invite } from './entities/invite.entity';
import { UserRole } from '../users/entities/user.entity';

describe('InvitesService', () => {
  let service: InvitesService;
  let repository: jest.Mocked<Repository<Invite>>;

  const mockInvite = {
    id: 'invite-123',
    code: 'ABC12345',
    role: UserRole.OPERATOR,
    createdById: 'user-123',
    createdBy: null,
    usedById: null,
    usedBy: null,
    usedAt: null,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
    createdAt: new Date(),
    isUsed: false,
    isExpired: false,
    isValid: true,
  } as unknown as Invite;

  const mockQueryBuilder = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([mockInvite]),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvitesService,
        {
          provide: getRepositoryToken(Invite),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            delete: jest.fn(),
            createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue(24), // 24 hours expiration
          },
        },
        {
          provide: DataSource,
          useValue: {
            createQueryRunner: jest.fn().mockReturnValue({
              connect: jest.fn(),
              startTransaction: jest.fn(),
              commitTransaction: jest.fn(),
              rollbackTransaction: jest.fn(),
              release: jest.fn(),
              manager: {
                findOne: jest.fn(),
                save: jest.fn(),
              },
            }),
          },
        },
      ],
    }).compile();

    service = module.get<InvitesService>(InvitesService);
    repository = module.get(getRepositoryToken(Invite));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create an invite for operator', async () => {
      repository.create.mockReturnValue(mockInvite);
      repository.save.mockResolvedValue(mockInvite);

      const result = await service.create('user-123', UserRole.OPERATOR);

      expect(result).toEqual(mockInvite);
      expect(repository.create).toHaveBeenCalled();
      expect(repository.save).toHaveBeenCalled();
    });

    it('should create an invite for manager', async () => {
      const managerInvite = { ...mockInvite, role: UserRole.MANAGER } as unknown as Invite;
      repository.create.mockReturnValue(managerInvite);
      repository.save.mockResolvedValue(managerInvite);

      const result = await service.create('user-123', UserRole.MANAGER);

      expect(result.role).toBe(UserRole.MANAGER);
    });

    it('should throw BadRequestException for admin role', async () => {
      await expect(service.create('user-123', UserRole.ADMIN)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('findByCode', () => {
    it('should return invite when found', async () => {
      repository.findOne.mockResolvedValue(mockInvite);

      const result = await service.findByCode('ABC12345');

      expect(result).toEqual(mockInvite);
      expect(repository.findOne).toHaveBeenCalledWith({
        where: { code: 'ABC12345' },
        relations: ['createdBy'],
      });
    });

    it('should return null when not found', async () => {
      repository.findOne.mockResolvedValue(null);

      const result = await service.findByCode('INVALID');

      expect(result).toBeNull();
    });
  });

  describe('findByCodeOrFail', () => {
    it('should return invite when found', async () => {
      repository.findOne.mockResolvedValue(mockInvite);

      const result = await service.findByCodeOrFail('ABC12345');

      expect(result).toEqual(mockInvite);
    });

    it('should throw NotFoundException when not found', async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(service.findByCodeOrFail('INVALID')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findAll', () => {
    it('should return all invites', async () => {
      const result = await service.findAll();

      expect(result).toEqual([mockInvite]);
      expect(mockQueryBuilder.getMany).toHaveBeenCalled();
    });

    it('should filter by createdById when provided', async () => {
      await service.findAll('user-123');

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'invite.createdById = :createdById',
        { createdById: 'user-123' },
      );
    });
  });

  describe('findPending', () => {
    it('should return pending invites', async () => {
      repository.find.mockResolvedValue([mockInvite]);

      const result = await service.findPending();

      expect(result).toEqual([mockInvite]);
    });
  });

  describe('markAsUsed', () => {
    it('should mark invite as used', async () => {
      const usedInvite = {
        ...mockInvite,
        usedById: 'new-user',
        usedAt: new Date(),
        isUsed: true,
      } as unknown as Invite;
      repository.findOne.mockResolvedValue(mockInvite);
      repository.save.mockResolvedValue(usedInvite);

      const result = await service.markAsUsed('invite-123', 'new-user');

      expect(result.usedById).toBe('new-user');
      expect(repository.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException when invite not found', async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(service.markAsUsed('invalid', 'user')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException when invite already used', async () => {
      repository.findOne.mockResolvedValue({
        ...mockInvite,
        usedById: 'existing-user',
        isUsed: true,
      } as unknown as Invite);

      await expect(service.markAsUsed('invite-123', 'new-user')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when invite expired', async () => {
      const expiredInvite = {
        ...mockInvite,
        expiresAt: new Date(Date.now() - 1000), // expired
        isExpired: true,
        isValid: false,
      } as unknown as Invite;
      repository.findOne.mockResolvedValue(expiredInvite);

      await expect(service.markAsUsed('invite-123', 'new-user')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('delete', () => {
    it('should delete unused invite', async () => {
      const unusedInvite = {
        ...mockInvite,
        usedById: null,
      } as unknown as Invite;
      repository.findOne.mockResolvedValue(unusedInvite);
      repository.delete.mockResolvedValue({ affected: 1 } as any);

      await service.delete('invite-123');

      expect(repository.delete).toHaveBeenCalledWith('invite-123');
    });

    it('should throw NotFoundException when invite not found', async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(service.delete('invalid')).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when invite already used', async () => {
      repository.findOne.mockResolvedValue({
        ...mockInvite,
        usedById: 'some-user',
        isUsed: true,
      } as unknown as Invite);

      await expect(service.delete('invite-123')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('validateInvite', () => {
    it('should return valid for unused, non-expired invite', async () => {
      repository.findOne.mockResolvedValue(mockInvite);

      const result = await service.validateInvite('ABC12345');

      expect(result.valid).toBe(true);
      expect(result.role).toBe(UserRole.OPERATOR);
    });

    it('should return invalid when invite not found', async () => {
      repository.findOne.mockResolvedValue(null);

      const result = await service.validateInvite('INVALID');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invite not found');
    });

    it('should return invalid when invite already used', async () => {
      const usedInvite = {
        ...mockInvite,
        usedById: 'some-user',
        isUsed: true,
      } as unknown as Invite;
      repository.findOne.mockResolvedValue(usedInvite);

      const result = await service.validateInvite('ABC12345');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invite already used');
    });

    it('should return invalid when invite expired', async () => {
      const expiredInvite = {
        ...mockInvite,
        expiresAt: new Date(Date.now() - 1000),
        isUsed: false,
        isExpired: true,
        isValid: false,
      } as unknown as Invite;
      repository.findOne.mockResolvedValue(expiredInvite);

      const result = await service.validateInvite('ABC12345');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invite has expired');
    });
  });

  describe('deleteUnused', () => {
    it('should delete all unused invites', async () => {
      repository.delete.mockResolvedValue({ affected: 5 } as any);

      const result = await service.deleteUnused();

      expect(result).toBe(5);
    });
  });
});
