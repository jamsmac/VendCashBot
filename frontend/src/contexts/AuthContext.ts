import { create } from 'zustand'
import { authApi, User } from '../api/auth'

interface AuthState {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (telegramData: any) => Promise<void>
  devLogin: (role: string) => Promise<void>
  logout: () => Promise<void>
  checkAuth: () => Promise<void>
}

export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  login: async (telegramData: any) => {
    try {
      const response = await authApi.telegramLogin(telegramData)
      // Token is now in httpOnly cookie, we only store user data
      set({
        user: response.user,
        isAuthenticated: true,
      })
    } catch (error) {
      set({ user: null, isAuthenticated: false })
      throw error
    }
  },

  devLogin: async (role: string) => {
    try {
      const response = await authApi.devLogin(role)
      set({
        user: response.user,
        isAuthenticated: true,
      })
    } catch (error) {
      set({ user: null, isAuthenticated: false })
      throw error
    }
  },

  logout: async () => {
    try {
      await authApi.logout()
    } catch {
      // Ignore logout errors
    }
    set({ user: null, isAuthenticated: false })
  },

  checkAuth: async () => {
    try {
      // Cookie is sent automatically with withCredentials
      const user = await authApi.me()
      set({ user, isAuthenticated: true, isLoading: false })
    } catch {
      set({ user: null, isAuthenticated: false, isLoading: false })
    }
  },
}))

// Check auth on app load (skip on login page to prevent unnecessary API calls)
if (window.location.pathname !== '/login') {
  useAuthStore.getState().checkAuth()
} else {
  // On login page, just set loading to false
  useAuthStore.setState({ isLoading: false })
}
