import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { usersApi, invitesApi } from '../api/users'
import { User } from '../api/auth'
import { Plus, Edit, X, Check, XCircle, Copy, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { format } from 'date-fns'

export default function Users() {
  const queryClient = useQueryClient()
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [inviteLink, setInviteLink] = useState('')
  const [showInactive, setShowInactive] = useState(false)

  const { data: users, isLoading: usersLoading } = useQuery({
    queryKey: ['users', showInactive],
    queryFn: () => usersApi.getAll(undefined, showInactive),
  })

  const { data: pendingInvites } = useQuery({
    queryKey: ['pending-invites'],
    queryFn: invitesApi.getPending,
  })

  const { register, handleSubmit, reset } = useForm<{ name: string; phone: string }>()

  const botUsername = import.meta.env.VITE_TELEGRAM_BOT_USERNAME || 'VendCashBot'

  const createInviteMutation = useMutation({
    mutationFn: invitesApi.create,
    onSuccess: (invite) => {
      queryClient.invalidateQueries({ queryKey: ['pending-invites'] })
      const link = `https://t.me/${botUsername}?start=invite_${invite.code}`
      setInviteLink(link)
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Ошибка')
    },
  })

  const deleteInviteMutation = useMutation({
    mutationFn: invitesApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-invites'] })
      toast.success('Приглашение удалено')
    },
  })

  const updateUserMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<User> }) =>
      usersApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      toast.success('Пользователь обновлён')
      closeEditModal()
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Ошибка')
    },
  })

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      isActive ? usersApi.activate(id) : usersApi.deactivate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      toast.success('Статус изменён')
    },
  })

  const openEditModal = (user: User) => {
    setEditingUser(user)
    reset({ name: user.name, phone: user.phone || '' })
    setShowEditModal(true)
  }

  const closeEditModal = () => {
    setShowEditModal(false)
    setEditingUser(null)
    reset()
  }

  const onSubmit = (data: { name: string; phone: string }) => {
    if (editingUser) {
      updateUserMutation.mutate({ id: editingUser.id, data })
    }
  }

  const copyInviteLink = () => {
    navigator.clipboard.writeText(inviteLink)
    toast.success('Ссылка скопирована')
  }

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'admin':
        return <span className="badge badge-info">👑 Админ</span>
      case 'manager':
        return <span className="badge badge-success">📊 Менеджер</span>
      case 'operator':
        return <span className="badge badge-warning">👷 Оператор</span>
      default:
        return null
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">👥 Сотрудники</h1>
        <button
          onClick={() => setShowInviteModal(true)}
          className="btn btn-primary flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Пригласить
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
          <span className="text-sm">Показать неактивных</span>
        </label>
      </div>

      {/* Users Table */}
      <div className="card overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Имя</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Роль</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Telegram</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Статус</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Действия</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {usersLoading ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                  Загрузка...
                </td>
              </tr>
            ) : (
              users?.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{user.name}</td>
                  <td className="px-4 py-3">{getRoleBadge(user.role)}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {user.telegramUsername ? `@${user.telegramUsername}` : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {user.isActive ? (
                      <span className="badge badge-success">✅ Активен</span>
                    ) : (
                      <span className="badge badge-danger">❌ Неактивен</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openEditModal(user)}
                        className="p-2 text-gray-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      {user.role !== 'admin' && (
                        <button
                          onClick={() =>
                            toggleActiveMutation.mutate({
                              id: user.id,
                              isActive: !user.isActive,
                            })
                          }
                          className={`p-2 rounded-lg ${
                            user.isActive
                              ? 'text-red-500 hover:bg-red-50'
                              : 'text-green-500 hover:bg-green-50'
                          }`}
                        >
                          {user.isActive ? (
                            <XCircle className="w-4 h-4" />
                          ) : (
                            <Check className="w-4 h-4" />
                          )}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pending Invites */}
      {pendingInvites && pendingInvites.length > 0 && (
        <div className="card overflow-hidden">
          <div className="p-4 border-b border-gray-200">
            <h2 className="font-semibold">📨 Ожидающие приглашения</h2>
          </div>
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Роль</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Создано</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Истекает</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pendingInvites.map((invite) => (
                <tr key={invite.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">{getRoleBadge(invite.role)}</td>
                  <td className="px-4 py-3 text-sm">
                    {format(new Date(invite.createdAt), 'dd.MM HH:mm')}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {format(new Date(invite.expiresAt), 'dd.MM HH:mm')}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          const link = `https://t.me/${botUsername}?start=invite_${invite.code}`
                          navigator.clipboard.writeText(link)
                          toast.success('Ссылка скопирована')
                        }}
                        className="p-2 text-primary-600 hover:bg-primary-50 rounded-lg"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => deleteInviteMutation.mutate(invite.id)}
                        className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="font-semibold text-lg">
                {inviteLink ? '✅ Ссылка создана!' : '📨 Пригласить сотрудника'}
              </h2>
              <button
                onClick={() => {
                  setShowInviteModal(false)
                  setInviteLink('')
                }}
                className="p-1 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4">
              {!inviteLink ? (
                <div className="space-y-4">
                  <p className="text-gray-600">Выберите роль:</p>
                  <div className="space-y-3">
                    <button
                      onClick={() => createInviteMutation.mutate('operator')}
                      disabled={createInviteMutation.isPending}
                      className="w-full p-4 border border-gray-200 rounded-lg hover:bg-gray-50 text-left"
                    >
                      <div className="font-medium">👷 Оператор</div>
                      <div className="text-sm text-gray-500">Отмечает сбор в Telegram</div>
                    </button>
                    <button
                      onClick={() => createInviteMutation.mutate('manager')}
                      disabled={createInviteMutation.isPending}
                      className="w-full p-4 border border-gray-200 rounded-lg hover:bg-gray-50 text-left"
                    >
                      <div className="font-medium">📊 Менеджер</div>
                      <div className="text-sm text-gray-500">
                        Принимает инкассации, просматривает отчёты
                      </div>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-gray-600">Отправьте эту ссылку сотруднику:</p>
                  <div className="p-3 bg-gray-50 rounded-lg break-all font-mono text-sm">
                    {inviteLink}
                  </div>
                  <button onClick={copyInviteLink} className="btn btn-primary w-full">
                    📋 Копировать
                  </button>
                  <p className="text-sm text-gray-500 text-center">
                    ⏰ Ссылка действует 24 часа
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {showEditModal && editingUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="font-semibold text-lg">✏️ Редактировать</h2>
              <button onClick={closeEditModal} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="p-4 space-y-4">
              <div className="text-sm text-gray-500 space-y-1">
                <div>
                  👤 Telegram:{' '}
                  {editingUser.telegramUsername ? `@${editingUser.telegramUsername}` : '—'}
                </div>
                <div>🎭 Роль: {editingUser.role} (изменить нельзя)</div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Имя</label>
                <input className="input" {...register('name')} />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Телефон</label>
                <input
                  className="input"
                  placeholder="+998 90 123 45 67"
                  {...register('phone')}
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={closeEditModal} className="btn btn-secondary flex-1">
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={updateUserMutation.isPending}
                  className="btn btn-primary flex-1"
                >
                  {updateUserMutation.isPending ? 'Сохранение...' : '💾 Сохранить'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
