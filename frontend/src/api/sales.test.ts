import { describe, it, expect, vi, beforeEach } from 'vitest'
import { salesApi } from './sales'

// Mock the client module
vi.mock('./client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

import { apiClient } from './client'

const mockGet = vi.mocked(apiClient.get)
const mockPost = vi.mocked(apiClient.post)
const mockDelete = vi.mocked(apiClient.delete)

describe('salesApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('import', () => {
    it('should upload file as FormData with extended timeout', async () => {
      const mockResult = { imported: 100, skipped: 0, duplicates: 5, errors: [], batchId: 'b1', machinesFound: 10, machinesNotFound: [] }
      mockPost.mockResolvedValue({ data: mockResult })

      const file = new File(['test'], 'orders.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const result = await salesApi.import(file)

      expect(mockPost).toHaveBeenCalledWith('/sales/import', expect.any(FormData), expect.objectContaining({
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120000,
      }))
      expect(result).toEqual(mockResult)
    })
  })

  describe('getOrders', () => {
    it('should fetch orders with query params', async () => {
      const mockData = { data: [], total: 0 }
      mockGet.mockResolvedValue({ data: mockData })

      const result = await salesApi.getOrders({ machineCode: 'M001', page: 1, limit: 50 })

      expect(mockGet).toHaveBeenCalledWith('/sales/orders', {
        params: { machineCode: 'M001', page: 1, limit: 50 },
        signal: undefined,
      })
      expect(result).toEqual(mockData)
    })

    it('should work with empty query', async () => {
      mockGet.mockResolvedValue({ data: { data: [], total: 0 } })
      await salesApi.getOrders()
      expect(mockGet).toHaveBeenCalledWith('/sales/orders', { params: {}, signal: undefined })
    })
  })

  describe('getSummary', () => {
    it('should fetch summary with date range', async () => {
      const mockSummary = { machines: [], totals: { cashTotal: 0, cashCount: 0, cardTotal: 0, cardCount: 0, refundTotal: 0, refundCount: 0 } }
      mockGet.mockResolvedValue({ data: mockSummary })

      const result = await salesApi.getSummary({ from: '2025-01-01', to: '2025-01-31' })

      expect(mockGet).toHaveBeenCalledWith('/sales/summary', {
        params: { from: '2025-01-01', to: '2025-01-31' },
        signal: undefined,
      })
      expect(result).toEqual(mockSummary)
    })
  })

  describe('getReconciliation', () => {
    it('should fetch reconciliation data', async () => {
      const mockResult = { items: [], summary: { totalExpected: 0, totalActual: 0, totalDifference: 0, matchedCount: 0, shortageCount: 0, overageCount: 0, noSalesCount: 0 } }
      mockGet.mockResolvedValue({ data: mockResult })

      const result = await salesApi.getReconciliation({ machineCode: 'M001' })

      expect(mockGet).toHaveBeenCalledWith('/sales/reconciliation', {
        params: { machineCode: 'M001' },
        signal: undefined,
      })
      expect(result).toEqual(mockResult)
    })
  })

  describe('getMachineCodes', () => {
    it('should return array of machine codes', async () => {
      mockGet.mockResolvedValue({ data: ['M001', 'M002'] })

      const result = await salesApi.getMachineCodes()

      expect(mockGet).toHaveBeenCalledWith('/sales/machine-codes', { signal: undefined })
      expect(result).toEqual(['M001', 'M002'])
    })
  })

  describe('getBatches', () => {
    it('should return import batches', async () => {
      const batches = [{ batchId: 'b1', importedAt: '2025-01-15T10:00:00Z', ordersCount: 100 }]
      mockGet.mockResolvedValue({ data: batches })

      const result = await salesApi.getBatches()

      expect(result).toEqual(batches)
    })
  })

  describe('deleteBatch', () => {
    it('should delete batch by ID', async () => {
      mockDelete.mockResolvedValue({ data: { deleted: 50 } })

      const result = await salesApi.deleteBatch('batch-123')

      expect(mockDelete).toHaveBeenCalledWith('/sales/batches/batch-123')
      expect(result).toEqual({ deleted: 50 })
    })
  })

  describe('getDailyStats', () => {
    it('should fetch daily stats with date range', async () => {
      const stats = [{ date: '2025-01-15', cashTotal: 50000, cashCount: 10, cardTotal: 30000, cardCount: 5 }]
      mockGet.mockResolvedValue({ data: stats })

      const result = await salesApi.getDailyStats({ from: '2025-01-01', to: '2025-01-31' })

      expect(mockGet).toHaveBeenCalledWith('/sales/daily-stats', {
        params: { from: '2025-01-01', to: '2025-01-31' },
        signal: undefined,
      })
      expect(result).toEqual(stats)
    })
  })

  describe('getTopMachines', () => {
    it('should fetch top machines with limit', async () => {
      const machines = [{ machineCode: 'M001', machineName: 'Machine 1', total: 500000, count: 100 }]
      mockGet.mockResolvedValue({ data: machines })

      const result = await salesApi.getTopMachines({ limit: 5 })

      expect(mockGet).toHaveBeenCalledWith('/sales/top-machines', {
        params: { limit: 5 },
        signal: undefined,
      })
      expect(result).toEqual(machines)
    })
  })

  describe('notifyShortages', () => {
    it('should post notify request', async () => {
      const response = { totalItems: 10, shortagesFound: 2, alertsSent: true }
      mockPost.mockResolvedValue({ data: response })

      const result = await salesApi.notifyShortages({ from: '2025-01-01' })

      expect(mockPost).toHaveBeenCalledWith('/sales/reconciliation/notify', null, {
        params: { from: '2025-01-01' },
      })
      expect(result).toEqual(response)
    })
  })

  describe('exportReconciliation', () => {
    it('should fetch blob for export', async () => {
      const blob = new Blob(['test'])
      mockGet.mockResolvedValue({ data: blob })

      const result = await salesApi.exportReconciliation({ machineCode: 'M001' })

      expect(mockGet).toHaveBeenCalledWith('/sales/reconciliation/export', {
        params: { machineCode: 'M001' },
        responseType: 'blob',
        signal: undefined,
      })
      expect(result).toBeInstanceOf(Blob)
    })
  })
})
