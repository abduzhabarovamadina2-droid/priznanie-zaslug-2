'use strict';
require('dotenv').config();

const required = ['DATABASE_URL'];
const missing = required.filter((k) => !process.env[k]);

// JWT_SECRET обязателен в production: без него подписывать токены нечем.
// В development сервер поднимется, но вход будет отвечать 503 — слабое
// значение по умолчанию намеренно не подставляем.
if ((process.env.NODE_ENV || 'development') === 'production' && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET обязателен при NODE_ENV=production. Задайте его в .env.');
}

const config = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 4000,
  databaseUrl: process.env.DATABASE_URL || '',
  jwtSecret: process.env.JWT_SECRET || '',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  corsOrigin: (process.env.CORS_ORIGIN || 'http://localhost:8010')
    .split(',').map((s) => s.trim()).filter(Boolean),
  seed: {
    employeesPath: process.env.SEED_EMPLOYEES_PATH || '../employees.json',
    ratingsPath: process.env.SEED_RATINGS_PATH || '../Рейтинг.json',
  },
  missingEnv: missing,
  isProd: (process.env.NODE_ENV || 'development') === 'production',
};

module.exports = config;
