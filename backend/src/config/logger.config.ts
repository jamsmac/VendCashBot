import { WinstonModule, utilities as nestWinstonModuleUtilities } from 'nest-winston';
import * as winston from 'winston';
import 'winston-daily-rotate-file';

const isProduction = process.env.NODE_ENV === 'production';

/**
 * QA-003: Structured JSON logging configuration.
 *
 * Development: Colored, human-readable console output (NestJS style)
 * Production: JSON format on console (for log aggregators like ELK/Datadog)
 *           + daily rotated JSON log files + separate error log files
 */

// Console transport: pretty in dev, JSON in production
const consoleTransport = new winston.transports.Console({
  format: isProduction
    ? winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json(),
      )
    : winston.format.combine(
        winston.format.timestamp(),
        winston.format.ms(),
        nestWinstonModuleUtilities.format.nestLike('VendCash', {
          colors: true,
          prettyPrint: true,
        }),
      ),
});

// File transport with daily rotation for production
const fileRotateTransport = new winston.transports.DailyRotateFile({
  filename: 'logs/vendcash-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: '20m',
  maxFiles: '14d',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json(),
  ),
});

// Error file transport
const errorFileTransport = new winston.transports.DailyRotateFile({
  filename: 'logs/vendcash-error-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: '20m',
  maxFiles: '30d',
  level: 'error',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json(),
  ),
});

export const createLogger = () => {
  const transports: winston.transport[] = [consoleTransport];

  if (isProduction) {
    transports.push(fileRotateTransport, errorFileTransport);
  }

  return WinstonModule.createLogger({
    level: isProduction ? 'info' : 'debug',
    transports,
  });
};

export const loggerConfig = {
  isProduction,
  level: isProduction ? 'info' : 'debug',
};
