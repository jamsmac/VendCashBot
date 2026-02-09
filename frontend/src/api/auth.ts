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

export interface TelegramLoginData {
  id: number
  first_name?: string
  last_name?: string
  username?: string
  photo_url?: string
  auth_date: number
  hash: string
}

export interface LoginResponse {
  user: User
}

export const authApi = {
  telegramLogin: async (data: TelegramLoginData): Promise<LoginResponse> => {
    const response = await apiClient.post('/auth/telegram', data)
    return response.data
  },

  devLogin: async (role: string): Promise<LoginResponse> => {
    const response = await apiClient.post('/auth/dev-login', { role })
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
