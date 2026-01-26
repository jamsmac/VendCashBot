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

    const now = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const { statusCode } = response;
          const duration = Date.now() - now;

          this.logger.log(
            `[${requestId}] ${method} ${url} ${statusCode} ${duration}ms - ${userId} - ${ip}`,
          );
        },
        error: (error) => {
          const duration = Date.now() - now;
          const statusCode = error.status || 500;

          this.logger.error(
            `[${requestId}] ${method} ${url} ${statusCode} ${duration}ms - ${userId} - ${ip} - ${error.message}`,
          );
        },
      }),
    );
  }
}
