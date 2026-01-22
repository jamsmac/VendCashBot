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
  getDashboard: async (): Promise<DashboardSummary> => {
    const response = await apiClient.get('/reports/dashboard')
    return response.data
  },

  getSummary: async (query: ReportQuery = {}): Promise<SummaryReport> => {
    const response = await apiClient.get('/reports/summary', { params: query })
    return response.data
  },

  getByMachine: async (query: ReportQuery = {}): Promise<{
    period: { from: string; to: string }
    data: MachineReport[]
    totals: { collectionsCount: number; totalAmount: number }
  }> => {
    const response = await apiClient.get('/reports/by-machine', { params: query })
    return response.data
  },

  getByDate: async (query: ReportQuery = {}): Promise<{
    period: { from: string; to: string }
    data: DateReport[]
    totals: { collectionsCount: number; totalAmount: number }
  }> => {
    const response = await apiClient.get('/reports/by-date', { params: query })
    return response.data
  },

  getByOperator: async (query: ReportQuery = {}): Promise<{
    period: { from: string; to: string }
    data: OperatorReport[]
    totals: { collectionsCount: number; totalAmount: number }
  }> => {
    const response = await apiClient.get('/reports/by-operator', { params: query })
    return response.data
  },

  exportExcel: async (query: ReportQuery = {}): Promise<Blob> => {
    const response = await apiClient.get('/reports/export', {
      params: query,
      responseType: 'blob',
    })
    return response.data
  },
}
