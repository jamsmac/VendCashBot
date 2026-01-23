const isProduction = process.env.NODE_ENV === 'production';

// Validate required environment variables in production
function requireEnv(name: string, defaultValue?: string): string {
  const value = process.env[name] || defaultValue;
  if (!value && isProduction) {
    throw new Error(`Environment variable ${name} is required in production`);
  }
  return value || '';
}

// Warn about insecure defaults in development
function warnIfDefault(name: string, value: string, defaultValue: string): string {
  if (value === defaultValue && !isProduction) {
    console.warn(`⚠️  Warning: Using default value for ${name}. Set it in .env for security.`);
  }
  return value;
}

export default () => {
  // Critical: JWT secret must be set in production
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret && isProduction) {
    throw new Error('JWT_SECRET is required in production environment');
  }

  // Critical: Telegram bot token must always be set
  const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!telegramBotToken) {
    throw new Error('TELEGRAM_BOT_TOKEN is required');
  }

  return {
    nodeEnv: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT || '3000', 10),
    database: {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      username: process.env.DB_USERNAME || 'vendcash',
      password: warnIfDefault(
        'DB_PASSWORD',
        process.env.DB_PASSWORD || 'vendcash',
        'vendcash',
      ),
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
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
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
