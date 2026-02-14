import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { usersApi, invitesApi, UsersQueryParams } from '../api/users'
import { User } from '../api/auth'
import {
  Plus,
  Edit,
  X,
  Check,
  XCircle,
  Copy,
  Trash2,
  Search,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { getErrorMessage } from '../utils/getErrorMessage'
import { format } from 'date-fns'

const BOT_USERNAME = import.meta.env.VITE_TELEGRAM_BOT_USERNAME || 'vendhubcashbot'
const PAGE_SIZE = 20

export default function Users() {
  const queryClient = useQueryClient()
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [inviteLink, setInviteLink] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchInput, setSearchInput] = useState('')

  const queryParams: UsersQueryParams = {
    page: currentPage,
    limit: PAGE_SIZE,
    includeInactive: showInactive,
    ...(searchQuery ? { search: searchQuery } : {}),
  }

  const { data: usersData, isLoading: usersLoading } = useQuery({
    queryKey: ['users', queryParams],
    queryFn: () => usersApi.getAll(queryParams),
  })

  const users = usersData?.data
  const meta = usersData?.meta

  const { data: pendingInvites } = useQuery({
    queryKey: ['pending-invites'],
    queryFn: invitesApi.getPending,
  })

  const { register, handleSubmit, reset } = useForm<{ name: string; phone: string }>()

  // Reset to page 1 when filters change
  const handleShowInactiveChange = (checked: boolean) => {
    setShowInactive(checked)
    setCurrentPage(1)
  }

  const handleSearch = useCallback(() => {
    setSearchQuery(searchInput)
    setCurrentPage(1)
  }, [searchInput])

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch()
  }

  const clearSearch = () => {
    setSearchInput('')
    setSearchQuery('')
    setCurrentPage(1)
  }

  const createInviteMutation = useMutation({
    mutationFn: invitesApi.create,
    onSuccess: (invite) => {
      queryClient.invalidateQueries({ queryKey: ['pending-invites'] })
      const link = `https://t.me/${BOT_USERNAME}?start=invite_${invite.code}`
      setInviteLink(link)
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error))
    },
  })

  const deleteInviteMutation = useMutation({
    mutationFn: invitesApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-invites'] })
      toast.success('Приглашение удалено')
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error, 'Ошибка удаления'))
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
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error))
    },
  })

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      isActive ? usersApi.activate(id) : usersApi.deactivate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      toast.success('Статус изменён')
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error, 'Ошибка изменения статуса'))
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

      {/* Filters & Search */}
      <div className="card p-4 space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Поиск по имени или Telegram..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              className="input pl-10 pr-8 w-full"
            />
            {searchInput && (
              <button
                onClick={clearSearch}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <button onClick={handleSearch} className="btn btn-secondary">
            Найти
          </button>
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => handleShowInactiveChange(e.target.checked)}
            className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          />
          <span className="text-sm">Показать неактивных</span>
        </label>
      </div>

      {/* Users Table */}
      <div className="card overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-gray-700/50">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400">Имя</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400">Роль</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400">Telegram</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400">Статус</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400">Действия</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {usersLoading ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                  Загрузка...
                </td>
              </tr>
            ) : !users?.length ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                  {searchQuery ? 'Ничего не найдено' : 'Нет пользователей'}
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{user.name}</td>
                  <td className="px-4 py-3">{getRoleBadge(user.role)}</td>
                  <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
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
                        className="p-2 text-gray-500 dark:text-gray-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/30 rounded-lg"
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
                          disabled={toggleActiveMutation.isPending}
                          className={`p-2 rounded-lg disabled:opacity-50 ${
                            user.isActive
                              ? 'text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30'
                              : 'text-green-500 hover:bg-green-50 dark:hover:bg-green-900/30'
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

        {/* Pagination */}
        {meta && meta.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
            <div className="text-sm text-gray-500 dark:text-gray-400">
              Показано {((meta.page - 1) * meta.limit) + 1}–{Math.min(meta.page * meta.limit, meta.total)} из {meta.total}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label="Предыдущая страница"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              {generatePageNumbers(currentPage, meta.totalPages).map((p, i) =>
                p === '...' ? (
                  <span key={`dots-${i}`} className="px-2 text-gray-400">...</span>
                ) : (
                  <button
                    key={p}
                    onClick={() => setCurrentPage(p as number)}
                    className={`w-8 h-8 rounded-lg text-sm font-medium ${
                      currentPage === p
                        ? 'bg-primary-600 text-white'
                        : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                    }`}
                  >
                    {p}
                  </button>
                ),
              )}
              <button
                onClick={() => setCurrentPage((p) => Math.min(meta.totalPages, p + 1))}
                disabled={currentPage === meta.totalPages}
                className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label="Следующая страница"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Pending Invites */}
      {pendingInvites && pendingInvites.length > 0 && (
        <div className="card overflow-hidden">
          <div className="p-4 border-b border-gray-200 dark:border-gray-600">
            <h2 className="font-semibold">📨 Ожидающие приглашения</h2>
          </div>
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700/50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400">Роль</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400">Создано</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400">Истекает</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {pendingInvites.map((invite) => (
                <tr key={invite.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <td className="px-4 py-3">{getRoleBadge(invite.role)}</td>
                  <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                    {format(new Date(invite.createdAt), 'dd.MM HH:mm')}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                    {format(new Date(invite.expiresAt), 'dd.MM HH:mm')}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          const link = `https://t.me/${BOT_USERNAME}?start=invite_${invite.code}`
                          navigator.clipboard.writeText(link)
                          toast.success('Ссылка скопирована')
                        }}
                        className="p-2 text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/30 rounded-lg"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => deleteInviteMutation.mutate(invite.id)}
                        disabled={deleteInviteMutation.isPending}
                        className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg disabled:opacity-50"
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
          <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="font-semibold text-lg">
                {inviteLink ? '✅ Ссылка создана!' : '📨 Пригласить сотрудника'}
              </h2>
              <button
                onClick={() => {
                  setShowInviteModal(false)
                  setInviteLink('')
                }}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4">
              {!inviteLink ? (
                <div className="space-y-4">
                  <p className="text-gray-600 dark:text-gray-300">Выберите роль:</p>
                  <div className="space-y-3">
                    <button
                      onClick={() => createInviteMutation.mutate('operator')}
                      disabled={createInviteMutation.isPending}
                      className="w-full p-4 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 text-left"
                    >
                      <div className="font-medium text-gray-900 dark:text-gray-100">👷 Оператор</div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">Отмечает сбор в Telegram</div>
                    </button>
                    <button
                      onClick={() => createInviteMutation.mutate('manager')}
                      disabled={createInviteMutation.isPending}
                      className="w-full p-4 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 text-left"
                    >
                      <div className="font-medium text-gray-900 dark:text-gray-100">📊 Менеджер</div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        Принимает инкассации, просматривает отчёты
                      </div>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-gray-600 dark:text-gray-300">Отправьте эту ссылку сотруднику:</p>
                  <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg break-all font-mono text-sm text-gray-900 dark:text-gray-100">
                    {inviteLink}
                  </div>
                  <button onClick={copyInviteLink} className="btn btn-primary w-full">
                    📋 Копировать
                  </button>
                  <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
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
          <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="font-semibold text-lg">✏️ Редактировать</h2>
              <button onClick={closeEditModal} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="p-4 space-y-4">
              <div className="text-sm text-gray-500 dark:text-gray-400 space-y-1">
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

/** Generate page number buttons: [1, 2, '...', 5, 6, 7, '...', 10] */
function generatePageNumbers(
  current: number,
  total: number,
): (number | '...')[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1)
  }

  const pages: (number | '...')[] = [1]

  if (current > 3) pages.push('...')

  const start = Math.max(2, current - 1)
  const end = Math.min(total - 1, current + 1)

  for (let i = start; i <= end; i++) {
    pages.push(i)
  }

  if (current < total - 2) pages.push('...')

  pages.push(total)
  return pages
}
