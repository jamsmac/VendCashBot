import { DataSource } from 'typeorm';
import { User, UserRole } from './modules/users/entities/user.entity';
import { Machine } from './modules/machines/entities/machine.entity';
import * as winston from 'winston';
import 'dotenv/config';

/**
 * QA-003: Standalone Winston logger for seed script.
 * Uses JSON format in production, pretty print in development.
 */
const isProduction = process.env.NODE_ENV === 'production';
const logger = winston.createLogger({
  level: 'info',
  format: isProduction
    ? winston.format.combine(winston.format.timestamp(), winston.format.json())
    : winston.format.combine(
        winston.format.colorize(),
        winston.format.simple(),
      ),
  transports: [new winston.transports.Console()],
});

// Support DATABASE_URL (Railway) or individual DB_* env vars
const dbConfig = process.env.DATABASE_URL
  ? {
      type: 'postgres' as const,
      url: process.env.DATABASE_URL,
      ssl: isProduction
        ? { rejectUnauthorized: !!process.env.DATABASE_CA_CERT }
        : false,
    }
  : {
      type: 'postgres' as const,
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      username: process.env.DB_USERNAME || 'vendcash',
      password: process.env.DB_PASSWORD || 'vendcash',
      database: process.env.DB_DATABASE || 'vendcash',
    };

const dataSource = new DataSource({
  ...dbConfig,
  entities: [User, Machine],
  synchronize: false,
});

const machines = [
  { code: '5b7b181f0000', name: 'Кардиология КПП' },
  { code: '6620191f0000', name: 'Кардиология 2 корпус' },
  { code: 'a7ca181f0000', name: 'KIUT CLINIC' },
  { code: '3266181f0000', name: 'American Hospital' },
  { code: '4f9c181f0000', name: 'Grand clinic' },
  { code: '72ac181f0000', name: 'Soliq Yashnobod' },
  { code: '9457181f0000', name: 'KIUT M corp' },
  { code: '2c67181f0000', name: 'SOLIQ OLMAZOR' },
  { code: '1dce181f0000', name: 'KIMYO' },
  { code: '24a8181f0000', name: 'Parus F4' },
  { code: '4eaf181f0000', name: 'Parus F1' },
  { code: 'c7a6181f0000', name: 'DUNYO Supermarket' },
  { code: '17b7181f0000', name: 'ZIYO market' },
];

async function seed() {
  logger.info('Starting seed', { action: 'seed_start' });

  await dataSource.initialize();
  logger.info('Database connected', { action: 'db_connected' });

  const userRepository = dataSource.getRepository(User);
  const machineRepository = dataSource.getRepository(Machine);

  // Create admin user
  const adminTelegramId = process.env.ADMIN_TELEGRAM_ID;
  if (!adminTelegramId) {
    logger.error('ADMIN_TELEGRAM_ID is required', { action: 'seed_error' });
    process.exit(1);
  }

  const existingAdmin = await userRepository.findOne({
    where: { telegramId: parseInt(adminTelegramId, 10) },
  });

  if (!existingAdmin) {
    const admin = userRepository.create({
      telegramId: parseInt(adminTelegramId, 10),
      name: process.env.ADMIN_NAME || 'Администратор',
      role: UserRole.ADMIN,
      isActive: true,
    });
    await userRepository.save(admin);
    logger.info('Admin user created', { action: 'admin_created', name: admin.name, telegramId: admin.telegramId });
  } else {
    logger.info('Admin user already exists', { action: 'admin_exists', name: existingAdmin.name });
  }

  // Create machines
  for (const machineData of machines) {
    const existing = await machineRepository.findOne({
      where: { code: machineData.code },
    });

    if (!existing) {
      const machine = machineRepository.create({
        code: machineData.code,
        name: machineData.name,
        isActive: true,
      });
      await machineRepository.save(machine);
      logger.info('Machine created', { action: 'machine_created', name: machine.name, code: machine.code });
    } else {
      logger.info('Machine already exists', { action: 'machine_exists', name: existing.name, code: existing.code });
    }
  }

  logger.info('Seed completed', { action: 'seed_complete' });
  await dataSource.destroy();
}

seed().catch((error) => {
  logger.error('Seed failed', { action: 'seed_failed', error: error.message, stack: error.stack });
  process.exit(1);
});
