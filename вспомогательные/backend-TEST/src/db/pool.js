'use strict';
const { Pool } = require('pg');
const config = require('../config');
const logger = require('../utils/logger');

if (!config.databaseUrl) {
  logger.warn('DATABASE_URL не задан — запросы к базе будут падать. Скопируйте .env.example в .env.');
}

/**
 * Подстраховка SSL для облачной базы (Neon и любой другой удалённый хост).
 *
 * Если в строке подключения уже указан sslmode — не вмешиваемся: драйвер
 * разберёт его сам, и явная опция ssl только перекрыла бы намерение автора
 * строки. Вмешиваемся лишь тогда, когда sslmode не указан, а хост не
 * локальный: без TLS такое подключение просто не состоится.
 *
 * Проверка сертификата остаётся включённой. У Neon сертификат публичный и
 * валидный, отключать проверку не нужно и небезопасно.
 */
function resolveSsl(url) {
  if (!url) return undefined;
  if (/[?&]sslmode=/i.test(url)) return undefined;

  let host = '';
  try { host = new URL(url).hostname; } catch { return undefined; }
  if (!host) return undefined;

  const isLocal = ['localhost', '127.0.0.1', '::1', ''].includes(host);
  if (isLocal) return undefined;

  logger.info(`Хост ${host} удалённый, а sslmode в строке не указан — включаем TLS с проверкой сертификата.`);
  return { rejectUnauthorized: true };
}

const sslOption = resolveSsl(config.databaseUrl);

const pool = new Pool({
  connectionString: config.databaseUrl,
  ...(sslOption ? { ssl: sslOption } : {}),
  max: 10,
  idleTimeoutMillis: 30000,
  // Облачная база после простоя просыпается 5-10 секунд: пяти было мало.
  connectionTimeoutMillis: 15000,
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
