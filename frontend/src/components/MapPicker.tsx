import { useEffect, useState, useRef, useCallback } from 'react'
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { MapPin, Navigation, Search } from 'lucide-react'
import * as Sentry from '@sentry/react'

// Fix for default marker icon (Leaflet/Webpack compatibility)
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

interface MapPickerProps {
  latitude?: number
  longitude?: number
  onLocationSelect: (lat: number, lng: number, address?: string) => void
  onAddressChange?: (address: string) => void
  address?: string
}

// Component to handle map click events
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

// Component to recenter map
function RecenterMap({ center }: { center: [number, number] }) {
  const map = useMap()
  useEffect(() => {
    map.setView(center, map.getZoom())
  }, [center, map])
  return null
}

export default function MapPicker({
  latitude,
  longitude,
  onLocationSelect,
  onAddressChange,
  address = '',
}: MapPickerProps) {
  // Default to Tashkent, Uzbekistan
  const defaultCenter: [number, number] = [41.2995, 69.2401]
  // Ensure coordinates are numbers (PostgreSQL decimals come as strings)
  const initialLat = latitude != null ? Number(latitude) : undefined
  const initialLng = longitude != null ? Number(longitude) : undefined
  const hasInitialCoords = initialLat != null && initialLng != null && !isNaN(initialLat) && !isNaN(initialLng)
  const [position, setPosition] = useState<[number, number] | null>(
    hasInitialCoords ? [initialLat!, initialLng!] : null
  )
  const [center, setCenter] = useState<[number, number]>(
    hasInitialCoords ? [initialLat!, initialLng!] : defaultCenter
  )
  const [searchQuery, setSearchQuery] = useState(address)
  const [isSearching, setIsSearching] = useState(false)
  const [isLocating, setIsLocating] = useState(false)
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  // Update parent when position changes
  // Note: onLocationSelect is intentionally excluded from deps to prevent infinite loops
  // when parent doesn't memoize the callback
  useEffect(() => {
    if (position) {
      onLocationSelect(position[0], position[1])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position])

  // Reverse geocoding to get address from coordinates
  const reverseGeocode = useCallback(async (lat: number, lng: number) => {
    // Abort previous in-flight request
    abortControllerRef.current?.abort()
    const controller = new AbortController()
    abortControllerRef.current = controller
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=ru`,
        { signal: controller.signal }
      )
      const data = await response.json()
      if (data.display_name) {
        const address = data.display_name
        setSearchQuery(address)
        onAddressChange?.(address)
      }
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        Sentry.captureException(error, { tags: { component: 'MapPicker' } })
      }
    }
  }, [onAddressChange])

  // Handle position change with reverse geocoding
  const handlePositionChange = useCallback((newPos: [number, number]) => {
    setPosition(newPos)
    setCenter(newPos)
    reverseGeocode(newPos[0], newPos[1])
  }, [reverseGeocode])

  // Search for address (geocoding)
  const searchAddress = async (query: string) => {
    if (!query.trim()) return

    abortControllerRef.current?.abort()
    const controller = new AbortController()
    abortControllerRef.current = controller
    setIsSearching(true)
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1&accept-language=ru`,
        { signal: controller.signal }
      )
      const data = await response.json()
      if (data.length > 0) {
        const { lat, lon, display_name } = data[0]
        const newPos: [number, number] = [parseFloat(lat), parseFloat(lon)]
        setPosition(newPos)
        setCenter(newPos)
        setSearchQuery(display_name)
        onLocationSelect(newPos[0], newPos[1], display_name)
        onAddressChange?.(display_name)
      }
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        Sentry.captureException(error, { tags: { component: 'MapPicker' } })
      }
    } finally {
      setIsSearching(false)
    }
  }

  // Debounced search
  const handleSearchInput = (value: string) => {
    setSearchQuery(value)
    onAddressChange?.(value)

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }
    searchTimeoutRef.current = setTimeout(() => {
      if (value.trim().length > 3) {
        searchAddress(value)
      }
    }, 1000)
  }

  // Cleanup debounce timer and abort in-flight requests on unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
      abortControllerRef.current?.abort()
    }
  }, [])

  // Get current location
  const getCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser')
      return
    }

    setIsLocating(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const newPos: [number, number] = [position.coords.latitude, position.coords.longitude]
        handlePositionChange(newPos)
        setIsLocating(false)
      },
      (error) => {
        Sentry.captureException(error, { tags: { component: 'MapPicker' } })
        setIsLocating(false)
        alert('Could not get your location')
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  return (
    <div className="space-y-3">
      {/* Search input */}
      <div className="relative">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => handleSearchInput(e.target.value)}
          placeholder="Search address or click on map..."
          className="input pr-20"
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
          <button
            type="button"
            onClick={() => searchAddress(searchQuery)}
            disabled={isSearching}
            className="p-1.5 text-gray-500 hover:text-primary-600 hover:bg-primary-50 rounded"
            title="Search"
          >
            <Search className={`w-4 h-4 ${isSearching ? 'animate-pulse' : ''}`} />
          </button>
          <button
            type="button"
            onClick={getCurrentLocation}
            disabled={isLocating}
            className="p-1.5 text-gray-500 hover:text-primary-600 hover:bg-primary-50 rounded"
            title="Use my location"
          >
            <Navigation className={`w-4 h-4 ${isLocating ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Map */}
      <div className="relative h-[300px] rounded-lg overflow-hidden border border-gray-200">
        <MapContainer
          center={center}
          zoom={13}
          style={{ height: '100%', width: '100%' }}
          className="z-0"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <LocationMarker position={position} setPosition={handlePositionChange} />
          <RecenterMap center={center} />
        </MapContainer>

        {/* Hint overlay */}
        {!position && (
          <div className="absolute bottom-3 left-3 right-3 bg-white/90 backdrop-blur-sm p-2 rounded-lg text-center text-sm text-gray-600">
            <MapPin className="w-4 h-4 inline-block mr-1" />
            Click on map to select location
          </div>
        )}
      </div>

      {/* Coordinates display */}
      {position && (
        <div className="text-xs text-gray-500 flex items-center gap-2">
          <MapPin className="w-3 h-3" />
          <span>
            {position[0].toFixed(6)}, {position[1].toFixed(6)}
          </span>
        </div>
      )}
    </div>
  )
}
