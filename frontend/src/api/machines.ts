import { apiClient } from './client'

export interface Machine {
  id: string
  code: string
  name: string
  location?: string
  latitude?: number
  longitude?: number
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface CreateMachineData {
  code: string
  name: string
  location?: string
  latitude?: number
  longitude?: number
}

export interface UpdateMachineData {
  name?: string
  location?: string
  latitude?: number
  longitude?: number
  isActive?: boolean
}

export const machinesApi = {
  getAll: async (activeOnly = true): Promise<Machine[]> => {
    const response = await apiClient.get('/machines', { params: { active: activeOnly } })
    return response.data
  },

  getById: async (id: string): Promise<Machine> => {
    const response = await apiClient.get(`/machines/${id}`)
    return response.data
  },

  create: async (data: CreateMachineData): Promise<Machine> => {
    const response = await apiClient.post('/machines', data)
    return response.data
  },

  update: async (id: string, data: UpdateMachineData): Promise<Machine> => {
    const response = await apiClient.patch(`/machines/${id}`, data)
    return response.data
  },

  deactivate: async (id: string): Promise<Machine> => {
    const response = await apiClient.delete(`/machines/${id}`)
    return response.data
  },

  activate: async (id: string): Promise<Machine> => {
    const response = await apiClient.post(`/machines/${id}/activate`)
    return response.data
  },
}
