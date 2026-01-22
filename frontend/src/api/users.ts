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
  getAll: async (role?: string, includeInactive = false): Promise<User[]> => {
    const response = await apiClient.get('/users', { params: { role, includeInactive } })
    return response.data
  },

  getById: async (id: string): Promise<User> => {
    const response = await apiClient.get(`/users/${id}`)
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

  getOperators: async (): Promise<User[]> => {
    const response = await apiClient.get('/users/operators')
    return response.data
  },
}

export const invitesApi = {
  getAll: async (): Promise<Invite[]> => {
    const response = await apiClient.get('/invites')
    return response.data
  },

  getPending: async (): Promise<Invite[]> => {
    const response = await apiClient.get('/invites/pending')
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
