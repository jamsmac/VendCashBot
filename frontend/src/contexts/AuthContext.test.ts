import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from '@testing-library/react'
import { useAuthStore } from './AuthContext'

// Mock the authApi module
vi.mock('../api/auth', () => ({
  authApi: {
    telegramLogin: vi.fn(),
    register: vi.fn(),
    devLogin: vi.fn(),
    logout: vi.fn(),
    me: vi.fn(),
  },
}))

// Import the mocked authApi after the mock is set up
import { authApi } from '../api/auth'

const mockUser = {
  id: '1',
  telegramId: 123456,
  telegramUsername: 'testuser',
  telegramFirstName: 'Test',
  name: 'Test User',
  role: 'operator' as const,
  isActive: true,
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
}

describe('AuthContext (useAuthStore)', () => {
  beforeEach(() => {
    // Reset store state before each test
    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      isInitialized: false,
    })
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Initial state', () => {
    it('should have correct initial state', () => {
      const state = useAuthStore.getState()
      expect(state.user).toBeNull()
      expect(state.isAuthenticated).toBe(false)
      expect(state.isLoading).toBe(false)
      expect(state.isInitialized).toBe(false)
    })
  })

  describe('login method', () => {
    it('should set user and authenticated on successful login', async () => {
      const telegramData = {
        id: 123456,
        first_name: 'Test',
        last_name: 'User',
        username: 'testuser',
        photo_url: 'https://example.com/photo.jpg',
        auth_date: 1234567890,
        hash: 'abc123',
      }

      vi.mocked(authApi.telegramLogin).mockResolvedValueOnce({
        user: mockUser,
      })

      await act(async () => {
        await useAuthStore.getState().login(telegramData)
      })

      const state = useAuthStore.getState()
      expect(state.user).toEqual(mockUser)
      expect(state.isAuthenticated).toBe(true)
      expect(state.isLoading).toBe(false)
    })

    it('should clear state and rethrow on login failure', async () => {
      const telegramData = {
        id: 123456,
        first_name: 'Test',
        last_name: 'User',
        username: 'testuser',
        photo_url: 'https://example.com/photo.jpg',
        auth_date: 1234567890,
        hash: 'invalid',
      }

      const error = new Error('Invalid hash')
      vi.mocked(authApi.telegramLogin).mockRejectedValueOnce(error)

      try {
        await act(async () => {
          await useAuthStore.getState().login(telegramData)
        })
        expect.fail('Should have thrown an error')
      } catch (err) {
        expect(err).toBe(error)
      }

      const state = useAuthStore.getState()
      expect(state.user).toBeNull()
      expect(state.isAuthenticated).toBe(false)
      expect(state.isLoading).toBe(false)
    })
  })

  describe('register method', () => {
    it('should set user and authenticated on successful registration', async () => {
      const telegramData = {
        id: 123456,
        first_name: 'Test',
        last_name: 'User',
        username: 'testuser',
        photo_url: 'https://example.com/photo.jpg',
        auth_date: 1234567890,
        hash: 'abc123',
      }
      const inviteCode = 'INVITE123'

      vi.mocked(authApi.register).mockResolvedValueOnce({
        user: mockUser,
      })

      await act(async () => {
        await useAuthStore.getState().register(telegramData, inviteCode)
      })

      const state = useAuthStore.getState()
      expect(state.user).toEqual(mockUser)
      expect(state.isAuthenticated).toBe(true)
      expect(state.isLoading).toBe(false)
      expect(authApi.register).toHaveBeenCalledWith({
        ...telegramData,
        code: inviteCode,
      })
    })

    it('should clear state and rethrow on registration failure', async () => {
      const telegramData = {
        id: 123456,
        first_name: 'Test',
        last_name: 'User',
        username: 'testuser',
        photo_url: 'https://example.com/photo.jpg',
        auth_date: 1234567890,
        hash: 'abc123',
      }
      const inviteCode = 'INVALID_CODE'

      const error = new Error('Invalid invite code')
      vi.mocked(authApi.register).mockRejectedValueOnce(error)

      try {
        await act(async () => {
          await useAuthStore.getState().register(telegramData, inviteCode)
        })
        expect.fail('Should have thrown an error')
      } catch (err) {
        expect(err).toBe(error)
      }

      const state = useAuthStore.getState()
      expect(state.user).toBeNull()
      expect(state.isAuthenticated).toBe(false)
      expect(state.isLoading).toBe(false)
    })
  })

  describe('devLogin method', () => {
    it('should set user and authenticated on successful dev login', async () => {
      const role = 'admin'

      vi.mocked(authApi.devLogin).mockResolvedValueOnce({
        user: { ...mockUser, role: 'admin' },
      })

      await act(async () => {
        await useAuthStore.getState().devLogin(role)
      })

      const state = useAuthStore.getState()
      expect(state.user?.role).toBe('admin')
      expect(state.isAuthenticated).toBe(true)
      expect(state.isLoading).toBe(false)
      expect(authApi.devLogin).toHaveBeenCalledWith(role)
    })

    it('should clear state and rethrow on dev login failure', async () => {
      const role = 'invalid_role'

      const error = new Error('Invalid role')
      vi.mocked(authApi.devLogin).mockRejectedValueOnce(error)

      try {
        await act(async () => {
          await useAuthStore.getState().devLogin(role)
        })
        expect.fail('Should have thrown an error')
      } catch (err) {
        expect(err).toBe(error)
      }

      const state = useAuthStore.getState()
      expect(state.user).toBeNull()
      expect(state.isAuthenticated).toBe(false)
      expect(state.isLoading).toBe(false)
    })
  })

  describe('logout method', () => {
    it('should clear state on successful logout', async () => {
      // Set up initial state
      useAuthStore.setState({
        user: mockUser,
        isAuthenticated: true,
        isLoading: false,
      })

      vi.mocked(authApi.logout).mockResolvedValueOnce({ success: true })

      await act(async () => {
        await useAuthStore.getState().logout()
      })

      const state = useAuthStore.getState()
      expect(state.user).toBeNull()
      expect(state.isAuthenticated).toBe(false)
      expect(state.isLoading).toBe(false)
    })

    it('should clear state even on logout error', async () => {
      // Set up initial state
      useAuthStore.setState({
        user: mockUser,
        isAuthenticated: true,
        isLoading: false,
      })

      vi.mocked(authApi.logout).mockRejectedValueOnce(new Error('Logout failed'))

      await act(async () => {
        await useAuthStore.getState().logout()
      })

      const state = useAuthStore.getState()
      expect(state.user).toBeNull()
      expect(state.isAuthenticated).toBe(false)
      expect(state.isLoading).toBe(false)
    })
  })

  describe('checkAuth method', () => {
    it('should set user on successful checkAuth', async () => {
      vi.mocked(authApi.me).mockResolvedValueOnce(mockUser)

      await act(async () => {
        await useAuthStore.getState().checkAuth()
      })

      const state = useAuthStore.getState()
      expect(state.user).toEqual(mockUser)
      expect(state.isAuthenticated).toBe(true)
      expect(state.isLoading).toBe(false)
      expect(state.isInitialized).toBe(true)
    })

    it('should clear state on checkAuth failure', async () => {
      vi.mocked(authApi.me).mockRejectedValueOnce(new Error('Not authenticated'))

      await act(async () => {
        await useAuthStore.getState().checkAuth()
      })

      const state = useAuthStore.getState()
      expect(state.user).toBeNull()
      expect(state.isAuthenticated).toBe(false)
      expect(state.isLoading).toBe(false)
      expect(state.isInitialized).toBe(true)
    })

    it('should not make concurrent requests if already initialized', async () => {
      useAuthStore.setState({ isInitialized: true, isLoading: false })

      vi.mocked(authApi.me).mockResolvedValueOnce(mockUser)

      await act(async () => {
        await useAuthStore.getState().checkAuth()
      })

      // API call should not be made
      expect(authApi.me).not.toHaveBeenCalled()
    })

    it('should make API call even if initialized but loading', async () => {
      useAuthStore.setState({ isInitialized: true, isLoading: true })

      vi.mocked(authApi.me).mockResolvedValueOnce(mockUser)

      await act(async () => {
        await useAuthStore.getState().checkAuth()
      })

      // API call should be made when loading
      expect(authApi.me).toHaveBeenCalled()
    })
  })

  describe('clearAuth method', () => {
    it('should reset user state', () => {
      // Set up initial state
      useAuthStore.setState({
        user: mockUser,
        isAuthenticated: true,
        isLoading: false,
      })

      act(() => {
        useAuthStore.getState().clearAuth()
      })

      const state = useAuthStore.getState()
      expect(state.user).toBeNull()
      expect(state.isAuthenticated).toBe(false)
      expect(state.isLoading).toBe(false)
    })

    it('should be callable without side effects', () => {
      useAuthStore.setState({
        user: mockUser,
        isAuthenticated: true,
        isLoading: false,
      })

      act(() => {
        useAuthStore.getState().clearAuth()
      })

      // Should not throw and state should be clean
      const state = useAuthStore.getState()
      expect(state).toBeDefined()
      expect(state.user).toBeNull()
    })
  })
})
