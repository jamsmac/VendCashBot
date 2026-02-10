import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import * as cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { createLogger } from './config/logger.config';

async function bootstrap() {
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
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: [
            "'self'",
            "'unsafe-inline'",
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

  // CORS — support multiple origins separated by commas
  const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173')
    .split(',')
    .map(origin => origin.trim());
  app.enableCors({
    origin: allowedOrigins.length === 1 ? allowedOrigins[0] : allowedOrigins,
    credentials: true,
  });

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
