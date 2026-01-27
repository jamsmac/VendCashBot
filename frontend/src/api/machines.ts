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

  // Machine Locations
  getLocations: async (machineId: string): Promise<MachineLocation[]> => {
    const response = await apiClient.get(`/machines/${machineId}/locations`)
    return response.data
  },

  getCurrentLocation: async (machineId: string): Promise<MachineLocation | null> => {
    const response = await apiClient.get(`/machines/${machineId}/locations/current`)
    return response.data
  },

  getLocationForDate: async (machineId: string, date: string): Promise<MachineLocation | null> => {
    const response = await apiClient.get(`/machines/${machineId}/locations/for-date`, {
      params: { date },
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
