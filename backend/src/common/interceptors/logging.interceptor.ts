import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { v4 as uuidv4 } from 'uuid';

/**
 * QA-003: Structured JSON logging interceptor.
 * Logs HTTP requests with structured metadata instead of string concatenation.
 * Winston's JSON transport will serialize these as proper JSON fields.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest();
    const response = ctx.getResponse();

    // Generate or use existing request ID for log correlation
    const requestId =
      (request.headers?.['x-request-id'] as string) || uuidv4().slice(0, 8);
    request.requestId = requestId;
    response.setHeader?.('X-Request-ID', requestId);

    const { method, url, ip } = request;
    const userId = request.user?.id || 'anon';
    const userAgent = request.headers?.['user-agent'] || '';

    const now = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const { statusCode } = response;
          const duration = Date.now() - now;

          // Structured log: Winston JSON transport will serialize metadata fields
          this.logger.log(
            JSON.stringify({
              requestId,
              method,
              url,
              statusCode,
              duration,
              userId,
              ip,
              userAgent,
            }),
          );
        },
        error: (error) => {
          const duration = Date.now() - now;
          const statusCode = error.status || 500;

          this.logger.error(
            JSON.stringify({
              requestId,
              method,
              url,
              statusCode,
              duration,
              userId,
              ip,
              userAgent,
              error: error.message,
              stack: statusCode >= 500 ? error.stack : undefined,
            }),
          );
        },
      }),
    );
  }
}
