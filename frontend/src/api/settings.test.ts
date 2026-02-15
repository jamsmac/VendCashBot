import { describe, it, expect, vi, beforeEach } from 'vitest'
import { settingsApi } from './settings'

vi.mock('./client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

import { apiClient } from './client'

const mockGet = vi.mocked(apiClient.get)
const mockPut = vi.mocked(apiClient.put)

describe('settingsApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getAppSettings', () => {
    it('should fetch app settings from /settings/app', async () => {
      const mockSettings = {
        reconciliationTolerance: 5,
        shortageAlertThreshold: 10,
        collectionDistanceMeters: 50,
        defaultPageSize: 50,
      }
      mockGet.mockResolvedValue({ data: mockSettings })

      const result = await settingsApi.getAppSettings()

      expect(mockGet).toHaveBeenCalledWith('/settings/app', { signal: undefined })
      expect(result).toEqual(mockSettings)
    })

    it('should pass abort signal', async () => {
      mockGet.mockResolvedValue({ data: {} })
      const controller = new AbortController()

      await settingsApi.getAppSettings(controller.signal)

      expect(mockGet).toHaveBeenCalledWith('/settings/app', { signal: controller.signal })
    })
  })

  describe('updateAppSettings', () => {
    it('should PUT partial settings', async () => {
      const updated = {
        reconciliationTolerance: 10,
        shortageAlertThreshold: 15,
        collectionDistanceMeters: 50,
        defaultPageSize: 50,
      }
      mockPut.mockResolvedValue({ data: updated })

      const result = await settingsApi.updateAppSettings({ reconciliationTolerance: 10, shortageAlertThreshold: 15 })

      expect(mockPut).toHaveBeenCalledWith('/settings/app', { reconciliationTolerance: 10, shortageAlertThreshold: 15 })
      expect(result).toEqual(updated)
    })
  })
})
