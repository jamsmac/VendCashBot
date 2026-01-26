import { useState } from 'react'
import { Link } from 'react-router-dom'
import { History } from 'lucide-react'
import CollectionsList from './collections/CollectionsList'
import PendingCollections from './collections/PendingCollections'
import BankDeposits from './collections/BankDeposits'
import { useQuery } from '@tanstack/react-query'
import { collectionsApi } from '../api/collections'

type Tab = 'list' | 'pending' | 'finance'

export default function Collections() {
  const [activeTab, setActiveTab] = useState<Tab>('list')

  // Fetch pending count for the badge
  const { data: pending } = useQuery({
    queryKey: ['pending-count'],
    queryFn: collectionsApi.getPending,
    refetchInterval: 30000,
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Инкассации</h1>
        <Link to="/collections/history" className="btn btn-primary flex items-center gap-2">
          <History className="w-4 h-4" />
          Ввод истории
        </Link>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="flex space-x-8" aria-label="Tabs">
          <button
            onClick={() => setActiveTab('list')}
            className={`
              whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors
              ${activeTab === 'list'
                ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }
            `}
          >
            Журнал операций
          </button>

          <button
            onClick={() => setActiveTab('pending')}
            className={`
              whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-2
              ${activeTab === 'pending'
                ? 'border-yellow-500 text-yellow-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }
            `}
          >
            Ожидают приёма
            {(pending?.length || 0) > 0 && (
              <span className="bg-yellow-100 text-yellow-800 text-xs py-0.5 px-2 rounded-full">
                {pending?.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('finance')}
            className={`
              whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors
              ${activeTab === 'finance'
                ? 'border-green-500 text-green-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }
            `}
          >
            Касса и Банк
          </button>
        </nav>
      </div>

      {/* Content */}
      <div className="min-h-[400px]">
        {activeTab === 'list' && <CollectionsList />}
        {activeTab === 'pending' && <PendingCollections />}
        {activeTab === 'finance' && <BankDeposits />}
      </div>
    </div>
  )
}
