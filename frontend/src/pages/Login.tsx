import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../contexts/AuthContext'
import toast from 'react-hot-toast'

declare global {
  interface Window {
    TelegramLoginWidget: {
      dataOnauth: (user: any) => void
    }
  }
}

export default function Login() {
  const navigate = useNavigate()
  const { login, devLogin, isAuthenticated } = useAuthStore()
  const [isLoading, setIsLoading] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const widgetLoaded = useRef(false)

  // Store login function in ref to avoid re-creating callback
  const loginRef = useRef(login)
  loginRef.current = login

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard')
    }
  }, [isAuthenticated, navigate])

  useEffect(() => {
    // Prevent double loading in StrictMode
    if (widgetLoaded.current) return

    // Set up Telegram callback using ref
    window.TelegramLoginWidget = {
      dataOnauth: async (telegramUser: any) => {
        setIsLoading(true)
        try {
          await loginRef.current(telegramUser)
          toast.success('Добро пожаловать!')
          navigate('/dashboard')
        } catch (error: any) {
          const message = error.response?.data?.message || 'Ошибка авторизации'
          toast.error(message)
        } finally {
          setIsLoading(false)
        }
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
    script.async = true

    console.log('Login: Effect running', { widgetLoaded: widgetLoaded.current, container: containerRef.current });

    if (containerRef.current) {
      console.log('Login: Appending script');
      containerRef.current.appendChild(script)
      widgetLoaded.current = true
    } else {
      console.error('Login: Container ref is missing');
    }

    // No cleanup - we don't want to destroy the widget on re-renders
  }, [navigate])

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
            {isLoading && (
              <div className="flex items-center gap-2 text-gray-500">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary-600" />
                <span>Авторизация...</span>
              </div>
            )}
          </div>

          <div className="border-t pt-6">
            <p className="text-center text-sm text-gray-500 mb-4">
              Прямой вход (для разработки)
            </p>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => devLogin('manager')}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
              >
                Менеджер
              </button>
              <button
                onClick={() => devLogin('operator')}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
              >
                Инкассатор
              </button>
            </div>
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
