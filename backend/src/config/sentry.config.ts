import * as Sentry from '@sentry/node';
import { Logger } from '@nestjs/common';

const logger = new Logger('Sentry');

/**
 * QA-004: Sentry error monitoring initialization for backend.
 * Initializes Sentry only when SENTRY_DSN is provided.
 * Safe to call even without DSN — becomes a no-op.
 */
export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN;

  if (!dsn) {
    logger.warn('SENTRY_DSN not configured — error monitoring disabled');
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    release: process.env.APP_VERSION || 'vendcash@unknown',

    // Performance monitoring: sample 20% of transactions in production
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,

    // Don't send PII by default
    sendDefaultPii: false,

    // Filter out common noise
    ignoreErrors: [
      'ECONNREFUSED',       // DB/Redis connection refused during startup
      'ECONNRESET',         // Connection resets (client disconnects)
      'EPIPE',              // Broken pipe
    ],

    // Add useful context to every event
    beforeSend(event) {
      // Strip sensitive headers
      if (event.request?.headers) {
        delete event.request.headers['cookie'];
        delete event.request.headers['authorization'];
      }
      return event;
    },
  });

  logger.log('Sentry initialized successfully');
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
 * Flush Sentry events before shutdown.
 * Should be called during graceful shutdown.
 */
export async function flushSentry(timeout = 2000): Promise<void> {
  if (process.env.SENTRY_DSN) {
    await Sentry.close(timeout);
  }
}
