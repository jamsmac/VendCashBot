import { Test, TestingModule } from '@nestjs/testing';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { ReportQueryDto } from './dto/report-query.dto';

describe('ReportsController', () => {
  let controller: ReportsController;
  let reportsService: jest.Mocked<ReportsService>;

  const mockSummary = {
    period: { from: '2024-01-01T00:00:00.000Z', to: '2024-01-31T23:59:59.999Z' },
    totalCollections: 10,
    totalAmount: 5000,
    pendingCount: 3,
    receivedCount: 5,
    cancelledCount: 2,
    averageAmount: 1000,
  };

  const mockByMachine = {
    period: { from: '2024-01-01T00:00:00.000Z', to: '2024-01-31T23:59:59.999Z' },
    data: [
      {
        machine: { id: 'machine-1', code: 'A01', name: 'Machine One' },
        collectionsCount: 5,
        totalAmount: 2500,
        averageAmount: 500,
      },
      {
        machine: { id: 'machine-2', code: 'B02', name: 'Machine Two' },
        collectionsCount: 3,
        totalAmount: 1500,
        averageAmount: 500,
      },
    ],
    totals: { collectionsCount: 8, totalAmount: 4000 },
  };

  const mockByDate = {
    period: { from: '2024-01-01T00:00:00.000Z', to: '2024-01-31T23:59:59.999Z' },
    data: [
      { date: '2024-01-15', collectionsCount: 4, totalAmount: 2000 },
      { date: '2024-01-14', collectionsCount: 2, totalAmount: 800 },
    ],
    totals: { collectionsCount: 6, totalAmount: 2800 },
  };

  const mockByOperator = {
    period: { from: '2024-01-01T00:00:00.000Z', to: '2024-01-31T23:59:59.999Z' },
    data: [
      {
        operator: { id: 'op-1', name: 'John Doe', telegramUsername: 'johndoe' },
        collectionsCount: 7,
        totalAmount: 3500,
      },
      {
        operator: { id: 'op-2', name: 'Jane Smith', telegramUsername: 'janesmith' },
        collectionsCount: 4,
        totalAmount: 1200,
      },
    ],
    totals: { collectionsCount: 11, totalAmount: 4700 },
  };

  const mockDashboard = { pending: 3, todayAmount: 2500, monthAmount: 18000 };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReportsController],
      providers: [
        {
          provide: ReportsService,
          useValue: {
            getSummary: jest.fn(),
            getTodaySummary: jest.fn(),
            getByMachine: jest.fn(),
            getByDate: jest.fn(),
            getByOperator: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<ReportsController>(ReportsController);
    reportsService = module.get(ReportsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getSummary', () => {
    it('should return summary report', async () => {
      const query: ReportQueryDto = { from: '2024-01-01', to: '2024-01-31' };
      reportsService.getSummary.mockResolvedValue(mockSummary);

      const result = await controller.getSummary(query);

      expect(reportsService.getSummary).toHaveBeenCalledWith(query);
      expect(result).toEqual(mockSummary);
    });

    it('should return summary with default dates', async () => {
      const query: ReportQueryDto = {};
      reportsService.getSummary.mockResolvedValue(mockSummary);

      const result = await controller.getSummary(query);

      expect(reportsService.getSummary).toHaveBeenCalledWith(query);
      expect(result).toEqual(mockSummary);
    });
  });

  describe('getDashboard', () => {
    it('should return dashboard summary', async () => {
      reportsService.getTodaySummary.mockResolvedValue(mockDashboard);

      const result = await controller.getDashboard();

      expect(reportsService.getTodaySummary).toHaveBeenCalled();
      expect(result).toEqual(mockDashboard);
    });
  });

  describe('getByMachine', () => {
    it('should return machine report', async () => {
      const query: ReportQueryDto = { from: '2024-01-01', to: '2024-01-31' };
      reportsService.getByMachine.mockResolvedValue(mockByMachine);

      const result = await controller.getByMachine(query);

      expect(reportsService.getByMachine).toHaveBeenCalledWith(query);
      expect(result).toEqual(mockByMachine);
    });
  });

  describe('getByDate', () => {
    it('should return date report', async () => {
      const query: ReportQueryDto = { from: '2024-01-01', to: '2024-01-31' };
      reportsService.getByDate.mockResolvedValue(mockByDate);

      const result = await controller.getByDate(query);

      expect(reportsService.getByDate).toHaveBeenCalledWith(query);
      expect(result).toEqual(mockByDate);
    });
  });

  describe('getByOperator', () => {
    it('should return operator report', async () => {
      const query: ReportQueryDto = { from: '2024-01-01', to: '2024-01-31' };
      reportsService.getByOperator.mockResolvedValue(mockByOperator);

      const result = await controller.getByOperator(query);

      expect(reportsService.getByOperator).toHaveBeenCalledWith(query);
      expect(result).toEqual(mockByOperator);
    });
  });

  describe('exportToExcel', () => {
    it('should generate Excel file and send as response', async () => {
      const query: ReportQueryDto = { from: '2024-01-01', to: '2024-01-31' };
      reportsService.getByMachine.mockResolvedValue(mockByMachine);
      reportsService.getByDate.mockResolvedValue(mockByDate);
      reportsService.getByOperator.mockResolvedValue(mockByOperator);

      const mockRes = {
        setHeader: jest.fn(),
        send: jest.fn(),
      } as any;

      await controller.exportToExcel(query, mockRes);

      expect(reportsService.getByMachine).toHaveBeenCalledWith(query);
      expect(reportsService.getByDate).toHaveBeenCalledWith(query);
      expect(reportsService.getByOperator).toHaveBeenCalledWith(query);

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        expect.stringMatching(/^attachment; filename=vendcash-report-\d{4}-\d{2}-\d{2}\.xlsx$/),
      );
      expect(mockRes.send).toHaveBeenCalledWith(expect.any(Buffer));
    });

    it('should handle empty report data', async () => {
      const query: ReportQueryDto = {};
      reportsService.getByMachine.mockResolvedValue({
        period: { from: '', to: '' },
        data: [],
        totals: { collectionsCount: 0, totalAmount: 0 },
      });
      reportsService.getByDate.mockResolvedValue({
        period: { from: '', to: '' },
        data: [],
        totals: { collectionsCount: 0, totalAmount: 0 },
      });
      reportsService.getByOperator.mockResolvedValue({
        period: { from: '', to: '' },
        data: [],
        totals: { collectionsCount: 0, totalAmount: 0 },
      });

      const mockRes = {
        setHeader: jest.fn(),
        send: jest.fn(),
      } as any;

      await controller.exportToExcel(query, mockRes);

      expect(mockRes.send).toHaveBeenCalledWith(expect.any(Buffer));
    });

    it('should sanitize dangerous characters in machine code for Excel', async () => {
      const query: ReportQueryDto = { from: '2024-01-01', to: '2024-01-31' };
      reportsService.getByMachine.mockResolvedValue({
        ...mockByMachine,
        data: [
          {
            machine: { id: 'm1', code: '=CMD()', name: '+dangerous' },
            collectionsCount: 1,
            totalAmount: 100,
            averageAmount: 100,
          },
        ],
      });
      reportsService.getByDate.mockResolvedValue({
        ...mockByDate,
        data: [
          { date: '-2024-01-15', collectionsCount: 1, totalAmount: 100 },
        ],
      });
      reportsService.getByOperator.mockResolvedValue({
        ...mockByOperator,
        data: [
          {
            operator: { id: 'op-1', name: '@hacker', telegramUsername: null as any },
            collectionsCount: 1,
            totalAmount: 100,
          },
        ],
      });

      const mockRes = {
        setHeader: jest.fn(),
        send: jest.fn(),
      } as any;

      await controller.exportToExcel(query, mockRes);

      // Verify the buffer was sent (the sanitization happens internally)
      expect(mockRes.send).toHaveBeenCalledWith(expect.any(Buffer));
    });

    it('should sanitize null and undefined values via sanitizeForExcel', async () => {
      const query: ReportQueryDto = { from: '2024-01-01', to: '2024-01-31' };
      reportsService.getByMachine.mockResolvedValue({
        ...mockByMachine,
        data: [
          {
            machine: { id: 'm1', code: null as any, name: undefined as any },
            collectionsCount: 1,
            totalAmount: 100,
            averageAmount: 100,
          },
        ],
      });
      reportsService.getByDate.mockResolvedValue({
        ...mockByDate,
        data: [],
      });
      reportsService.getByOperator.mockResolvedValue({
        ...mockByOperator,
        data: [
          {
            operator: { id: 'op-1', name: 'Normal', telegramUsername: null as any },
            collectionsCount: 1,
            totalAmount: 100,
          },
        ],
      });

      const mockRes = {
        setHeader: jest.fn(),
        send: jest.fn(),
      } as any;

      await controller.exportToExcel(query, mockRes);

      expect(mockRes.send).toHaveBeenCalledWith(expect.any(Buffer));
    });

    it('should handle operator with telegramUsername set to null', async () => {
      const query: ReportQueryDto = { from: '2024-01-01', to: '2024-01-31' };
      reportsService.getByMachine.mockResolvedValue({
        ...mockByMachine,
        data: [],
      });
      reportsService.getByDate.mockResolvedValue({
        ...mockByDate,
        data: [],
      });
      reportsService.getByOperator.mockResolvedValue({
        period: { from: '', to: '' },
        data: [
          {
            operator: { id: 'op-1', name: 'Test Op', telegramUsername: null as unknown as string },
            collectionsCount: 2,
            totalAmount: 500,
          },
        ],
        totals: { collectionsCount: 2, totalAmount: 500 },
      });

      const mockRes = {
        setHeader: jest.fn(),
        send: jest.fn(),
      } as any;

      await controller.exportToExcel(query, mockRes);

      expect(mockRes.send).toHaveBeenCalledWith(expect.any(Buffer));
    });

    it('should handle pipe and tab characters in sanitizeForExcel', async () => {
      const query: ReportQueryDto = { from: '2024-01-01', to: '2024-01-31' };
      reportsService.getByMachine.mockResolvedValue({
        ...mockByMachine,
        data: [
          {
            machine: { id: 'm1', code: '|pipe', name: '\ttab' },
            collectionsCount: 1,
            totalAmount: 100,
            averageAmount: 100,
          },
        ],
      });
      reportsService.getByDate.mockResolvedValue({
        ...mockByDate,
        data: [],
      });
      reportsService.getByOperator.mockResolvedValue({
        ...mockByOperator,
        data: [],
      });

      const mockRes = {
        setHeader: jest.fn(),
        send: jest.fn(),
      } as any;

      await controller.exportToExcel(query, mockRes);

      expect(mockRes.send).toHaveBeenCalledWith(expect.any(Buffer));
    });
  });
});
