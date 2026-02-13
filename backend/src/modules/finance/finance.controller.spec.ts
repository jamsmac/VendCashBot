import { Test, TestingModule } from '@nestjs/testing';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';
import { User, UserRole } from '../users/entities/user.entity';

describe('FinanceController', () => {
  let controller: FinanceController;
  let financeService: jest.Mocked<FinanceService>;

  const mockUser = {
    id: 'user-123',
    name: 'Test User',
    role: UserRole.MANAGER,
  } as User;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FinanceController],
      providers: [
        {
          provide: FinanceService,
          useValue: {
            getBalance: jest.fn(),
            findAllDeposits: jest.fn(),
            createDeposit: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<FinanceController>(FinanceController);
    financeService = module.get(FinanceService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getBalance', () => {
    it('should return balance from service', async () => {
      const balanceResult = { received: 10000, deposited: 5000, balance: 5000 };
      financeService.getBalance.mockResolvedValue(balanceResult);

      const result = await controller.getBalance();

      expect(result).toEqual(balanceResult);
      expect(financeService.getBalance).toHaveBeenCalledTimes(1);
    });
  });

  describe('getDeposits', () => {
    it('should return deposits from service', async () => {
      const deposits = [
        { id: 'dep-1', amount: 5000, depositDate: new Date() },
        { id: 'dep-2', amount: 3000, depositDate: new Date() },
      ];
      financeService.findAllDeposits.mockResolvedValue(deposits as any);

      const result = await controller.getDeposits();

      expect(result).toEqual(deposits);
      expect(financeService.findAllDeposits).toHaveBeenCalledTimes(1);
    });
  });

  describe('createDeposit', () => {
    it('should create a deposit via service', async () => {
      const dto = { amount: 5000, date: '2025-01-15', notes: 'Test deposit' };
      const createdDeposit = {
        id: 'dep-new',
        amount: 5000,
        depositDate: new Date('2025-01-15'),
        notes: 'Test deposit',
        createdById: 'user-123',
      };
      financeService.createDeposit.mockResolvedValue(createdDeposit as any);

      const result = await controller.createDeposit(dto, mockUser);

      expect(result).toEqual(createdDeposit);
      expect(financeService.createDeposit).toHaveBeenCalledWith('user-123', dto);
    });

    it('should pass user id from CurrentUser decorator', async () => {
      const dto = { amount: 1000, date: '2025-02-01' };
      const adminUser = { id: 'admin-456', role: UserRole.ADMIN } as User;
      financeService.createDeposit.mockResolvedValue({} as any);

      await controller.createDeposit(dto, adminUser);

      expect(financeService.createDeposit).toHaveBeenCalledWith('admin-456', dto);
    });
  });
});
