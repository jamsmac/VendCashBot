import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../contexts/AuthContext'
import { useNotifications } from '../hooks/useNotifications'
import ThemeToggle from './ThemeToggle'
import NotificationBell from './NotificationBell'
import {
  LayoutDashboard,
  ClipboardList,
  BarChart3,
  Settings,
  Users,
  LogOut,
  Menu,
  X,
} from 'lucide-react'
import { useState } from 'react'

export default function Layout() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Initialize WebSocket notifications
  useNotifications()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const isAdmin = user?.role === 'admin'
  const isManager = user?.role === 'manager' || isAdmin

  const navItems = [
    ...(isManager ? [{ to: '/dashboard', icon: LayoutDashboard, label: 'Главная' }] : []),
    { to: '/collections', icon: ClipboardList, label: 'Инкассации' },
    { to: '/reports', icon: BarChart3, label: 'Отчёты' },
    ...(isManager ? [{ to: '/machines', icon: Settings, label: 'Автоматы' }] : []),
    ...(isAdmin ? [{ to: '/users', icon: Users, label: 'Сотрудники' }] : []),
  ]

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Skip to content accessibility link (QA-005) */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[100] focus:bg-primary-600 focus:text-white focus:px-4 focus:py-2 focus:rounded-lg focus:text-sm"
      >
        Перейти к содержимому
      </a>

      {/* Mobile header */}
      <header className="lg:hidden bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center justify-between" role="banner">
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-2 -ml-2"
          aria-label="Открыть меню"
          aria-expanded={sidebarOpen}
        >
          <Menu className="w-6 h-6 dark:text-gray-200" aria-hidden="true" />
        </button>
        <span className="font-bold text-lg text-primary-600 dark:text-primary-400">VendCash</span>
        <div className="flex items-center gap-1">
          <NotificationBell />
          <ThemeToggle />
        </div>
      </header>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 z-50 h-full w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 transform transition-transform duration-200 lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        role="navigation"
        aria-label="Главное меню"
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <span className="font-bold text-xl text-primary-600 dark:text-primary-400">VendCash</span>
          <div className="flex items-center gap-1">
            <div className="hidden lg:flex items-center gap-1">
              <NotificationBell />
              <ThemeToggle />
            </div>
            <button
              className="lg:hidden p-2"
              onClick={() => setSidebarOpen(false)}
              aria-label="Закрыть меню"
            >
              <X className="w-5 h-5 dark:text-gray-200" aria-hidden="true" />
            </button>
          </div>
        </div>

        <nav className="p-4 space-y-1" aria-label="Навигация">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${isActive
                  ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`
              }
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-primary-100 dark:bg-primary-900/50 rounded-full flex items-center justify-center">
              <span className="text-primary-700 dark:text-primary-300 font-medium">
                {user?.name?.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate dark:text-gray-100">{user?.name}</div>
              <div className="text-sm text-gray-500 dark:text-gray-400 capitalize">{user?.role}</div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 w-full px-3 py-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
          >
            <LogOut className="w-5 h-5" />
            Выйти
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main id="main-content" className="lg:ml-64 p-4 lg:p-6" role="main" aria-label="Основной контент">
        <Outlet />
      </main>
    </div>
  )
}
