import { useEffect, useCallback, useRef } from 'react'
import { io, Socket } from 'socket.io-client'
import { create } from 'zustand'
import toast from 'react-hot-toast'
import { useAuthStore } from '../contexts/AuthContext'

interface Notification {
  id: string
  type: 'collection_created' | 'collection_received' | 'collection_cancelled' | 'machine_approved' | 'machine_rejected'
  data: any
  timestamp: Date
  read: boolean
}

interface NotificationsState {
  notifications: Notification[]
  unreadCount: number
  addNotification: (notification: Omit<Notification, 'id' | 'read'>) => void
  markAsRead: (id: string) => void
  markAllAsRead: () => void
  clearAll: () => void
}

export const useNotificationsStore = create<NotificationsState>((set) => ({
  notifications: [],
  unreadCount: 0,

  addNotification: (notification) => {
    const newNotification: Notification = {
      ...notification,
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      read: false,
    }

    set((state) => ({
      notifications: [newNotification, ...state.notifications].slice(0, 50), // Keep last 50
      unreadCount: state.unreadCount + 1,
    }))
  },

  markAsRead: (id) => {
    set((state) => {
      const notification = state.notifications.find((n) => n.id === id)
      if (notification && !notification.read) {
        return {
          notifications: state.notifications.map((n) =>
            n.id === id ? { ...n, read: true } : n
          ),
          unreadCount: Math.max(0, state.unreadCount - 1),
        }
      }
      return state
    })
  },

  markAllAsRead: () => {
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    }))
  },

  clearAll: () => {
    set({ notifications: [], unreadCount: 0 })
  },
}))

const getNotificationMessage = (type: string, data: any): string => {
  switch (type) {
    case 'collection_created':
      return `Новая инкассация: ${data.machine?.code || 'Автомат'}`
    case 'collection_received':
      return `Инкассация принята: ${data.amount?.toLocaleString('ru-RU')} сум`
    case 'collection_cancelled':
      return `Инкассация отменена: ${data.machine?.code || 'Автомат'}`
    case 'machine_approved':
      return `Автомат "${data.code}" одобрен`
    case 'machine_rejected':
      return `Автомат "${data.code}" отклонён`
    default:
      return 'Новое уведомление'
  }
}

export function useNotifications() {
  const socketRef = useRef<Socket | null>(null)
  const { isAuthenticated } = useAuthStore()
  const { addNotification } = useNotificationsStore()

  const connect = useCallback(() => {
    if (!isAuthenticated) return

    const apiUrl = import.meta.env.VITE_API_URL || ''
    const wsUrl = apiUrl.replace('/api', '').replace('http', 'ws')

    socketRef.current = io(`${wsUrl}/notifications`, {
      withCredentials: true, // Send cookies with WebSocket connection
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    })

    socketRef.current.on('connect', () => {
      console.log('WebSocket connected')
    })

    socketRef.current.on('disconnect', (reason) => {
      console.log('WebSocket disconnected:', reason)
    })

    socketRef.current.on('notification', (payload: { type: string; data: any; timestamp: Date }) => {
      addNotification({
        type: payload.type as Notification['type'],
        data: payload.data,
        timestamp: new Date(payload.timestamp),
      })

      // Show toast notification
      const message = getNotificationMessage(payload.type, payload.data)
      toast(message, {
        icon: payload.type.includes('cancelled') || payload.type.includes('rejected') ? '❌' : '✅',
        duration: 4000,
      })
    })

    socketRef.current.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error.message)
    })
  }, [isAuthenticated, addNotification])

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect()
      socketRef.current = null
    }
  }, [])

  useEffect(() => {
    if (isAuthenticated) {
      connect()
    } else {
      disconnect()
    }

    return () => {
      disconnect()
    }
  }, [isAuthenticated, connect, disconnect])

  return {
    isConnected: socketRef.current?.connected || false,
  }
}
