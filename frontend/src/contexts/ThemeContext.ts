import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type Theme = 'light' | 'dark' | 'system'

interface ThemeState {
  theme: Theme
  setTheme: (theme: Theme) => void
  isDark: boolean
}

const getSystemTheme = (): boolean => {
  if (typeof window !== 'undefined') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  }
  return false
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'system',
      isDark: getSystemTheme(),

      setTheme: (theme: Theme) => {
        let isDark: boolean

        if (theme === 'system') {
          isDark = getSystemTheme()
        } else {
          isDark = theme === 'dark'
        }

        // Update DOM
        if (isDark) {
          document.documentElement.classList.add('dark')
        } else {
          document.documentElement.classList.remove('dark')
        }

        set({ theme, isDark })
      },
    }),
    {
      name: 'vendcash-theme',
      onRehydrateStorage: () => (state) => {
        if (state) {
          // Apply theme on hydration
          const isDark = state.theme === 'system'
            ? getSystemTheme()
            : state.theme === 'dark'

          if (isDark) {
            document.documentElement.classList.add('dark')
          } else {
            document.documentElement.classList.remove('dark')
          }

          state.isDark = isDark
        }
      },
    }
  )
)

// Listen for system theme changes
if (typeof window !== 'undefined') {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    const state = useThemeStore.getState()
    if (state.theme === 'system') {
      state.setTheme('system')
    }
  })
}
