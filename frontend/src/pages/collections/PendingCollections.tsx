import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { collectionsApi, Collection } from '../../api/collections'
import { format } from 'date-fns'
import { Clock } from 'lucide-react'
import ReceiveModal from '../../components/ReceiveModal'
import toast from 'react-hot-toast'

export default function PendingCollections() {
    const [selectedCollection, setSelectedCollection] = useState<Collection | null>(null)

    const { data: pending, isLoading, refetch } = useQuery({
        queryKey: ['pending-collections'],
        queryFn: collectionsApi.getPending,
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

    return (
        <div className="space-y-4">
            <div className="card">
                {isLoading ? (
                    <div className="p-8 text-center text-gray-500">Загрузка...</div>
                ) : pending && pending.length > 0 ? (
                    <div className="divide-y divide-gray-100">
                        {pending.map((collection) => (
                            <div
                                key={collection.id}
                                className="p-4 flex items-center justify-between hover:bg-gray-50"
                            >
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 bg-yellow-100 rounded-xl flex items-center justify-center">
                                        <Clock className="w-6 h-6 text-yellow-600" />
                                    </div>
                                    <div>
                                        <div className="font-medium text-lg">{collection.machine.name}</div>
                                        <div className="text-sm text-gray-500 space-x-2">
                                            <span>📍 {collection.machine.code}</span>
                                            <span>•</span>
                                            <span>👷 {collection.operator.name}</span>
                                        </div>
                                        <div className="text-sm text-gray-500">
                                            ⏰ {format(new Date(collection.collectedAt), 'dd.MM.yyyy HH:mm:ss')}
                                        </div>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setSelectedCollection(collection)}
                                    className="btn btn-primary"
                                >
                                    ✅ Принять
                                </button>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="p-12 text-center">
                        <div className="text-6xl mb-4">✅</div>
                        <div className="text-xl text-gray-600">Нет ожидающих приёма</div>
                        <div className="text-gray-400 mt-2">Все инкассации обработаны</div>
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
        </div>
    )
}
