require('dotenv').config({ quiet: true });

const env = process.env.NODE_ENV || 'development';

const config = {
  env,
  port: Number(process.env.PORT) || 4000,
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '30d',
  // Uploaded audio is stored here. On hosts with temporary disks, point this at a persistent volume.
  mediaDir: process.env.MEDIA_DIR || require('path').join(__dirname, '..', 'media'),
  corsOrigins: (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
};

if (!config.databaseUrl) {
  throw new Error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
}
if (!config.jwtSecret || config.jwtSecret.length < 32) {
  if (env === 'production') {
    throw new Error('JWT_SECRET must be set to a random string of at least 32 characters.');
  }
  config.jwtSecret = config.jwtSecret || 'dev-only-secret-do-not-use-in-production-0000';
}

module.exports = config;
