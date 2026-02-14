import { apiClient } from './client'

export interface DashboardSummary {
  pending: number
  todayAmount: number
  monthAmount: number
}

export interface SummaryReport {
  period: { from: string; to: string }
  totalCollections: number
  totalAmount: number
  pendingCount: number
  receivedCount: number
  cancelledCount: number
  averageAmount: number
}

export interface MachineReport {
  machine: { id: string; code: string; name: string }
  collectionsCount: number
  totalAmount: number
  averageAmount: number
}

export interface DateReport {
  date: string
  collectionsCount: number
  totalAmount: number
}

export interface OperatorReport {
  operator: { id: string; name: string; telegramUsername?: string }
  collectionsCount: number
  totalAmount: number
}

export interface ReportQuery {
  from?: string
  to?: string
}

export const reportsApi = {
  getDashboard: async (signal?: AbortSignal): Promise<DashboardSummary> => {
    const response = await apiClient.get('/reports/dashboard', { signal })
    return response.data
  },

  getSummary: async (query: ReportQuery = {}, signal?: AbortSignal): Promise<SummaryReport> => {
    const response = await apiClient.get('/reports/summary', { params: query, signal })
    return response.data
  },

  getByMachine: async (query: ReportQuery = {}, signal?: AbortSignal): Promise<{
    period: { from: string; to: string }
    data: MachineReport[]
    totals: { collectionsCount: number; totalAmount: number }
  }> => {
    const response = await apiClient.get('/reports/by-machine', { params: query, signal })
    return response.data
  },

  getByDate: async (query: ReportQuery = {}, signal?: AbortSignal): Promise<{
    period: { from: string; to: string }
    data: DateReport[]
    totals: { collectionsCount: number; totalAmount: number }
  }> => {
    const response = await apiClient.get('/reports/by-date', { params: query, signal })
    return response.data
  },

  getByOperator: async (query: ReportQuery = {}, signal?: AbortSignal): Promise<{
    period: { from: string; to: string }
    data: OperatorReport[]
    totals: { collectionsCount: number; totalAmount: number }
  }> => {
    const response = await apiClient.get('/reports/by-operator', { params: query, signal })
    return response.data
  },

  exportExcel: async (query: ReportQuery = {}, signal?: AbortSignal): Promise<Blob> => {
    const response = await apiClient.get('/reports/export', {
      params: query,
      responseType: 'blob',
      signal,
    })
    return response.data
  },
}
