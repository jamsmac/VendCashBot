import { Test, TestingModule } from '@nestjs/testing';
import { InvitesController } from './invites.controller';
import { InvitesService } from './invites.service';
import { User, UserRole } from '../users/entities/user.entity';

describe('InvitesController', () => {
  let controller: InvitesController;
  let invitesService: jest.Mocked<InvitesService>;

  const mockUser = {
    id: 'admin-123',
    name: 'Admin User',
    role: UserRole.ADMIN,
  } as User;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InvitesController],
      providers: [
        {
          provide: InvitesService,
          useValue: {
            findAll: jest.fn(),
            findPending: jest.fn(),
            create: jest.fn(),
            delete: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<InvitesController>(InvitesController);
    invitesService = module.get(InvitesService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should return all invites from service', async () => {
      const invites = [
        { id: 'inv-1', code: 'ABC123', role: UserRole.OPERATOR },
        { id: 'inv-2', code: 'DEF456', role: UserRole.MANAGER },
      ];
      invitesService.findAll.mockResolvedValue(invites as any);

      const result = await controller.findAll();

      expect(result).toEqual(invites);
      expect(invitesService.findAll).toHaveBeenCalledTimes(1);
    });
  });

  describe('findPending', () => {
    it('should return pending invites from service', async () => {
      const pendingInvites = [
        { id: 'inv-1', code: 'ABC123', usedById: null },
      ];
      invitesService.findPending.mockResolvedValue(pendingInvites as any);

      const result = await controller.findPending();

      expect(result).toEqual(pendingInvites);
      expect(invitesService.findPending).toHaveBeenCalledTimes(1);
    });
  });

  describe('create', () => {
    it('should create an invite with given role and user id', async () => {
      const createdInvite = {
        id: 'inv-new',
        code: 'NEW123',
        role: UserRole.OPERATOR,
        createdById: 'admin-123',
      };
      invitesService.create.mockResolvedValue(createdInvite as any);

      const result = await controller.create(
        { role: UserRole.OPERATOR },
        mockUser,
      );

      expect(result).toEqual(createdInvite);
      expect(invitesService.create).toHaveBeenCalledWith('admin-123', UserRole.OPERATOR);
    });

    it('should pass manager role correctly', async () => {
      invitesService.create.mockResolvedValue({} as any);

      await controller.create({ role: UserRole.MANAGER }, mockUser);

      expect(invitesService.create).toHaveBeenCalledWith('admin-123', UserRole.MANAGER);
    });
  });

  describe('delete', () => {
    it('should delete invite and return success', async () => {
      invitesService.delete.mockResolvedValue(undefined);

      const result = await controller.delete('inv-123');

      expect(result).toEqual({ success: true });
      expect(invitesService.delete).toHaveBeenCalledWith('inv-123');
    });

    it('should propagate service errors', async () => {
      invitesService.delete.mockRejectedValue(new Error('Not found'));

      await expect(controller.delete('invalid')).rejects.toThrow('Not found');
    });
  });
});
