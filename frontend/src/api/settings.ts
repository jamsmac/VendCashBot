import { apiClient } from './client'

export interface AppSettings {
  reconciliationTolerance: number
  shortageAlertThreshold: number
  collectionDistanceMeters: number
  defaultPageSize: number
}

export const settingsApi = {
  getAppSettings: async (signal?: AbortSignal): Promise<AppSettings> => {
    const response = await apiClient.get('/settings/app', { signal })
    return response.data
  },

  updateAppSettings: async (settings: Partial<AppSettings>): Promise<AppSettings> => {
    const response = await apiClient.put('/settings/app', settings)
    return response.data
  },
}
