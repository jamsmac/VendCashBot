import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { financeApi } from '../../api/finance'
import { format } from 'date-fns'
import { Plus, Wallet, TrendingDown, ArrowDownRight } from 'lucide-react'
import DepositModal from '../../components/DepositModal'
import toast from 'react-hot-toast'

export default function BankDeposits() {
    const [isModalOpen, setIsModalOpen] = useState(false)

    const { data: balance, refetch: refetchBalance } = useQuery({
        queryKey: ['finance-balance'],
        queryFn: financeApi.getBalance,
    })

    const { data: deposits, refetch: refetchDeposits } = useQuery({
        queryKey: ['finance-deposits'],
        queryFn: financeApi.getDeposits,
    })

    const handleDeposit = async (data: { amount: number; notes: string; date: string }) => {
        try {
            await financeApi.createDeposit(data)
            toast.success('Сдача в банк зафиксирована!')
            setIsModalOpen(false)
            refetchBalance()
            refetchDeposits()
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'Ошибка')
        }
    }

    return (
        <div className="space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="card p-6 bg-gradient-to-br from-primary-500 to-primary-600 text-white border-none">
                    <div className="flex items-center gap-4 mb-4">
                        <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
                            <Wallet className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <div className="text-primary-100 text-sm font-medium">Остаток в кассе</div>
                            <div className="text-2xl font-bold">
                                {balance?.balance.toLocaleString('ru-RU') || 0} сум
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={() => setIsModalOpen(true)}
                        className="w-full py-2 bg-white/20 hover:bg-white/30 rounded-lg backdrop-blur-sm transition-colors text-sm font-medium flex items-center justify-center gap-2"
                    >
                        <Plus className="w-4 h-4" />
                        Сдать выручку
                    </button>
                </div>

                <div className="card p-6">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-xl flex items-center justify-center">
                            <ArrowDownRight className="w-6 h-6 text-green-600 dark:text-green-400" />
                        </div>
                        <div>
                            <div className="text-gray-500 dark:text-gray-400 text-sm font-medium">Всего принято</div>
                            <div className="text-2xl font-bold text-gray-900 dark:text-white">
                                {balance?.received.toLocaleString('ru-RU') || 0} сум
                            </div>
                        </div>
                    </div>
                </div>

                <div className="card p-6">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center">
                            <TrendingDown className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div>
                            <div className="text-gray-500 dark:text-gray-400 text-sm font-medium">Всего сдано</div>
                            <div className="text-2xl font-bold text-gray-900 dark:text-white">
                                {balance?.deposited.toLocaleString('ru-RU') || 0} сум
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* History Table */}
            <div className="card">
                <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700">
                    <h3 className="font-bold text-lg">История сдачи</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-gray-50 dark:bg-gray-700/50">
                            <tr>
                                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400">Дата</th>
                                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400">Сумма</th>
                                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400">Кто сдал</th>
                                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400">Примечание</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                            {deposits?.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
                                        История пуста
                                    </td>
                                </tr>
                            ) : (
                                deposits?.map((deposit) => (
                                    <tr key={deposit.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                        <td className="px-6 py-3 text-sm text-gray-900 dark:text-gray-100">
                                            <div>{format(new Date(deposit.depositDate), 'dd.MM.yyyy')}</div>
                                            <div className="text-gray-500 dark:text-gray-400 text-xs">
                                                {format(new Date(deposit.depositDate), 'HH:mm')}
                                            </div>
                                        </td>
                                        <td className="px-6 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">
                                            {Number(deposit.amount).toLocaleString('ru-RU')} сум
                                        </td>
                                        <td className="px-6 py-3 text-sm">
                                            <div className="flex items-center gap-2">
                                                <div className="w-6 h-6 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center text-xs font-medium text-gray-600 dark:text-gray-300">
                                                    {deposit.createdBy?.name?.charAt(0)}
                                                </div>
                                                {deposit.createdBy?.name}
                                            </div>
                                        </td>
                                        <td className="px-6 py-3 text-sm text-gray-500 dark:text-gray-400">
                                            {deposit.notes || '—'}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal */}
            {isModalOpen && (
                <DepositModal
                    onClose={() => setIsModalOpen(false)}
                    onSubmit={handleDeposit}
                    maxAmount={balance?.balance || 0}
                />
            )}
        </div>
    )
}
