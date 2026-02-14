import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { reportsApi, ReportQuery } from '../api/reports'
import { Download } from 'lucide-react'
import toast from 'react-hot-toast'

type Tab = 'machine' | 'date' | 'operator'

export default function Reports() {
  const [activeTab, setActiveTab] = useState<Tab>('machine')
  const [query, setQuery] = useState<ReportQuery>({})
  const [exporting, setExporting] = useState(false)

  const { data: byMachine, isLoading: loadingMachine } = useQuery({
    queryKey: ['reports-by-machine', query],
    queryFn: ({ signal }) => reportsApi.getByMachine(query, signal),
    enabled: activeTab === 'machine',
  })

  const { data: byDate, isLoading: loadingDate } = useQuery({
    queryKey: ['reports-by-date', query],
    queryFn: ({ signal }) => reportsApi.getByDate(query, signal),
    enabled: activeTab === 'date',
  })

  const { data: byOperator, isLoading: loadingOperator } = useQuery({
    queryKey: ['reports-by-operator', query],
    queryFn: ({ signal }) => reportsApi.getByOperator(query, signal),
    enabled: activeTab === 'operator',
  })

  const handleExport = async () => {
    if (exporting) return
    setExporting(true)
    try {
      const blob = await reportsApi.exportExcel(query)
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `vendcash-report-${new Date().toISOString().split('T')[0]}.xlsx`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
      toast.success('Отчёт скачан')
    } catch {
      toast.error('Ошибка экспорта')
    } finally {
      setExporting(false)
    }
  }

  const formatAmount = (amount: number) => new Intl.NumberFormat('ru-RU').format(amount)

  const tabs = [
    { id: 'machine' as Tab, label: 'По автоматам' },
    { id: 'date' as Tab, label: 'По датам' },
    { id: 'operator' as Tab, label: 'По операторам' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Отчёты</h1>
        <button onClick={handleExport} disabled={exporting} className="btn btn-primary flex items-center gap-2 disabled:opacity-50">
          <Download className="w-4 h-4" />
          {exporting ? 'Экспорт...' : 'Excel'}
        </button>
      </div>

      {/* Date range */}
      <div className="card p-4 flex flex-wrap items-center gap-4">
        <span className="text-sm text-gray-500 dark:text-gray-400">Период:</span>
        <input
          type="date"
          className="input w-auto"
          value={query.from || ''}
          onChange={(e) => setQuery({ ...query, from: e.target.value || undefined })}
        />
        <span>—</span>
        <input
          type="date"
          className="input w-auto"
          value={query.to || ''}
          min={query.from || undefined}
          onChange={(e) => setQuery({ ...query, to: e.target.value || undefined })}
        />
        {query.from && query.to && query.from > query.to && (
          <span className="text-red-500 text-sm">Дата «от» не может быть позже «до»</span>
        )}
      </div>

      {/* Tabs */}
      <div className="card overflow-hidden">
        <div className="flex border-b border-gray-200 dark:border-gray-600">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'text-primary-600 border-b-2 border-primary-600 bg-primary-50 dark:bg-primary-900/30'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* By Machine */}
        {activeTab === 'machine' && (
          <div className="overflow-x-auto">
            {loadingMachine ? (
              <div className="p-8 text-center text-gray-500 dark:text-gray-400">Загрузка...</div>
            ) : !byMachine?.data?.length ? (
              <div className="p-8 text-center text-gray-500 dark:text-gray-400">Нет данных за выбранный период</div>
            ) : (
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-700/50">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400">Код</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400">Название</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-gray-500 dark:text-gray-400">Кол-во</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-gray-500 dark:text-gray-400">Сумма</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-gray-500 dark:text-gray-400">Среднее</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {byMachine?.data?.map((item) => (
                    <tr key={item.machine.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-3 text-sm font-mono text-gray-900 dark:text-gray-100">{item.machine.code}</td>
                      <td className="px-4 py-3 text-gray-900 dark:text-gray-100">{item.machine.name}</td>
                      <td className="px-4 py-3 text-right text-gray-900 dark:text-gray-100">{item.collectionsCount}</td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-gray-100">
                        {formatAmount(item.totalAmount)}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-500 dark:text-gray-400">
                        {formatAmount(Math.round(item.averageAmount))}
                      </td>
                    </tr>
                  ))}
                  {byMachine?.totals && (
                    <tr className="bg-gray-50 dark:bg-gray-700/50 font-semibold">
                      <td className="px-4 py-3"></td>
                      <td className="px-4 py-3 text-gray-900 dark:text-gray-100">ИТОГО</td>
                      <td className="px-4 py-3 text-right text-gray-900 dark:text-gray-100">{byMachine.totals.collectionsCount}</td>
                      <td className="px-4 py-3 text-right text-gray-900 dark:text-gray-100">
                        {formatAmount(byMachine.totals.totalAmount)}
                      </td>
                      <td className="px-4 py-3"></td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* By Date */}
        {activeTab === 'date' && (
          <div className="overflow-x-auto">
            {loadingDate ? (
              <div className="p-8 text-center text-gray-500 dark:text-gray-400">Загрузка...</div>
            ) : !byDate?.data?.length ? (
              <div className="p-8 text-center text-gray-500 dark:text-gray-400">Нет данных за выбранный период</div>
            ) : (
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-700/50">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400">Дата</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-gray-500 dark:text-gray-400">Кол-во</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-gray-500 dark:text-gray-400">Сумма</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {byDate?.data?.map((item) => (
                    <tr key={item.date} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-3 text-gray-900 dark:text-gray-100">{item.date}</td>
                      <td className="px-4 py-3 text-right text-gray-900 dark:text-gray-100">{item.collectionsCount}</td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-gray-100">
                        {formatAmount(item.totalAmount)}
                      </td>
                    </tr>
                  ))}
                  {byDate?.totals && (
                    <tr className="bg-gray-50 dark:bg-gray-700/50 font-semibold">
                      <td className="px-4 py-3 text-gray-900 dark:text-gray-100">ИТОГО</td>
                      <td className="px-4 py-3 text-right text-gray-900 dark:text-gray-100">{byDate.totals.collectionsCount}</td>
                      <td className="px-4 py-3 text-right text-gray-900 dark:text-gray-100">
                        {formatAmount(byDate.totals.totalAmount)}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* By Operator */}
        {activeTab === 'operator' && (
          <div className="overflow-x-auto">
            {loadingOperator ? (
              <div className="p-8 text-center text-gray-500 dark:text-gray-400">Загрузка...</div>
            ) : !byOperator?.data?.length ? (
              <div className="p-8 text-center text-gray-500 dark:text-gray-400">Нет данных за выбранный период</div>
            ) : (
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-700/50">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400">Оператор</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400">Telegram</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-gray-500 dark:text-gray-400">Кол-во</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-gray-500 dark:text-gray-400">Сумма</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {byOperator?.data?.map((item) => (
                    <tr key={item.operator.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-3 text-gray-900 dark:text-gray-100">{item.operator.name}</td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                        {item.operator.telegramUsername ? `@${item.operator.telegramUsername}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-900 dark:text-gray-100">{item.collectionsCount}</td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-gray-100">
                        {formatAmount(item.totalAmount)}
                      </td>
                    </tr>
                  ))}
                  {byOperator?.totals && (
                    <tr className="bg-gray-50 dark:bg-gray-700/50 font-semibold">
                      <td className="px-4 py-3 text-gray-900 dark:text-gray-100">ИТОГО</td>
                      <td className="px-4 py-3"></td>
                      <td className="px-4 py-3 text-right text-gray-900 dark:text-gray-100">{byOperator.totals.collectionsCount}</td>
                      <td className="px-4 py-3 text-right text-gray-900 dark:text-gray-100">
                        {formatAmount(byOperator.totals.totalAmount)}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
