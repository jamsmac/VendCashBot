import { AxiosError } from 'axios'

export function getErrorMessage(error: unknown, fallback = 'Ошибка'): string {
  if (error instanceof AxiosError) {
    const data = error.response?.data
    if (data && typeof data === 'object' && 'message' in data && typeof data.message === 'string') {
      return data.message
    }
    return fallback
  }
  if (error instanceof Error) {
    return error.message
  }
  return fallback
}
