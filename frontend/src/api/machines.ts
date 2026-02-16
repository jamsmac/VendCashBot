import { apiClient } from './client'

export interface Machine {
  id: string
  code: string
  name: string
  location?: string
  latitude?: number
  longitude?: number
  isActive: boolean
  status?: 'pending' | 'approved' | 'rejected'
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
  code?: string
  name?: string
  location?: string
  latitude?: number
  longitude?: number
  isActive?: boolean
}

export interface MachineLocation {
  id: string
  machineId: string
  address: string
  latitude?: number
  longitude?: number
  validFrom: string
  validTo?: string
  isCurrent: boolean
  createdAt: string
}

export interface CreateMachineLocationData {
  address: string
  latitude?: number
  longitude?: number
  validFrom: string
  validTo?: string
  isCurrent?: boolean
}

export interface UpdateMachineLocationData {
  address?: string
  latitude?: number
  longitude?: number
  validFrom?: string
  validTo?: string
  isCurrent?: boolean
}

export const machinesApi = {
  getAll: async (activeOnly = true, signal?: AbortSignal, approvedOnly = false): Promise<Machine[]> => {
    const response = await apiClient.get('/machines', {
      params: { active: activeOnly, approved: approvedOnly },
      signal,
    })
    return response.data
  },

  getById: async (id: string, signal?: AbortSignal): Promise<Machine> => {
    const response = await apiClient.get(`/machines/${id}`, { signal })
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

  // Machine Locations
  getLocations: async (machineId: string, signal?: AbortSignal): Promise<MachineLocation[]> => {
    const response = await apiClient.get(`/machines/${machineId}/locations`, { signal })
    return response.data
  },

  getCurrentLocation: async (machineId: string, signal?: AbortSignal): Promise<MachineLocation | null> => {
    const response = await apiClient.get(`/machines/${machineId}/locations/current`, { signal })
    return response.data
  },

  getLocationForDate: async (machineId: string, date: string, signal?: AbortSignal): Promise<MachineLocation | null> => {
    const response = await apiClient.get(`/machines/${machineId}/locations/for-date`, {
      params: { date },
      signal,
    })
    return response.data
  },

  addLocation: async (machineId: string, data: CreateMachineLocationData): Promise<MachineLocation> => {
    const response = await apiClient.post(`/machines/${machineId}/locations`, data)
    return response.data
  },

  updateLocation: async (locationId: string, data: UpdateMachineLocationData): Promise<MachineLocation> => {
    const response = await apiClient.patch(`/machines/locations/${locationId}`, data)
    return response.data
  },

  deleteLocation: async (locationId: string): Promise<void> => {
    await apiClient.delete(`/machines/locations/${locationId}`)
  },

  setCurrentLocation: async (locationId: string): Promise<MachineLocation> => {
    const response = await apiClient.post(`/machines/locations/${locationId}/set-current`)
    return response.data
  },
}
