import * as Sentry from '@sentry/react';

/**
 * QA-004: Sentry error monitoring initialization for frontend.
 * Initializes Sentry only when VITE_SENTRY_DSN is provided.
 * Safe to call without DSN — becomes a no-op.
 */
export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN;

  if (!dsn) {
    if (import.meta.env.DEV) {
      console.log('[Sentry] VITE_SENTRY_DSN not set — monitoring disabled');
    }
    return;
  }

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_APP_VERSION || 'vendcash-frontend@unknown',

    // Performance monitoring
    tracesSampleRate: import.meta.env.PROD ? 0.2 : 1.0,

    // Session replay for debugging (1% in production)
    replaysSessionSampleRate: import.meta.env.PROD ? 0.01 : 0,
    replaysOnErrorSampleRate: import.meta.env.PROD ? 0.5 : 0,

    // Filter out common noise
    ignoreErrors: [
      'ResizeObserver loop',          // Benign browser error
      'Network Error',                // Network interruptions
      'AbortError',                   // Cancelled requests (FE-001)
      'CanceledError',                // Axios cancelled requests
      'Non-Error promise rejection',  // Generic promise rejections
      /Loading chunk .* failed/,      // Lazy loading failures (user navigated away)
    ],

    // Don't track localhost
    denyUrls: [/localhost/, /127\.0\.0\.1/],

    beforeSend(event) {
      // Strip auth tokens from breadcrumbs
      if (event.breadcrumbs) {
        event.breadcrumbs = event.breadcrumbs.map((breadcrumb) => {
          if (breadcrumb.data?.url) {
            // Remove query params that might contain tokens
            try {
              const url = new URL(breadcrumb.data.url);
              url.searchParams.delete('token');
              breadcrumb.data.url = url.toString();
            } catch {
              // Not a valid URL, skip
            }
          }
          return breadcrumb;
        });
      }
      return event;
    },
  });
}

/**
 * Capture an exception to Sentry with optional context.
 * Safe to call even when Sentry is not initialized.
 */
export function captureException(
  error: unknown,
  context?: Record<string, unknown>,
): void {
  if (context) {
    Sentry.withScope((scope) => {
      Object.entries(context).forEach(([key, value]) => {
        scope.setExtra(key, value);
      });
      Sentry.captureException(error);
    });
  } else {
    Sentry.captureException(error);
  }
}

/**
 * Set the current user context for Sentry.
 */
export function setSentryUser(user: { id: string; role: string } | null): void {
  if (user) {
    Sentry.setUser({ id: user.id, role: user.role });
  } else {
    Sentry.setUser(null);
  }
}
