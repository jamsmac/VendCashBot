import { useQuery } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { collectionsApi, Collection, CollectionQuery, BulkCancelResult } from '../../api/collections'
import { machinesApi } from '../../api/machines'
import { format } from 'date-fns'
import { Filter, ChevronLeft, ChevronRight, Edit, Trash2, XSquare } from 'lucide-react'
import ReceiveModal from '../../components/ReceiveModal'
import DistanceBadge from '../../components/DistanceBadge'
import EditCollectionModal from '../../components/EditCollectionModal'
import CancelCollectionModal from '../../components/CancelCollectionModal'
import BulkCancelModal from '../../components/BulkCancelModal'
import { useAuthStore } from '../../contexts/AuthContext'
import toast from 'react-hot-toast'
import { getErrorMessage } from '../../utils/getErrorMessage'

export default function CollectionsList() {
    const [query, setQuery] = useState<CollectionQuery>({ page: 1, limit: 20 })
    const [selectedCollection, setSelectedCollection] = useState<Collection | null>(null)
    const [editCollection, setEditCollection] = useState<Collection | null>(null)
    const [cancelCollection, setCancelCollection] = useState<Collection | null>(null)
    const [showFilters, setShowFilters] = useState(false)
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
    const [showBulkCancel, setShowBulkCancel] = useState<'selected' | 'filtered' | null>(null)
    const { user } = useAuthStore()
    const isManagerOrAdmin = user?.role === 'manager' || user?.role === 'admin'

    const { data, isLoading, refetch } = useQuery({
        queryKey: ['collections', query],
        queryFn: ({ signal }) => collectionsApi.getAll(query, signal),
    })

    const { data: machines } = useQuery({
        queryKey: ['machines'],
        queryFn: ({ signal }) => machinesApi.getAll(true, signal),
    })

    const handleReceive = async (amount: number, notes?: string) => {
        if (!selectedCollection) return
        try {
            await collectionsApi.receive(selectedCollection.id, { amount, notes })
            toast.success('Инкассация принята!')
            setSelectedCollection(null)
            refetch()
        } catch (error: unknown) {
            toast.error(getErrorMessage(error))
        }
    }

    const handleEdit = async (amount: number, reason: string) => {
        if (!editCollection) return
        try {
            await collectionsApi.edit(editCollection.id, { amount, reason })
            toast.success('Сумма инкассации изменена!')
            setEditCollection(null)
            refetch()
        } catch (error: unknown) {
            toast.error(getErrorMessage(error))
        }
    }

    const handleCancel = async (reason?: string) => {
        if (!cancelCollection) return
        try {
            await collectionsApi.cancel(cancelCollection.id, reason)
            toast.success('Инкассация отменена')
            setCancelCollection(null)
            refetch()
        } catch (error: unknown) {
            toast.error(getErrorMessage(error))
        }
    }

    // Selection helpers
    const cancellableOnPage = (data?.data || []).filter(
        (c) => c.status !== 'cancelled'
    )
    const allPageSelected =
        cancellableOnPage.length > 0 &&
        cancellableOnPage.every((c) => selectedIds.has(c.id))

    const toggleSelectAll = () => {
        if (allPageSelected) {
            const newSet = new Set(selectedIds)
            cancellableOnPage.forEach((c) => newSet.delete(c.id))
            setSelectedIds(newSet)
        } else {
            const newSet = new Set(selectedIds)
            cancellableOnPage.forEach((c) => newSet.add(c.id))
            setSelectedIds(newSet)
        }
    }

    const toggleSelectOne = (id: string) => {
        const newSet = new Set(selectedIds)
        if (newSet.has(id)) {
            newSet.delete(id)
        } else {
            newSet.add(id)
        }
        setSelectedIds(newSet)
    }

    const hasActiveFilters = !!(
        query.status || query.machineId || query.operatorId ||
        query.source || query.from || query.to
    )

    // Reset selections when filters or page change
    useEffect(() => {
        setSelectedIds(new Set())
    }, [query.page, query.status, query.machineId, query.from, query.to])

    const [isBulkCancelling, setIsBulkCancelling] = useState(false)

    const handleBulkCancel = async (reason?: string) => {
        if (isBulkCancelling) return
        setIsBulkCancelling(true)
        try {
            let result: BulkCancelResult

            if (showBulkCancel === 'selected') {
                result = await collectionsApi.bulkCancel({
                    ids: Array.from(selectedIds),
                    reason,
                })
            } else {
                result = await collectionsApi.bulkCancel({
                    useFilters: true,
                    status: query.status,
                    machineId: query.machineId,
                    operatorId: query.operatorId,
                    source: query.source,
                    from: query.from,
                    to: query.to,
                    reason,
                })
            }

            if (result.cancelled > 0) {
                toast.success(`Отменено ${result.cancelled} инкассаций`)
            }
            if (result.failed > 0) {
                toast.error(`Не удалось отменить: ${result.failed}`)
            }

            setShowBulkCancel(null)
            setSelectedIds(new Set())
            refetch()
        } catch (error: unknown) {
            toast.error(getErrorMessage(error, 'Ошибка массовой отмены'))
        } finally {
            setIsBulkCancelling(false)
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

                    {isManagerOrAdmin && hasActiveFilters && (
                        <button
                            onClick={() => setShowBulkCancel('filtered')}
                            className="btn btn-danger text-sm flex items-center gap-1"
                            title="Отменить все записи по фильтру"
                        >
                            <XSquare className="w-4 h-4" />
                            Отменить все ({data?.total || 0})
                        </button>
                    )}
                </div>
            </div>

            {/* Selection Action Bar */}
            {isManagerOrAdmin && selectedIds.size > 0 && (
                <div className="card p-3 flex items-center justify-between bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                    <span className="text-sm font-medium text-red-700 dark:text-red-400">
                        Выбрано: {selectedIds.size}
                    </span>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setSelectedIds(new Set())}
                            className="btn btn-secondary text-sm"
                        >
                            Снять выделение
                        </button>
                        <button
                            onClick={() => setShowBulkCancel('selected')}
                            className="btn btn-danger text-sm"
                        >
                            Отменить выбранные
                        </button>
                    </div>
                </div>
            )}

            {/* Table */}
            <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-gray-50 dark:bg-gray-700/50">
                            <tr>
                                {isManagerOrAdmin && (
                                    <th className="px-4 py-3 w-10">
                                        <input
                                            type="checkbox"
                                            checked={allPageSelected && cancellableOnPage.length > 0}
                                            onChange={toggleSelectAll}
                                            className="rounded border-gray-300"
                                        />
                                    </th>
                                )}
                                <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400">Время</th>
                                <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400">Автомат</th>
                                <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400">Оператор</th>
                                <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400">Сумма</th>
                                <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400">📏 Расст.</th>
                                <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400">Статус</th>
                                <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400">Действия</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                            {isLoading ? (
                                <tr>
                                    <td colSpan={isManagerOrAdmin ? 8 : 7} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                                        Загрузка...
                                    </td>
                                </tr>
                            ) : data?.data.length === 0 ? (
                                <tr>
                                    <td colSpan={isManagerOrAdmin ? 8 : 7} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                                        Нет данных
                                    </td>
                                </tr>
                            ) : (
                                data?.data.map((collection) => (
                                    <tr key={collection.id} className={`hover:bg-gray-50 dark:hover:bg-gray-700/50 ${selectedIds.has(collection.id) ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}>
                                        {isManagerOrAdmin && (
                                            <td className="px-4 py-3">
                                                {collection.status !== 'cancelled' ? (
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedIds.has(collection.id)}
                                                        onChange={() => toggleSelectOne(collection.id)}
                                                        className="rounded border-gray-300"
                                                    />
                                                ) : (
                                                    <span className="block w-4" />
                                                )}
                                            </td>
                                        )}
                                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                                            <div>{format(new Date(collection.collectedAt), 'dd.MM.yyyy')}</div>
                                            <div className="text-gray-500 dark:text-gray-400">
                                                {format(new Date(collection.collectedAt), 'HH:mm:ss')}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="font-medium text-gray-900 dark:text-gray-100">{collection.machine.name}</div>
                                            <div className="text-sm text-gray-500 dark:text-gray-400">{collection.machine.code}</div>
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{collection.operator.name}</td>
                                        <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">
                                            {collection.amount
                                                ? `${Number(collection.amount).toLocaleString('ru-RU')} сум`
                                                : '—'}
                                        </td>
                                        <td className="px-4 py-3">
                                            <DistanceBadge distance={collection.distanceFromMachine} compact />
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
                                                            className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg"
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
                                                            className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg"
                                                            title="Редактировать сумму"
                                                        >
                                                            <Edit className="w-4 h-4" />
                                                        </button>
                                                        <button
                                                            onClick={() => setCancelCollection(collection)}
                                                            className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg"
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
                    <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between">
                        <div className="text-sm text-gray-500 dark:text-gray-400">
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

            {/* Bulk Cancel Modal */}
            {showBulkCancel && (
                <BulkCancelModal
                    count={
                        showBulkCancel === 'selected'
                            ? selectedIds.size
                            : (data?.total || 0)
                    }
                    mode={showBulkCancel}
                    onClose={() => setShowBulkCancel(null)}
                    onSubmit={handleBulkCancel}
                />
            )}
        </div>
    )
}
