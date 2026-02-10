import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { machinesApi, Machine } from '../api/machines'
import { collectionsApi } from '../api/collections'
import { Plus, Trash2, MapPin } from 'lucide-react'
import toast from 'react-hot-toast'
import { getErrorMessage } from '../utils/getErrorMessage'

const generateId = (): string => {
  try {
    return crypto.randomUUID()
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
  }
}

interface HistoryRow {
  id: string
  date: string
  time: string
  amount: string
  locationId: string
}

export default function HistoryByMachine() {
  const navigate = useNavigate()
  const [selectedMachine, setSelectedMachine] = useState<Machine | null>(null)
  const [rows, setRows] = useState<HistoryRow[]>([
    { id: generateId(), date: '', time: '12:00', amount: '', locationId: '' },
  ])

  const { data: machines } = useQuery({
    queryKey: ['machines'],
    queryFn: () => machinesApi.getAll(),
  })

  const { data: locations } = useQuery({
    queryKey: ['machine-locations', selectedMachine?.id],
    queryFn: () => selectedMachine ? machinesApi.getLocations(selectedMachine.id) : Promise.resolve([]),
    enabled: !!selectedMachine,
  })

  // Auto-select location based on date
  const updateLocationForDate = async (rowId: string, date: string) => {
    if (!selectedMachine || !date) return
    try {
      const location = await machinesApi.getLocationForDate(selectedMachine.id, date)
      if (location) {
        setRows(prev => prev.map(r => r.id === rowId ? { ...r, locationId: location.id } : r))
      }
    } catch {
      // If no location found, keep empty
    }
  }

  const mutation = useMutation({
    mutationFn: (data: Parameters<typeof collectionsApi.bulkCreate>[0]) => collectionsApi.bulkCreate(data),
    onSuccess: (result) => {
      toast.success(`Создано ${result.created} записей`)
      if (result.failed > 0) {
        toast.error(`Ошибок: ${result.failed}`)
      }
      navigate('/collections')
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error, 'Ошибка сохранения'))
    },
  })

  const addRow = () => {
    const lastRow = rows[rows.length - 1]
    setRows([
      ...rows,
      {
        id: generateId(),
        date: lastRow?.date || '',
        time: '12:00',
        amount: '',
        locationId: lastRow?.locationId || '',
      },
    ])
  }

  const removeRow = (id: string) => {
    if (rows.length > 1) {
      setRows(rows.filter((r) => r.id !== id))
    }
  }

  const updateRow = (id: string, field: keyof HistoryRow, value: string) => {
    setRows(rows.map((r) => (r.id === id ? { ...r, [field]: value } : r)))
    // Auto-select location when date changes
    if (field === 'date' && value) {
      updateLocationForDate(id, value)
    }
  }

  const handleSubmit = () => {
    if (!selectedMachine) {
      toast.error('Выберите автомат')
      return
    }

    const validRows = rows.filter((r) => r.date && r.amount)
    if (validRows.length === 0) {
      toast.error('Заполните хотя бы одну строку')
      return
    }

    const invalidAmounts = validRows.filter((r) => {
      const amt = parseFloat(r.amount)
      return isNaN(amt) || amt <= 0 || amt > 1_000_000_000
    })
    if (invalidAmounts.length > 0) {
      toast.error('Все суммы должны быть от 1 до 1,000,000,000')
      return
    }

    const collections = validRows.map((r) => ({
      machineId: selectedMachine.id,
      collectedAt: `${r.date}T${r.time || '12:00'}:00`,
      amount: parseFloat(r.amount),
      locationId: r.locationId || undefined,
    }))

    mutation.mutate({ collections, source: 'manual_history' })
  }

  const totalAmount = rows.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0)

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Ввод истории: по машине</h1>

      <div className="card p-4">
        <label className="block text-sm font-medium mb-2">🏧 Автомат</label>
        <select
          className="input"
          value={selectedMachine?.id || ''}
          onChange={(e) => {
            const machine = machines?.find((m) => m.id === e.target.value)
            setSelectedMachine(machine || null)
          }}
        >
          <option value="">Выберите автомат</option>
          {machines?.map((m) => (
            <option key={m.id} value={m.id}>
              {m.code} - {m.name}
            </option>
          ))}
        </select>
      </div>

      {selectedMachine && (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Дата</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Время</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Сумма</th>
                {locations && locations.length > 0 && (
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">
                    <span className="flex items-center gap-1">
                      <MapPin className="w-4 h-4" /> Адрес
                    </span>
                  </th>
                )}
                <th className="px-4 py-3 w-16"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-2">
                    <input
                      type="date"
                      className="input"
                      value={row.date}
                      onChange={(e) => updateRow(row.id, 'date', e.target.value)}
                      max={new Date().toISOString().split('T')[0]}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="time"
                      className="input"
                      value={row.time}
                      onChange={(e) => updateRow(row.id, 'time', e.target.value)}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="number"
                      className="input"
                      placeholder="Сумма"
                      min="1"
                      max="1000000000"
                      value={row.amount}
                      onChange={(e) => updateRow(row.id, 'amount', e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && row.amount) {
                          addRow()
                        }
                      }}
                    />
                  </td>
                  {locations && locations.length > 0 && (
                    <td className="px-4 py-2">
                      <select
                        className="input text-sm"
                        value={row.locationId}
                        onChange={(e) => updateRow(row.id, 'locationId', e.target.value)}
                      >
                        <option value="">Текущий адрес</option>
                        {locations.map((loc) => (
                          <option key={loc.id} value={loc.id}>
                            {loc.address} ({new Date(loc.validFrom).toLocaleDateString('ru-RU')}
                            {loc.validTo ? ` - ${new Date(loc.validTo).toLocaleDateString('ru-RU')}` : ' - сейчас'})
                          </option>
                        ))}
                      </select>
                    </td>
                  )}
                  <td className="px-4 py-2">
                    <button
                      onClick={() => removeRow(row.id)}
                      className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                      disabled={rows.length === 1}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="p-4 border-t border-gray-100 flex items-center justify-between">
            <button onClick={addRow} className="btn btn-secondary flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Добавить строку
            </button>
            <div className="text-sm text-gray-500">
              Итого: {rows.filter((r) => r.date && r.amount).length} записей,{' '}
              {totalAmount.toLocaleString('ru-RU')} сум
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-4">
        <button onClick={() => navigate(-1)} className="btn btn-secondary">
          Отмена
        </button>
        <button
          onClick={handleSubmit}
          disabled={mutation.isPending || !selectedMachine}
          className="btn btn-primary"
        >
          {mutation.isPending ? 'Сохранение...' : '💾 Сохранить всё'}
        </button>
      </div>
    </div>
  )
}
