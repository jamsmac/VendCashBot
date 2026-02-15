import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import {
  machinesApi,
  Machine,
  CreateMachineData,
  UpdateMachineData,
  CreateMachineLocationData,
} from '../api/machines'
import {
  Plus,
  Edit,
  X,
  Check,
  XCircle,
  MapPin,
  History,
  Trash2,
  Star,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { getErrorMessage } from '../utils/getErrorMessage'
import MapPicker from '../components/MapPicker'

interface MachineForm {
  code: string
  name: string
  location: string
  isActive: boolean
}

interface LocationForm {
  address: string
  validFrom: string
  validTo: string
  isCurrent: boolean
}

export default function Machines() {
  const queryClient = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [editingMachine, setEditingMachine] = useState<Machine | null>(null)
  const [showInactive, setShowInactive] = useState(false)
  const [showMap, setShowMap] = useState(false)
  const [selectedCoords, setSelectedCoords] = useState<{ lat?: number; lng?: number }>({})

  // Locations modal state
  const [showLocationsModal, setShowLocationsModal] = useState(false)
  const [selectedMachineForLocations, setSelectedMachineForLocations] = useState<Machine | null>(
    null
  )
  const [showAddLocationForm, setShowAddLocationForm] = useState(false)
  const [locationCoords, setLocationCoords] = useState<{ lat?: number; lng?: number }>({})
  const [showLocationMap, setShowLocationMap] = useState(false)

  const { data: machines, isLoading } = useQuery({
    queryKey: ['machines', showInactive],
    queryFn: ({ signal }) => machinesApi.getAll(!showInactive, signal),
  })

  const { data: locations, isLoading: isLoadingLocations } = useQuery({
    queryKey: ['machine-locations', selectedMachineForLocations?.id],
    queryFn: () =>
      selectedMachineForLocations
        ? machinesApi.getLocations(selectedMachineForLocations.id)
        : Promise.resolve([]),
    enabled: !!selectedMachineForLocations,
  })

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<MachineForm>()
  const locationValue = watch('location')

  const {
    register: registerLocation,
    handleSubmit: handleSubmitLocation,
    reset: resetLocation,
    setValue: setLocationValue,
    formState: { errors: locationErrors },
  } = useForm<LocationForm>()

  const createMutation = useMutation({
    mutationFn: (data: CreateMachineData) => machinesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['machines'] })
      toast.success('Автомат создан')
      closeModal()
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error))
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateMachineData }) =>
      machinesApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['machines'] })
      toast.success('Автомат обновлён')
      closeModal()
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error))
    },
  })

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      isActive ? machinesApi.activate(id) : machinesApi.deactivate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['machines'] })
      toast.success('Статус изменён')
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error, 'Ошибка изменения статуса'))
    },
  })

  // Location mutations
  const addLocationMutation = useMutation({
    mutationFn: ({
      machineId,
      data,
    }: {
      machineId: string
      data: CreateMachineLocationData
    }) => machinesApi.addLocation(machineId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['machine-locations'] })
      toast.success('Адрес добавлен')
      setShowAddLocationForm(false)
      resetLocation()
      setLocationCoords({})
      setShowLocationMap(false)
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error))
    },
  })

  const deleteLocationMutation = useMutation({
    mutationFn: (locationId: string) => machinesApi.deleteLocation(locationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['machine-locations'] })
      toast.success('Адрес удалён')
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error))
    },
  })

  const setCurrentLocationMutation = useMutation({
    mutationFn: (locationId: string) => machinesApi.setCurrentLocation(locationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['machine-locations'] })
      toast.success('Текущий адрес изменён')
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error))
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
      const lat = machine.latitude != null ? Number(machine.latitude) : undefined
      const lng = machine.longitude != null ? Number(machine.longitude) : undefined
      setSelectedCoords({ lat, lng })
      setShowMap(!!(lat && lng))
    } else {
      reset({ code: '', name: '', location: '', isActive: true })
      setSelectedCoords({})
      setShowMap(false)
    }
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setEditingMachine(null)
    setShowMap(false)
    setSelectedCoords({})
    reset()
  }

  const openLocationsModal = (machine: Machine) => {
    setSelectedMachineForLocations(machine)
    setShowLocationsModal(true)
    setShowAddLocationForm(false)
    resetLocation()
    setLocationCoords({})
    setShowLocationMap(false)
  }

  const closeLocationsModal = () => {
    setShowLocationsModal(false)
    setSelectedMachineForLocations(null)
    setShowAddLocationForm(false)
    resetLocation()
    setLocationCoords({})
    setShowLocationMap(false)
  }

  const handleLocationSelect = useCallback(
    (lat: number, lng: number, address?: string) => {
      setSelectedCoords({ lat, lng })
      if (address) {
        setValue('location', address)
      }
    },
    [setValue]
  )

  const handleAddressChange = useCallback(
    (address: string) => {
      setValue('location', address)
    },
    [setValue]
  )

  const handleLocationFormSelect = useCallback(
    (lat: number, lng: number, address?: string) => {
      setLocationCoords({ lat, lng })
      if (address) {
        setLocationValue('address', address)
      }
    },
    [setLocationValue]
  )

  const handleLocationFormAddressChange = useCallback(
    (address: string) => {
      setLocationValue('address', address)
    },
    [setLocationValue]
  )

  const onSubmit = (data: MachineForm) => {
    const machineData = {
      ...data,
      latitude: selectedCoords.lat,
      longitude: selectedCoords.lng,
    }

    if (editingMachine) {
      updateMutation.mutate({
        id: editingMachine.id,
        data: {
          code: machineData.code,
          name: machineData.name,
          location: machineData.location,
          latitude: machineData.latitude,
          longitude: machineData.longitude,
          isActive: String(machineData.isActive) === 'true',
        },
      })
    } else {
      createMutation.mutate(machineData)
    }
  }

  const onSubmitLocation = (data: LocationForm) => {
    if (!selectedMachineForLocations) return

    addLocationMutation.mutate({
      machineId: selectedMachineForLocations.id,
      data: {
        address: data.address,
        latitude: locationCoords.lat,
        longitude: locationCoords.lng,
        validFrom: data.validFrom,
        validTo: data.validTo || undefined,
        isCurrent: data.isCurrent,
      },
    })
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('ru-RU')
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Автоматы</h1>
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
          <thead className="bg-gray-50 dark:bg-gray-700/50">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400">Код</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400">Название</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400">Адрес</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400">Статус</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400">Действия</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
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
                <tr key={machine.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <td className="px-4 py-3 font-mono text-sm text-gray-900 dark:text-gray-100">{machine.code}</td>
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{machine.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                    <div className="flex items-center gap-1">
                      {machine.latitude && machine.longitude && (
                        <MapPin className="w-3 h-3 text-primary-500" />
                      )}
                      {machine.location || '—'}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {machine.isActive ? (
                      <span className="badge badge-success">Активен</span>
                    ) : (
                      <span className="badge badge-danger">Неактивен</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openModal(machine)}
                        className="p-2 text-gray-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/30 rounded-lg"
                        title="Редактировать"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => openLocationsModal(machine)}
                        className="p-2 text-gray-500 dark:text-gray-400 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/30 rounded-lg"
                        title="История адресов"
                      >
                        <History className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() =>
                          toggleActiveMutation.mutate({
                            id: machine.id,
                            isActive: !machine.isActive,
                          })
                        }
                        disabled={toggleActiveMutation.isPending}
                        className={`p-2 rounded-lg disabled:opacity-50 ${
                          machine.isActive
                            ? 'text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30'
                            : 'text-green-500 hover:bg-green-50 dark:hover:bg-green-900/30'
                        }`}
                        title={machine.isActive ? 'Деактивировать' : 'Активировать'}
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

      {/* Machine Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800 z-10">
              <h2 className="font-semibold text-lg text-gray-900 dark:text-gray-100">
                {editingMachine ? 'Редактировать автомат' : 'Добавить автомат'}
              </h2>
              <button onClick={closeModal} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-500 dark:text-gray-400">
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
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-medium">Текущий адрес</label>
                  <button
                    type="button"
                    onClick={() => setShowMap(!showMap)}
                    className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1"
                  >
                    <MapPin className="w-4 h-4" />
                    {showMap ? 'Скрыть карту' : 'Выбрать на карте'}
                  </button>
                </div>

                {showMap ? (
                  <MapPicker
                    latitude={selectedCoords.lat}
                    longitude={selectedCoords.lng}
                    address={locationValue}
                    onLocationSelect={handleLocationSelect}
                    onAddressChange={handleAddressChange}
                  />
                ) : (
                  <textarea
                    className="input min-h-[80px] resize-none"
                    placeholder="ул. Осиё, 4"
                    {...register('location')}
                  />
                )}

                {selectedCoords.lat != null && selectedCoords.lng != null && !showMap && (
                  <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    Координаты: {Number(selectedCoords.lat).toFixed(6)}, {Number(selectedCoords.lng).toFixed(6)}
                  </p>
                )}
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
                    : 'Сохранить'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Locations History Modal */}
      {showLocationsModal && selectedMachineForLocations && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800 z-10">
              <div>
                <h2 className="font-semibold text-lg text-gray-900 dark:text-gray-100">История адресов</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {selectedMachineForLocations.name} ({selectedMachineForLocations.code})
                </p>
              </div>
              <button onClick={closeLocationsModal} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-500 dark:text-gray-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4">
              {/* Add location form */}
              {showAddLocationForm ? (
                <div className="mb-6 p-4 border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                  <h3 className="font-medium mb-3 text-gray-900 dark:text-gray-100">Добавить адрес</h3>
                  <form onSubmit={handleSubmitLocation(onSubmitLocation)} className="space-y-4">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-sm font-medium">Адрес</label>
                        <button
                          type="button"
                          onClick={() => setShowLocationMap(!showLocationMap)}
                          className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1"
                        >
                          <MapPin className="w-4 h-4" />
                          {showLocationMap ? 'Скрыть карту' : 'Выбрать на карте'}
                        </button>
                      </div>

                      {showLocationMap ? (
                        <MapPicker
                          latitude={locationCoords.lat}
                          longitude={locationCoords.lng}
                          onLocationSelect={handleLocationFormSelect}
                          onAddressChange={handleLocationFormAddressChange}
                        />
                      ) : (
                        <input
                          className="input"
                          placeholder="ул. Осиё, 4"
                          {...registerLocation('address', { required: 'Обязательное поле' })}
                        />
                      )}
                      {locationErrors.address && (
                        <p className="text-red-500 text-sm mt-1">
                          {locationErrors.address.message}
                        </p>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">
                          Дата начала <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="date"
                          className="input"
                          {...registerLocation('validFrom', { required: 'Обязательное поле' })}
                        />
                        {locationErrors.validFrom && (
                          <p className="text-red-500 text-sm mt-1">
                            {locationErrors.validFrom.message}
                          </p>
                        )}
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Дата окончания</label>
                        <input type="date" className="input" {...registerLocation('validTo')} />
                      </div>
                    </div>

                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        {...registerLocation('isCurrent')}
                        className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                      <span className="text-sm">Текущий адрес</span>
                    </label>

                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setShowAddLocationForm(false)
                          resetLocation()
                          setLocationCoords({})
                          setShowLocationMap(false)
                        }}
                        className="btn btn-secondary flex-1"
                      >
                        Отмена
                      </button>
                      <button
                        type="submit"
                        disabled={addLocationMutation.isPending}
                        className="btn btn-primary flex-1"
                      >
                        {addLocationMutation.isPending ? 'Сохранение...' : 'Добавить'}
                      </button>
                    </div>
                  </form>
                </div>
              ) : (
                <button
                  onClick={() => setShowAddLocationForm(true)}
                  className="mb-4 btn btn-primary flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Добавить адрес
                </button>
              )}

              {/* Locations list */}
              {isLoadingLocations ? (
                <p className="text-center text-gray-500 py-4">Загрузка...</p>
              ) : locations?.length === 0 ? (
                <p className="text-center text-gray-500 py-4">Нет адресов</p>
              ) : (
                <div className="space-y-3">
                  {locations?.map((loc) => (
                    <div
                      key={loc.id}
                      className={`p-4 border rounded-lg ${
                        loc.isCurrent ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' : 'border-gray-200 dark:border-gray-600'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            {loc.isCurrent && (
                              <Star className="w-4 h-4 text-primary-500 fill-primary-500" />
                            )}
                            <p className="font-medium text-gray-900 dark:text-gray-100">{loc.address}</p>
                          </div>
                          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                            {formatDate(loc.validFrom)}
                            {loc.validTo ? ` — ${formatDate(loc.validTo)}` : ' — по настоящее время'}
                          </p>
                          {loc.latitude != null && loc.longitude != null && (
                            <p className="text-xs text-gray-400 mt-1">
                              {Number(loc.latitude).toFixed(6)}, {Number(loc.longitude).toFixed(6)}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          {!loc.isCurrent && (
                            <button
                              onClick={() => setCurrentLocationMutation.mutate(loc.id)}
                              className="p-2 text-gray-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/30 rounded-lg"
                              title="Сделать текущим"
                            >
                              <Star className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={() => {
                              if (confirm('Удалить этот адрес?')) {
                                deleteLocationMutation.mutate(loc.id)
                              }
                            }}
                            className="p-2 text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg"
                            title="Удалить"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
