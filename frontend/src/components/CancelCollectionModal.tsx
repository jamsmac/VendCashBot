import { useState } from 'react'
import { X } from 'lucide-react'
import { Collection } from '../api/collections'
import { format } from 'date-fns'

interface CancelCollectionModalProps {
  collection: Collection
  onClose: () => void
  onSubmit: (reason?: string) => Promise<void>
}

export default function CancelCollectionModal({ collection, onClose, onSubmit }: CancelCollectionModalProps) {
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

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="font-semibold text-lg">Отмена инкассации</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-gray-500">🏧 Автомат:</span>
              <span className="font-medium">{collection.machine.code}</span>
            </div>
            <div className="text-gray-700">{collection.machine.name}</div>
            <div className="flex items-center gap-2">
              <span className="text-gray-500">👷 Оператор:</span>
              <span>{collection.operator.name}</span>
            </div>
            {collection.amount != null && (
              <div className="flex items-center gap-2">
                <span className="text-gray-500">💰 Сумма:</span>
                <span className="font-medium">
                  {Number(collection.amount).toLocaleString('ru-RU')} сум
                </span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <span className="text-gray-500">⏰ Время сбора:</span>
              <span>{format(new Date(collection.collectedAt), 'dd.MM.yyyy HH:mm:ss')}</span>
            </div>
          </div>

          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
            Это действие нельзя отменить. Инкассация будет помечена как отменённая.
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
            <button type="button" onClick={onClose} className="btn btn-secondary flex-1">
              Назад
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="btn btn-danger flex-1"
            >
              {isSubmitting ? 'Отмена...' : 'Отменить инкассацию'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
