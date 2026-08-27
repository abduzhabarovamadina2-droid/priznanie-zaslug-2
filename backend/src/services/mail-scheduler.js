'use strict';
const mail = require('./mail.service');
const mailConfig = require('../config/mail');
const logger = require('../utils/logger');

/**
 * Планировщик рассылки.
 *
 * Раньше очередь писем разбиралась только вручную — запросом
 * POST /api/notifications/flush. Значит, письмо уходило, лишь если кто-то
 * про него вспомнил. Теперь очередь разбирается сама, с заданным шагом.
 *
 * Отдельного планировщика (cron, очередь задач) намеренно не заводим: одна
 * задача с интервалом в несколько минут не требует инфраструктуры, а лишняя
 * зависимость в банковском контуре — это лишнее согласование.
 *
 * Ручной маршрут остаётся: он нужен, чтобы разобрать очередь немедленно,
 * не дожидаясь следующего срабатывания.
 */
const INTERVAL_MS = Number(process.env.MAIL_INTERVAL_MIN || 5) * 60 * 1000;
const ENABLED = String(process.env.MAIL_SCHEDULER || '1') === '1';

let timer = null;
let running = false;      // защита от наложения: разбор может идти дольше шага

async function tick() {
  if (running) {
    logger.warn('Рассылка: предыдущий разбор очереди ещё идёт, пропускаю такт');
    return;
  }
  running = true;
  try {
    const stats = await mail.flushQueue();
    // Молчим, когда очередь пуста: иначе журнал сервера забьётся пустыми
    // строками раз в несколько минут.
    if (stats.taken > 0) {
      logger.info(`Рассылка (${stats.mode}): взято ${stats.taken}, отправлено ${stats.sent}, ошибок ${stats.failed}`);
    }
  } catch (e) {
    logger.error('Рассылка: разбор очереди прерван — ' + e.message);
  } finally {
    running = false;
  }
}

function start() {
  if (!ENABLED) {
    logger.info('Рассылка: планировщик отключён (MAIL_SCHEDULER=0)');
    return null;
  }
  if (timer) return timer;

  timer = setInterval(tick, INTERVAL_MS);
  timer.unref();          // таймер не держит процесс при остановке сервера

  const minutes = Math.round(INTERVAL_MS / 60000);
  logger.info(`Рассылка: очередь разбирается каждые ${minutes} мин`
    + (mailConfig.enabled ? '' : ' (режим журнала — письма никуда не уходят)'));
  return timer;
}

function stop() {
  if (timer) { clearInterval(timer); timer = null; }
}

module.exports = { start, stop, tick, INTERVAL_MS, ENABLED };
