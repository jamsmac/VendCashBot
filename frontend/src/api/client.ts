import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios'
import toast from 'react-hot-toast'

const API_URL = import.meta.env.VITE_API_URL || '/api'

export const apiClient = axios.create({
  baseURL: API_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
})

// Track refresh state
let isRefreshing = false
let failedQueue: Array<{
  resolve: (value?: unknown) => void
  reject: (reason?: unknown) => void
}> = []

const processQueue = (error: AxiosError | null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error)
    } else {
      prom.resolve()
    }
  })
  failedQueue = []
}

// Clear auth state and redirect to login
const handleAuthFailure = () => {
  // Clear Zustand store - import dynamically to avoid circular deps
  import('../contexts/AuthContext').then(({ useAuthStore }) => {
    useAuthStore.getState().clearAuth()
  })

  // Clear the queue with error
  processQueue(new AxiosError('Session expired'))

  // Redirect to login if not already there
  if (window.location.pathname !== '/login') {
    window.location.href = '/login'
  }
}

// Response interceptor for error handling and token refresh
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean }

    // Network error (no response)
    if (!error.response) {
      if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
        toast.error('Превышено время ожидания. Проверьте соединение.')
      } else if (error.message.includes('Network Error')) {
        toast.error('Ошибка сети. Проверьте подключение к интернету.')
      }
      return Promise.reject(error)
    }

    const status = error.response.status

    // Server errors (5xx)
    if (status >= 500) {
      toast.error('Ошибка сервера. Попробуйте позже.')
      return Promise.reject(error)
    }

    // Rate limiting
    if (status === 429) {
      toast.error('Слишком много запросов. Подождите минуту.')
      return Promise.reject(error)
    }

    // Forbidden
    if (status === 403) {
      toast.error('Доступ запрещён. Недостаточно прав.')
      return Promise.reject(error)
    }

    // Not Found
    if (status === 404) {
      toast.error('Ресурс не найден.')
      return Promise.reject(error)
    }

    // Bad Request - show specific error message if available
    if (status === 400) {
      const errorMessage = (error.response?.data as { message?: string })?.message
      toast.error(errorMessage || 'Неверный запрос.')
      return Promise.reject(error)
    }

    // Handle 401 Unauthorized
    if (status === 401 && !originalRequest._retry) {
      // Don't retry refresh endpoint - session is truly expired
      if (originalRequest.url?.includes('/auth/refresh')) {
        handleAuthFailure()
        return Promise.reject(error)
      }

      // Don't retry login endpoint
      if (originalRequest.url?.includes('/auth/telegram') ||
          originalRequest.url?.includes('/auth/dev-login')) {
        return Promise.reject(error)
      }

      // If already refreshing, queue this request
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject })
        })
          .then(() => apiClient(originalRequest))
          .catch((err) => Promise.reject(err))
      }

      originalRequest._retry = true
      isRefreshing = true

      try {
        // Attempt to refresh tokens
        await axios.post(
          `${API_URL}/auth/refresh`,
          {},
          { withCredentials: true }
        )

        // Success - process queued requests
        processQueue(null)

        // Retry original request with new cookie
        return apiClient(originalRequest)
      } catch (refreshError) {
        // Refresh failed - clear auth and redirect
        handleAuthFailure()
        return Promise.reject(refreshError)
      } finally {
        isRefreshing = false
      }
    }

    return Promise.reject(error)
  }
)
