import { apiClient } from './client'

export interface User {
  id: string
  telegramId: number
  telegramUsername?: string
  telegramFirstName?: string
  name: string
  phone?: string
  role: 'operator' | 'manager' | 'admin'
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface LoginResponse {
  user: User
}

export const authApi = {
  telegramLogin: async (data: any): Promise<LoginResponse> => {
    const response = await apiClient.post('/auth/telegram', data)
    return response.data
  },

  me: async (): Promise<User> => {
    const response = await apiClient.get('/auth/me')
    return response.data
  },

  refresh: async (): Promise<{ success: boolean }> => {
    const response = await apiClient.post('/auth/refresh')
    return response.data
  },

  logout: async (): Promise<{ success: boolean }> => {
    const response = await apiClient.post('/auth/logout')
    return response.data
  },
}
