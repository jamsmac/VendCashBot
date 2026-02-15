import { useState, useCallback, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { salesApi, SalesQuery, ImportResult } from '../api/sales'
import { Upload, Search, Trash2, ChevronLeft, ChevronRight, Bell, Download, BarChart3, X } from 'lucide-react'
import { format, subDays } from 'date-fns'
import toast from 'react-hot-toast'
import { getErrorMessage } from '../utils/getErrorMessage'
import ReconciliationTable from '../components/ReconciliationTable'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, PieChart, Pie, Cell,
} from 'recharts'

type Tab = 'import' | 'orders' | 'reconciliation' | 'analytics'

const formatAmount = (amount: number) => new Intl.NumberFormat('ru-RU').format(amount)

export default function Sales() {
  const [activeTab, setActiveTab] = useState<Tab>('reconciliation')
  const queryClient = useQueryClient()

  const tabs = [
    { id: 'import' as Tab, label: '📥 Импорт' },
    { id: 'orders' as Tab, label: '📊 База продаж' },
    { id: 'reconciliation' as Tab, label: '🔍 Сверка' },
    { id: 'analytics' as Tab, label: '📈 Аналитика' },
  ]

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Продажи</h1>

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

        {activeTab === 'import' && <ImportTab onImportSuccess={() => queryClient.invalidateQueries({ queryKey: ['sales'] })} />}
        {activeTab === 'orders' && <OrdersTab />}
        {activeTab === 'reconciliation' && <ReconciliationTab />}
        {activeTab === 'analytics' && <AnalyticsTab />}
      </div>
    </div>
  )
}

// ======================== IMPORT TAB ========================

function ImportTab({ onImportSuccess }: { onImportSuccess: () => void }) {
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [deletingBatch, setDeletingBatch] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<{ loaded: number; total: number; percent: number } | null>(null)
  const [abortController, setAbortController] = useState<AbortController | null>(null)

  const { data: batches, refetch: refetchBatches } = useQuery({
    queryKey: ['sales', 'batches'],
    queryFn: ({ signal }) => salesApi.getBatches(signal),
  })

  const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50 MB

  const formatFileSize = (bytes: number) => {
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} КБ`
    return `${bytes} Б`
  }

  const validateFile = (file: File): boolean => {
    const ext = file.name.toLowerCase()
    if (!ext.endsWith('.xlsx') && !ext.endsWith('.xls')) {
      toast.error('Поддерживаются только файлы Excel (.xlsx, .xls)')
      return false
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error(`Файл слишком большой (${formatFileSize(file.size)}). Максимум: 50 МБ`)
      return false
    }
    return true
  }

  const startUpload = useCallback(async (file: File) => {
    if (!validateFile(file)) return

    const controller = new AbortController()
    setAbortController(controller)
    setImporting(true)
    setResult(null)
    setUploadProgress({ loaded: 0, total: file.size, percent: 0 })

    try {
      const res = await salesApi.import(file, {
        signal: controller.signal,
        onUploadProgress: (progress) => setUploadProgress(progress),
      })
      setResult(res)
      const parts = [`Импортировано: ${res.imported}`]
      if (res.duplicates > 0) parts.push(`дубликатов: ${res.duplicates}`)
      toast.success(parts.join(', '))
      onImportSuccess()
      refetchBatches()
    } catch (error: unknown) {
      if (controller.signal.aborted) {
        toast.error('Загрузка отменена')
      } else {
        toast.error(getErrorMessage(error))
      }
    } finally {
      setImporting(false)
      setUploadProgress(null)
      setAbortController(null)
    }
  }, [onImportSuccess, refetchBatches])

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    startUpload(file)
  }, [startUpload])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!importing) setIsDragging(true)
  }, [importing])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    if (importing) return

    const file = e.dataTransfer.files[0]
    if (!file) return
    startUpload(file)
  }, [importing, startUpload])

  const handleCancelUpload = useCallback(() => {
    abortController?.abort()
  }, [abortController])

  const handleDeleteBatch = async (batchId: string) => {
    if (!confirm('Удалить все заказы из этого импорта?')) return
    setDeletingBatch(batchId)
    try {
      const res = await salesApi.deleteBatch(batchId)
      toast.success(`Удалено: ${res.deleted} заказов`)
      refetchBatches()
      onImportSuccess()
    } catch (error: unknown) {
      toast.error(getErrorMessage(error))
    } finally {
      setDeletingBatch(null)
    }
  }

  return (
    <div className="p-4 space-y-6">
      {/* Upload area with drag & drop */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200 ${
          isDragging
            ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 scale-[1.01]'
            : importing
              ? 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50'
              : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
        }`}
      >
        {/* Progress bar during upload */}
        {importing && uploadProgress ? (
          <div className="space-y-4">
            <div className="w-16 h-16 mx-auto rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
              <Upload className="w-8 h-8 text-primary-600 dark:text-primary-400 animate-pulse" />
            </div>
            <div>
              <p className="text-gray-700 dark:text-gray-300 font-medium mb-1">
                Загрузка файла... {uploadProgress.percent}%
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {formatFileSize(uploadProgress.loaded)} / {formatFileSize(uploadProgress.total)}
              </p>
            </div>
            {/* Progress bar */}
            <div className="max-w-md mx-auto">
              <div className="h-2.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary-500 rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${uploadProgress.percent}%` }}
                />
              </div>
            </div>
            {uploadProgress.percent < 100 && (
              <button
                onClick={handleCancelUpload}
                className="btn btn-secondary text-sm inline-flex items-center gap-1.5 text-red-600 dark:text-red-400 border-red-300 dark:border-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
              >
                <X className="w-4 h-4" />
                Отменить
              </button>
            )}
            {uploadProgress.percent >= 100 && (
              <p className="text-sm text-primary-600 dark:text-primary-400">Обработка на сервере...</p>
            )}
          </div>
        ) : (
          <>
            <Upload className={`w-12 h-12 mx-auto mb-4 transition-colors ${
              isDragging ? 'text-primary-500' : 'text-gray-400'
            }`} />
            <p className="text-gray-600 dark:text-gray-300 mb-2">
              {isDragging ? 'Отпустите файл для загрузки' : 'Перетащите Excel файл сюда или нажмите кнопку'}
            </p>
            <p className="text-sm text-gray-400 dark:text-gray-500 mb-4">
              Поддерживаются файлы .xlsx и .xls до 50 МБ
            </p>
            <label className="btn btn-primary inline-flex items-center gap-2 cursor-pointer">
              <Upload className="w-4 h-4" />
              Выбрать файл
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileUpload}
                disabled={importing}
                className="hidden"
              />
            </label>
          </>
        )}
      </div>

      {/* Import result */}
      {result && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 space-y-2">
          <h3 className="font-semibold text-green-700 dark:text-green-400">Результат импорта</h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
            <div>
              <span className="text-gray-500 dark:text-gray-400">Импортировано:</span>{' '}
              <span className="font-medium text-green-700 dark:text-green-400">{result.imported}</span>
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-400">Дубликаты:</span>{' '}
              <span className={`font-medium ${result.duplicates > 0 ? 'text-orange-600 dark:text-orange-400' : ''}`}>
                {result.duplicates}
              </span>
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-400">Пропущено:</span>{' '}
              <span className="font-medium">{result.skipped}</span>
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-400">Автоматов найдено:</span>{' '}
              <span className="font-medium">{result.machinesFound}</span>
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-400">Batch ID:</span>{' '}
              <span className="font-mono text-xs">{result.batchId}</span>
            </div>
          </div>
          {result.machinesNotFound.length > 0 && (
            <div className="text-sm text-orange-600 dark:text-orange-400">
              Автоматы не найдены в системе: {result.machinesNotFound.join(', ')}
            </div>
          )}
          {result.errors.length > 0 && (
            <details className="text-sm text-red-600 dark:text-red-400">
              <summary className="cursor-pointer">Ошибки ({result.errors.length})</summary>
              <ul className="mt-2 space-y-1 ml-4 list-disc">
                {result.errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {/* Import history */}
      {batches && batches.length > 0 && (
        <div>
          <h3 className="font-semibold mb-3">История импортов</h3>
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {batches.map((batch) => (
              <div key={batch.batchId} className="py-3 flex items-center justify-between">
                <div>
                  <span className="font-mono text-sm text-gray-600 dark:text-gray-300">{batch.batchId}</span>
                  <span className="mx-2 text-gray-400">•</span>
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    {format(new Date(batch.importedAt), 'dd.MM.yyyy HH:mm')}
                  </span>
                  <span className="mx-2 text-gray-400">•</span>
                  <span className="text-sm font-medium">{batch.ordersCount} заказов</span>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={async () => {
                      try {
                        const { url, originalName } = await salesApi.getImportFileUrl(batch.batchId)
                        const a = document.createElement('a')
                        a.href = url
                        a.download = originalName
                        a.target = '_blank'
                        a.click()
                      } catch {
                        toast.error('Файл не найден или не был сохранён')
                      }
                    }}
                    className="p-2 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg"
                    title="Скачать оригинал"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteBatch(batch.batchId)}
                    disabled={deletingBatch === batch.batchId}
                    className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg disabled:opacity-50"
                    title="Удалить импорт"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ======================== ORDERS TAB ========================

function OrdersTab() {
  const [query, setQuery] = useState<SalesQuery>({ page: 1, limit: 50 })

  const { data: machineCodes } = useQuery({
    queryKey: ['sales', 'machine-codes'],
    queryFn: ({ signal }) => salesApi.getMachineCodes(signal),
  })

  const { data, isLoading } = useQuery({
    queryKey: ['sales', 'orders', query],
    queryFn: ({ signal }) => salesApi.getOrders(query, signal),
  })

  const totalPages = data ? Math.ceil(data.total / (query.limit || 50)) : 0

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-600 flex flex-wrap items-center gap-3">
        <select
          className="input w-auto"
          value={query.machineCode || ''}
          onChange={(e) => setQuery({ ...query, machineCode: e.target.value || undefined, page: 1 })}
        >
          <option value="">Все автоматы</option>
          {machineCodes?.map((code) => (
            <option key={code} value={code}>{code}</option>
          ))}
        </select>

        <select
          className="input w-auto"
          value={query.paymentMethod || ''}
          onChange={(e) => setQuery({ ...query, paymentMethod: (e.target.value || undefined) as SalesQuery['paymentMethod'], page: 1 })}
        >
          <option value="">Все типы</option>
          <option value="cash">Наличные</option>
          <option value="card">Карта</option>
        </select>

        <select
          className="input w-auto"
          value={query.paymentStatus || ''}
          onChange={(e) => setQuery({ ...query, paymentStatus: (e.target.value || undefined) as SalesQuery['paymentStatus'], page: 1 })}
        >
          <option value="">Все статусы</option>
          <option value="paid">Оплачено</option>
          <option value="refunded">Возврат</option>
        </select>

        <input
          type="date"
          className="input w-auto"
          value={query.from || ''}
          onChange={(e) => setQuery({ ...query, from: e.target.value || undefined, page: 1 })}
        />
        <span className="text-gray-400">—</span>
        <input
          type="date"
          className="input w-auto"
          value={query.to || ''}
          onChange={(e) => setQuery({ ...query, to: e.target.value || undefined, page: 1 })}
        />

        {data && (
          <span className="text-sm text-gray-500 dark:text-gray-400 ml-auto">
            Всего: {data.total.toLocaleString('ru-RU')}
          </span>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        {isLoading ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">Загрузка...</div>
        ) : !data?.data?.length ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">
            {data?.total === 0 ? 'Нет импортированных заказов' : 'Нет данных по фильтрам'}
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700/50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Дата</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Автомат</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Товар</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400">Оплата</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400">Статус</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Сумма</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {data.data.map((order) => (
                <tr key={order.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 text-sm">
                  <td className="px-3 py-2 text-gray-600 dark:text-gray-300 whitespace-nowrap">
                    {format(new Date(order.orderDate), 'dd.MM.yy HH:mm')}
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-gray-900 dark:text-gray-100">
                      {order.machine?.name || order.machineCode}
                    </div>
                    {order.machine?.name && (
                      <div className="text-xs text-gray-400 font-mono">{order.machineCode}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-gray-700 dark:text-gray-300">
                    {order.productName}
                    {order.flavor && <span className="text-gray-400 ml-1">({order.flavor})</span>}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                      order.paymentMethod === 'cash'
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                    }`}>
                      {order.paymentMethod === 'cash' ? 'Нал' : 'Карта'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center">
                    {order.paymentStatus === 'refunded' && (
                      <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                        Возврат
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap">
                    {formatAmount(order.price)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="p-4 flex items-center justify-between border-t border-gray-200 dark:border-gray-600">
          <button
            onClick={() => setQuery({ ...query, page: Math.max(1, (query.page || 1) - 1) })}
            disabled={(query.page || 1) <= 1}
            className="btn btn-secondary flex items-center gap-1 disabled:opacity-50"
          >
            <ChevronLeft className="w-4 h-4" /> Назад
          </button>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            Стр. {query.page || 1} из {totalPages}
          </span>
          <button
            onClick={() => setQuery({ ...query, page: Math.min(totalPages, (query.page || 1) + 1) })}
            disabled={(query.page || 1) >= totalPages}
            className="btn btn-secondary flex items-center gap-1 disabled:opacity-50"
          >
            Вперёд <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  )
}

// ======================== RECONCILIATION TAB ========================

function ReconciliationTab() {
  const [query, setQuery] = useState<{ machineCode?: string; from?: string; to?: string }>({})
  const [notifying, setNotifying] = useState(false)
  const [exporting, setExporting] = useState(false)

  const { data: machineCodes } = useQuery({
    queryKey: ['sales', 'machine-codes'],
    queryFn: ({ signal }) => salesApi.getMachineCodes(signal),
  })

  const { data, isLoading } = useQuery({
    queryKey: ['sales', 'reconciliation', query],
    queryFn: ({ signal }) => salesApi.getReconciliation(query, signal),
  })

  const handleNotify = async () => {
    setNotifying(true)
    try {
      const res = await salesApi.notifyShortages(query)
      if (res.alertsSent) {
        toast.success(`Отправлены алерты по ${res.shortagesFound} недостачам`)
      } else {
        toast.success('Значительных недостач (>10%) не обнаружено')
      }
    } catch (error: unknown) {
      toast.error(getErrorMessage(error))
    } finally {
      setNotifying(false)
    }
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      const blob = await salesApi.exportReconciliation(query)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `reconciliation_${new Date().toISOString().slice(0, 10)}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Отчёт скачан')
    } catch (error: unknown) {
      toast.error(getErrorMessage(error))
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-600 flex flex-wrap items-center gap-3">
        <select
          className="input w-auto"
          value={query.machineCode || ''}
          onChange={(e) => setQuery({ ...query, machineCode: e.target.value || undefined })}
        >
          <option value="">Все автоматы</option>
          {machineCodes?.map((code) => (
            <option key={code} value={code}>{code}</option>
          ))}
        </select>

        <input
          type="date"
          className="input w-auto"
          value={query.from || ''}
          onChange={(e) => setQuery({ ...query, from: e.target.value || undefined })}
        />
        <span className="text-gray-400">—</span>
        <input
          type="date"
          className="input w-auto"
          value={query.to || ''}
          onChange={(e) => setQuery({ ...query, to: e.target.value || undefined })}
        />

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={handleNotify}
            disabled={notifying || !data?.items?.length}
            className="btn btn-secondary text-sm flex items-center gap-1 disabled:opacity-50"
            title="Отправить Telegram-алерт по недостачам >10%"
          >
            <Bell className="w-4 h-4" />
            {notifying ? 'Отправка...' : 'Алерт'}
          </button>
          <button
            onClick={handleExport}
            disabled={exporting || !data?.items?.length}
            className="btn btn-secondary text-sm flex items-center gap-1 disabled:opacity-50"
            title="Скачать отчёт сверки в Excel"
          >
            <Download className="w-4 h-4" />
            {exporting ? 'Экспорт...' : 'Excel'}
          </button>
        </div>
      </div>

      {/* Summary cards */}
      {data?.summary && (
        <div className="px-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-green-700 dark:text-green-400">{data.summary.matchedCount}</div>
            <div className="text-xs text-green-600 dark:text-green-500">Совпадения</div>
          </div>
          <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-red-700 dark:text-red-400">{data.summary.shortageCount}</div>
            <div className="text-xs text-red-600 dark:text-red-500">Недостачи</div>
          </div>
          <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-orange-700 dark:text-orange-400">{data.summary.overageCount}</div>
            <div className="text-xs text-orange-600 dark:text-orange-500">Излишки</div>
          </div>
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-gray-700 dark:text-gray-300">
              {formatAmount(Math.round(data.summary.totalDifference))}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Общая разница</div>
          </div>
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="p-8 text-center text-gray-500 dark:text-gray-400">Загрузка сверки...</div>
      ) : !data?.items?.length ? (
        <div className="p-12 text-center">
          <Search className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <div className="text-gray-500 dark:text-gray-400">
            {data?.items?.length === 0
              ? 'Нет данных для сверки. Импортируйте заказы и убедитесь что есть принятые инкассации.'
              : 'Загрузка...'}
          </div>
        </div>
      ) : (
        <ReconciliationTable items={data.items} />
      )}
    </div>
  )
}

// ======================== ANALYTICS TAB ========================

const CHART_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316']

const formatK = (value: number) => {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`
  return String(value)
}

function AnalyticsTab() {
  const defaultFrom = useMemo(() => format(subDays(new Date(), 30), 'yyyy-MM-dd'), [])
  const defaultTo = useMemo(() => format(new Date(), 'yyyy-MM-dd'), [])
  const [from, setFrom] = useState(defaultFrom)
  const [to, setTo] = useState(defaultTo)

  const dateQuery = useMemo(() => ({ from, to }), [from, to])

  const { data: dailyStats, isLoading: loadingDaily } = useQuery({
    queryKey: ['sales', 'daily-stats', dateQuery],
    queryFn: ({ signal }) => salesApi.getDailyStats(dateQuery, signal),
  })

  const { data: topMachines, isLoading: loadingTop } = useQuery({
    queryKey: ['sales', 'top-machines', dateQuery],
    queryFn: ({ signal }) => salesApi.getTopMachines({ ...dateQuery, limit: 10 }, signal),
  })

  const { data: summary, isLoading: loadingSummary } = useQuery({
    queryKey: ['sales', 'summary', dateQuery],
    queryFn: ({ signal }) => salesApi.getSummary(dateQuery, signal),
  })

  // Prepare pie chart data from summary
  const pieData = useMemo(() => {
    if (!summary) return []
    return [
      { name: 'Наличные', value: summary.totals.cashTotal, color: '#10b981' },
      { name: 'Карта', value: summary.totals.cardTotal, color: '#3b82f6' },
    ].filter(d => d.value > 0)
  }, [summary])

  // Prepare daily chart data — format dates
  const dailyChartData = useMemo(() => {
    if (!dailyStats) return []
    return dailyStats.map(d => ({
      ...d,
      label: format(new Date(d.date), 'dd.MM'),
      total: d.cashTotal + d.cardTotal,
    }))
  }, [dailyStats])

  const isLoading = loadingDaily || loadingTop || loadingSummary

  return (
    <div className="p-4 space-y-6">
      {/* Date filters */}
      <div className="flex flex-wrap items-center gap-3">
        <BarChart3 className="w-5 h-5 text-primary-600" />
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Период:</span>
        <input
          type="date"
          className="input w-auto"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
        <span className="text-gray-400">—</span>
        <input
          type="date"
          className="input w-auto"
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
      </div>

      {isLoading ? (
        <div className="p-12 text-center text-gray-500 dark:text-gray-400">Загрузка аналитики...</div>
      ) : (
        <>
          {/* Summary KPIs */}
          {summary && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-4">
                <div className="text-sm text-green-600 dark:text-green-400">Наличные</div>
                <div className="text-xl font-bold text-green-700 dark:text-green-300 mt-1">
                  {formatAmount(summary.totals.cashTotal)}
                </div>
                <div className="text-xs text-green-500 mt-1">{summary.totals.cashCount} заказов</div>
              </div>
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4">
                <div className="text-sm text-blue-600 dark:text-blue-400">Карта</div>
                <div className="text-xl font-bold text-blue-700 dark:text-blue-300 mt-1">
                  {formatAmount(summary.totals.cardTotal)}
                </div>
                <div className="text-xs text-blue-500 mt-1">{summary.totals.cardCount} заказов</div>
              </div>
              <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-4">
                <div className="text-sm text-red-600 dark:text-red-400">Возвраты</div>
                <div className="text-xl font-bold text-red-700 dark:text-red-300 mt-1">
                  {formatAmount(summary.totals.refundTotal)}
                </div>
                <div className="text-xs text-red-500 mt-1">{summary.totals.refundCount} заказов</div>
              </div>
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
                <div className="text-sm text-gray-600 dark:text-gray-400">Всего</div>
                <div className="text-xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                  {formatAmount(summary.totals.cashTotal + summary.totals.cardTotal)}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {summary.totals.cashCount + summary.totals.cardCount} заказов
                </div>
              </div>
            </div>
          )}

          {/* Daily Sales Chart */}
          {dailyChartData.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">
                Продажи по дням
              </h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={dailyChartData} barGap={0}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    interval={dailyChartData.length > 15 ? Math.floor(dailyChartData.length / 10) : 0}
                  />
                  <YAxis
                    tickFormatter={formatK}
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    formatter={(value: number | string | undefined) => formatAmount(Number(value ?? 0))}
                    labelFormatter={(label) => `Дата: ${label}`}
                  />
                  <Legend />
                  <Bar dataKey="cashTotal" name="Наличные" fill="#10b981" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="cardTotal" name="Карта" fill="#3b82f6" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Two columns: Pie chart + Top machines */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Payment method breakdown */}
            {pieData.length > 0 && (
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">
                  Способы оплаты
                </h3>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={3}
                      dataKey="value"
                      label={({ name, percent }: { name?: string; percent?: number }) => `${name ?? ''} ${((percent ?? 0) * 100).toFixed(0)}%`}
                    >
                      {pieData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number | string | undefined) => formatAmount(Number(value ?? 0))} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Top Machines */}
            {topMachines && topMachines.length > 0 && (
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">
                  Топ автоматов по продажам
                </h3>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={topMachines} layout="vertical" margin={{ left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis type="number" tickFormatter={formatK} tick={{ fontSize: 11 }} />
                    <YAxis
                      type="category"
                      dataKey="machineName"
                      tick={{ fontSize: 11 }}
                      width={120}
                      tickFormatter={(val: string) => val?.length > 15 ? val.slice(0, 15) + '…' : val || '—'}
                    />
                    <Tooltip formatter={(value: number | string | undefined) => formatAmount(Number(value ?? 0))} />
                    <Bar dataKey="total" name="Продажи" radius={[0, 4, 4, 0]}>
                      {topMachines.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Daily trend line chart */}
          {dailyChartData.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">
                Тренд общей выручки
              </h3>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={dailyChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11 }}
                    interval={dailyChartData.length > 15 ? Math.floor(dailyChartData.length / 10) : 0}
                  />
                  <YAxis tickFormatter={formatK} tick={{ fontSize: 11 }} axisLine={false} />
                  <Tooltip formatter={(value: number | string | undefined) => formatAmount(Number(value ?? 0))} />
                  <Line
                    type="monotone"
                    dataKey="total"
                    name="Всего"
                    stroke="#8b5cf6"
                    strokeWidth={2}
                    dot={dailyChartData.length <= 31}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </div>
  )
}
