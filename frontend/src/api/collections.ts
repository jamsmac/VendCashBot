import { apiClient } from './client'

export interface Machine {
  id: string
  code: string
  name: string
  location?: string
}

export interface Collection {
  id: string
  machine: Machine
  operator: { id: string; name: string; telegramUsername?: string }
  manager?: { id: string; name: string }
  collectedAt: string
  receivedAt?: string
  amount?: number
  status: 'collected' | 'received' | 'cancelled'
  source: 'realtime' | 'manual_history' | 'excel_import'
  notes?: string
  createdAt: string
}

export interface CollectionQuery {
  status?: string
  machineId?: string
  operatorId?: string
  source?: string
  from?: string
  to?: string
  sortBy?: string
  sortOrder?: 'ASC' | 'DESC'
  page?: number
  limit?: number
}

export interface BulkCancelResult {
  cancelled: number
  failed: number
  errors: { id: string; error: string }[]
  total: number
}

export const collectionsApi = {
  getAll: async (query: CollectionQuery = {}): Promise<{ data: Collection[]; total: number }> => {
    const response = await apiClient.get('/collections', { params: query })
    return response.data
  },

  getPending: async (): Promise<Collection[]> => {
    const response = await apiClient.get('/collections/pending')
    return response.data
  },

  getById: async (id: string): Promise<Collection> => {
    const response = await apiClient.get(`/collections/${id}`)
    return response.data
  },

  receive: async (id: string, data: { amount: number; notes?: string }): Promise<Collection> => {
    const response = await apiClient.patch(`/collections/${id}/receive`, data)
    return response.data
  },

  edit: async (id: string, data: { amount: number; reason: string }): Promise<Collection> => {
    const response = await apiClient.patch(`/collections/${id}/edit`, data)
    return response.data
  },

  cancel: async (id: string, reason?: string): Promise<Collection> => {
    const response = await apiClient.patch(`/collections/${id}/cancel`, { reason })
    return response.data
  },

  bulkCancel: async (data: {
    ids?: string[]
    useFilters?: boolean
    status?: string
    machineId?: string
    operatorId?: string
    source?: string
    from?: string
    to?: string
    reason?: string
  }): Promise<BulkCancelResult> => {
    const response = await apiClient.patch('/collections/bulk-cancel', data)
    return response.data
  },

  bulkCreate: async (data: {
    collections: Array<{
      machineId?: string
      machineCode?: string
      collectedAt: string
      amount?: number
      notes?: string
    }>
    source?: string
  }) => {
    const response = await apiClient.post('/collections/bulk', data)
    return response.data
  },

  getHistory: async (id: string) => {
    const response = await apiClient.get(`/collections/${id}/history`)
    return response.data
  },
}
