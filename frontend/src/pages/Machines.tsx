import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { machinesApi, Machine } from '../api/machines'
import { Plus, Edit, X, Check, XCircle } from 'lucide-react'
import toast from 'react-hot-toast'

interface MachineForm {
  code: string
  name: string
  location?: string
  isActive: boolean
}

export default function Machines() {
  const queryClient = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [editingMachine, setEditingMachine] = useState<Machine | null>(null)
  const [showInactive, setShowInactive] = useState(false)

  const { data: machines, isLoading } = useQuery({
    queryKey: ['machines', showInactive],
    queryFn: () => machinesApi.getAll(!showInactive),
  })

  const { register, handleSubmit, reset, formState: { errors } } = useForm<MachineForm>()

  const createMutation = useMutation({
    mutationFn: machinesApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['machines'] })
      toast.success('Автомат создан')
      closeModal()
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Ошибка')
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Machine> }) =>
      machinesApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['machines'] })
      toast.success('Автомат обновлён')
      closeModal()
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Ошибка')
    },
  })

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      isActive ? machinesApi.activate(id) : machinesApi.deactivate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['machines'] })
      toast.success('Статус изменён')
    },
  })

  const openModal = (machine?: Machine) => {
    setEditingMachine(machine || null)
    if (machine) {
      reset({
        code: machine.code,
        name: machine.name,
        location: machine.location || '',
        isActive: machine.isActive,
      })
    } else {
      reset({ code: '', name: '', location: '', isActive: true })
    }
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setEditingMachine(null)
    reset()
  }

  const onSubmit = (data: MachineForm) => {
    // Convert isActive from string to boolean (radio buttons send strings)
    const formData = {
      ...data,
      isActive: data.isActive === true || data.isActive === 'true' as unknown as boolean,
    }
    if (editingMachine) {
      updateMutation.mutate({ id: editingMachine.id, data: formData })
    } else {
      createMutation.mutate(formData)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">🏧 Автоматы</h1>
        <button onClick={() => openModal()} className="btn btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Добавить
        </button>
      </div>

      {/* Filters */}
      <div className="card p-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          />
          <span className="text-sm">Показать неактивные</span>
        </label>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Код</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Название</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Адрес</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Статус</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Действия</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                  Загрузка...
                </td>
              </tr>
            ) : machines?.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                  Нет автоматов
                </td>
              </tr>
            ) : (
              machines?.map((machine) => (
                <tr key={machine.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-sm">{machine.code}</td>
                  <td className="px-4 py-3 font-medium">{machine.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{machine.location || '—'}</td>
                  <td className="px-4 py-3">
                    {machine.isActive ? (
                      <span className="badge badge-success">✅ Активен</span>
                    ) : (
                      <span className="badge badge-danger">❌ Неактивен</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openModal(machine)}
                        className="p-2 text-gray-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() =>
                          toggleActiveMutation.mutate({
                            id: machine.id,
                            isActive: !machine.isActive,
                          })
                        }
                        className={`p-2 rounded-lg ${
                          machine.isActive
                            ? 'text-red-500 hover:bg-red-50'
                            : 'text-green-500 hover:bg-green-50'
                        }`}
                      >
                        {machine.isActive ? (
                          <XCircle className="w-4 h-4" />
                        ) : (
                          <Check className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="font-semibold text-lg">
                {editingMachine ? '✏️ Редактировать автомат' : '🏧 Добавить автомат'}
              </h2>
              <button onClick={closeModal} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">
                  Серийный номер (код) <span className="text-red-500">*</span>
                </label>
                <input
                  className="input"
                  placeholder="5b7b181f0000"
                  {...register('code', { required: 'Обязательное поле' })}
                />
                {errors.code && (
                  <p className="text-red-500 text-sm mt-1">{errors.code.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  Название <span className="text-red-500">*</span>
                </label>
                <input
                  className="input"
                  placeholder="Кардиология КПП"
                  {...register('name', { required: 'Обязательное поле' })}
                />
                {errors.name && (
                  <p className="text-red-500 text-sm mt-1">{errors.name.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Адрес/Локация</label>
                <textarea
                  className="input min-h-[80px] resize-none"
                  placeholder="ул. Осиё, 4"
                  {...register('location')}
                />
              </div>

              {editingMachine && (
                <div>
                  <label className="block text-sm font-medium mb-2">Статус</label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        value="true"
                        {...register('isActive')}
                        defaultChecked={editingMachine.isActive}
                        className="text-primary-600"
                      />
                      <span>Активен</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        value="false"
                        {...register('isActive')}
                        defaultChecked={!editingMachine.isActive}
                        className="text-primary-600"
                      />
                      <span>Неактивен</span>
                    </label>
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={closeModal} className="btn btn-secondary flex-1">
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="btn btn-primary flex-1"
                >
                  {createMutation.isPending || updateMutation.isPending
                    ? 'Сохранение...'
                    : '💾 Сохранить'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
