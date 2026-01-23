import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
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
  appLogger.log(`DB_HOST: ${process.env.DB_HOST}`);

  // Security headers (must be before CORS)
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https:'],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );

  // Global prefix
  app.setGlobalPrefix('api');

  // CORS
  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
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

  // Swagger
  const config = new DocumentBuilder()
    .setTitle('VendCash API')
    .setDescription('Vending Machine Collection Tracking System API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 3000;

  // Enable graceful shutdown hooks
  app.enableShutdownHooks();

  // Handle SIGTERM for graceful shutdown
  process.on('SIGTERM', async () => {
    appLogger.log('SIGTERM received, shutting down gracefully...');
    await app.close();
    appLogger.log('Application shut down complete');
    process.exit(0);
  });

  // Handle SIGINT for graceful shutdown
  process.on('SIGINT', async () => {
    appLogger.log('SIGINT received, shutting down gracefully...');
    await app.close();
    appLogger.log('Application shut down complete');
    process.exit(0);
  });

  try {
    await app.listen(port, '0.0.0.0');
    appLogger.log(`VendCash API running on port ${port}`);
  } catch (error) {
    appLogger.error('Failed to start application:', error);
    process.exit(1);
  }
}

bootstrap();
