import { useAuthStore } from '../contexts/AuthContext'

export function useModules() {
  const user = useAuthStore((state) => state.user)
  const modules = user?.modules || []

  const hasModule = (module: string): boolean => {
    return modules.includes(module)
  }

  const hasAnyModule = (...mods: string[]): boolean => {
    return mods.some((m) => modules.includes(m))
  }

  return {
    modules,
    hasModule,
    hasAnyModule,
    isAdmin: user?.role === 'admin',
  }
}
