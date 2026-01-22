import { Sun, Moon, Monitor } from 'lucide-react'
import { useThemeStore } from '../contexts/ThemeContext'

export default function ThemeToggle() {
  const { theme, setTheme } = useThemeStore()

  const cycleTheme = () => {
    if (theme === 'light') {
      setTheme('dark')
    } else if (theme === 'dark') {
      setTheme('system')
    } else {
      setTheme('light')
    }
  }

  return (
    <button
      onClick={cycleTheme}
      className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
      title={`Текущая тема: ${theme === 'light' ? 'Светлая' : theme === 'dark' ? 'Тёмная' : 'Системная'}`}
    >
      {theme === 'light' ? (
        <Sun className="w-5 h-5 text-yellow-500" />
      ) : theme === 'dark' ? (
        <Moon className="w-5 h-5 text-blue-400" />
      ) : (
        <Monitor className="w-5 h-5 text-gray-500 dark:text-gray-400" />
      )}
    </button>
  )
}
