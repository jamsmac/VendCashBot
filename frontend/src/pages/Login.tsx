import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '../contexts/AuthContext'
import { authApi } from '../api/auth'
import toast from 'react-hot-toast'

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

type Mode = 'login' | 'register'

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

  const loginWidgetRef = useRef<HTMLDivElement>(null)
  const registerWidgetRef = useRef<HTMLDivElement>(null)
  const loginWidgetLoaded = useRef(false)
  const registerWidgetLoaded = useRef(false)
  const isMounted = useRef(true)

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated && !authLoading) {
      navigate('/', { replace: true })
    }
  }, [isAuthenticated, authLoading, navigate])

  // Login handler
  const handleLogin = useCallback(async (telegramUser: TelegramUser) => {
    if (isSubmitting) return
    setIsSubmitting(true)
    try {
      await login(telegramUser)
      if (isMounted.current) {
        toast.success('Добро пожаловать!')
        navigate('/', { replace: true })
      }
    } catch (error: any) {
      if (isMounted.current) {
        const msg = error.response?.data?.message || 'Ошибка авторизации'
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

  // Register handler
  const handleRegister = useCallback(async (telegramUser: TelegramUser) => {
    if (isSubmitting || !inviteCode.trim()) return
    setIsSubmitting(true)
    try {
      await register(telegramUser, inviteCode.trim())
      if (isMounted.current) {
        toast.success('Регистрация успешна! Добро пожаловать!')
        navigate('/', { replace: true })
      }
    } catch (error: any) {
      if (isMounted.current) {
        const msg = error.response?.data?.message || 'Ошибка регистрации'
        toast.error(msg)
      }
    } finally {
      if (isMounted.current) setIsSubmitting(false)
    }
  }, [register, navigate, isSubmitting, inviteCode])

  // Refs for latest handlers
  const loginHandlerRef = useRef(handleLogin)
  loginHandlerRef.current = handleLogin
  const registerHandlerRef = useRef(handleRegister)
  registerHandlerRef.current = handleRegister

  // Load Telegram widget into a container
  const loadWidget = (container: HTMLDivElement, callbackName: string) => {
    const script = document.createElement('script')
    script.src = 'https://telegram.org/js/telegram-widget.js?22'
    script.setAttribute('data-telegram-login', import.meta.env.VITE_TELEGRAM_BOT_USERNAME || 'vendhubcashbot')
    script.setAttribute('data-size', 'large')
    script.setAttribute('data-radius', '8')
    script.setAttribute('data-onauth', `${callbackName}(user)`)
    script.setAttribute('data-request-access', 'write')
    script.crossOrigin = 'anonymous'
    script.async = true
    container.appendChild(script)
  }

  // Setup login widget
  useEffect(() => {
    isMounted.current = true

    // Setup global callbacks
    ;(window as any).TelegramLoginAuth = (user: TelegramUser) => {
      loginHandlerRef.current(user)
    }
    ;(window as any).TelegramRegisterAuth = (user: TelegramUser) => {
      registerHandlerRef.current(user)
    }

    if (!loginWidgetLoaded.current && loginWidgetRef.current) {
      loadWidget(loginWidgetRef.current, 'TelegramLoginAuth')
      loginWidgetLoaded.current = true
    }

    return () => { isMounted.current = false }
  }, [])

  // Load register widget when invite is validated
  useEffect(() => {
    if (inviteValid && !registerWidgetLoaded.current && registerWidgetRef.current) {
      loadWidget(registerWidgetRef.current, 'TelegramRegisterAuth')
      registerWidgetLoaded.current = true
    }
  }, [inviteValid])

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
            <div ref={loginWidgetRef} className="flex justify-center min-h-[50px]">
              {(isSubmitting || authLoading) && (
                <div className="flex items-center gap-2 text-gray-500">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary-600" />
                  <span>{isSubmitting ? 'Авторизация...' : 'Проверка сессии...'}</span>
                </div>
              )}
            </div>
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
                  registerWidgetLoaded.current = false
                  if (registerWidgetRef.current) {
                    registerWidgetRef.current.innerHTML = ''
                  }
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

                <div ref={registerWidgetRef} className="flex justify-center min-h-[50px]">
                  {isSubmitting && (
                    <div className="flex items-center gap-2 text-gray-500">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary-600" />
                      <span>Регистрация...</span>
                    </div>
                  )}
                </div>
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
