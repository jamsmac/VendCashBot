import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './contexts/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Collections from './pages/Collections'
import CollectionsPending from './pages/CollectionsPending'
import HistoryEntry from './pages/HistoryEntry'
import HistoryByMachine from './pages/HistoryByMachine'
import HistoryByDate from './pages/HistoryByDate'
import ExcelImport from './pages/ExcelImport'
import Reports from './pages/Reports'
import Machines from './pages/Machines'
import Users from './pages/Users'
import TelegramMapPicker from './pages/TelegramMapPicker'

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

  // Wait for auth to load before checking role
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
      </div>
    )
  }

  if (user?.role !== 'admin') {
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}

function ManagerRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuthStore()

  // Wait for auth to load before checking role
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
      </div>
    )
  }

  if (user?.role !== 'admin' && user?.role !== 'manager') {
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/telegram/map" element={<TelegramMapPicker />} />

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="collections" element={<Collections />} />
        <Route path="collections/pending" element={<CollectionsPending />} />
        <Route path="collections/history" element={<HistoryEntry />} />
        <Route path="collections/history/by-machine" element={<HistoryByMachine />} />
        <Route path="collections/history/by-date" element={<HistoryByDate />} />
        <Route path="collections/history/excel-import" element={<ExcelImport />} />
        <Route path="reports" element={<Reports />} />
        <Route
          path="machines"
          element={
            <ManagerRoute>
              <Machines />
            </ManagerRoute>
          }
        />
        <Route
          path="users"
          element={
            <AdminRoute>
              <Users />
            </AdminRoute>
          }
        />
      </Route>
    </Routes>
  )
}
