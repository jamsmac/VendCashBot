import { useState } from 'react'
import { X, AlertTriangle } from 'lucide-react'

interface BulkCancelModalProps {
  count: number
  mode: 'selected' | 'filtered'
  onClose: () => void
  onSubmit: (reason?: string) => Promise<void>
}

export default function BulkCancelModal({ count, mode, onClose, onSubmit }: BulkCancelModalProps) {
  const [reason, setReason] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    try {
      await onSubmit(reason || undefined)
    } finally {
      setIsSubmitting(false)
    }
  }

  const modeText = mode === 'selected' ? 'выбранных' : 'отфильтрованных'

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="font-semibold text-lg">Массовая отмена инкассаций</h2>
          <button onClick={onClose} disabled={isSubmitting} className="p-1 hover:bg-gray-100 rounded-lg disabled:opacity-50">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-red-700">
              <p className="font-medium">
                Будет отменено {count} {modeText} инкассаций
              </p>
              <p className="mt-1">
                Это действие нельзя отменить. Все выбранные инкассации будут помечены как
                отменённые.
              </p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Причина отмены</label>
            <textarea
              className="input min-h-[80px] resize-none"
              placeholder="Опционально"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} disabled={isSubmitting} className="btn btn-secondary flex-1">
              Назад
            </button>
            <button
              type="submit"
              disabled={isSubmitting || count === 0}
              className="btn btn-danger flex-1"
            >
              {isSubmitting ? 'Отмена...' : `Отменить (${count})`}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
