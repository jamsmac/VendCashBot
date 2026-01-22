import { WinstonModule, utilities as nestWinstonModuleUtilities } from 'nest-winston';
import * as winston from 'winston';
import 'winston-daily-rotate-file';

const isProduction = process.env.NODE_ENV === 'production';

// Console transport with colors for development
const consoleTransport = new winston.transports.Console({
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.ms(),
    nestWinstonModuleUtilities.format.nestLike('VendCash', {
      colors: !isProduction,
      prettyPrint: !isProduction,
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
