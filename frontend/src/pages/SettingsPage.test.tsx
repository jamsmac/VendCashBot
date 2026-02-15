import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// Mock settings API
const mockGetAppSettings = vi.fn()
const mockUpdateAppSettings = vi.fn()

vi.mock('../api/settings', () => ({
  settingsApi: {
    getAppSettings: (...args: unknown[]) => mockGetAppSettings(...args),
    updateAppSettings: (...args: unknown[]) => mockUpdateAppSettings(...args),
  },
}))

// Mock react-hot-toast
vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

import SettingsPage from './SettingsPage'

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

const defaultSettings = {
  reconciliationTolerance: 5,
  shortageAlertThreshold: 10,
  collectionDistanceMeters: 50,
  defaultPageSize: 50,
}

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAppSettings.mockResolvedValue(defaultSettings)
    mockUpdateAppSettings.mockResolvedValue(defaultSettings)
  })

  it('should render loading state initially', () => {
    // Make the API hang
    mockGetAppSettings.mockReturnValue(new Promise(() => {}))

    render(<SettingsPage />, { wrapper: createWrapper() })

    // Should show spinner (Loader2 icon)
    expect(screen.queryByText('Настройки')).not.toBeInTheDocument()
  })

  it('should render settings form after loading', async () => {
    render(<SettingsPage />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('Настройки')).toBeInTheDocument()
    })

    expect(screen.getByText('Допуск совпадения (%)')).toBeInTheDocument()
    expect(screen.getByText('Порог Telegram-алерта (%)')).toBeInTheDocument()
    expect(screen.getByText('Допуск геолокации (метры)')).toBeInTheDocument()
    expect(screen.getByText('Записей на странице')).toBeInTheDocument()
  })

  it('should display current setting values', async () => {
    render(<SettingsPage />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('5%')).toBeInTheDocument()
    })

    expect(screen.getByText('10%')).toBeInTheDocument()
    expect(screen.getByText('50м')).toBeInTheDocument()
  })

  it('should enable save button when settings change', async () => {
    render(<SettingsPage />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('Сохранить')).toBeInTheDocument()
    })

    const saveBtn = screen.getByText('Сохранить').closest('button')!
    expect(saveBtn).toBeDisabled()

    // Change a range slider
    const sliders = screen.getAllByRole('slider')
    fireEvent.change(sliders[0], { target: { value: '10' } })

    expect(saveBtn).not.toBeDisabled()
  })

  it('should call updateAppSettings on save', async () => {
    const updatedSettings = { ...defaultSettings, reconciliationTolerance: 10 }
    mockUpdateAppSettings.mockResolvedValue(updatedSettings)

    render(<SettingsPage />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('Сохранить')).toBeInTheDocument()
    })

    // Change tolerance
    const sliders = screen.getAllByRole('slider')
    fireEvent.change(sliders[0], { target: { value: '10' } })

    // Click save
    fireEvent.click(screen.getByText('Сохранить'))

    await waitFor(() => {
      expect(mockUpdateAppSettings).toHaveBeenCalled()
    })
  })

  it('should reset to defaults when clicking reset button', async () => {
    mockGetAppSettings.mockResolvedValue({
      ...defaultSettings,
      reconciliationTolerance: 15,
    })

    render(<SettingsPage />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('15%')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('По умолчанию'))

    // Should reset to 5%
    expect(screen.getByText('5%')).toBeInTheDocument()
  })

  it('should show error state when loading fails', async () => {
    mockGetAppSettings.mockRejectedValue(new Error('Network error'))

    render(<SettingsPage />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText(/Ошибка загрузки настроек/)).toBeInTheDocument()
    })
  })
})
