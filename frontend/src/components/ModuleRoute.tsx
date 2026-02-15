import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../contexts/AuthContext'

function getDefaultRoute(modules: string[]): string {
  if (modules.includes('dashboard')) return '/dashboard'
  if (modules.includes('collections')) return '/collections'
  if (modules.includes('reports')) return '/reports'
  return '/collections'
}

interface ModuleRouteProps {
  module: string
  children: React.ReactNode
}

export default function ModuleRoute({ module, children }: ModuleRouteProps) {
  const { user, isLoading } = useAuthStore()

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
      </div>
    )
  }

  const modules = user?.modules || []
  if (!modules.includes(module)) {
    return <Navigate to={getDefaultRoute(modules)} replace />
  }

  return <>{children}</>
}
