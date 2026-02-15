import 'dotenv/config';
import { DataSource } from 'typeorm';

// Parse DATABASE_URL if provided (Railway/Heroku style)
function parseDatabaseUrl(): { host: string; port: number; username: string; password: string; database: string } | null {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return null;

  try {
    const url = new URL(databaseUrl);
    return {
      host: url.hostname,
      port: parseInt(url.port || '5432', 10),
      username: url.username,
      password: url.password,
      database: url.pathname.slice(1),
    };
  } catch {
    process.stderr.write(JSON.stringify({ timestamp: new Date().toISOString(), level: 'error', context: 'DataSource', message: 'Failed to parse DATABASE_URL' }) + '\n');
    return null;
  }
}

const dbFromUrl = parseDatabaseUrl();
const isProduction = process.env.NODE_ENV === 'production';

const AppDataSource = new DataSource({
  type: 'postgres',
  host: dbFromUrl?.host || process.env.DB_HOST || 'localhost',
  port: dbFromUrl?.port || parseInt(process.env.DB_PORT || '5432', 10),
  username: dbFromUrl?.username || process.env.DB_USERNAME || 'vendcash',
  password: dbFromUrl?.password || process.env.DB_PASSWORD || 'vendcash',
  database: dbFromUrl?.database || process.env.DB_DATABASE || 'vendcash',
  entities: [__dirname + '/../**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/../migrations/*{.ts,.js}'],
  synchronize: false,
  logging: !isProduction,
  ssl: isProduction
    ? {
        rejectUnauthorized: !!process.env.DATABASE_CA_CERT,
        ...(process.env.DATABASE_CA_CERT ? { ca: process.env.DATABASE_CA_CERT } : {}),
      }
    : false,
});

export default AppDataSource;
