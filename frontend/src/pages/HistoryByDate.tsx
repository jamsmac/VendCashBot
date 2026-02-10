import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { machinesApi, MachineLocation } from '../api/machines'
import { collectionsApi } from '../api/collections'
import { Plus, Trash2, MapPin } from 'lucide-react'
import toast from 'react-hot-toast'

const generateId = (): string => {
  try {
    return crypto.randomUUID()
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
  }
}

interface HistoryRow {
  id: string
  machineId: string
  time: string
  amount: string
  locationId: string
  locations: MachineLocation[]
}

export default function HistoryByDate() {
  const navigate = useNavigate()
  const [selectedDate, setSelectedDate] = useState('')
  const [defaultTime, setDefaultTime] = useState('14:00')
  const [rows, setRows] = useState<HistoryRow[]>([
    { id: generateId(), machineId: '', time: defaultTime, amount: '', locationId: '', locations: [] },
  ])

  // Keep a ref to rows for use in effects without stale closures
  const rowsRef = useRef(rows)
  rowsRef.current = rows

  const { data: machines } = useQuery({
    queryKey: ['machines'],
    queryFn: () => machinesApi.getAll(),
  })

  // Load locations when machine is selected
  const loadLocationsForRow = async (rowId: string, machineId: string) => {
    if (!machineId) {
      setRows(prev => prev.map(r => r.id === rowId ? { ...r, locations: [], locationId: '' } : r))
      return
    }
    try {
      const locs = await machinesApi.getLocations(machineId)
      // Auto-select location for current date if available
      let autoLocationId = ''
      if (selectedDate && locs.length > 0) {
        const locForDate = await machinesApi.getLocationForDate(machineId, selectedDate)
        if (locForDate) {
          autoLocationId = locForDate.id
        }
      }
      setRows(prev => prev.map(r => r.id === rowId ? { ...r, locations: locs, locationId: autoLocationId } : r))
    } catch {
      setRows(prev => prev.map(r => r.id === rowId ? { ...r, locations: [], locationId: '' } : r))
    }
  }

  // Update locations for all rows when date changes
  useEffect(() => {
    if (selectedDate) {
      // Use ref to avoid stale closure over rows
      const currentRows = rowsRef.current
      currentRows.forEach(row => {
        if (row.machineId && row.locations.length > 0) {
          machinesApi.getLocationForDate(row.machineId, selectedDate).then(loc => {
            if (loc) {
              setRows(prev => prev.map(r => r.id === row.id ? { ...r, locationId: loc.id } : r))
            }
          }).catch(() => {})
        }
      })
    }
  }, [selectedDate])

  const mutation = useMutation({
    mutationFn: (data: { collections: { machineId: string; collectedAt: string; amount: number; locationId?: string }[]; source: string }) =>
      collectionsApi.bulkCreate(data),
    onSuccess: (result) => {
      toast.success(`Создано ${result.created} записей`)
      if (result.failed > 0) {
        toast.error(`Ошибок: ${result.failed}`)
      }
      navigate('/collections')
    },
    onError: (error: Error & { response?: { data?: { message?: string } } }) => {
      toast.error(error.response?.data?.message || 'Ошибка сохранения')
    },
  })

  const usedMachineIds = rows.map((r) => r.machineId).filter(Boolean)
  const availableMachines = machines?.filter((m) => !usedMachineIds.includes(m.id)) || []

  const addRow = () => {
    const lastRow = rows[rows.length - 1]
    const lastTime = lastRow?.time || defaultTime
    const [hours, minutes] = lastTime.split(':').map(Number)
    const totalMinutes = hours * 60 + minutes + 5
    const newHours = Math.min(Math.floor(totalMinutes / 60), 23)
    const newMins = totalMinutes >= 24 * 60 ? 59 : totalMinutes % 60
    const newTime = `${String(newHours).padStart(2, '0')}:${String(newMins).padStart(2, '0')}`

    setRows([
      ...rows,
      {
        id: generateId(),
        machineId: '',
        time: newTime,
        amount: '',
        locationId: '',
        locations: [],
      },
    ])
  }

  const removeRow = (id: string) => {
    if (rows.length > 1) {
      setRows(rows.filter((r) => r.id !== id))
    }
  }

  const updateRow = (id: string, field: keyof Omit<HistoryRow, 'locations'>, value: string) => {
    setRows(rows.map((r) => (r.id === id ? { ...r, [field]: value } : r)))
    // Load locations when machine changes
    if (field === 'machineId') {
      loadLocationsForRow(id, value)
    }
  }

  const handleSubmit = () => {
    if (!selectedDate) {
      toast.error('Выберите дату')
      return
    }

    const validRows = rows.filter((r) => r.machineId && r.amount)
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
      machineId: r.machineId,
      collectedAt: `${selectedDate}T${r.time || '12:00'}:00`,
      amount: parseFloat(r.amount),
      locationId: r.locationId || undefined,
    }))

    mutation.mutate({ collections, source: 'manual_history' })
  }

  const totalAmount = rows.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0)

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Ввод истории: по дате</h1>

      <div className="card p-4 flex flex-wrap gap-4">
        <div>
          <label className="block text-sm font-medium mb-2">📅 Дата</label>
          <input
            type="date"
            className="input"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            max={new Date().toISOString().split('T')[0]}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-2">⏰ Время по умолчанию</label>
          <input
            type="time"
            className="input"
            value={defaultTime}
            onChange={(e) => setDefaultTime(e.target.value)}
          />
        </div>
      </div>

      {selectedDate && (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Автомат</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">
                  <span className="flex items-center gap-1">
                    <MapPin className="w-4 h-4" /> Адрес
                  </span>
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 w-32">Время</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 w-40">Сумма</th>
                <th className="px-4 py-3 w-16"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-2">
                    <select
                      className="input"
                      value={row.machineId}
                      onChange={(e) => updateRow(row.id, 'machineId', e.target.value)}
                    >
                      <option value="">Выберите автомат</option>
                      {machines
                        ?.filter((m) => !usedMachineIds.includes(m.id) || m.id === row.machineId)
                        .map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.code} - {m.name}
                          </option>
                        ))}
                    </select>
                  </td>
                  <td className="px-4 py-2">
                    {row.locations.length > 0 ? (
                      <select
                        className="input text-sm"
                        value={row.locationId}
                        onChange={(e) => updateRow(row.id, 'locationId', e.target.value)}
                      >
                        <option value="">Текущий адрес</option>
                        {row.locations.map((loc) => (
                          <option key={loc.id} value={loc.id}>
                            {loc.address} ({new Date(loc.validFrom).toLocaleDateString('ru-RU')}
                            {loc.validTo ? ` - ${new Date(loc.validTo).toLocaleDateString('ru-RU')}` : ' - сейчас'})
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-gray-400 text-sm">
                        {row.machineId ? 'Нет истории' : '-'}
                      </span>
                    )}
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
                        if (e.key === 'Enter' && row.machineId && row.amount) {
                          addRow()
                        }
                      }}
                    />
                  </td>
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
            <button
              onClick={addRow}
              disabled={availableMachines.length === 0}
              className="btn btn-secondary flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Добавить строку
            </button>
            <div className="text-sm text-gray-500">
              Итого: {rows.filter((r) => r.machineId && r.amount).length} записей,{' '}
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
          disabled={mutation.isPending || !selectedDate}
          className="btn btn-primary"
        >
          {mutation.isPending ? 'Сохранение...' : '💾 Сохранить всё'}
        </button>
      </div>
    </div>
  )
}
