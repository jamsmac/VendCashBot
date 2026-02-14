import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './contexts/AuthContext'
import Layout from './components/Layout'
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

function getDefaultRoute(role?: string): string {
  if (role === 'admin' || role === 'manager') return '/dashboard'
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

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuthStore()

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
      </div>
    )
  }

  if (user?.role !== 'admin') {
    return <Navigate to={getDefaultRoute(user?.role)} replace />
  }

  return <>{children}</>
}

function ManagerRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuthStore()

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
      </div>
    )
  }

  if (user?.role !== 'admin' && user?.role !== 'manager') {
    return <Navigate to={getDefaultRoute(user?.role)} replace />
  }

  return <>{children}</>
}

function DefaultRedirect() {
  const { user } = useAuthStore()
  return <Navigate to={getDefaultRoute(user?.role)} replace />
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
            <ManagerRoute>
              <SuspenseWrapper><Dashboard /></SuspenseWrapper>
            </ManagerRoute>
          }
        />
        <Route path="collections" element={<SuspenseWrapper><Collections /></SuspenseWrapper>} />
        <Route path="collections/pending" element={<SuspenseWrapper><CollectionsPending /></SuspenseWrapper>} />
        <Route path="collections/history" element={<SuspenseWrapper><HistoryEntry /></SuspenseWrapper>} />
        <Route path="collections/history/by-machine" element={<SuspenseWrapper><HistoryByMachine /></SuspenseWrapper>} />
        <Route path="collections/history/by-date" element={<SuspenseWrapper><HistoryByDate /></SuspenseWrapper>} />
        <Route path="collections/history/excel-import" element={<ManagerRoute><SuspenseWrapper><ExcelImport /></SuspenseWrapper></ManagerRoute>} />
        <Route path="reports" element={<ManagerRoute><SuspenseWrapper><Reports /></SuspenseWrapper></ManagerRoute>} />
        <Route
          path="machines"
          element={
            <ManagerRoute>
              <SuspenseWrapper><Machines /></SuspenseWrapper>
            </ManagerRoute>
          }
        />
        <Route
          path="users"
          element={
            <AdminRoute>
              <SuspenseWrapper><Users /></SuspenseWrapper>
            </AdminRoute>
          }
        />
      </Route>

      {/* Catch-all 404 */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
