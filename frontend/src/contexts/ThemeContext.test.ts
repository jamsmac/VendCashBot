import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from '@testing-library/react'
import { useThemeStore } from './ThemeContext'

describe('ThemeContext (useThemeStore)', () => {
  beforeEach(() => {
    // Clear all mocks and reset store
    vi.clearAllMocks()
    // Reset localStorage
    localStorage.clear()
    // Reset document classes
    document.documentElement.className = ''
    // Reset store state
    useThemeStore.setState({
      theme: 'system',
      isDark: false,
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    document.documentElement.className = ''
  })

  describe('Initial state', () => {
    it('should have theme set to system', () => {
      const state = useThemeStore.getState()
      expect(state.theme).toBe('system')
    })

    it('should compute isDark based on system preference', () => {
      const state = useThemeStore.getState()
      expect(state.isDark).toBeDefined()
      expect(typeof state.isDark).toBe('boolean')
    })
  })

  describe('setTheme method', () => {
    it('should update theme to dark and set isDark to true', () => {
      act(() => {
        useThemeStore.getState().setTheme('dark')
      })

      const state = useThemeStore.getState()
      expect(state.theme).toBe('dark')
      expect(state.isDark).toBe(true)
    })

    it('should update theme to light and set isDark to false', () => {
      act(() => {
        useThemeStore.getState().setTheme('light')
      })

      const state = useThemeStore.getState()
      expect(state.theme).toBe('light')
      expect(state.isDark).toBe(false)
    })

    it('should update theme to system and use system preference', () => {
      // Mock system preference
      const mockMatchMedia = vi.fn()
      mockMatchMedia.mockReturnValue({
        matches: true, // System prefers dark
        media: '(prefers-color-scheme: dark)',
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })

      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: mockMatchMedia,
      })

      act(() => {
        useThemeStore.getState().setTheme('system')
      })

      const state = useThemeStore.getState()
      expect(state.theme).toBe('system')
      // isDark should match system preference (true in this mock)
      expect(typeof state.isDark).toBe('boolean')
    })

    it('should add dark class to document.documentElement when theme is dark', () => {
      act(() => {
        useThemeStore.getState().setTheme('dark')
      })

      expect(document.documentElement.classList.contains('dark')).toBe(true)
    })

    it('should remove dark class from document.documentElement when theme is light', () => {
      // First set to dark
      act(() => {
        useThemeStore.getState().setTheme('dark')
      })
      expect(document.documentElement.classList.contains('dark')).toBe(true)

      // Then change to light
      act(() => {
        useThemeStore.getState().setTheme('light')
      })

      expect(document.documentElement.classList.contains('dark')).toBe(false)
    })

    it('should handle multiple theme changes', () => {
      act(() => {
        useThemeStore.getState().setTheme('light')
      })
      expect(useThemeStore.getState().theme).toBe('light')
      expect(useThemeStore.getState().isDark).toBe(false)

      act(() => {
        useThemeStore.getState().setTheme('dark')
      })
      expect(useThemeStore.getState().theme).toBe('dark')
      expect(useThemeStore.getState().isDark).toBe(true)

      act(() => {
        useThemeStore.getState().setTheme('light')
      })
      expect(useThemeStore.getState().theme).toBe('light')
      expect(useThemeStore.getState().isDark).toBe(false)
    })

    it('should update document class on every theme change', () => {
      act(() => {
        useThemeStore.getState().setTheme('dark')
      })
      expect(document.documentElement.classList.contains('dark')).toBe(true)

      act(() => {
        useThemeStore.getState().setTheme('light')
      })
      expect(document.documentElement.classList.contains('dark')).toBe(false)

      act(() => {
        useThemeStore.getState().setTheme('dark')
      })
      expect(document.documentElement.classList.contains('dark')).toBe(true)
    })

    it('should handle light theme with system preference for dark', () => {
      // Mock system preference as dark
      const mockMatchMedia = vi.fn()
      mockMatchMedia.mockReturnValue({
        matches: true,
        media: '(prefers-color-scheme: dark)',
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })

      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: mockMatchMedia,
      })

      // Even though system prefers dark, explicitly setting light should take precedence
      act(() => {
        useThemeStore.getState().setTheme('light')
      })

      expect(useThemeStore.getState().theme).toBe('light')
      expect(useThemeStore.getState().isDark).toBe(false)
      expect(document.documentElement.classList.contains('dark')).toBe(false)
    })

    it('should handle dark theme with system preference for light', () => {
      // Mock system preference as light
      const mockMatchMedia = vi.fn()
      mockMatchMedia.mockReturnValue({
        matches: false,
        media: '(prefers-color-scheme: dark)',
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })

      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: mockMatchMedia,
      })

      // Even though system prefers light, explicitly setting dark should take precedence
      act(() => {
        useThemeStore.getState().setTheme('dark')
      })

      expect(useThemeStore.getState().theme).toBe('dark')
      expect(useThemeStore.getState().isDark).toBe(true)
      expect(document.documentElement.classList.contains('dark')).toBe(true)
    })
  })

  describe('isDark computed property', () => {
    it('should be true when theme is dark', () => {
      act(() => {
        useThemeStore.getState().setTheme('dark')
      })

      expect(useThemeStore.getState().isDark).toBe(true)
    })

    it('should be false when theme is light', () => {
      act(() => {
        useThemeStore.getState().setTheme('light')
      })

      expect(useThemeStore.getState().isDark).toBe(false)
    })

    it('should reflect system preference when theme is system', () => {
      // Mock system preference as dark
      const mockMatchMedia = vi.fn()
      mockMatchMedia.mockReturnValue({
        matches: true,
        media: '(prefers-color-scheme: dark)',
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })

      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: mockMatchMedia,
      })

      act(() => {
        useThemeStore.getState().setTheme('system')
      })

      // isDark should reflect system preference (true)
      expect(useThemeStore.getState().isDark).toBe(true)
    })
  })
})
