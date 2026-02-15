import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './contexts/AuthContext'
import Layout from './components/Layout'
import ModuleRoute from './components/ModuleRoute'
import Login from './pages/Login'

// Lazy-loaded pages (FE-004: code splitting)
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Collections = lazy(() => import('./pages/Collections'))
const CollectionsPending = lazy(() => import('./pages/CollectionsPending'))
const HistoryEntry = lazy(() => import('./pages/HistoryEntry'))
const HistoryByMachine = lazy(() => import('./pages/HistoryByMachine'))
const HistoryByDate = lazy(() => import('./pages/HistoryByDate'))
const ExcelImport = lazy(() => import('./pages/ExcelImport'))
const Reports = lazy(() => import('./pages/Reports'))
const Machines = lazy(() => import('./pages/Machines'))
const Users = lazy(() => import('./pages/Users'))
const Sales = lazy(() => import('./pages/Sales'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const TelegramMapPicker = lazy(() => import('./pages/TelegramMapPicker'))

function PageLoader() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
    </div>
  )
}

function SuspenseWrapper({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<PageLoader />}>{children}</Suspense>
}

function getDefaultRoute(modules?: string[]): string {
  if (modules?.includes('dashboard')) return '/dashboard'
  if (modules?.includes('collections')) return '/collections'
  return '/collections'
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuthStore()

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

function DefaultRedirect() {
  const { user } = useAuthStore()
  return <Navigate to={getDefaultRoute(user?.modules)} replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/telegram/map" element={<SuspenseWrapper><TelegramMapPicker /></SuspenseWrapper>} />

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DefaultRedirect />} />
        <Route
          path="dashboard"
          element={
            <ModuleRoute module="dashboard">
              <SuspenseWrapper><Dashboard /></SuspenseWrapper>
            </ModuleRoute>
          }
        />
        <Route path="collections" element={<ModuleRoute module="collections"><SuspenseWrapper><Collections /></SuspenseWrapper></ModuleRoute>} />
        <Route path="collections/pending" element={<ModuleRoute module="collections"><SuspenseWrapper><CollectionsPending /></SuspenseWrapper></ModuleRoute>} />
        <Route path="collections/history" element={<ModuleRoute module="collections"><SuspenseWrapper><HistoryEntry /></SuspenseWrapper></ModuleRoute>} />
        <Route path="collections/history/by-machine" element={<ModuleRoute module="collections"><SuspenseWrapper><HistoryByMachine /></SuspenseWrapper></ModuleRoute>} />
        <Route path="collections/history/by-date" element={<ModuleRoute module="collections"><SuspenseWrapper><HistoryByDate /></SuspenseWrapper></ModuleRoute>} />
        <Route path="collections/history/excel-import" element={<ModuleRoute module="collections"><SuspenseWrapper><ExcelImport /></SuspenseWrapper></ModuleRoute>} />
        <Route path="reports" element={<ModuleRoute module="reports"><SuspenseWrapper><Reports /></SuspenseWrapper></ModuleRoute>} />
        <Route path="sales" element={<ModuleRoute module="sales"><SuspenseWrapper><Sales /></SuspenseWrapper></ModuleRoute>} />
        <Route
          path="machines"
          element={
            <ModuleRoute module="machines">
              <SuspenseWrapper><Machines /></SuspenseWrapper>
            </ModuleRoute>
          }
        />
        <Route
          path="users"
          element={
            <ModuleRoute module="users">
              <SuspenseWrapper><Users /></SuspenseWrapper>
            </ModuleRoute>
          }
        />
        <Route
          path="settings"
          element={
            <ModuleRoute module="settings">
              <SuspenseWrapper><SettingsPage /></SuspenseWrapper>
            </ModuleRoute>
          }
        />
      </Route>

      {/* Catch-all 404 */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
