import { apiClient } from './client'
import { User } from './auth'

export interface Invite {
  id: string
  code: string
  role: 'operator' | 'manager'
  createdBy: User
  usedBy?: User
  usedAt?: string
  expiresAt: string
  createdAt: string
}

export const usersApi = {
  getAll: async (role?: string, includeInactive = false, signal?: AbortSignal): Promise<User[]> => {
    const response = await apiClient.get('/users', { params: { role, includeInactive }, signal })
    return response.data
  },

  getById: async (id: string, signal?: AbortSignal): Promise<User> => {
    const response = await apiClient.get(`/users/${id}`, { signal })
    return response.data
  },

  update: async (id: string, data: Partial<User>): Promise<User> => {
    const response = await apiClient.patch(`/users/${id}`, data)
    return response.data
  },

  deactivate: async (id: string): Promise<User> => {
    const response = await apiClient.delete(`/users/${id}`)
    return response.data
  },

  activate: async (id: string): Promise<User> => {
    const response = await apiClient.post(`/users/${id}/activate`)
    return response.data
  },

  getOperators: async (signal?: AbortSignal): Promise<User[]> => {
    const response = await apiClient.get('/users/operators', { signal })
    return response.data
  },

  getUserModules: async (id: string, signal?: AbortSignal): Promise<{
    modules: string[]
    customModules: string[]
    allModules: string[]
  }> => {
    const response = await apiClient.get(`/users/${id}/modules`, { signal })
    return response.data
  },

  setUserModules: async (id: string, modules: string[]): Promise<{ modules: string[] }> => {
    const response = await apiClient.put(`/users/${id}/modules`, { modules })
    return response.data
  },
}

export const invitesApi = {
  getAll: async (signal?: AbortSignal): Promise<Invite[]> => {
    const response = await apiClient.get('/invites', { signal })
    // Backend returns { data: Invite[], total: number } with pagination
    return response.data.data ?? response.data
  },

  getPending: async (signal?: AbortSignal): Promise<Invite[]> => {
    const response = await apiClient.get('/invites/pending', { signal })
    return response.data
  },

  create: async (role: 'operator' | 'manager'): Promise<Invite> => {
    const response = await apiClient.post('/invites', { role })
    return response.data
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/invites/${id}`)
  },
}
