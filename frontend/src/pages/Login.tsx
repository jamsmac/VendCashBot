import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../contexts/AuthContext'
import toast from 'react-hot-toast'

// Telegram Login Widget data interface
interface TelegramUser {
  id: number
  first_name?: string
  last_name?: string
  username?: string
  photo_url?: string
  auth_date: number
  hash: string
}

declare global {
  interface Window {
    TelegramLoginWidget: {
      dataOnauth: (user: TelegramUser) => void
    }
  }
}

export default function Login() {
  const navigate = useNavigate()
  const { login, isAuthenticated, isLoading: authLoading } = useAuthStore()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const widgetLoaded = useRef(false)
  const isMounted = useRef(true)

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated && !authLoading) {
      navigate('/dashboard', { replace: true })
    }
  }, [isAuthenticated, authLoading, navigate])

  // Memoized login handler to prevent stale closures
  const handleTelegramAuth = useCallback(async (telegramUser: TelegramUser) => {
    // Prevent double-submit
    if (isSubmitting) return

    setIsSubmitting(true)
    try {
      await login(telegramUser)
      // Only navigate and show toast if component is still mounted
      if (isMounted.current) {
        toast.success('Добро пожаловать!')
        navigate('/dashboard', { replace: true })
      }
    } catch (error: any) {
      if (isMounted.current) {
        const message = error.response?.data?.message || 'Ошибка авторизации'
        toast.error(message)
      }
    } finally {
      if (isMounted.current) {
        setIsSubmitting(false)
      }
    }
  }, [login, navigate, isSubmitting])

  // Store handler in ref to avoid recreating widget callback
  const handleAuthRef = useRef(handleTelegramAuth)
  handleAuthRef.current = handleTelegramAuth

  useEffect(() => {
    isMounted.current = true

    // Prevent double loading in StrictMode
    if (widgetLoaded.current) return

    // Set up Telegram callback using ref to get latest handler
    window.TelegramLoginWidget = {
      dataOnauth: (telegramUser: TelegramUser) => {
        handleAuthRef.current(telegramUser)
      },
    }

    // Load Telegram widget
    const script = document.createElement('script')
    script.src = 'https://telegram.org/js/telegram-widget.js?22'
    script.setAttribute('data-telegram-login', import.meta.env.VITE_TELEGRAM_BOT_USERNAME || 'vendhubcashbot')
    script.setAttribute('data-size', 'large')
    script.setAttribute('data-radius', '8')
    script.setAttribute('data-onauth', 'TelegramLoginWidget.dataOnauth(user)')
    script.setAttribute('data-request-access', 'write')
    script.crossOrigin = 'anonymous'
    script.async = true

    if (containerRef.current) {
      containerRef.current.appendChild(script)
      widgetLoaded.current = true
    }

    // Cleanup on unmount
    return () => {
      isMounted.current = false
    }
  }, [])

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-600 to-primary-800 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-primary-600 mb-2">VendCash</h1>
          <p className="text-gray-600">Система учёта инкассации</p>
        </div>

        <div className="space-y-6">
          <div className="text-center">
            <p className="text-gray-700 mb-4">
              Войдите через Telegram для доступа к системе
            </p>
          </div>

          <div ref={containerRef} className="flex justify-center min-h-[50px]">
            {(isSubmitting || authLoading) && (
              <div className="flex items-center gap-2 text-gray-500">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary-600" />
                <span>{isSubmitting ? 'Авторизация...' : 'Проверка сессии...'}</span>
              </div>
            )}
          </div>

          <div className="text-center text-sm text-gray-500">
            <p>
              Для регистрации используйте ссылку-приглашение от администратора
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
