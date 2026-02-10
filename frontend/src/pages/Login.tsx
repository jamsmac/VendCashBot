import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '../contexts/AuthContext'
import { authApi } from '../api/auth'
import toast from 'react-hot-toast'
import { getErrorMessage } from '../utils/getErrorMessage'

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
    TelegramLoginAuth?: (user: TelegramUser) => void
    TelegramRegisterAuth?: (user: TelegramUser) => void
  }
}

type Mode = 'login' | 'register'

const BOT_USERNAME = import.meta.env.VITE_TELEGRAM_BOT_USERNAME || 'vendhubcashbot'

export default function Login() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { login, register, isAuthenticated, isLoading: authLoading } = useAuthStore()

  // Check if invite code is in URL (?code=XXXX)
  const urlInviteCode = searchParams.get('code') || ''

  const [mode, setMode] = useState<Mode>(urlInviteCode ? 'register' : 'login')
  const [inviteCode, setInviteCode] = useState(urlInviteCode)
  const [inviteValid, setInviteValid] = useState<boolean | null>(null)
  const [inviteRole, setInviteRole] = useState<string | null>(null)
  const [inviteChecking, setInviteChecking] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [loginWidgetFailed, setLoginWidgetFailed] = useState(false)
  const [registerWidgetFailed, setRegisterWidgetFailed] = useState(false)

  const isMounted = useRef(true)

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated && !authLoading) {
      navigate('/', { replace: true })
    }
  }, [isAuthenticated, authLoading, navigate])

  // Cleanup on unmount
  useEffect(() => {
    isMounted.current = true
    return () => { isMounted.current = false }
  }, [])

  // Login handler
  const loginHandlerRef = useRef<(user: TelegramUser) => void>(() => {})
  const handleLogin = useCallback(async (telegramUser: TelegramUser) => {
    if (isSubmitting) return
    setIsSubmitting(true)
    try {
      await login(telegramUser)
      if (isMounted.current) {
        toast.success('Добро пожаловать!')
        navigate('/', { replace: true })
      }
    } catch (error: unknown) {
      if (isMounted.current) {
        const msg = getErrorMessage(error, 'Ошибка авторизации')
        if (msg.includes('not registered') || msg.includes('не зарегистрирован')) {
          toast.error('Вы не зарегистрированы. Введите код приглашения для регистрации.')
          setMode('register')
        } else {
          toast.error(msg)
        }
      }
    } finally {
      if (isMounted.current) setIsSubmitting(false)
    }
  }, [login, navigate, isSubmitting])
  loginHandlerRef.current = handleLogin

  // Register handler
  const registerHandlerRef = useRef<(user: TelegramUser) => void>(() => {})
  const handleRegister = useCallback(async (telegramUser: TelegramUser) => {
    if (isSubmitting || !inviteCode.trim()) return
    setIsSubmitting(true)
    try {
      await register(telegramUser, inviteCode.trim())
      if (isMounted.current) {
        toast.success('Регистрация успешна! Добро пожаловать!')
        navigate('/', { replace: true })
      }
    } catch (error: unknown) {
      if (isMounted.current) {
        const msg = getErrorMessage(error, 'Ошибка регистрации')
        toast.error(msg)
      }
    } finally {
      if (isMounted.current) setIsSubmitting(false)
    }
  }, [register, navigate, isSubmitting, inviteCode])
  registerHandlerRef.current = handleRegister

  // Setup global callbacks once
  useEffect(() => {
    window.TelegramLoginAuth = (user: TelegramUser) => {
      loginHandlerRef.current(user)
    }
    window.TelegramRegisterAuth = (user: TelegramUser) => {
      registerHandlerRef.current(user)
    }
  }, [])

  // Load Telegram widget into a container
  const loadWidget = useCallback((container: HTMLDivElement, callbackName: string, onFail: () => void) => {
    // Clear any previous content
    container.innerHTML = ''

    const script = document.createElement('script')
    script.src = 'https://telegram.org/js/telegram-widget.js?22'
    script.setAttribute('data-telegram-login', BOT_USERNAME)
    script.setAttribute('data-size', 'large')
    script.setAttribute('data-radius', '8')
    script.setAttribute('data-onauth', `${callbackName}(user)`)
    script.setAttribute('data-request-access', 'write')
    script.async = true

    // Detect if widget fails to load (timeout-based since Telegram widget doesn't fire error events reliably)
    const timeout = setTimeout(() => {
      // Check if the iframe was actually created
      const iframe = container.querySelector('iframe')
      if (!iframe) {
        onFail()
      }
    }, 5000)

    script.onload = () => {
      // After script loads, give iframe a moment to appear
      setTimeout(() => {
        const iframe = container.querySelector('iframe')
        if (!iframe) {
          clearTimeout(timeout)
          onFail()
        } else {
          clearTimeout(timeout)
        }
      }, 2000)
    }

    script.onerror = () => {
      clearTimeout(timeout)
      onFail()
    }

    container.appendChild(script)
  }, [])

  // Load login widget when login tab is active
  const loginWidgetRef = useCallback((node: HTMLDivElement | null) => {
    if (node && mode === 'login') {
      // Small delay to ensure DOM is ready
      setTimeout(() => {
        if (node.childNodes.length === 0) {
          setLoginWidgetFailed(false)
          loadWidget(node, 'TelegramLoginAuth', () => {
            if (isMounted.current) setLoginWidgetFailed(true)
          })
        }
      }, 100)
    }
  }, [mode, loadWidget])

  // Load register widget when invite is validated
  const registerWidgetRef = useCallback((node: HTMLDivElement | null) => {
    if (node && inviteValid) {
      setTimeout(() => {
        if (node.childNodes.length === 0) {
          setRegisterWidgetFailed(false)
          loadWidget(node, 'TelegramRegisterAuth', () => {
            if (isMounted.current) setRegisterWidgetFailed(true)
          })
        }
      }, 100)
    }
  }, [inviteValid, loadWidget])

  // Validate invite code (with auto-check from URL)
  useEffect(() => {
    if (urlInviteCode) {
      checkInvite(urlInviteCode)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const checkInvite = async (code: string) => {
    if (!code.trim()) return
    setInviteChecking(true)
    setInviteValid(null)
    try {
      const result = await authApi.validateInvite(code.trim())
      if (isMounted.current) {
        setInviteValid(result.valid)
        setInviteRole(result.role || null)
        if (!result.valid) {
          toast.error('Код приглашения недействителен или истёк')
        }
      }
    } catch {
      if (isMounted.current) {
        setInviteValid(false)
        toast.error('Ошибка проверки кода')
      }
    } finally {
      if (isMounted.current) setInviteChecking(false)
    }
  }

  const roleLabel = (role: string | null) => {
    if (role === 'operator') return 'Оператор'
    if (role === 'manager') return 'Менеджер'
    return role || ''
  }

  const WidgetFallbackMessage = () => (
    <div className="text-center py-2">
      <p className="text-amber-600 text-sm mb-2">
        ⚠️ Telegram виджет не загрузился
      </p>
      <p className="text-gray-500 text-xs">
        Убедитесь, что домен <code className="bg-gray-100 px-1 rounded">{window.location.hostname}</code> настроен
        в <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">@BotFather</a> →
        /setdomain для бота <code className="bg-gray-100 px-1 rounded">@{BOT_USERNAME}</code>
      </p>
    </div>
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-600 to-primary-800 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-primary-600 mb-2">VendCash</h1>
          <p className="text-gray-600">Система учёта инкассации</p>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 mb-6">
          <button
            onClick={() => setMode('login')}
            className={`flex-1 py-2 text-center font-medium text-sm transition-colors ${
              mode === 'login'
                ? 'text-primary-600 border-b-2 border-primary-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Вход
          </button>
          <button
            onClick={() => setMode('register')}
            className={`flex-1 py-2 text-center font-medium text-sm transition-colors ${
              mode === 'register'
                ? 'text-primary-600 border-b-2 border-primary-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Регистрация
          </button>
        </div>

        {/* Login mode */}
        {mode === 'login' && (
          <div className="space-y-4">
            <p className="text-gray-700 text-center text-sm">
              Войдите через Telegram для доступа к системе
            </p>
            <div ref={loginWidgetRef} className="flex justify-center min-h-[50px] items-center">
              {(isSubmitting || authLoading) && (
                <div className="flex items-center gap-2 text-gray-500">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary-600" />
                  <span>{isSubmitting ? 'Авторизация...' : 'Проверка сессии...'}</span>
                </div>
              )}
            </div>
            {loginWidgetFailed && <WidgetFallbackMessage />}
            <p className="text-center text-xs text-gray-400">
              Нет аккаунта? Перейдите во вкладку «Регистрация»
            </p>
          </div>
        )}

        {/* Register mode */}
        {mode === 'register' && (
          <div className="space-y-4">
            <p className="text-gray-700 text-center text-sm">
              Введите код приглашения от администратора
            </p>

            <div className="flex gap-2">
              <input
                type="text"
                value={inviteCode}
                onChange={(e) => {
                  setInviteCode(e.target.value.toUpperCase())
                  setInviteValid(null)
                  setRegisterWidgetFailed(false)
                }}
                placeholder="Код приглашения"
                maxLength={32}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-center font-mono text-lg tracking-widest focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent uppercase"
              />
              <button
                onClick={() => checkInvite(inviteCode)}
                disabled={!inviteCode.trim() || inviteChecking}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {inviteChecking ? '...' : 'OK'}
              </button>
            </div>

            {inviteValid === true && (
              <div className="text-center">
                <div className="inline-flex items-center gap-1 px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm mb-3">
                  <span>Код действителен</span>
                  {inviteRole && <span className="font-medium">({roleLabel(inviteRole)})</span>}
                </div>

                <p className="text-gray-600 text-sm mb-3">
                  Нажмите кнопку ниже, чтобы зарегистрироваться через Telegram
                </p>

                <div ref={registerWidgetRef} className="flex justify-center min-h-[50px] items-center">
                  {isSubmitting && (
                    <div className="flex items-center gap-2 text-gray-500">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary-600" />
                      <span>Регистрация...</span>
                    </div>
                  )}
                </div>
                {registerWidgetFailed && <WidgetFallbackMessage />}
              </div>
            )}

            {inviteValid === false && (
              <div className="text-center">
                <div className="inline-flex items-center gap-1 px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm">
                  Код недействителен или истёк
                </div>
              </div>
            )}

            <p className="text-center text-xs text-gray-400">
              Уже зарегистрированы? Перейдите во вкладку «Вход»
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
