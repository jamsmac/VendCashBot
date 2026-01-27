import { useEffect, useState, useCallback, useRef } from 'react'
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { MapPin, Navigation, Search, Check } from 'lucide-react'

// Fix for default marker icon
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        ready: () => void
        expand: () => void
        close: () => void
        MainButton: {
          text: string
          color: string
          textColor: string
          isVisible: boolean
          isActive: boolean
          isProgressVisible: boolean
          show: () => void
          hide: () => void
          enable: () => void
          disable: () => void
          showProgress: (leaveActive?: boolean) => void
          hideProgress: () => void
          onClick: (callback: () => void) => void
          offClick: (callback: () => void) => void
          setText: (text: string) => void
        }
        sendData: (data: string) => void
        initDataUnsafe?: {
          user?: {
            id: number
            first_name: string
          }
        }
        themeParams?: {
          bg_color?: string
          text_color?: string
          hint_color?: string
          link_color?: string
          button_color?: string
          button_text_color?: string
        }
      }
    }
  }
}

function LocationMarker({
  position,
  setPosition,
}: {
  position: [number, number] | null
  setPosition: (pos: [number, number]) => void
}) {
  useMapEvents({
    click(e) {
      setPosition([e.latlng.lat, e.latlng.lng])
    },
  })

  return position === null ? null : <Marker position={position} />
}

function RecenterMap({ center }: { center: [number, number] }) {
  const map = useMap()
  useEffect(() => {
    map.setView(center, map.getZoom())
  }, [center, map])
  return null
}

export default function TelegramMapPicker() {
  // Default to Tashkent, Uzbekistan
  const defaultCenter: [number, number] = [41.2995, 69.2401]
  const [position, setPosition] = useState<[number, number] | null>(null)
  const [center, setCenter] = useState<[number, number]>(defaultCenter)
  const [address, setAddress] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [isLocating, setIsLocating] = useState(false)
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const telegramApp = window.Telegram?.WebApp

  // Initialize Telegram WebApp
  useEffect(() => {
    if (telegramApp) {
      telegramApp.ready()
      telegramApp.expand()

      // Setup MainButton
      telegramApp.MainButton.setText('Подтвердить')
      telegramApp.MainButton.hide()

      const handleMainButtonClick = () => {
        if (position) {
          const data = JSON.stringify({
            latitude: position[0],
            longitude: position[1],
            address: address || undefined,
          })
          telegramApp.sendData(data)
        }
      }

      telegramApp.MainButton.onClick(handleMainButtonClick)

      return () => {
        telegramApp.MainButton.offClick(handleMainButtonClick)
      }
    }
  }, [telegramApp, position, address])

  // Show/hide MainButton based on position
  useEffect(() => {
    if (telegramApp) {
      if (position) {
        telegramApp.MainButton.show()
        telegramApp.MainButton.enable()
      } else {
        telegramApp.MainButton.hide()
      }
    }
  }, [telegramApp, position])

  // Reverse geocoding
  const reverseGeocode = useCallback(async (lat: number, lng: number) => {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=ru`
      )
      const data = await response.json()
      if (data.display_name) {
        setAddress(data.display_name)
        setSearchQuery(data.display_name)
      }
    } catch (error) {
      console.error('Reverse geocoding error:', error)
    }
  }, [])

  // Handle position change
  const handlePositionChange = useCallback(
    (newPos: [number, number]) => {
      setPosition(newPos)
      setCenter(newPos)
      reverseGeocode(newPos[0], newPos[1])
    },
    [reverseGeocode]
  )

  // Search for address
  const searchAddress = async (query: string) => {
    if (!query.trim()) return

    setIsSearching(true)
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1&accept-language=ru`
      )
      const data = await response.json()
      if (data.length > 0) {
        const { lat, lon, display_name } = data[0]
        const newPos: [number, number] = [parseFloat(lat), parseFloat(lon)]
        setPosition(newPos)
        setCenter(newPos)
        setAddress(display_name)
        setSearchQuery(display_name)
      }
    } catch (error) {
      console.error('Geocoding error:', error)
    } finally {
      setIsSearching(false)
    }
  }

  // Debounced search
  const handleSearchInput = (value: string) => {
    setSearchQuery(value)

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }
    searchTimeoutRef.current = setTimeout(() => {
      if (value.trim().length > 3) {
        searchAddress(value)
      }
    }, 1000)
  }

  // Get current location
  const getCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported')
      return
    }

    setIsLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const newPos: [number, number] = [pos.coords.latitude, pos.coords.longitude]
        handlePositionChange(newPos)
        setIsLocating(false)
      },
      (error) => {
        console.error('Geolocation error:', error)
        setIsLocating(false)
        alert('Could not get location')
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  // Handle confirm for non-Telegram use
  const handleConfirm = () => {
    if (position) {
      const data = JSON.stringify({
        latitude: position[0],
        longitude: position[1],
        address: address || undefined,
      })

      if (telegramApp) {
        telegramApp.sendData(data)
      } else {
        // For testing without Telegram
        console.log('Location data:', data)
        alert(`Location selected:\n${address}\n\nCoordinates: ${position[0].toFixed(6)}, ${position[1].toFixed(6)}`)
      }
    }
  }

  // Get theme colors from Telegram
  const bgColor = telegramApp?.themeParams?.bg_color || '#ffffff'
  const textColor = telegramApp?.themeParams?.text_color || '#000000'
  const hintColor = telegramApp?.themeParams?.hint_color || '#999999'
  const buttonColor = telegramApp?.themeParams?.button_color || '#3b82f6'

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ backgroundColor: bgColor, color: textColor }}
    >
      {/* Header */}
      <div className="p-3 border-b" style={{ borderColor: hintColor + '30' }}>
        <h1 className="text-lg font-semibold text-center">Выберите локацию</h1>
      </div>

      {/* Search */}
      <div className="p-3">
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearchInput(e.target.value)}
            placeholder="Поиск адреса..."
            className="w-full px-4 py-3 pr-20 rounded-xl border focus:outline-none focus:ring-2 focus:ring-blue-500"
            style={{
              backgroundColor: bgColor,
              borderColor: hintColor + '50',
              color: textColor,
            }}
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
            <button
              onClick={() => searchAddress(searchQuery)}
              disabled={isSearching}
              className="p-2 rounded-lg transition-colors"
              style={{ color: buttonColor }}
            >
              <Search className={`w-5 h-5 ${isSearching ? 'animate-pulse' : ''}`} />
            </button>
            <button
              onClick={getCurrentLocation}
              disabled={isLocating}
              className="p-2 rounded-lg transition-colors"
              style={{ color: buttonColor }}
            >
              <Navigation className={`w-5 h-5 ${isLocating ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Map */}
      <div className="flex-1 relative min-h-[300px]">
        <MapContainer
          center={center}
          zoom={13}
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <LocationMarker position={position} setPosition={handlePositionChange} />
          <RecenterMap center={center} />
        </MapContainer>

        {/* Hint */}
        {!position && (
          <div
            className="absolute bottom-4 left-4 right-4 p-3 rounded-xl text-center text-sm"
            style={{
              backgroundColor: bgColor + 'ee',
              color: hintColor,
            }}
          >
            <MapPin className="w-4 h-4 inline-block mr-1" />
            Нажмите на карту для выбора локации
          </div>
        )}
      </div>

      {/* Selected location info */}
      {position && (
        <div className="p-3 border-t" style={{ borderColor: hintColor + '30' }}>
          <div className="flex items-start gap-2">
            <MapPin className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: buttonColor }} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{address || 'Загрузка адреса...'}</p>
              <p className="text-xs" style={{ color: hintColor }}>
                {position[0].toFixed(6)}, {position[1].toFixed(6)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Confirm button (shown when not in Telegram or as fallback) */}
      {position && !telegramApp && (
        <div className="p-3 border-t" style={{ borderColor: hintColor + '30' }}>
          <button
            onClick={handleConfirm}
            className="w-full py-3 px-4 rounded-xl font-medium text-white flex items-center justify-center gap-2"
            style={{ backgroundColor: buttonColor }}
          >
            <Check className="w-5 h-5" />
            Подтвердить
          </button>
        </div>
      )}
    </div>
  )
}
