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
  let dataSource: jest.Mocked<DataSource>;
  let configService: { get: jest.Mock };

  let mockQueryRunner: {
    connect: jest.Mock;
    startTransaction: jest.Mock;
    commitTransaction: jest.Mock;
    rollbackTransaction: jest.Mock;
    release: jest.Mock;
    manager: {
      findOne: jest.Mock;
      save: jest.Mock;
    };
  };

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
    mockQueryRunner = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      manager: {
        findOne: jest.fn(),
        save: jest.fn(),
      },
    };

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
            createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
          },
        },
      ],
    }).compile();

    service = module.get<InvitesService>(InvitesService);
    repository = module.get(getRepositoryToken(Invite));
    dataSource = module.get(DataSource);
    configService = module.get(ConfigService);
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

    it('should default to 24 hours expiration when config returns falsy', async () => {
      configService.get.mockReturnValue(undefined);

      repository.create.mockReturnValue(mockInvite);
      repository.save.mockResolvedValue(mockInvite);

      await service.create('user-123', UserRole.OPERATOR);

      // The create call should have expiresAt roughly 24 hours from now
      const createArg = repository.create.mock.calls[0][0] as any;
      const expectedMs = 24 * 60 * 60 * 1000;
      const diff = createArg.expiresAt.getTime() - Date.now();
      expect(diff).toBeGreaterThan(expectedMs - 1000);
      expect(diff).toBeLessThan(expectedMs + 1000);
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
      const expiredInvite = Object.create(Object.prototype, {
        id: { value: 'invite-123', writable: true, enumerable: true },
        code: { value: 'ABC12345', writable: true, enumerable: true },
        role: { value: UserRole.OPERATOR, writable: true, enumerable: true },
        createdById: { value: 'user-123', writable: true, enumerable: true },
        usedById: { value: null, writable: true, enumerable: true },
        usedAt: { value: null, writable: true, enumerable: true },
        expiresAt: { value: new Date(Date.now() - 1000), writable: true, enumerable: true },
        isExpired: { get: () => true, enumerable: true },
      }) as unknown as Invite;
      repository.findOne.mockResolvedValue(expiredInvite);

      await expect(service.markAsUsed('invite-123', 'new-user')).rejects.toThrow(
        'Invite has expired',
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

  describe('claimInvite', () => {
    it('should claim a valid invite within a transaction', async () => {
      const validInvite = {
        ...mockInvite,
        usedById: null,
        isExpired: false,
      } as unknown as Invite;
      const savedInvite = {
        ...validInvite,
        usedById: 'new-user',
        usedAt: expect.any(Date),
      } as unknown as Invite;

      mockQueryRunner.manager.findOne.mockResolvedValue(validInvite);
      mockQueryRunner.manager.save.mockResolvedValue(savedInvite);

      const result = await service.claimInvite('ABC12345', 'new-user');

      expect(result).toEqual(savedInvite);
      expect(mockQueryRunner.connect).toHaveBeenCalled();
      expect(mockQueryRunner.startTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.manager.findOne).toHaveBeenCalledWith(Invite, {
        where: { code: 'ABC12345' },
        lock: { mode: 'pessimistic_write' },
      });
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });

    it('should rollback and throw NotFoundException when invite not found', async () => {
      mockQueryRunner.manager.findOne.mockResolvedValue(null);

      await expect(service.claimInvite('INVALID', 'user')).rejects.toThrow(
        NotFoundException,
      );

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
      expect(mockQueryRunner.commitTransaction).not.toHaveBeenCalled();
    });

    it('should rollback and throw BadRequestException when invite already used', async () => {
      const usedInvite = {
        ...mockInvite,
        usedById: 'existing-user',
        isExpired: false,
      } as unknown as Invite;
      mockQueryRunner.manager.findOne.mockResolvedValue(usedInvite);

      await expect(service.claimInvite('ABC12345', 'new-user')).rejects.toThrow(
        BadRequestException,
      );

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
      expect(mockQueryRunner.commitTransaction).not.toHaveBeenCalled();
    });

    it('should rollback and throw BadRequestException when invite expired', async () => {
      const expiredInvite = {
        ...mockInvite,
        usedById: null,
        isExpired: true,
      } as unknown as Invite;
      mockQueryRunner.manager.findOne.mockResolvedValue(expiredInvite);

      await expect(service.claimInvite('ABC12345', 'new-user')).rejects.toThrow(
        BadRequestException,
      );

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
      expect(mockQueryRunner.commitTransaction).not.toHaveBeenCalled();
    });

    it('should release queryRunner even when an unexpected error occurs', async () => {
      const dbError = new Error('Connection lost');
      mockQueryRunner.manager.findOne.mockRejectedValue(dbError);

      await expect(service.claimInvite('ABC12345', 'user')).rejects.toThrow(
        'Connection lost',
      );

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });
  });

  describe('deleteUnused', () => {
    it('should delete all unused invites', async () => {
      repository.delete.mockResolvedValue({ affected: 5 } as any);

      const result = await service.deleteUnused();

      expect(result).toBe(5);
    });

    it('should return 0 when affected is undefined', async () => {
      repository.delete.mockResolvedValue({ affected: undefined } as any);

      const result = await service.deleteUnused();

      expect(result).toBe(0);
    });
  });
});
