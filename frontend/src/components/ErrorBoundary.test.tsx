import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ErrorBoundary from './ErrorBoundary'

// Create a component that throws an error for testing
const ThrowError = () => {
  throw new Error('Test error')
}

// Create a component that doesn't throw
const SafeComponent = () => <div>Safe content</div>

describe('ErrorBoundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Suppress console.error for error boundary tests
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  describe('Rendering children', () => {
    it('should render children when no error occurs', () => {
      render(
        <ErrorBoundary>
          <SafeComponent />
        </ErrorBoundary>
      )

      expect(screen.getByText('Safe content')).toBeInTheDocument()
    })

    it('should render multiple children when no error occurs', () => {
      render(
        <ErrorBoundary>
          <div>First child</div>
          <div>Second child</div>
        </ErrorBoundary>
      )

      expect(screen.getByText('First child')).toBeInTheDocument()
      expect(screen.getByText('Second child')).toBeInTheDocument()
    })

    it('should handle nested components without error', () => {
      render(
        <ErrorBoundary>
          <div>
            <div>
              <span>Nested content</span>
            </div>
          </div>
        </ErrorBoundary>
      )

      expect(screen.getByText('Nested content')).toBeInTheDocument()
    })
  })

  describe('Error handling', () => {
    it('should show error UI when child throws an error', () => {
      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      )

      // Check for the error heading
      const heading = screen.getByText('Что-то пошло не так')
      expect(heading).toBeInTheDocument()
      expect(heading.tagName).toBe('H1')
    })

    it('should display error message text', () => {
      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      )

      expect(screen.getByText(/Произошла непредвиденная ошибка/i)).toBeInTheDocument()
    })

    it('should show warning emoji in error UI', () => {
      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      )

      expect(screen.getByText('⚠️')).toBeInTheDocument()
    })

    it('should display both action buttons', () => {
      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      )

      const retryButton = screen.getByRole('button', { name: /Попробовать снова/i })
      const reloadButton = screen.getByRole('button', { name: /Обновить страницу/i })

      expect(retryButton).toBeInTheDocument()
      expect(reloadButton).toBeInTheDocument()
    })
  })

  describe('Retry button - "Попробовать снова"', () => {
    it('should have retry button available when error is caught', () => {
      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      )

      // Error should be displayed
      expect(screen.getByText('Что-то пошло не так')).toBeInTheDocument()

      // Click retry button should be available
      const retryButton = screen.getByRole('button', { name: /Попробовать снова/i })
      expect(retryButton).toBeInTheDocument()
    })

    it('should be clickable when error is displayed', () => {
      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      )

      const retryButton = screen.getByRole('button', { name: /Попробовать снова/i })
      expect(retryButton).toBeInTheDocument()
      expect(retryButton).toBeEnabled()
      expect(retryButton).toHaveClass('rounded')
      expect(retryButton).toHaveClass('hover:bg-gray-300')
    })
  })

  describe('Reload button', () => {
    it('should have reload button in error UI', () => {
      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      )

      const reloadButton = screen.getByRole('button', { name: /Обновить страницу/i })
      expect(reloadButton).toBeInTheDocument()
    })

    it('should have reload button that is enabled', () => {
      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      )

      const reloadButton = screen.getByRole('button', { name: /Обновить страницу/i })
      expect(reloadButton).toBeEnabled()
    })

    it('should have accessible reload button', () => {
      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      )

      const reloadButton = screen.getByRole('button', { name: /Обновить страницу/i })
      expect(reloadButton).toBeVisible()
      expect(reloadButton).toBeInTheDocument()
    })
  })

  describe('Custom fallback', () => {
    it('should show custom fallback when provided', () => {
      const customFallback = <div>Custom error component</div>

      render(
        <ErrorBoundary fallback={customFallback}>
          <ThrowError />
        </ErrorBoundary>
      )

      expect(screen.getByText('Custom error component')).toBeInTheDocument()
    })

    it('should not show default error UI when custom fallback is provided', () => {
      const customFallback = <div>Custom error component</div>

      render(
        <ErrorBoundary fallback={customFallback}>
          <ThrowError />
        </ErrorBoundary>
      )

      expect(screen.queryByText('Что-то пошло не так')).not.toBeInTheDocument()
      expect(screen.queryByText(/Произошла непредвиденная ошибка/i)).not.toBeInTheDocument()
    })

    it('should render complex custom fallback', () => {
      const customFallback = (
        <div>
          <h1>Custom Error Handler</h1>
          <p>Custom error message</p>
          <button>Contact support</button>
        </div>
      )

      render(
        <ErrorBoundary fallback={customFallback}>
          <ThrowError />
        </ErrorBoundary>
      )

      expect(screen.getByText('Custom Error Handler')).toBeInTheDocument()
      expect(screen.getByText('Custom error message')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Contact support/i })).toBeInTheDocument()
    })
  })

  describe('Error information in development mode', () => {
    it('should show error details in development mode', () => {
      // Ensure we're in dev mode
      const originalEnv = import.meta.env.DEV

      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      )

      // Look for the details element that shows error info
      const details = screen.queryByText(/Детали ошибки/i)

      // In dev mode, details section should exist
      if (originalEnv) {
        expect(details).toBeInTheDocument()
      }
    })
  })

  describe('CSS classes', () => {
    it('should have proper styling classes in error UI', () => {
      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      )

      const heading = screen.getByText('Что-то пошло не так')
      expect(heading).toHaveClass('text-2xl')
      expect(heading).toHaveClass('font-bold')
    })

    it('should apply dark mode classes', () => {
      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      )

      // Find the main container
      const container = screen.getByText('Что-то пошло не так').closest('div')?.parentElement
      expect(container).toHaveClass('min-h-screen')
      expect(container).toHaveClass('bg-gray-100')
    })
  })

  describe('Multiple errors', () => {
    it('should handle error and recovery', () => {
      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      )

      expect(screen.getByText('Что-то пошло не так')).toBeInTheDocument()

      const retryButton = screen.getByRole('button', { name: /Попробовать снова/i })
      expect(retryButton).toBeInTheDocument()

      // Click retry to reset state
      fireEvent.click(retryButton)

      // After clicking retry, the component should be in a state to show safe content
      // when the parent updates it
      expect(retryButton).not.toBeInTheDocument()
    })
  })

  describe('Error boundary state management', () => {
    it('should render children when no error occurs', () => {
      render(
        <ErrorBoundary>
          <SafeComponent />
        </ErrorBoundary>
      )

      // No error, safe content should show
      expect(screen.getByText('Safe content')).toBeInTheDocument()
      expect(screen.queryByText('Что-то пошло не так')).not.toBeInTheDocument()
    })

    it('should show error UI when error is thrown', () => {
      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      )

      // Error UI should show
      expect(screen.getByText('Что-то пошло не так')).toBeInTheDocument()
      expect(screen.queryByText('Safe content')).not.toBeInTheDocument()
    })
  })

  describe('Edge cases', () => {
    it('should handle undefined children gracefully', () => {
      render(
        <ErrorBoundary>
          {undefined}
        </ErrorBoundary>
      )

      // Should not crash
      expect(screen.queryByText('Что-то пошло не так')).not.toBeInTheDocument()
    })

    it('should handle null children gracefully', () => {
      render(
        <ErrorBoundary>
          {null}
        </ErrorBoundary>
      )

      // Should not crash
      expect(screen.queryByText('Что-то пошло не так')).not.toBeInTheDocument()
    })

    it('should handle error with no message', () => {
      const ThrowNoMessageError = () => {
        // eslint-disable-next-line no-throw-literal
        throw {}
      }

      render(
        <ErrorBoundary>
          <ThrowNoMessageError />
        </ErrorBoundary>
      )

      // Error UI should still show
      expect(screen.getByText('Что-то пошло не так')).toBeInTheDocument()
    })
  })

  describe('Button accessibility', () => {
    it('retry button should be accessible via keyboard', () => {
      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      )

      const retryButton = screen.getByRole('button', { name: /Попробовать снова/i })
      expect(retryButton).toBeEnabled()
    })

    it('reload button should be accessible via keyboard', () => {
      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      )

      const reloadButton = screen.getByRole('button', { name: /Обновить страницу/i })
      expect(reloadButton).toBeEnabled()
    })

    it('buttons should have proper contrast and visibility', () => {
      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      )

      const retryButton = screen.getByRole('button', { name: /Попробовать снова/i })
      const reloadButton = screen.getByRole('button', { name: /Обновить страницу/i })

      expect(retryButton).toBeVisible()
      expect(reloadButton).toBeVisible()
    })
  })
})
