import { apiClient } from './client'

export interface SalesOrder {
  id: string
  orderNumber?: string
  productName?: string
  flavor?: string
  paymentMethod: 'cash' | 'card'
  paymentStatus: 'paid' | 'refunded'
  machineCode: string
  machineId?: string
  machine?: { id: string; code: string; name: string }
  address?: string
  price: number
  orderDate: string
  importBatchId: string
  importedAt: string
}

export interface ImportResult {
  imported: number
  skipped: number
  duplicates: number
  errors: string[]
  batchId: string
  machinesFound: number
  machinesNotFound: string[]
}

export interface SalesQuery {
  machineCode?: string
  paymentMethod?: 'cash' | 'card'
  paymentStatus?: 'paid' | 'refunded'
  from?: string
  to?: string
  page?: number
  limit?: number
}

export interface SalesSummaryMachine {
  machineCode: string
  machineName: string | null
  cashTotal: number
  cashCount: number
  cardTotal: number
  cardCount: number
  refundTotal: number
  refundCount: number
}

export interface SalesSummary {
  machines: SalesSummaryMachine[]
  totals: {
    cashTotal: number
    cashCount: number
    cardTotal: number
    cardCount: number
    refundTotal: number
    refundCount: number
  }
}

export interface ReconciliationItem {
  machineCode: string
  machineName: string
  periodStart: string
  periodEnd: string
  expectedAmount: number
  actualAmount: number
  difference: number
  percentDeviation: number
  status: 'matched' | 'shortage' | 'overage' | 'no_sales'
  cashOrdersCount: number
  collectionId: string
}

export interface ReconciliationResult {
  items: ReconciliationItem[]
  summary: {
    totalExpected: number
    totalActual: number
    totalDifference: number
    matchedCount: number
    shortageCount: number
    overageCount: number
    noSalesCount: number
  }
}

export interface DailyStatsItem {
  date: string
  cashTotal: number
  cashCount: number
  cardTotal: number
  cardCount: number
}

export interface TopMachineItem {
  machineCode: string
  machineName: string | null
  total: number
  count: number
}

export interface ImportBatch {
  batchId: string
  importedAt: string
  ordersCount: number
}

export const salesApi = {
  import: async (
    file: File,
    options?: {
      onUploadProgress?: (progress: { loaded: number; total: number; percent: number }) => void
      signal?: AbortSignal
    },
  ): Promise<ImportResult> => {
    const formData = new FormData()
    formData.append('file', file)
    const response = await apiClient.post('/sales/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120000, // 2 min for large files
      signal: options?.signal,
      onUploadProgress: options?.onUploadProgress
        ? (progressEvent) => {
            const total = progressEvent.total || file.size
            const loaded = progressEvent.loaded
            options.onUploadProgress!({ loaded, total, percent: Math.round((loaded / total) * 100) })
          }
        : undefined,
    })
    return response.data
  },

  getOrders: async (query: SalesQuery = {}, signal?: AbortSignal): Promise<{ data: SalesOrder[]; total: number }> => {
    const response = await apiClient.get('/sales/orders', { params: query, signal })
    return response.data
  },

  getSummary: async (query: { from?: string; to?: string } = {}, signal?: AbortSignal): Promise<SalesSummary> => {
    const response = await apiClient.get('/sales/summary', { params: query, signal })
    return response.data
  },

  getReconciliation: async (
    query: { machineCode?: string; from?: string; to?: string } = {},
    signal?: AbortSignal,
  ): Promise<ReconciliationResult> => {
    const response = await apiClient.get('/sales/reconciliation', { params: query, signal })
    return response.data
  },

  getMachineCodes: async (signal?: AbortSignal): Promise<string[]> => {
    const response = await apiClient.get('/sales/machine-codes', { signal })
    return response.data
  },

  getBatches: async (signal?: AbortSignal): Promise<ImportBatch[]> => {
    const response = await apiClient.get('/sales/batches', { signal })
    return response.data
  },

  deleteBatch: async (batchId: string): Promise<{ deleted: number }> => {
    const response = await apiClient.delete(`/sales/batches/${batchId}`)
    return response.data
  },

  getDailyStats: async (
    query: { from?: string; to?: string } = {},
    signal?: AbortSignal,
  ): Promise<DailyStatsItem[]> => {
    const response = await apiClient.get('/sales/daily-stats', { params: query, signal })
    return response.data
  },

  getTopMachines: async (
    query: { from?: string; to?: string; limit?: number } = {},
    signal?: AbortSignal,
  ): Promise<TopMachineItem[]> => {
    const response = await apiClient.get('/sales/top-machines', { params: query, signal })
    return response.data
  },

  notifyShortages: async (
    query: { machineCode?: string; from?: string; to?: string } = {},
  ): Promise<{ totalItems: number; shortagesFound: number; alertsSent: boolean }> => {
    const response = await apiClient.post('/sales/reconciliation/notify', null, { params: query })
    return response.data
  },

  exportReconciliation: async (
    query: { machineCode?: string; from?: string; to?: string } = {},
    signal?: AbortSignal,
  ): Promise<Blob> => {
    const response = await apiClient.get('/sales/reconciliation/export', {
      params: query,
      responseType: 'blob',
      signal,
    })
    return response.data
  },

  getImportFileUrl: async (batchId: string): Promise<{ url: string; originalName: string }> => {
    const response = await apiClient.get(`/sales/batches/${batchId}/file`)
    return response.data
  },
}
