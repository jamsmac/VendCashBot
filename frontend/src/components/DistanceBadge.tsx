import { DISTANCE_WARNING_THRESHOLD } from '../api/collections'
import { MapPin } from 'lucide-react'

interface DistanceBadgeProps {
  distance?: number
  /** Show compact version (just icon + meters) */
  compact?: boolean
}

/**
 * Displays operator's distance from machine at collection time.
 * Green if within threshold, red/warning if too far.
 */
export default function DistanceBadge({ distance, compact = false }: DistanceBadgeProps) {
  if (distance == null) return null

  const rounded = Math.round(distance)
  const isFar = distance > DISTANCE_WARNING_THRESHOLD

  if (compact) {
    return (
      <span
        className={`inline-flex items-center gap-1 text-xs font-medium ${
          isFar
            ? 'text-red-600 dark:text-red-400'
            : 'text-green-600 dark:text-green-400'
        }`}
        title={`Оператор находился в ${rounded} м от автомата`}
      >
        <MapPin className="w-3 h-3" />
        {rounded} м
        {isFar && ' ⚠️'}
      </span>
    )
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${
        isFar
          ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
          : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
      }`}
      title={
        isFar
          ? `Оператор был в ${rounded} м от автомата — далеко!`
          : `Оператор был в ${rounded} м от автомата`
      }
    >
      <MapPin className="w-3 h-3" />
      {rounded} м
      {isFar && ' ⚠️'}
    </span>
  )
}
