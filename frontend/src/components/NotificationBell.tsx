import { useState, useRef, useEffect } from 'react'
import { Bell, X, CheckCheck } from 'lucide-react'
import { useNotificationsStore } from '../hooks/useNotifications'
import { formatDistanceToNow } from 'date-fns'
import { ru } from 'date-fns/locale'

export default function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const { notifications, unreadCount, markAsRead, markAllAsRead, clearAll } = useNotificationsStore()

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'collection_created':
        return '📥'
      case 'collection_received':
        return '✅'
      case 'collection_cancelled':
        return '❌'
      case 'machine_approved':
        return '🎉'
      case 'machine_rejected':
        return '⛔'
      default:
        return '📢'
    }
  }

  const getNotificationText = (type: string, data: any) => {
    switch (type) {
      case 'collection_created':
        return `Новая инкассация с автомата ${data.machine?.code || '—'}`
      case 'collection_received':
        return `Инкассация принята: ${data.amount?.toLocaleString('ru-RU')} сум`
      case 'collection_cancelled':
        return `Инкассация отменена: ${data.machine?.code || '—'}`
      case 'machine_approved':
        return `Автомат "${data.code}" был одобрен`
      case 'machine_rejected':
        return `Автомат "${data.code}" был отклонён: ${data.rejectionReason || '—'}`
      default:
        return 'Новое уведомление'
    }
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        aria-label={`Уведомления${unreadCount > 0 ? `, ${unreadCount} непрочитанных` : ''}`}
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <Bell className="w-5 h-5 text-gray-600 dark:text-gray-300" aria-hidden="true" />
        {unreadCount > 0 && (
          <span
            className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center"
            aria-hidden="true"
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          className="absolute right-0 mt-2 w-80 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-50"
          role="menu"
          aria-label="Список уведомлений"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
            <h3 className="font-medium text-gray-900 dark:text-gray-100" id="notifications-heading">Уведомления</h3>
            <div className="flex gap-1">
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                  title="Отметить все как прочитанные"
                  aria-label="Отметить все как прочитанные"
                >
                  <CheckCheck className="w-4 h-4 text-gray-500" aria-hidden="true" />
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  onClick={clearAll}
                  className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                  title="Очистить все"
                  aria-label="Очистить все уведомления"
                >
                  <X className="w-4 h-4 text-gray-500" aria-hidden="true" />
                </button>
              )}
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto" role="list" aria-labelledby="notifications-heading">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-gray-500 dark:text-gray-400" role="listitem">
                Нет уведомлений
              </div>
            ) : (
              notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`px-4 py-3 border-b border-gray-100 dark:border-gray-700 last:border-b-0 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 ${
                    !notification.read ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                  }`}
                  onClick={() => markAsRead(notification.id)}
                  role="listitem"
                  aria-label={`${getNotificationText(notification.type, notification.data)}${!notification.read ? ', непрочитано' : ''}`}
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && markAsRead(notification.id)}
                >
                  <div className="flex gap-3">
                    <span className="text-lg">{getNotificationIcon(notification.type)}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900 dark:text-gray-100">
                        {getNotificationText(notification.type, notification.data)}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {formatDistanceToNow(new Date(notification.timestamp), {
                          addSuffix: true,
                          locale: ru,
                        })}
                      </p>
                    </div>
                    {!notification.read && (
                      <div className="w-2 h-2 bg-blue-500 rounded-full mt-2" />
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
