export default () => ({
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USERNAME || 'vendcash',
    password: process.env.DB_PASSWORD || 'vendcash',
    database: process.env.DB_DATABASE || 'vendcash',
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'vendcash-super-secret-key-change-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    welcomeImage: process.env.TELEGRAM_WELCOME_IMAGE || '',
  },
  admin: {
    telegramId: parseInt(process.env.ADMIN_TELEGRAM_ID || '0', 10),
    name: process.env.ADMIN_NAME || 'Администратор',
  },
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  timezone: process.env.TZ || 'Asia/Tashkent',
});
