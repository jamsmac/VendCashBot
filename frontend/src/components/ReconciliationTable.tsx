import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { X } from 'lucide-react'
import { ReconciliationItem, salesApi } from '../api/sales'

const formatAmount = (amount: number) => new Intl.NumberFormat('ru-RU').format(Math.round(amount))

function StatusBadge({ status }: { status: ReconciliationItem['status'] }) {
  const config = {
    matched: { label: '✅ Совпадает', bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-400' },
    shortage: { label: '🔴 Недостача', bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400' },
    overage: { label: '🟠 Излишек', bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-700 dark:text-orange-400' },
    no_sales: { label: '⚪ Нет продаж', bg: 'bg-gray-100 dark:bg-gray-700', text: 'text-gray-600 dark:text-gray-400' },
  }

  const c = config[status]
  return (
    <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  )
}

interface ReconciliationTableProps {
  items: ReconciliationItem[]
}

export default function ReconciliationTable({ items }: ReconciliationTableProps) {
  const [selectedItem, setSelectedItem] = useState<ReconciliationItem | null>(null)

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-gray-700/50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Автомат</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Период</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Продажи (нал)</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Инкассация</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Разница</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">%</th>
              <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400">Статус</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {items.map((item, idx) => {
              const rowBg = item.status === 'shortage'
                ? 'bg-red-50/50 dark:bg-red-900/10'
                : item.status === 'overage'
                  ? 'bg-orange-50/50 dark:bg-orange-900/10'
                  : ''

              return (
                <tr
                  key={`${item.collectionId}-${idx}`}
                  className={`hover:bg-gray-100 dark:hover:bg-gray-700/70 text-sm cursor-pointer transition-colors ${rowBg}`}
                  onClick={() => setSelectedItem(item)}
                  title="Нажмите для детализации"
                >
                  <td className="px-3 py-2">
                    <div className="font-medium text-gray-900 dark:text-gray-100">{item.machineName}</div>
                    <div className="text-xs text-gray-400 font-mono">{item.machineCode}</div>
                  </td>
                  <td className="px-3 py-2 text-gray-600 dark:text-gray-300 whitespace-nowrap text-xs">
                    <div>{format(new Date(item.periodStart), 'dd.MM.yy HH:mm')}</div>
                    <div className="text-gray-400">→ {format(new Date(item.periodEnd), 'dd.MM.yy HH:mm')}</div>
                  </td>
                  <td className="px-3 py-2 text-right text-gray-900 dark:text-gray-100 whitespace-nowrap">
                    {formatAmount(item.expectedAmount)}
                    <div className="text-xs text-gray-400">{item.cashOrdersCount} заказов</div>
                  </td>
                  <td className="px-3 py-2 text-right font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap">
                    {formatAmount(item.actualAmount)}
                  </td>
                  <td className={`px-3 py-2 text-right font-medium whitespace-nowrap ${
                    item.difference > 0
                      ? 'text-orange-600 dark:text-orange-400'
                      : item.difference < 0
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-green-600 dark:text-green-400'
                  }`}>
                    {item.difference > 0 ? '+' : ''}{formatAmount(item.difference)}
                  </td>
                  <td className={`px-3 py-2 text-right text-xs whitespace-nowrap ${
                    Math.abs(item.percentDeviation) <= 5
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-red-600 dark:text-red-400'
                  }`}>
                    {item.percentDeviation > 0 ? '+' : ''}{item.percentDeviation.toFixed(1)}%
                  </td>
                  <td className="px-3 py-2 text-center">
                    <StatusBadge status={item.status} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Detail Modal */}
      {selectedItem && (
        <ReconciliationDetailModal
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
        />
      )}
    </>
  )
}

// ======================== DETAIL MODAL ========================

function ReconciliationDetailModal({
  item,
  onClose,
}: {
  item: ReconciliationItem
  onClose: () => void
}) {
  const { data: ordersData, isLoading, isError } = useQuery({
    queryKey: ['sales', 'orders', 'detail', item.machineCode, item.periodStart, item.periodEnd],
    queryFn: ({ signal }) =>
      salesApi.getOrders(
        {
          machineCode: item.machineCode,
          paymentMethod: 'cash',
          paymentStatus: 'paid',
          from: item.periodStart,
          to: item.periodEnd,
          limit: 200,
        },
        signal,
      ),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50" />

      {/* Modal */}
      <div
        className="relative bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-3xl w-full max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Детализация сверки
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {item.machineName} ({item.machineCode})
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Summary cards */}
        <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-3 border-b border-gray-200 dark:border-gray-700">
          <div className="text-center">
            <div className="text-xs text-gray-500 dark:text-gray-400">Период</div>
            <div className="text-sm font-medium mt-1">
              {format(new Date(item.periodStart), 'dd.MM.yy HH:mm')}
              <span className="text-gray-400 mx-1">→</span>
              {format(new Date(item.periodEnd), 'dd.MM.yy HH:mm')}
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-gray-500 dark:text-gray-400">Ожидаемое (нал)</div>
            <div className="text-lg font-bold text-gray-900 dark:text-gray-100 mt-1">
              {formatAmount(item.expectedAmount)}
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-gray-500 dark:text-gray-400">Инкассация</div>
            <div className="text-lg font-bold text-gray-900 dark:text-gray-100 mt-1">
              {formatAmount(item.actualAmount)}
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-gray-500 dark:text-gray-400">Разница</div>
            <div className={`text-lg font-bold mt-1 ${
              item.difference < 0
                ? 'text-red-600 dark:text-red-400'
                : item.difference > 0
                  ? 'text-orange-600 dark:text-orange-400'
                  : 'text-green-600 dark:text-green-400'
            }`}>
              {item.difference > 0 ? '+' : ''}{formatAmount(item.difference)}
              <span className="text-xs ml-1">({item.percentDeviation.toFixed(1)}%)</span>
            </div>
          </div>
        </div>

        {/* Orders list */}
        <div className="flex-1 overflow-auto p-4">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
            Наличные заказы за период ({item.cashOrdersCount})
          </h3>

          {isLoading ? (
            <div className="py-8 text-center text-gray-500 dark:text-gray-400">
              Загрузка заказов...
            </div>
          ) : isError ? (
            <div className="py-8 text-center text-red-500 dark:text-red-400">
              Ошибка загрузки заказов
            </div>
          ) : !ordersData?.data?.length ? (
            <div className="py-8 text-center text-gray-500 dark:text-gray-400">
              Заказы не найдены
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-700/50">
                <tr>
                  <th className="px-2 py-1.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Дата</th>
                  <th className="px-2 py-1.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Товар</th>
                  <th className="px-2 py-1.5 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Сумма</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {ordersData.data.map((order) => (
                  <tr key={order.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-2 py-1.5 text-gray-600 dark:text-gray-300 whitespace-nowrap">
                      {format(new Date(order.orderDate), 'dd.MM HH:mm')}
                    </td>
                    <td className="px-2 py-1.5 text-gray-700 dark:text-gray-300">
                      {order.productName}
                      {order.flavor && <span className="text-gray-400 ml-1">({order.flavor})</span>}
                    </td>
                    <td className="px-2 py-1.5 text-right font-medium text-gray-900 dark:text-gray-100">
                      {formatAmount(order.price)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200 dark:border-gray-600">
                  <td colSpan={2} className="px-2 py-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
                    Итого
                  </td>
                  <td className="px-2 py-2 text-right text-sm font-bold text-gray-900 dark:text-gray-100">
                    {formatAmount(ordersData.data.reduce((sum, o) => sum + o.price, 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end">
          <button
            onClick={onClose}
            className="btn btn-secondary"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  )
}
