import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios'
import toast from 'react-hot-toast'

const API_URL = import.meta.env.VITE_API_URL || '/api'

export const apiClient = axios.create({
  baseURL: API_URL,
  timeout: 30000, // 30 seconds
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // Send cookies with requests
})

// Track if we're currently refreshing the token
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

// Response interceptor for errors and token refresh
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean }

    // 1. Network error (no response at all)
    if (!error.response) {
      if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
        toast.error('Превышено время ожидания. Проверьте соединение.')
      } else if (error.message.includes('Network Error')) {
        toast.error('Ошибка сети. Проверьте подключение к интернету.')
      }
      return Promise.reject(error)
    }

    // 2. Server errors (5xx)
    if (error.response.status >= 500) {
      toast.error('Ошибка сервера. Попробуйте позже.')
      return Promise.reject(error)
    }

    // 3. Rate limiting
    if (error.response.status === 429) {
      toast.error('Слишком много запросов. Подождите минуту.')
      return Promise.reject(error)
    }

    // 4. If error is 401 and we haven't tried to refresh yet
    if (error.response?.status === 401 && !originalRequest._retry) {
      // Don't try to refresh if the failed request was the refresh endpoint itself
      if (originalRequest.url?.includes('/auth/refresh')) {
        // Only redirect if not already on login page to prevent infinite loop
        if (window.location.pathname !== '/login') {
          window.location.href = '/login'
        }
        return Promise.reject(error)
      }

      if (isRefreshing) {
        // If we're already refreshing, queue this request
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject })
        })
          .then(() => {
            // Retry with new cookie (automatically sent)
            return apiClient(originalRequest)
          })
          .catch((err) => {
            return Promise.reject(err)
          })
      }

      originalRequest._retry = true
      isRefreshing = true

      try {
        // Try to refresh the token (cookies sent automatically)
        await axios.post(
          `${API_URL}/auth/refresh`,
          {},
          { withCredentials: true }
        )

        processQueue(null)

        // Retry original request (new cookie will be sent automatically)
        return apiClient(originalRequest)
      } catch (refreshError) {
        processQueue(refreshError as AxiosError)
        // Only redirect if not already on login page
        if (window.location.pathname !== '/login') {
          window.location.href = '/login'
        }
        return Promise.reject(refreshError)
      } finally {
        isRefreshing = false
      }
    }

    return Promise.reject(error)
  }
)
