import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { FinanceService } from './finance.service';
import { BankDeposit } from './entities/bank-deposit.entity';
import { Collection, CollectionStatus } from '../collections/entities/collection.entity';

describe('FinanceService', () => {
  let service: FinanceService;
  let depositRepository: jest.Mocked<Repository<BankDeposit>>;
  let collectionRepository: jest.Mocked<Repository<Collection>>;
  let dataSource: jest.Mocked<DataSource>;

  const mockDeposit = {
    id: 'deposit-123',
    amount: 5000,
    depositDate: new Date('2025-01-15'),
    notes: 'Weekly deposit',
    createdById: 'user-123',
    createdBy: null,
    createdAt: new Date(),
  } as unknown as BankDeposit;

  const mockCollection = {
    id: 'collection-123',
    amount: 10000,
    status: CollectionStatus.RECEIVED,
    machineId: 'machine-1',
    operatorId: 'user-456',
  } as unknown as Collection;

  // QueryRunner mock — shared across tests but reset in beforeEach
  let mockQueryRunner: {
    connect: jest.Mock;
    startTransaction: jest.Mock;
    commitTransaction: jest.Mock;
    rollbackTransaction: jest.Mock;
    release: jest.Mock;
    manager: {
      createQueryBuilder: jest.Mock;
    };
  };

  // Query builder returned by queryRunner.manager.createQueryBuilder
  let mockQrQueryBuilder: {
    select: jest.Mock;
    where: jest.Mock;
    getRawOne: jest.Mock;
  };

  beforeEach(async () => {
    mockQrQueryBuilder = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getRawOne: jest.fn(),
    };

    mockQueryRunner = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      manager: {
        createQueryBuilder: jest.fn().mockReturnValue(mockQrQueryBuilder),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FinanceService,
        {
          provide: getRepositoryToken(BankDeposit),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            find: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Collection),
          useValue: {},
        },
        {
          provide: DataSource,
          useValue: {
            createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
          },
        },
      ],
    }).compile();

    service = module.get<FinanceService>(FinanceService);
    depositRepository = module.get(getRepositoryToken(BankDeposit));
    collectionRepository = module.get(getRepositoryToken(Collection));
    dataSource = module.get(DataSource);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // createDeposit
  // ---------------------------------------------------------------------------
  describe('createDeposit', () => {
    it('should create and save a deposit with provided data', async () => {
      depositRepository.create.mockReturnValue(mockDeposit);
      depositRepository.save.mockResolvedValue(mockDeposit);

      const result = await service.createDeposit('user-123', {
        amount: 5000,
        notes: 'Weekly deposit',
        date: '2025-01-15',
      });

      expect(result).toEqual(mockDeposit);
      expect(depositRepository.create).toHaveBeenCalledWith({
        amount: 5000,
        notes: 'Weekly deposit',
        depositDate: new Date('2025-01-15'),
        createdById: 'user-123',
      });
      expect(depositRepository.save).toHaveBeenCalledWith(mockDeposit);
    });

    it('should create a deposit without optional notes', async () => {
      const depositNoNotes = { ...mockDeposit, notes: undefined } as unknown as BankDeposit;
      depositRepository.create.mockReturnValue(depositNoNotes);
      depositRepository.save.mockResolvedValue(depositNoNotes);

      const result = await service.createDeposit('user-123', {
        amount: 3000,
        date: '2025-02-01',
      });

      expect(result).toEqual(depositNoNotes);
      expect(depositRepository.create).toHaveBeenCalledWith({
        amount: 3000,
        notes: undefined,
        depositDate: new Date('2025-02-01'),
        createdById: 'user-123',
      });
    });

    it('should propagate repository save errors', async () => {
      depositRepository.create.mockReturnValue(mockDeposit);
      depositRepository.save.mockRejectedValue(new Error('DB write error'));

      await expect(
        service.createDeposit('user-123', { amount: 5000, date: '2025-01-15' }),
      ).rejects.toThrow('DB write error');
    });
  });

  // ---------------------------------------------------------------------------
  // findAllDeposits
  // ---------------------------------------------------------------------------
  describe('findAllDeposits', () => {
    it('should return all deposits ordered by depositDate DESC with createdBy relation', async () => {
      const deposits = [mockDeposit];
      depositRepository.find.mockResolvedValue(deposits);

      const result = await service.findAllDeposits();

      expect(result).toEqual(deposits);
      expect(depositRepository.find).toHaveBeenCalledWith({
        order: { depositDate: 'DESC' },
        relations: ['createdBy'],
      });
    });

    it('should return empty array when no deposits exist', async () => {
      depositRepository.find.mockResolvedValue([]);

      const result = await service.findAllDeposits();

      expect(result).toEqual([]);
    });

    it('should propagate repository errors', async () => {
      depositRepository.find.mockRejectedValue(new Error('Connection lost'));

      await expect(service.findAllDeposits()).rejects.toThrow('Connection lost');
    });
  });

  // ---------------------------------------------------------------------------
  // getBalance
  // ---------------------------------------------------------------------------
  describe('getBalance', () => {
    it('should return correct balance when both received and deposited values exist', async () => {
      // First call: Collection query -> totalReceived
      // Second call: BankDeposit query -> totalDeposited
      mockQrQueryBuilder.getRawOne
        .mockResolvedValueOnce({ totalReceived: '15000.50' })
        .mockResolvedValueOnce({ totalDeposited: '10000.25' });

      const result = await service.getBalance();

      expect(result).toEqual({
        received: 15000.5,
        deposited: 10000.25,
        balance: 5000.25,
      });

      // Verify transaction lifecycle
      expect(mockQueryRunner.connect).toHaveBeenCalled();
      expect(mockQueryRunner.startTransaction).toHaveBeenCalledWith('REPEATABLE READ');
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });

    it('should return zeros when no collections or deposits exist (COALESCE returns 0)', async () => {
      mockQrQueryBuilder.getRawOne
        .mockResolvedValueOnce({ totalReceived: '0' })
        .mockResolvedValueOnce({ totalDeposited: '0' });

      const result = await service.getBalance();

      expect(result).toEqual({
        received: 0,
        deposited: 0,
        balance: 0,
      });
    });

    it('should handle negative balance (deposited > received)', async () => {
      mockQrQueryBuilder.getRawOne
        .mockResolvedValueOnce({ totalReceived: '5000' })
        .mockResolvedValueOnce({ totalDeposited: '8000' });

      const result = await service.getBalance();

      expect(result).toEqual({
        received: 5000,
        deposited: 8000,
        balance: -3000,
      });
    });

    it('should round results to 2 decimal places', async () => {
      mockQrQueryBuilder.getRawOne
        .mockResolvedValueOnce({ totalReceived: '100.555' })
        .mockResolvedValueOnce({ totalDeposited: '50.444' });

      const result = await service.getBalance();

      // Math.round(100.555 * 100) / 100 = 100.56
      // Math.round(50.444 * 100) / 100 = 50.44
      // Math.round((100.555 - 50.444) * 100) / 100 = Math.round(50.111 * 100) / 100 = 50.11
      expect(result.received).toBe(100.56);
      expect(result.deposited).toBe(50.44);
      expect(result.balance).toBe(50.11);
    });

    it('should handle null/NaN values gracefully via || 0 fallback', async () => {
      mockQrQueryBuilder.getRawOne
        .mockResolvedValueOnce({ totalReceived: null })
        .mockResolvedValueOnce({ totalDeposited: null });

      const result = await service.getBalance();

      expect(result).toEqual({
        received: 0,
        deposited: 0,
        balance: 0,
      });
    });

    it('should call createQueryBuilder with correct entities', async () => {
      mockQrQueryBuilder.getRawOne
        .mockResolvedValueOnce({ totalReceived: '0' })
        .mockResolvedValueOnce({ totalDeposited: '0' });

      await service.getBalance();

      // First call for Collection, second for BankDeposit
      expect(mockQueryRunner.manager.createQueryBuilder).toHaveBeenCalledTimes(2);
      expect(mockQueryRunner.manager.createQueryBuilder).toHaveBeenNthCalledWith(
        1,
        Collection,
        'collection',
      );
      expect(mockQueryRunner.manager.createQueryBuilder).toHaveBeenNthCalledWith(
        2,
        BankDeposit,
        'deposit',
      );
    });

    it('should filter collections by RECEIVED status', async () => {
      mockQrQueryBuilder.getRawOne
        .mockResolvedValueOnce({ totalReceived: '0' })
        .mockResolvedValueOnce({ totalDeposited: '0' });

      await service.getBalance();

      // The where clause is called on the first query builder (for collections)
      expect(mockQrQueryBuilder.where).toHaveBeenCalledWith(
        'collection.status = :status',
        { status: CollectionStatus.RECEIVED },
      );
    });

    it('should rollback transaction and re-throw on query error', async () => {
      const dbError = new Error('Query failed');
      mockQrQueryBuilder.getRawOne.mockRejectedValueOnce(dbError);

      await expect(service.getBalance()).rejects.toThrow('Query failed');

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.commitTransaction).not.toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });

    it('should release queryRunner even when rollback itself fails', async () => {
      const dbError = new Error('Query failed');
      mockQrQueryBuilder.getRawOne.mockRejectedValueOnce(dbError);
      mockQueryRunner.rollbackTransaction.mockRejectedValueOnce(
        new Error('Rollback failed'),
      );

      // The rollback error will propagate instead of the original error
      await expect(service.getBalance()).rejects.toThrow('Rollback failed');

      // release is in the finally block, so it should always be called
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });

    it('should release queryRunner even when commit fails', async () => {
      mockQrQueryBuilder.getRawOne
        .mockResolvedValueOnce({ totalReceived: '100' })
        .mockResolvedValueOnce({ totalDeposited: '50' });
      mockQueryRunner.commitTransaction.mockRejectedValueOnce(
        new Error('Commit failed'),
      );

      await expect(service.getBalance()).rejects.toThrow('Commit failed');

      // rollback is called in catch, release in finally
      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });
  });
});
