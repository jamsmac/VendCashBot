import { useQuery } from '@tanstack/react-query'
import { Clock, Banknote, Calendar, AlertTriangle, CheckCircle, ArrowRight } from 'lucide-react'
import { reportsApi } from '../api/reports'
import { collectionsApi, Collection } from '../api/collections'
import { salesApi } from '../api/sales'
import { format } from 'date-fns'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import ReceiveModal from '../components/ReceiveModal'
import DistanceBadge from '../components/DistanceBadge'
import toast from 'react-hot-toast'
import { getErrorMessage } from '../utils/getErrorMessage'

export default function Dashboard() {
  const [selectedCollection, setSelectedCollection] = useState<Collection | null>(null)
  const navigate = useNavigate()

  const { data: dashboard, isLoading: dashboardLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: ({ signal }) => reportsApi.getDashboard(signal),
  })

  const { data: pending, isLoading: pendingLoading, refetch: refetchPending } = useQuery({
    queryKey: ['dashboard', 'pending-collections'],
    queryFn: ({ signal }) => collectionsApi.getPending(signal),
  })

  const { data: reconciliation } = useQuery({
    queryKey: ['dashboard', 'reconciliation'],
    queryFn: ({ signal }) => salesApi.getReconciliation({}, signal),
  })

  const handleReceive = async (amount: number, notes?: string) => {
    if (!selectedCollection) return
    try {
      await collectionsApi.receive(selectedCollection.id, { amount, notes })
      toast.success('Инкассация принята!')
      setSelectedCollection(null)
      refetchPending()
    } catch (error: unknown) {
      toast.error(getErrorMessage(error))
    }
  }

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('ru-RU').format(amount)
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Главная</h1>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-yellow-100 dark:bg-yellow-900/30 rounded-xl flex items-center justify-center">
              <Clock className="w-6 h-6 text-yellow-600 dark:text-yellow-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Ожидают приёма</p>
              <p className="text-2xl font-bold">
                {dashboardLoading ? '...' : dashboard?.pending || 0}
              </p>
            </div>
          </div>
        </div>

        <div className="card p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-xl flex items-center justify-center">
              <Banknote className="w-6 h-6 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Сегодня</p>
              <p className="text-2xl font-bold">
                {dashboardLoading ? '...' : `${formatAmount(dashboard?.todayAmount || 0)}`}
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500">сум</p>
            </div>
          </div>
        </div>

        <div className="card p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center">
              <Calendar className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">За месяц</p>
              <p className="text-2xl font-bold">
                {dashboardLoading ? '...' : `${formatAmount(dashboard?.monthAmount || 0)}`}
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500">сум</p>
            </div>
          </div>
        </div>
      </div>

      {/* Reconciliation Widget */}
      {reconciliation && reconciliation.items.length > 0 && (
        <div className="card">
          <div className="p-4 border-b border-gray-200 dark:border-gray-600 flex items-center justify-between">
            <h2 className="font-semibold">🔍 Сверка наличных</h2>
            <button
              onClick={() => navigate('/sales')}
              className="text-sm text-primary-600 dark:text-primary-400 hover:underline flex items-center gap-1"
            >
              Подробнее <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          <div className="p-4">
            {/* Summary mini-cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <div className="flex items-center gap-2 bg-green-50 dark:bg-green-900/20 rounded-lg p-3">
                <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0" />
                <div>
                  <div className="text-lg font-bold text-green-700 dark:text-green-400">
                    {reconciliation.summary.matchedCount}
                  </div>
                  <div className="text-xs text-green-600 dark:text-green-500">Совпадения</div>
                </div>
              </div>
              <div className="flex items-center gap-2 bg-red-50 dark:bg-red-900/20 rounded-lg p-3">
                <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0" />
                <div>
                  <div className="text-lg font-bold text-red-700 dark:text-red-400">
                    {reconciliation.summary.shortageCount}
                  </div>
                  <div className="text-xs text-red-600 dark:text-red-500">Недостачи</div>
                </div>
              </div>
              <div className="flex items-center gap-2 bg-orange-50 dark:bg-orange-900/20 rounded-lg p-3">
                <AlertTriangle className="w-5 h-5 text-orange-600 dark:text-orange-400 flex-shrink-0" />
                <div>
                  <div className="text-lg font-bold text-orange-700 dark:text-orange-400">
                    {reconciliation.summary.overageCount}
                  </div>
                  <div className="text-xs text-orange-600 dark:text-orange-500">Излишки</div>
                </div>
              </div>
              <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                <Banknote className="w-5 h-5 text-gray-600 dark:text-gray-400 flex-shrink-0" />
                <div>
                  <div className="text-lg font-bold text-gray-700 dark:text-gray-300">
                    {formatAmount(Math.abs(Math.round(reconciliation.summary.totalDifference)))}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">Разница (сум)</div>
                </div>
              </div>
            </div>

            {/* Top shortages — show up to 3 */}
            {reconciliation.items.filter((i) => i.status === 'shortage').length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Последние недостачи:</h3>
                <div className="space-y-2">
                  {reconciliation.items
                    .filter((i) => i.status === 'shortage')
                    .slice(0, 3)
                    .map((item, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between bg-red-50/50 dark:bg-red-900/10 rounded-lg px-3 py-2 text-sm"
                      >
                        <div>
                          <span className="font-medium text-gray-900 dark:text-gray-100">{item.machineName}</span>
                          <span className="text-gray-400 mx-2">•</span>
                          <span className="text-gray-500 dark:text-gray-400 text-xs">
                            {format(new Date(item.periodEnd), 'dd.MM.yy')}
                          </span>
                        </div>
                        <span className="font-medium text-red-600 dark:text-red-400">
                          -{formatAmount(Math.abs(item.difference))} ({item.percentDeviation.toFixed(1)}%)
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Pending collections */}
      <div className="card">
        <div className="p-4 border-b border-gray-200 dark:border-gray-600 flex items-center justify-between">
          <h2 className="font-semibold">⏳ Ожидают приёма</h2>
          <span className="badge badge-warning">{pending?.length || 0}</span>
        </div>

        {pendingLoading ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">Загрузка...</div>
        ) : pending && pending.length > 0 ? (
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {pending.slice(0, 10).map((collection) => (
              <div
                key={collection.id}
                className="p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg flex items-center justify-center">
                    <Clock className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900 dark:text-gray-100">{collection.machine.name}</span>
                      <DistanceBadge distance={collection.distanceFromMachine} compact />
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      {format(new Date(collection.collectedAt), 'HH:mm:ss')} • {collection.operator.name}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedCollection(collection)}
                  className="btn btn-primary text-sm"
                >
                  Принять
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">
            ✅ Нет ожидающих приёма
          </div>
        )}
      </div>

      {/* Receive Modal */}
      {selectedCollection && (
        <ReceiveModal
          collection={selectedCollection}
          onClose={() => setSelectedCollection(null)}
          onSubmit={handleReceive}
        />
      )}
    </div>
  )
}
