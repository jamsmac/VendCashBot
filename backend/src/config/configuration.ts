const isProduction = process.env.NODE_ENV === 'production';

// Helper for environment variables (used by warnIfDefault and for explicit env access)
function getEnv(name: string, defaultValue?: string): string {
  return process.env[name] ?? defaultValue ?? '';
}

// Warn about insecure defaults in development
function warnIfDefault(name: string, defaultValue: string): string {
  const value = getEnv(name, defaultValue);
  if (value === defaultValue && !isProduction) {
    console.warn(`⚠️  Warning: Using default value for ${name}. Set it in .env for security.`);
  }
  return value;
}

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
      database: url.pathname.slice(1), // Remove leading /
    };
  } catch {
    console.error('Failed to parse DATABASE_URL');
    return null;
  }
}

export default () => {
  // Critical: JWT secret must be set and strong in production
  const jwtSecret = process.env.JWT_SECRET;
  if (isProduction) {
    if (!jwtSecret) {
      throw new Error('JWT_SECRET is required in production environment');
    }
    if (jwtSecret.length < 32) {
      throw new Error('JWT_SECRET must be at least 32 characters long for security');
    }
  }

  // Critical: Telegram bot token must always be set
  const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!telegramBotToken) {
    throw new Error('TELEGRAM_BOT_TOKEN is required');
  }

  // Parse DATABASE_URL if available (Railway provides this)
  const dbFromUrl = parseDatabaseUrl();

  return {
    nodeEnv: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT || '3000', 10),
    database: dbFromUrl || {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      username: process.env.DB_USERNAME || 'vendcash',
      password: warnIfDefault('DB_PASSWORD', 'vendcash'),
      database: process.env.DB_DATABASE || 'vendcash',
    },
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD || undefined,
      ttl: parseInt(process.env.REDIS_TTL || '300', 10), // 5 minutes default
    },
    jwt: {
      secret: jwtSecret || 'dev-only-secret-do-not-use-in-production',
      accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
      refreshDays: parseInt(process.env.JWT_REFRESH_DAYS || '30', 10),
    },
    telegram: {
      botToken: telegramBotToken,
      welcomeImage: process.env.TELEGRAM_WELCOME_IMAGE || '',
    },
    admin: {
      telegramId: parseInt(process.env.ADMIN_TELEGRAM_ID || '0', 10),
      name: process.env.ADMIN_NAME || 'Администратор',
    },
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
    timezone: process.env.TZ || 'Asia/Tashkent',
    // Application settings
    app: {
      maxCollectionAmount: parseInt(process.env.MAX_COLLECTION_AMOUNT || '1000000000', 10),
      inviteExpirationHours: parseInt(process.env.INVITE_EXPIRATION_HOURS || '24', 10),
      duplicateCheckMinutes: parseInt(process.env.DUPLICATE_CHECK_MINUTES || '30', 10),
    },
  };
};
