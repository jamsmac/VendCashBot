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
  latitude?: number
  longitude?: number
  distanceFromMachine?: number
  createdAt: string
}

/** Distance threshold in meters — beyond this, collection is flagged */
export const DISTANCE_WARNING_THRESHOLD = 50

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

export interface CollectionHistory {
  id: string
  action: string
  field?: string
  oldValue?: string
  newValue?: string
  reason?: string
  performedBy: { id: string; name: string }
  createdAt: string
}

export interface BulkCancelResult {
  cancelled: number
  failed: number
  errors: { id: string; error: string }[]
  total: number
}

export const collectionsApi = {
  getAll: async (query: CollectionQuery = {}, signal?: AbortSignal): Promise<{ data: Collection[]; total: number }> => {
    const response = await apiClient.get('/collections', { params: query, signal })
    return response.data
  },

  getPending: async (signal?: AbortSignal): Promise<Collection[]> => {
    const response = await apiClient.get('/collections/pending', { signal })
    return response.data
  },

  getById: async (id: string, signal?: AbortSignal): Promise<Collection> => {
    const response = await apiClient.get(`/collections/${id}`, { signal })
    return response.data
  },

  receive: async (id: string, data: { amount: number; notes?: string }): Promise<Collection> => {
    const response = await apiClient.patch(`/collections/${id}/receive`, data)
    return response.data
  },

  edit: async (id: string, data: { amount?: number; reason: string; notes?: string }): Promise<Collection> => {
    const response = await apiClient.patch(`/collections/${id}/edit`, data)
    return response.data
  },

  remove: async (id: string): Promise<{ success: boolean }> => {
    const response = await apiClient.delete(`/collections/${id}`)
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

  getHistory: async (id: string, signal?: AbortSignal): Promise<CollectionHistory[]> => {
    const response = await apiClient.get(`/collections/${id}/history`, { signal })
    return response.data
  },
}
