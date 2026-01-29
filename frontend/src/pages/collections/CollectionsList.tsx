import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { collectionsApi, Collection, CollectionQuery } from '../../api/collections'
import { machinesApi } from '../../api/machines'
import { format } from 'date-fns'
import { Filter, ChevronLeft, ChevronRight, Edit, Trash2 } from 'lucide-react'
import ReceiveModal from '../../components/ReceiveModal'
import EditCollectionModal from '../../components/EditCollectionModal'
import CancelCollectionModal from '../../components/CancelCollectionModal'
import toast from 'react-hot-toast'

export default function CollectionsList() {
    const [query, setQuery] = useState<CollectionQuery>({ page: 1, limit: 20 })
    const [selectedCollection, setSelectedCollection] = useState<Collection | null>(null)
    const [editCollection, setEditCollection] = useState<Collection | null>(null)
    const [cancelCollection, setCancelCollection] = useState<Collection | null>(null)
    const [showFilters, setShowFilters] = useState(false)

    const { data, isLoading, refetch } = useQuery({
        queryKey: ['collections', query],
        queryFn: () => collectionsApi.getAll(query),
    })

    const { data: machines } = useQuery({
        queryKey: ['machines'],
        queryFn: () => machinesApi.getAll(),
    })

    const handleReceive = async (amount: number, notes?: string) => {
        if (!selectedCollection) return
        try {
            await collectionsApi.receive(selectedCollection.id, { amount, notes })
            toast.success('Инкассация принята!')
            setSelectedCollection(null)
            refetch()
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'Ошибка')
        }
    }

    const handleEdit = async (amount: number, reason: string) => {
        if (!editCollection) return
        try {
            await collectionsApi.edit(editCollection.id, { amount, reason })
            toast.success('Сумма инкассации изменена!')
            setEditCollection(null)
            refetch()
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'Ошибка')
        }
    }

    const handleCancel = async (reason?: string) => {
        if (!cancelCollection) return
        try {
            await collectionsApi.cancel(cancelCollection.id, reason)
            toast.success('Инкассация отменена')
            setCancelCollection(null)
            refetch()
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'Ошибка')
        }
    }

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'collected':
                return <span className="badge badge-warning">⏳ Ожидает</span>
            case 'received':
                return <span className="badge badge-success">✅ Принято</span>
            case 'cancelled':
                return <span className="badge badge-danger">❌ Отменено</span>
            default:
                return null
        }
    }

    const totalPages = Math.ceil((data?.total || 0) / (query.limit || 20))

    return (
        <div className="space-y-4">
            {/* Filters */}
            <div className="card p-4">
                <div className="flex flex-wrap items-center gap-4">
                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        className="btn btn-secondary flex items-center gap-2"
                    >
                        <Filter className="w-4 h-4" />
                        Фильтры
                    </button>

                    <select
                        className="input w-auto"
                        value={query.status || ''}
                        onChange={(e) => setQuery({ ...query, status: e.target.value || undefined, page: 1 })}
                    >
                        <option value="">Все статусы</option>
                        <option value="collected">Ожидают</option>
                        <option value="received">Принято</option>
                        <option value="cancelled">Отменено</option>
                    </select>

                    {showFilters && (
                        <>
                            <select
                                className="input w-auto"
                                value={query.machineId || ''}
                                onChange={(e) =>
                                    setQuery({ ...query, machineId: e.target.value || undefined, page: 1 })
                                }
                            >
                                <option value="">Все автоматы</option>
                                {machines?.map((m) => (
                                    <option key={m.id} value={m.id}>
                                        {m.name}
                                    </option>
                                ))}
                            </select>

                            <input
                                type="date"
                                className="input w-auto"
                                value={query.from || ''}
                                onChange={(e) => setQuery({ ...query, from: e.target.value || undefined, page: 1 })}
                            />
                            <span>—</span>
                            <input
                                type="date"
                                className="input w-auto"
                                value={query.to || ''}
                                onChange={(e) => setQuery({ ...query, to: e.target.value || undefined, page: 1 })}
                            />
                        </>
                    )}
                </div>
            </div>

            {/* Table */}
            <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Время</th>
                                <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Автомат</th>
                                <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Оператор</th>
                                <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Сумма</th>
                                <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Статус</th>
                                <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Действия</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {isLoading ? (
                                <tr>
                                    <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                                        Загрузка...
                                    </td>
                                </tr>
                            ) : data?.data.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                                        Нет данных
                                    </td>
                                </tr>
                            ) : (
                                data?.data.map((collection) => (
                                    <tr key={collection.id} className="hover:bg-gray-50">
                                        <td className="px-4 py-3 text-sm">
                                            <div>{format(new Date(collection.collectedAt), 'dd.MM.yyyy')}</div>
                                            <div className="text-gray-500">
                                                {format(new Date(collection.collectedAt), 'HH:mm:ss')}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="font-medium">{collection.machine.name}</div>
                                            <div className="text-sm text-gray-500">{collection.machine.code}</div>
                                        </td>
                                        <td className="px-4 py-3 text-sm">{collection.operator.name}</td>
                                        <td className="px-4 py-3 text-sm font-medium">
                                            {collection.amount
                                                ? `${Number(collection.amount).toLocaleString('ru-RU')} сум`
                                                : '—'}
                                        </td>
                                        <td className="px-4 py-3">{getStatusBadge(collection.status)}</td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                {collection.status === 'collected' && (
                                                    <>
                                                        <button
                                                            onClick={() => setSelectedCollection(collection)}
                                                            className="text-primary-600 hover:text-primary-800 font-medium text-sm"
                                                        >
                                                            Принять
                                                        </button>
                                                        <button
                                                            onClick={() => setCancelCollection(collection)}
                                                            className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"
                                                            title="Отменить"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </>
                                                )}
                                                {collection.status === 'received' && (
                                                    <>
                                                        <button
                                                            onClick={() => setEditCollection(collection)}
                                                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg"
                                                            title="Редактировать сумму"
                                                        >
                                                            <Edit className="w-4 h-4" />
                                                        </button>
                                                        <button
                                                            onClick={() => setCancelCollection(collection)}
                                                            className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"
                                                            title="Отменить"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
                        <div className="text-sm text-gray-500">
                            Всего: {data?.total || 0}
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setQuery({ ...query, page: (query.page || 1) - 1 })}
                                disabled={query.page === 1}
                                className="btn btn-secondary p-2"
                            >
                                <ChevronLeft className="w-4 h-4" />
                            </button>
                            <span className="text-sm">
                                {query.page} / {totalPages}
                            </span>
                            <button
                                onClick={() => setQuery({ ...query, page: (query.page || 1) + 1 })}
                                disabled={query.page === totalPages}
                                className="btn btn-secondary p-2"
                            >
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Receive Modal */}
            {selectedCollection && (
                <ReceiveModal
                    collection={selectedCollection}
                    onClose={() => setSelectedCollection(null)}
                    onSubmit={handleReceive}
                />
            )}

            {/* Edit Modal */}
            {editCollection && (
                <EditCollectionModal
                    collection={editCollection}
                    onClose={() => setEditCollection(null)}
                    onSubmit={handleEdit}
                />
            )}

            {/* Cancel Modal */}
            {cancelCollection && (
                <CancelCollectionModal
                    collection={cancelCollection}
                    onClose={() => setCancelCollection(null)}
                    onSubmit={handleCancel}
                />
            )}
        </div>
    )
}
