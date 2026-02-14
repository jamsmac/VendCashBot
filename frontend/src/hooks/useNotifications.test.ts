import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from '@testing-library/react'
import { useNotificationsStore } from './useNotifications'

describe('useNotificationsStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset store state
    useNotificationsStore.setState({
      notifications: [],
      unreadCount: 0,
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Initial state', () => {
    it('should have empty notifications and zero unreadCount', () => {
      const state = useNotificationsStore.getState()
      expect(state.notifications).toEqual([])
      expect(state.unreadCount).toBe(0)
    })
  })

  describe('addNotification method', () => {
    it('should add notification to the list', () => {
      const notification = {
        type: 'collection_created' as const,
        data: { machine: { code: 'M001' } },
        timestamp: new Date(),
      }

      act(() => {
        useNotificationsStore.getState().addNotification(notification)
      })

      const state = useNotificationsStore.getState()
      expect(state.notifications).toHaveLength(1)
      expect(state.notifications[0].type).toBe('collection_created')
      expect(state.notifications[0].read).toBe(false)
    })

    it('should increment unreadCount when adding notification', () => {
      const notification = {
        type: 'collection_created' as const,
        data: { machine: { code: 'M001' } },
        timestamp: new Date(),
      }

      act(() => {
        useNotificationsStore.getState().addNotification(notification)
      })

      expect(useNotificationsStore.getState().unreadCount).toBe(1)
    })

    it('should add notification with generated id', () => {
      const notification = {
        type: 'collection_received' as const,
        data: { amount: 50000 },
        timestamp: new Date(),
      }

      act(() => {
        useNotificationsStore.getState().addNotification(notification)
      })

      const state = useNotificationsStore.getState()
      expect(state.notifications[0].id).toBeDefined()
      expect(typeof state.notifications[0].id).toBe('string')
      expect(state.notifications[0].id.length).toBeGreaterThan(0)
    })

    it('should add new notification at the beginning of the list', () => {
      const notification1 = {
        type: 'collection_created' as const,
        data: { machine: { code: 'M001' } },
        timestamp: new Date('2024-01-01'),
      }

      const notification2 = {
        type: 'collection_received' as const,
        data: { amount: 50000 },
        timestamp: new Date('2024-01-02'),
      }

      act(() => {
        useNotificationsStore.getState().addNotification(notification1)
        useNotificationsStore.getState().addNotification(notification2)
      })

      const state = useNotificationsStore.getState()
      expect(state.notifications).toHaveLength(2)
      expect(state.notifications[0].type).toBe('collection_received')
      expect(state.notifications[1].type).toBe('collection_created')
    })

    it('should keep max 50 notifications', () => {
      const addMany = (count: number) => {
        for (let i = 0; i < count; i++) {
          useNotificationsStore.getState().addNotification({
            type: 'collection_created' as const,
            data: { machine: { code: `M${i}` } },
            timestamp: new Date(),
          })
        }
      }

      act(() => {
        addMany(60)
      })

      const state = useNotificationsStore.getState()
      expect(state.notifications).toHaveLength(50)
    })

    it('should keep the most recent 50 notifications when exceeding limit', () => {
      const addMany = (count: number) => {
        for (let i = 0; i < count; i++) {
          useNotificationsStore.getState().addNotification({
            type: 'collection_created' as const,
            data: { machine: { code: `M${i}` } },
            timestamp: new Date(Date.now() + i),
          })
        }
      }

      act(() => {
        addMany(60)
      })

      const state = useNotificationsStore.getState()
      expect(state.notifications).toHaveLength(50)
      // Most recent notification should be at index 0
      expect(state.notifications[0].data.machine?.code).toBe('M59')
      // Oldest kept notification should be at the end
      expect(state.notifications[49].data.machine?.code).toBe('M10')
    })

    it('should handle multiple notifications with correct unreadCount', () => {
      act(() => {
        for (let i = 0; i < 5; i++) {
          useNotificationsStore.getState().addNotification({
            type: 'collection_created' as const,
            data: { machine: { code: `M${i}` } },
            timestamp: new Date(),
          })
        }
      })

      expect(useNotificationsStore.getState().unreadCount).toBe(5)
    })
  })

  describe('markAsRead method', () => {
    it('should mark notification as read', () => {
      let notificationId: string

      act(() => {
        useNotificationsStore.getState().addNotification({
          type: 'collection_created' as const,
          data: { machine: { code: 'M001' } },
          timestamp: new Date(),
        })
        notificationId = useNotificationsStore.getState().notifications[0].id
      })

      act(() => {
        useNotificationsStore.getState().markAsRead(notificationId!)
      })

      const notification = useNotificationsStore.getState().notifications.find(n => n.id === notificationId)
      expect(notification?.read).toBe(true)
    })

    it('should decrement unreadCount when marking as read', () => {
      let notificationId: string

      act(() => {
        useNotificationsStore.getState().addNotification({
          type: 'collection_created' as const,
          data: { machine: { code: 'M001' } },
          timestamp: new Date(),
        })
        notificationId = useNotificationsStore.getState().notifications[0].id
      })

      expect(useNotificationsStore.getState().unreadCount).toBe(1)

      act(() => {
        useNotificationsStore.getState().markAsRead(notificationId!)
      })

      expect(useNotificationsStore.getState().unreadCount).toBe(0)
    })

    it('should not change state if notification is already read', () => {
      let notificationId: string

      act(() => {
        useNotificationsStore.getState().addNotification({
          type: 'collection_created' as const,
          data: { machine: { code: 'M001' } },
          timestamp: new Date(),
        })
        notificationId = useNotificationsStore.getState().notifications[0].id
      })

      act(() => {
        useNotificationsStore.getState().markAsRead(notificationId!)
      })

      expect(useNotificationsStore.getState().unreadCount).toBe(0)

      // Try to mark as read again
      act(() => {
        useNotificationsStore.getState().markAsRead(notificationId!)
      })

      // unreadCount should still be 0
      expect(useNotificationsStore.getState().unreadCount).toBe(0)
    })

    it('should not decrement unreadCount below 0', () => {
      act(() => {
        useNotificationsStore.getState().markAsRead('non-existent-id')
      })

      expect(useNotificationsStore.getState().unreadCount).toBe(0)
    })

    it('should handle non-existent notification id', () => {
      act(() => {
        useNotificationsStore.getState().addNotification({
          type: 'collection_created' as const,
          data: { machine: { code: 'M001' } },
          timestamp: new Date(),
        })
      })

      const initialState = useNotificationsStore.getState()
      const initialCount = initialState.unreadCount

      act(() => {
        useNotificationsStore.getState().markAsRead('non-existent-id')
      })

      expect(useNotificationsStore.getState().unreadCount).toBe(initialCount)
    })

    it('should mark only specific notification as read when multiple exist', () => {
      let id1: string
      let id2: string

      act(() => {
        useNotificationsStore.getState().addNotification({
          type: 'collection_created' as const,
          data: { machine: { code: 'M001' } },
          timestamp: new Date(),
        })
        useNotificationsStore.getState().addNotification({
          type: 'collection_received' as const,
          data: { amount: 50000 },
          timestamp: new Date(),
        })
        id2 = useNotificationsStore.getState().notifications[0].id
        id1 = useNotificationsStore.getState().notifications[1].id
      })

      act(() => {
        useNotificationsStore.getState().markAsRead(id1!)
      })

      const state = useNotificationsStore.getState()
      expect(state.notifications.find(n => n.id === id1)?.read).toBe(true)
      expect(state.notifications.find(n => n.id === id2)?.read).toBe(false)
      expect(state.unreadCount).toBe(1)
    })
  })

  describe('markAllAsRead method', () => {
    it('should mark all notifications as read', () => {
      act(() => {
        for (let i = 0; i < 3; i++) {
          useNotificationsStore.getState().addNotification({
            type: 'collection_created' as const,
            data: { machine: { code: `M${i}` } },
            timestamp: new Date(),
          })
        }
      })

      expect(useNotificationsStore.getState().unreadCount).toBe(3)

      act(() => {
        useNotificationsStore.getState().markAllAsRead()
      })

      const state = useNotificationsStore.getState()
      expect(state.notifications.every(n => n.read)).toBe(true)
      expect(state.unreadCount).toBe(0)
    })

    it('should reset unreadCount to 0', () => {
      act(() => {
        useNotificationsStore.getState().addNotification({
          type: 'collection_created' as const,
          data: { machine: { code: 'M001' } },
          timestamp: new Date(),
        })
        useNotificationsStore.getState().addNotification({
          type: 'collection_received' as const,
          data: { amount: 50000 },
          timestamp: new Date(),
        })
      })

      act(() => {
        useNotificationsStore.getState().markAllAsRead()
      })

      expect(useNotificationsStore.getState().unreadCount).toBe(0)
    })

    it('should handle empty notifications list', () => {
      act(() => {
        useNotificationsStore.getState().markAllAsRead()
      })

      const state = useNotificationsStore.getState()
      expect(state.notifications).toHaveLength(0)
      expect(state.unreadCount).toBe(0)
    })

    it('should handle mixed read and unread notifications', () => {
      let id1: string

      act(() => {
        useNotificationsStore.getState().addNotification({
          type: 'collection_created' as const,
          data: { machine: { code: 'M001' } },
          timestamp: new Date(),
        })
        useNotificationsStore.getState().addNotification({
          type: 'collection_received' as const,
          data: { amount: 50000 },
          timestamp: new Date(),
        })
        id1 = useNotificationsStore.getState().notifications[1].id
      })

      act(() => {
        useNotificationsStore.getState().markAsRead(id1!)
      })

      expect(useNotificationsStore.getState().unreadCount).toBe(1)

      act(() => {
        useNotificationsStore.getState().markAllAsRead()
      })

      const state = useNotificationsStore.getState()
      expect(state.notifications.every(n => n.read)).toBe(true)
      expect(state.unreadCount).toBe(0)
    })
  })

  describe('clearAll method', () => {
    it('should empty notifications list', () => {
      act(() => {
        useNotificationsStore.getState().addNotification({
          type: 'collection_created' as const,
          data: { machine: { code: 'M001' } },
          timestamp: new Date(),
        })
        useNotificationsStore.getState().addNotification({
          type: 'collection_received' as const,
          data: { amount: 50000 },
          timestamp: new Date(),
        })
      })

      expect(useNotificationsStore.getState().notifications).toHaveLength(2)

      act(() => {
        useNotificationsStore.getState().clearAll()
      })

      expect(useNotificationsStore.getState().notifications).toHaveLength(0)
    })

    it('should reset unreadCount to 0', () => {
      act(() => {
        for (let i = 0; i < 5; i++) {
          useNotificationsStore.getState().addNotification({
            type: 'collection_created' as const,
            data: { machine: { code: `M${i}` } },
            timestamp: new Date(),
          })
        }
      })

      expect(useNotificationsStore.getState().unreadCount).toBe(5)

      act(() => {
        useNotificationsStore.getState().clearAll()
      })

      expect(useNotificationsStore.getState().unreadCount).toBe(0)
    })

    it('should handle clearing empty list', () => {
      act(() => {
        useNotificationsStore.getState().clearAll()
      })

      const state = useNotificationsStore.getState()
      expect(state.notifications).toHaveLength(0)
      expect(state.unreadCount).toBe(0)
    })

    it('should completely reset state', () => {
      act(() => {
        useNotificationsStore.getState().addNotification({
          type: 'collection_created' as const,
          data: { machine: { code: 'M001' } },
          timestamp: new Date(),
        })
      })

      const state1 = useNotificationsStore.getState()
      expect(state1.notifications).toHaveLength(1)
      expect(state1.unreadCount).toBe(1)

      act(() => {
        useNotificationsStore.getState().clearAll()
      })

      const state2 = useNotificationsStore.getState()
      expect(state2.notifications).toHaveLength(0)
      expect(state2.unreadCount).toBe(0)
    })
  })

  describe('Integration tests', () => {
    it('should handle complex workflow', () => {
      let id1: string
      let id2: string

      act(() => {
        // Add 3 notifications
        useNotificationsStore.getState().addNotification({
          type: 'collection_created' as const,
          data: { machine: { code: 'M001' } },
          timestamp: new Date(),
        })
        useNotificationsStore.getState().addNotification({
          type: 'collection_received' as const,
          data: { amount: 50000 },
          timestamp: new Date(),
        })
        useNotificationsStore.getState().addNotification({
          type: 'collection_cancelled' as const,
          data: { machine: { code: 'M002' } },
          timestamp: new Date(),
        })
        const notifications = useNotificationsStore.getState().notifications
        id2 = notifications[1].id
        id1 = notifications[2].id
      })

      expect(useNotificationsStore.getState().unreadCount).toBe(3)

      // Mark one as read
      act(() => {
        useNotificationsStore.getState().markAsRead(id1!)
      })
      expect(useNotificationsStore.getState().unreadCount).toBe(2)

      // Mark another as read
      act(() => {
        useNotificationsStore.getState().markAsRead(id2!)
      })
      expect(useNotificationsStore.getState().unreadCount).toBe(1)

      // Mark all as read
      act(() => {
        useNotificationsStore.getState().markAllAsRead()
      })
      expect(useNotificationsStore.getState().unreadCount).toBe(0)

      // Clear all
      act(() => {
        useNotificationsStore.getState().clearAll()
      })
      expect(useNotificationsStore.getState().notifications).toHaveLength(0)
      expect(useNotificationsStore.getState().unreadCount).toBe(0)
    })

    it('should maintain correct unreadCount throughout operations', () => {
      act(() => {
        for (let i = 0; i < 10; i++) {
          useNotificationsStore.getState().addNotification({
            type: 'collection_created' as const,
            data: { machine: { code: `M${i}` } },
            timestamp: new Date(),
          })
        }
      })

      let state = useNotificationsStore.getState()
      expect(state.unreadCount).toBe(10)
      expect(state.notifications).toHaveLength(10)

      // Mark half as read
      const ids = state.notifications.slice(0, 5).map(n => n.id)
      act(() => {
        ids.forEach(id => {
          useNotificationsStore.getState().markAsRead(id)
        })
      })

      state = useNotificationsStore.getState()
      expect(state.unreadCount).toBe(5)

      // Mark all as read
      act(() => {
        useNotificationsStore.getState().markAllAsRead()
      })

      state = useNotificationsStore.getState()
      expect(state.unreadCount).toBe(0)
      expect(state.notifications.every(n => n.read)).toBe(true)
    })
  })
})
