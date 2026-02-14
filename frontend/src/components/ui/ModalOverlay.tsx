import { useEffect, useRef, useCallback, ReactNode } from 'react'

interface ModalOverlayProps {
  children: ReactNode
  onClose: () => void
  /** Disable closing via Escape (e.g. during form submission) */
  disableClose?: boolean
  className?: string
}

/**
 * Accessible modal overlay with:
 * - Escape key handler (FE-005)
 * - Focus trap (FE-002 / WCAG 2.1)
 * - Click-outside-to-close
 * - aria-modal, role="dialog"
 * - Dark mode support (FE-003)
 */
export default function ModalOverlay({
  children,
  onClose,
  disableClose = false,
  className = '',
}: ModalOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  // Escape key handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !disableClose) {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose, disableClose])

  // Focus trap
  useEffect(() => {
    const content = contentRef.current
    if (!content) return

    const focusableSelector =
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    const focusableElements = content.querySelectorAll<HTMLElement>(focusableSelector)
    const firstFocusable = focusableElements[0]
    const lastFocusable = focusableElements[focusableElements.length - 1]

    // Focus first focusable element
    firstFocusable?.focus()

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return

      if (e.shiftKey) {
        if (document.activeElement === firstFocusable) {
          e.preventDefault()
          lastFocusable?.focus()
        }
      } else {
        if (document.activeElement === lastFocusable) {
          e.preventDefault()
          firstFocusable?.focus()
        }
      }
    }

    content.addEventListener('keydown', handleTab)
    return () => content.removeEventListener('keydown', handleTab)
  }, [])

  // Prevent body scroll while modal is open
  useEffect(() => {
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = originalOverflow
    }
  }, [])

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === overlayRef.current && !disableClose) {
        onClose()
      }
    },
    [onClose, disableClose],
  )

  return (
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      className={`fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 ${className}`}
      onClick={handleOverlayClick}
    >
      <div ref={contentRef}>{children}</div>
    </div>
  )
}
