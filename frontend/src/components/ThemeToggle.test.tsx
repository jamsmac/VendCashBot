import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// Mock the theme store
const mockSetTheme = vi.fn()

const createMockStore = (theme: string) => ({
  useThemeStore: () => ({
    theme,
    setTheme: mockSetTheme,
  }),
})

describe('ThemeToggle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('should render theme toggle button', async () => {
    vi.doMock('../contexts/ThemeContext', () => createMockStore('light'))
    const { default: ThemeToggleComponent } = await import('./ThemeToggle')

    render(<ThemeToggleComponent />)

    const button = screen.getByRole('button')
    expect(button).toBeInTheDocument()
  })

  it('should display light theme title when theme is light', async () => {
    vi.doMock('../contexts/ThemeContext', () => createMockStore('light'))
    const { default: ThemeToggleComponent } = await import('./ThemeToggle')

    render(<ThemeToggleComponent />)

    const button = screen.getByRole('button')
    expect(button).toHaveAttribute('title', 'Текущая тема: Светлая')
  })

  it('should display dark theme title when theme is dark', async () => {
    vi.doMock('../contexts/ThemeContext', () => createMockStore('dark'))
    const { default: ThemeToggleComponent } = await import('./ThemeToggle')

    render(<ThemeToggleComponent />)

    const button = screen.getByRole('button')
    expect(button).toHaveAttribute('title', 'Текущая тема: Тёмная')
  })

  it('should cycle theme on click: light -> dark', async () => {
    vi.doMock('../contexts/ThemeContext', () => createMockStore('light'))
    const { default: ThemeToggleComponent } = await import('./ThemeToggle')

    render(<ThemeToggleComponent />)

    const button = screen.getByRole('button')
    fireEvent.click(button)

    expect(mockSetTheme).toHaveBeenCalledWith('dark')
  })

  it('should cycle theme on click: dark -> system', async () => {
    vi.doMock('../contexts/ThemeContext', () => createMockStore('dark'))
    const { default: ThemeToggleComponent } = await import('./ThemeToggle')

    render(<ThemeToggleComponent />)

    const button = screen.getByRole('button')
    fireEvent.click(button)

    expect(mockSetTheme).toHaveBeenCalledWith('system')
  })

  it('should cycle theme on click: system -> light', async () => {
    vi.doMock('../contexts/ThemeContext', () => createMockStore('system'))
    const { default: ThemeToggleComponent } = await import('./ThemeToggle')

    render(<ThemeToggleComponent />)

    const button = screen.getByRole('button')
    fireEvent.click(button)

    expect(mockSetTheme).toHaveBeenCalledWith('light')
  })
})
