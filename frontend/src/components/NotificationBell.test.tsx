import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import NotificationBell from './NotificationBell'

// Mock the notifications store
const mockNotifications = [
  {
    id: '1',
    type: 'collection_created',
    data: { machine: { code: 'M001' } },
    timestamp: new Date().toISOString(),
    read: false,
  },
  {
    id: '2',
    type: 'collection_received',
    data: { amount: 50000 },
    timestamp: new Date().toISOString(),
    read: true,
  },
]

vi.mock('../hooks/useNotifications', () => ({
  useNotificationsStore: vi.fn(() => ({
    notifications: mockNotifications,
    unreadCount: 1,
    markAsRead: vi.fn(),
    markAllAsRead: vi.fn(),
    clearAll: vi.fn(),
  })),
}))

// Mock date-fns
vi.mock('date-fns', () => ({
  formatDistanceToNow: vi.fn(() => '5 минут назад'),
}))

vi.mock('date-fns/locale', () => ({
  ru: {},
}))

describe('NotificationBell', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render notification bell button', () => {
    render(<NotificationBell />)

    const button = screen.getByRole('button', { name: /уведомления/i })
    expect(button).toBeInTheDocument()
  })

  it('should show unread count badge', () => {
    render(<NotificationBell />)

    // The badge shows "1" for unread notifications
    expect(screen.getByText('1')).toBeInTheDocument()
  })

  it('should have proper aria attributes', () => {
    render(<NotificationBell />)

    const button = screen.getByRole('button', { name: /уведомления.*1 непрочитанных/i })
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(button).toHaveAttribute('aria-haspopup', 'true')
  })

  it('should toggle dropdown on click', () => {
    render(<NotificationBell />)

    const button = screen.getByRole('button', { name: /уведомления/i })

    // Initially closed
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()

    // Click to open
    fireEvent.click(button)
    expect(screen.getByRole('menu')).toBeInTheDocument()

    // Click again to close
    fireEvent.click(button)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('should display notifications when dropdown is open', () => {
    render(<NotificationBell />)

    const button = screen.getByRole('button', { name: /уведомления/i })
    fireEvent.click(button)

    expect(screen.getByText(/Новая инкассация с автомата M001/i)).toBeInTheDocument()
    expect(screen.getByText(/Инкассация принята: 50 000 сум/i)).toBeInTheDocument()
  })

  it('should have accessible notification items', () => {
    render(<NotificationBell />)

    const button = screen.getByRole('button', { name: /уведомления/i })
    fireEvent.click(button)

    const listItems = screen.getAllByRole('listitem')
    expect(listItems.length).toBeGreaterThan(0)
  })
})
