import { useState } from 'react'
import { X } from 'lucide-react'
import toast from 'react-hot-toast'

interface DepositModalProps {
    onClose: () => void
    onSubmit: (data: { amount: number; notes: string; date: string }) => Promise<void>
    maxAmount: number
}

export default function DepositModal({ onClose, onSubmit, maxAmount }: DepositModalProps) {
    const [amount, setAmount] = useState('')
    const [notes, setNotes] = useState('')
    const [date, setDate] = useState(new Date().toISOString().split('T')[0])
    const [loading, setLoading] = useState(false)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!amount) return

        setLoading(true)
        try {
            await onSubmit({
                amount: parseFloat(amount),
                notes,
                date,
            })
            onClose()
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'Ошибка при сдаче в банк')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                    <h3 className="font-bold text-lg">Сдача денег в банк</h3>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
                        <X className="w-5 h-5 text-gray-500" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Дата сдачи *
                        </label>
                        <input
                            type="datetime-local"
                            required
                            className="input"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Сумма (сум) *
                        </label>
                        <input
                            type="number"
                            required
                            min="0"
                            max={maxAmount}
                            className="input"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            placeholder="Введите сумму"
                        />
                        <div className="text-xs text-gray-500 mt-1">
                            Доступно: {maxAmount.toLocaleString('ru-RU')} сум
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Примечание
                        </label>
                        <textarea
                            className="input min-h-[100px]"
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="Номер квитанции, банк и т.д."
                        />
                    </div>

                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="btn btn-secondary flex-1"
                            disabled={loading}
                        >
                            Отмена
                        </button>
                        <button
                            type="submit"
                            className="btn btn-primary flex-1"
                            disabled={loading}
                        >
                            {loading ? 'Сохранение...' : 'Сдать'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
