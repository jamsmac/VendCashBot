import { useEffect, useCallback, useState } from 'react'
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
  const { login, isAuthenticated } = useAuthStore()
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard')
    }
  }, [isAuthenticated, navigate])

  const handleTelegramAuth = useCallback(
    async (telegramUser: any) => {
      setIsLoading(true)
      try {
        await login(telegramUser)
        toast.success('Добро пожаловать!')
        navigate('/dashboard')
      } catch (error: any) {
        const message = error.response?.data?.message || 'Ошибка авторизации'
        toast.error(message)
      } finally {
        setIsLoading(false)
      }
    },
    [login, navigate],
  )

  useEffect(() => {
    // Set up Telegram callback
    window.TelegramLoginWidget = {
      dataOnauth: handleTelegramAuth,
    }

    // Load Telegram widget
    const script = document.createElement('script')
    script.src = 'https://telegram.org/js/telegram-widget.js?22'
    script.setAttribute('data-telegram-login', import.meta.env.VITE_TELEGRAM_BOT_USERNAME || 'VendCashBot')
    script.setAttribute('data-size', 'large')
    script.setAttribute('data-radius', '8')
    script.setAttribute('data-onauth', 'TelegramLoginWidget.dataOnauth(user)')
    script.setAttribute('data-request-access', 'write')
    script.async = true

    const container = document.getElementById('telegram-login-container')
    if (container) {
      container.innerHTML = ''
      container.appendChild(script)
    }

    return () => {
      if (container) {
        container.innerHTML = ''
      }
    }
  }, [handleTelegramAuth])

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

          <div id="telegram-login-container" className="flex justify-center min-h-[50px]">
            {isLoading && (
              <div className="flex items-center gap-2 text-gray-500">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary-600" />
                <span>Авторизация...</span>
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
