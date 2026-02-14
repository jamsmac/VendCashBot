import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { X } from 'lucide-react'
import { Collection } from '../api/collections'
import ModalOverlay from './ui/ModalOverlay'

interface EditCollectionModalProps {
  collection: Collection
  onClose: () => void
  onSubmit: (amount: number, reason: string) => Promise<void>
}

interface EditFormData {
  amount: number
  reason: string
}

export default function EditCollectionModal({ collection, onClose, onSubmit }: EditCollectionModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { register, handleSubmit, watch, formState: { errors } } = useForm<EditFormData>({
    defaultValues: {
      amount: Number(collection.amount) || 0,
    },
  })

  const amount = watch('amount')

  const handleFormSubmit = async (data: EditFormData) => {
    setIsSubmitting(true)
    try {
      await onSubmit(data.amount, data.reason)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <ModalOverlay onClose={onClose} disableClose={isSubmitting}>
      <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="font-semibold text-lg">Редактирование инкассации</h2>
          <button onClick={onClose} disabled={isSubmitting} className="p-1 hover:bg-gray-100 rounded-lg disabled:opacity-50">
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
              <span className="text-gray-500">💰 Текущая сумма:</span>
              <span className="font-medium">
                {Number(collection.amount).toLocaleString('ru-RU')} сум
              </span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Новая сумма (сум) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              min="1"
              step="1"
              className="input"
              placeholder="Введите новую сумму"
              {...register('amount', {
                required: 'Введите сумму',
                valueAsNumber: true,
                min: { value: 1, message: 'Сумма должна быть больше 0' },
                max: { value: 1000000000, message: 'Сумма не может превышать 1,000,000,000' },
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
            <label className="block text-sm font-medium mb-1">
              Причина изменения <span className="text-red-500">*</span>
            </label>
            <textarea
              className="input min-h-[80px] resize-none"
              placeholder="Укажите причину изменения суммы"
              {...register('reason', {
                required: 'Укажите причину',
                maxLength: { value: 500, message: 'Максимум 500 символов' },
              })}
            />
            {errors.reason && (
              <p className="text-red-500 text-sm mt-1">{errors.reason.message}</p>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} disabled={isSubmitting} className="btn btn-secondary flex-1">
              Отмена
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="btn btn-primary flex-1"
            >
              {isSubmitting ? 'Сохранение...' : 'Сохранить'}
            </button>
          </div>
        </form>
      </div>
    </ModalOverlay>
  )
}
