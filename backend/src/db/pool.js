'use strict';
const { Pool } = require('pg');
const config = require('../config');
const logger = require('../utils/logger');

if (!config.databaseUrl) {
  logger.warn('DATABASE_URL не задан — запросы к базе будут падать. Скопируйте .env.example в .env.');
}

const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => logger.error('Ошибка простаивающего соединения с БД:', err.message));

/** Выполнить запрос. Возвращает результат pg. */
async function query(text, params) {
  const started = Date.now();
  const res = await pool.query(text, params);
  const ms = Date.now() - started;
  if (ms > 500) logger.warn(`Медленный запрос (${ms} мс): ${text.slice(0, 80)}`);
  return res;
}

/** Выполнить набор запросов в одной транзакции. */
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function closePool() {
  await pool.end();
}

module.exports = { pool, query, withTransaction, closePool };
