import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios'

const API_URL = import.meta.env.VITE_API_URL || '/api'

export const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Track if we're currently refreshing the token
let isRefreshing = false
let failedQueue: Array<{
  resolve: (value?: unknown) => void
  reject: (reason?: unknown) => void
}> = []

const processQueue = (error: AxiosError | null, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error)
    } else {
      prom.resolve(token)
    }
  })
  failedQueue = []
}

const getToken = (): string | null => {
  const authData = localStorage.getItem('vendcash-auth')
  if (authData) {
    try {
      const { state } = JSON.parse(authData)
      return state?.token || null
    } catch {
      return null
    }
  }
  return null
}

const setToken = (token: string) => {
  const authData = localStorage.getItem('vendcash-auth')
  if (authData) {
    try {
      const parsed = JSON.parse(authData)
      parsed.state.token = token
      localStorage.setItem('vendcash-auth', JSON.stringify(parsed))
    } catch {
      // Ignore parsing errors
    }
  }
}

// Request interceptor for auth token
apiClient.interceptors.request.use((config) => {
  const token = getToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Response interceptor for errors and token refresh
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean }

    // If error is 401 and we haven't tried to refresh yet
    if (error.response?.status === 401 && !originalRequest._retry) {
      // Don't try to refresh if the failed request was the refresh endpoint itself
      if (originalRequest.url?.includes('/auth/refresh')) {
        localStorage.removeItem('vendcash-auth')
        window.location.href = '/login'
        return Promise.reject(error)
      }

      if (isRefreshing) {
        // If we're already refreshing, queue this request
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject })
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`
            return apiClient(originalRequest)
          })
          .catch((err) => {
            return Promise.reject(err)
          })
      }

      originalRequest._retry = true
      isRefreshing = true

      try {
        const token = getToken()
        if (!token) {
          throw new Error('No token available')
        }

        // Try to refresh the token
        const response = await axios.post(
          `${API_URL}/auth/refresh`,
          {},
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        )

        const newToken = response.data.accessToken
        setToken(newToken)
        processQueue(null, newToken)

        // Retry original request with new token
        originalRequest.headers.Authorization = `Bearer ${newToken}`
        return apiClient(originalRequest)
      } catch (refreshError) {
        processQueue(refreshError as AxiosError, null)
        localStorage.removeItem('vendcash-auth')
        window.location.href = '/login'
        return Promise.reject(refreshError)
      } finally {
        isRefreshing = false
      }
    }

    return Promise.reject(error)
  }
)
