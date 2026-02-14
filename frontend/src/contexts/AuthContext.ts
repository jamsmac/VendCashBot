import { create } from 'zustand'
import { authApi, User, TelegramLoginData } from '../api/auth'
import { setSentryUser } from '../config/sentry'

export type TelegramAuthData = TelegramLoginData

interface AuthState {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  isInitialized: boolean
  login: (telegramData: TelegramAuthData) => Promise<void>
  register: (telegramData: TelegramAuthData, inviteCode: string) => Promise<void>
  devLogin: (role: string) => Promise<void>
  logout: () => Promise<void>
  checkAuth: () => Promise<void>
  clearAuth: () => void
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  isInitialized: false,

  login: async (telegramData: TelegramAuthData) => {
    try {
      const response = await authApi.telegramLogin(telegramData)
      setSentryUser({ id: response.user.id, role: response.user.role })
      set({
        user: response.user,
        isAuthenticated: true,
        isLoading: false,
      })
    } catch (error) {
      set({ user: null, isAuthenticated: false, isLoading: false })
      throw error
    }
  },

  register: async (telegramData: TelegramAuthData, inviteCode: string) => {
    try {
      const response = await authApi.register({ ...telegramData, code: inviteCode })
      set({
        user: response.user,
        isAuthenticated: true,
        isLoading: false,
      })
    } catch (error) {
      set({ user: null, isAuthenticated: false, isLoading: false })
      throw error
    }
  },

  devLogin: async (role: string) => {
    try {
      const response = await authApi.devLogin(role)
      set({
        user: response.user,
        isAuthenticated: true,
        isLoading: false,
      })
    } catch (error) {
      set({ user: null, isAuthenticated: false, isLoading: false })
      throw error
    }
  },

  logout: async () => {
    try {
      await authApi.logout()
    } catch {
      // Ignore logout errors - clear state anyway
    }
    setSentryUser(null)
    set({ user: null, isAuthenticated: false, isLoading: false })
  },

  checkAuth: async () => {
    // Prevent multiple concurrent checks
    const state = get()
    if (state.isInitialized && !state.isLoading) {
      return
    }

    set({ isLoading: true })
    try {
      const user = await authApi.me()
      set({
        user,
        isAuthenticated: true,
        isLoading: false,
        isInitialized: true,
      })
    } catch {
      set({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        isInitialized: true,
      })
    }
  },

  // Called by API client when refresh fails
  clearAuth: () => {
    set({
      user: null,
      isAuthenticated: false,
      isLoading: false,
    })
  },
}))

// Initialize auth check after store is created
// This runs once when the module loads
const initAuth = () => {
  // Don't check auth on login page to prevent unnecessary API calls
  if (window.location.pathname === '/login') {
    useAuthStore.setState({ isLoading: false, isInitialized: true })
    return
  }

  // Check auth for all other pages
  useAuthStore.getState().checkAuth()
}

// Run initialization
initAuth()
