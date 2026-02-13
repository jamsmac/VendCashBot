import { describe, it, expect } from 'vitest'
import { AxiosError } from 'axios'
import { getErrorMessage } from './getErrorMessage'

describe('getErrorMessage', () => {
  it('should return AxiosError response message when available', () => {
    const axiosError = new AxiosError()
    axiosError.response = {
      data: {
        message: 'Invalid credentials',
      },
      status: 401,
      statusText: 'Unauthorized',
      headers: {},
      config: {} as any,
    }

    const result = getErrorMessage(axiosError)
    expect(result).toBe('Invalid credentials')
  })

  it('should return fallback for AxiosError without message', () => {
    const axiosError = new AxiosError()
    axiosError.response = {
      data: {},
      status: 500,
      statusText: 'Internal Server Error',
      headers: {},
      config: {} as any,
    }

    const result = getErrorMessage(axiosError)
    expect(result).toBe('Ошибка')
  })

  it('should return fallback for AxiosError without response', () => {
    const axiosError = new AxiosError('Network error')

    const result = getErrorMessage(axiosError)
    expect(result).toBe('Ошибка')
  })

  it('should return Error.message for regular Error', () => {
    const error = new Error('Something went wrong')

    const result = getErrorMessage(error)
    expect(result).toBe('Something went wrong')
  })

  it('should return default fallback for unknown types', () => {
    const result = getErrorMessage(null)
    expect(result).toBe('Ошибка')
  })

  it('should return default fallback for string type', () => {
    const result = getErrorMessage('Some string error')
    expect(result).toBe('Ошибка')
  })

  it('should return default fallback for object type', () => {
    const result = getErrorMessage({ some: 'object' })
    expect(result).toBe('Ошибка')
  })

  it('should return custom fallback when provided', () => {
    const result = getErrorMessage(null, 'Custom error message')
    expect(result).toBe('Custom error message')
  })

  it('should return custom fallback for AxiosError without message', () => {
    const axiosError = new AxiosError()
    axiosError.response = {
      data: {},
      status: 500,
      statusText: 'Internal Server Error',
      headers: {},
      config: {} as any,
    }

    const result = getErrorMessage(axiosError, 'Custom fallback')
    expect(result).toBe('Custom fallback')
  })

  it('should return AxiosError message even with custom fallback provided', () => {
    const axiosError = new AxiosError()
    axiosError.response = {
      data: {
        message: 'Actual error message',
      },
      status: 400,
      statusText: 'Bad Request',
      headers: {},
      config: {} as any,
    }

    const result = getErrorMessage(axiosError, 'Custom fallback')
    expect(result).toBe('Actual error message')
  })
})
