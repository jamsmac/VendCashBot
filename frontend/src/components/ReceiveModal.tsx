import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { X } from 'lucide-react'
import { Collection } from '../api/collections'
import { format } from 'date-fns'

interface ReceiveModalProps {
  collection: Collection
  onClose: () => void
  onSubmit: (amount: number, notes?: string) => Promise<void>
}

export default function ReceiveModal({ collection, onClose, onSubmit }: ReceiveModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { register, handleSubmit, watch, formState: { errors } } = useForm<{
    amount: number
    notes?: string
  }>()

  const amount = watch('amount')

  const handleFormSubmit = async (data: { amount: number; notes?: string }) => {
    setIsSubmitting(true)
    try {
      await onSubmit(data.amount, data.notes)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="font-semibold text-lg">Приём инкассации</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit(handleFormSubmit)} className="p-4 space-y-4">
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
            <div className="flex items-center gap-2">
              <span className="text-gray-500">⏰ Время сбора:</span>
              <span>{format(new Date(collection.collectedAt), 'dd.MM.yyyy HH:mm:ss')}</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Сумма (сум) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              className="input"
              placeholder="Введите сумму"
              {...register('amount', {
                required: 'Введите сумму',
                valueAsNumber: true,
                min: { value: 0, message: 'Сумма должна быть положительной' },
              })}
            />
            {errors.amount && (
              <p className="text-red-500 text-sm mt-1">{errors.amount.message}</p>
            )}
            {amount > 0 && (
              <p className="text-gray-500 text-sm mt-1">
                = {Number(amount).toLocaleString('ru-RU')} сум
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Примечание</label>
            <textarea
              className="input min-h-[80px] resize-none"
              placeholder="Опционально"
              {...register('notes')}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn btn-secondary flex-1">
              Отмена
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="btn btn-primary flex-1"
            >
              {isSubmitting ? 'Сохранение...' : '✅ Принять'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
