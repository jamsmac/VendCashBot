import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { BaseExceptionFilter } from '@nestjs/core';
import helmet from 'helmet';
import * as cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { createLogger } from './config/logger.config';
import { initSentry, captureException, flushSentry } from './config/sentry.config';

/**
 * Global exception filter that prevents stack traces from leaking in production.
 */
class GlobalExceptionFilter extends BaseExceptionFilter {
  private readonly filterLogger = new Logger('GlobalExceptionFilter');

  catch(exception: unknown, host: import('@nestjs/common').ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();

    if (exception instanceof HttpException) {
      super.catch(exception, host);
      return;
    }

    // Log full error for debugging
    this.filterLogger.error(
      'Unhandled exception:',
      exception instanceof Error ? exception.stack : String(exception),
    );

    // QA-004: Report to Sentry
    captureException(exception, {
      context: 'GlobalExceptionFilter',
      url: ctx.getRequest()?.url,
      method: ctx.getRequest()?.method,
    });

    // Return safe error response without stack trace
    const status = HttpStatus.INTERNAL_SERVER_ERROR;
    response.status(status).json({
      statusCode: status,
      message: 'Internal server error',
      ...(process.env.NODE_ENV !== 'production' && exception instanceof Error
        ? { debug: exception.message }
        : {}),
    });
  }
}

async function bootstrap() {
  // QA-004: Initialize Sentry before anything else
  initSentry();

  const logger = createLogger();

  const app = await NestFactory.create(AppModule, {
    logger,
  });

  const appLogger = new Logger('Bootstrap');

  appLogger.log('Starting VendCash API...');
  appLogger.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  appLogger.log(`PORT: ${process.env.PORT || 3000}`);

  // Security headers (must be before CORS)
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'"],
          scriptSrc: [
            "'self'",
            'https://telegram.org',
            'https://oauth.telegram.org',
          ],
          frameSrc: [
            "'self'",
            'https://telegram.org',
            'https://oauth.telegram.org',
          ],
          connectSrc: ["'self'", 'https://telegram.org'],
          imgSrc: ["'self'", 'data:', 'https:'],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );

  // Cookie parser for httpOnly cookies
  app.use(cookieParser());

  // Global prefix
  app.setGlobalPrefix('api');

  // CORS — support multiple origins separated by commas, reject wildcard
  const rawOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173')
    .split(',')
    .map(origin => origin.trim())
    .filter(origin => origin !== '*'); // Reject wildcard — breaks credentials
  if (rawOrigins.length === 0) {
    appLogger.warn('CORS: No valid origins configured. Defaulting to localhost.');
    rawOrigins.push('http://localhost:5173');
  }
  app.enableCors({
    origin: rawOrigins.length === 1 ? rawOrigins[0] : rawOrigins,
    credentials: true,
  });

  // Global exception filter — prevents stack trace leaks in production (BE-006)
  const httpAdapter = app.getHttpAdapter();
  app.useGlobalFilters(new GlobalExceptionFilter(httpAdapter));

  // Validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Swagger (only in non-production)
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('VendCash API')
      .setDescription('Vending Machine Collection Tracking System API')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = process.env.PORT || 3000;

  // Enable graceful shutdown hooks (handles SIGTERM/SIGINT automatically)
  app.enableShutdownHooks();

  // QA-004: Flush Sentry events on shutdown
  process.on('beforeExit', async () => {
    await flushSentry();
  });

  try {
    await app.listen(port, '0.0.0.0');
    appLogger.log(`VendCash API running on port ${port}`);
  } catch (error) {
    appLogger.error('Failed to start application:');
    appLogger.error(`Error name: ${error?.name}`);
    appLogger.error(`Error message: ${error?.message}`);
    appLogger.error(`Error stack: ${error?.stack}`);
    if (error?.errors) {
      appLogger.error(`Nested errors: ${JSON.stringify(error.errors, null, 2)}`);
    }
    process.exit(1);
  }
}

bootstrap();
