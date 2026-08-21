'use strict';
const app = require('./app');
const config = require('./config');
const logger = require('./utils/logger');
const { closePool } = require('./db/pool');

const server = app.listen(config.port, () => {
  logger.info(`Backend «Признание заслуг» слушает http://localhost:${config.port}`);
  logger.info(`Окружение: ${config.env}`);
  logger.info(`Проверка: http://localhost:${config.port}/api/health`);
  if (config.missingEnv.length) {
    logger.warn(`Не заданы переменные окружения: ${config.missingEnv.join(', ')}. Скопируйте .env.example в .env.`);
  }
});

async function shutdown(signal) {
  logger.info(`Получен ${signal}, останавливаемся…`);
  server.close(async () => {
    try { await closePool(); } catch { /* пул мог быть не открыт */ }
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}

['SIGINT', 'SIGTERM'].forEach((s) => process.on(s, () => shutdown(s)));

module.exports = server;
