import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Save, RotateCcw, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { settingsApi, AppSettings } from '../api/settings'
import { getErrorMessage } from '../utils/getErrorMessage'

const DEFAULTS: AppSettings = {
  reconciliationTolerance: 5,
  shortageAlertThreshold: 10,
  collectionDistanceMeters: 50,
  defaultPageSize: 50,
}

export default function SettingsPage() {
  const queryClient = useQueryClient()
  const [settings, setSettings] = useState<AppSettings>(DEFAULTS)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['settings', 'app'],
    queryFn: ({ signal }) => settingsApi.getAppSettings(signal),
  })

  useEffect(() => {
    if (data) {
      setSettings(data)
      setDirty(false)
    }
  }, [data])

  const handleChange = (key: keyof AppSettings, value: number) => {
    setSettings(prev => ({ ...prev, [key]: value }))
    setDirty(true)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const updated = await settingsApi.updateAppSettings(settings)
      setSettings(updated)
      setDirty(false)
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      toast.success('Настройки сохранены')
    } catch (error: unknown) {
      toast.error(getErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  const handleReset = () => {
    setSettings({ ...DEFAULTS })
    setDirty(true)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    )
  }

  if (isError) {
    return (
      <div className="text-center py-12 text-red-500">
        Ошибка загрузки настроек. Попробуйте обновить страницу.
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold">Настройки</h1>

      <div className="card p-6 space-y-6">
        <h2 className="text-lg font-semibold border-b border-gray-200 dark:border-gray-600 pb-2">
          Сверка
        </h2>

        {/* Reconciliation tolerance */}
        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Допуск совпадения (%)
          </label>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Если отклонение в пределах этого порога — статус «Совпадение» (зелёный)
          </p>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={1}
              max={20}
              step={1}
              value={settings.reconciliationTolerance}
              onChange={(e) => handleChange('reconciliationTolerance', Number(e.target.value))}
              className="flex-1"
            />
            <span className="w-12 text-center font-mono text-sm bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
              {settings.reconciliationTolerance}%
            </span>
          </div>
        </div>

        {/* Shortage alert threshold */}
        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Порог Telegram-алерта (%)
          </label>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Недостачи с отклонением больше этого значения отправляются в Telegram
          </p>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={5}
              max={50}
              step={5}
              value={settings.shortageAlertThreshold}
              onChange={(e) => handleChange('shortageAlertThreshold', Number(e.target.value))}
              className="flex-1"
            />
            <span className="w-12 text-center font-mono text-sm bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
              {settings.shortageAlertThreshold}%
            </span>
          </div>
        </div>

        <h2 className="text-lg font-semibold border-b border-gray-200 dark:border-gray-600 pb-2 pt-4">
          Инкассации
        </h2>

        {/* Collection distance threshold */}
        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Допуск геолокации (метры)
          </label>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Максимальное расстояние от автомата при подтверждении инкассации
          </p>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={10}
              max={500}
              step={10}
              value={settings.collectionDistanceMeters}
              onChange={(e) => handleChange('collectionDistanceMeters', Number(e.target.value))}
              className="flex-1"
            />
            <span className="w-16 text-center font-mono text-sm bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
              {settings.collectionDistanceMeters}м
            </span>
          </div>
        </div>

        <h2 className="text-lg font-semibold border-b border-gray-200 dark:border-gray-600 pb-2 pt-4">
          Отображение
        </h2>

        {/* Page size */}
        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Записей на странице
          </label>
          <select
            className="input w-auto"
            value={settings.defaultPageSize}
            onChange={(e) => handleChange('defaultPageSize', Number(e.target.value))}
          >
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={200}>200</option>
          </select>
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-3 pt-4 border-t border-gray-200 dark:border-gray-600">
          <button
            onClick={handleSave}
            disabled={!dirty || saving}
            className="btn btn-primary flex items-center gap-2 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Сохранение...' : 'Сохранить'}
          </button>
          <button
            onClick={handleReset}
            className="btn btn-secondary flex items-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            По умолчанию
          </button>
        </div>
      </div>
    </div>
  )
}
