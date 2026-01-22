import { useQuery } from '@tanstack/react-query'
import { Clock, Banknote, Calendar } from 'lucide-react'
import { reportsApi } from '../api/reports'
import { collectionsApi, Collection } from '../api/collections'
import { format } from 'date-fns'
import { useState } from 'react'
import ReceiveModal from '../components/ReceiveModal'
import toast from 'react-hot-toast'

export default function Dashboard() {
  const [selectedCollection, setSelectedCollection] = useState<Collection | null>(null)

  const { data: dashboard, isLoading: dashboardLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: reportsApi.getDashboard,
  })

  const { data: pending, isLoading: pendingLoading, refetch: refetchPending } = useQuery({
    queryKey: ['pending-collections'],
    queryFn: collectionsApi.getPending,
  })

  const handleReceive = async (amount: number, notes?: string) => {
    if (!selectedCollection) return
    try {
      await collectionsApi.receive(selectedCollection.id, { amount, notes })
      toast.success('Инкассация принята!')
      setSelectedCollection(null)
      refetchPending()
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Ошибка')
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
            <div className="w-12 h-12 bg-yellow-100 rounded-xl flex items-center justify-center">
              <Clock className="w-6 h-6 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Ожидают приёма</p>
              <p className="text-2xl font-bold">
                {dashboardLoading ? '...' : dashboard?.pending || 0}
              </p>
            </div>
          </div>
        </div>

        <div className="card p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
              <Banknote className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Сегодня</p>
              <p className="text-2xl font-bold">
                {dashboardLoading ? '...' : `${formatAmount(dashboard?.todayAmount || 0)}`}
              </p>
              <p className="text-xs text-gray-400">сум</p>
            </div>
          </div>
        </div>

        <div className="card p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
              <Calendar className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">За месяц</p>
              <p className="text-2xl font-bold">
                {dashboardLoading ? '...' : `${formatAmount(dashboard?.monthAmount || 0)}`}
              </p>
              <p className="text-xs text-gray-400">сум</p>
            </div>
          </div>
        </div>
      </div>

      {/* Pending collections */}
      <div className="card">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="font-semibold">⏳ Ожидают приёма</h2>
          <span className="badge badge-warning">{pending?.length || 0}</span>
        </div>

        {pendingLoading ? (
          <div className="p-8 text-center text-gray-500">Загрузка...</div>
        ) : pending && pending.length > 0 ? (
          <div className="divide-y divide-gray-100">
            {pending.slice(0, 10).map((collection) => (
              <div
                key={collection.id}
                className="p-4 flex items-center justify-between hover:bg-gray-50"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
                    <Clock className="w-5 h-5 text-yellow-600" />
                  </div>
                  <div>
                    <div className="font-medium">{collection.machine.name}</div>
                    <div className="text-sm text-gray-500">
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
          <div className="p-8 text-center text-gray-500">
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
