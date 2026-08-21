'use strict';
require('dotenv').config();

const required = ['DATABASE_URL'];
const missing = required.filter((k) => !process.env[k]);

const config = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 4000,
  databaseUrl: process.env.DATABASE_URL || '',
  jwtSecret: process.env.JWT_SECRET || '',
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
