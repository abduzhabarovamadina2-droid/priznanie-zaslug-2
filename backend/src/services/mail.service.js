'use strict';
const nodemailer = require('nodemailer');
const config = require('../config/mail');
const repo = require('../repositories/notifications.repo');
const logger = require('../utils/logger');

let transport = null;

/** Транспорт создаём один раз и только если почта настроена. */
function getTransport() {
  if (!config.enabled) return null;
  if (transport) return transport;
  transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.user ? { user: config.user, pass: config.pass } : undefined,
  });
  return transport;
}

/**
 * Отправка одного письма.
 *
 * Пока MAIL_HOST не задан, письмо не уходит никуда — только в лог. Это не
 * «заглушка ради вида»: очередь, отметки об отправке и счётчик попыток
 * работают по-настоящему, меняется лишь последний шаг.
 */
async function deliver(note) {
  const to = config.redirectTo || note.email;
  if (!to) throw new Error('Адрес получателя не указан');

  const subject = note.title;
  const text = [note.text, note.request_no ? `\nЗаявка: ${note.request_no}` : '']
    .filter(Boolean).join('\n');

  const t = getTransport();
  if (!t) {
    logger.info(`[почта: режим журнала] кому: ${to} | тема: ${subject}`);
    return { mode: 'log' };
  }

  await t.sendMail({ from: config.from, to, subject, text });
  return { mode: 'smtp' };
}

/**
 * Разбор очереди: берём неотправленные письма и пробуем доставить.
 * Ошибка одного письма не останавливает остальные — она записывается
 * в send_error, а счётчик попыток не даёт долбиться в упавший сервер вечно.
 */
async function flushQueue({ limit } = {}) {
  const batch = await repo.pending(limit || config.batchSize, config.maxAttempts);
  const stats = { taken: batch.length, sent: 0, failed: 0, mode: config.enabled ? 'smtp' : 'log' };

  for (const note of batch) {
    try {
      await deliver(note);
      await repo.markSent(note.id);
      stats.sent += 1;
    } catch (e) {
      await repo.markFailed(note.id, e.message);
      stats.failed += 1;
      logger.error(`Письмо ${note.id} не отправлено: ${e.message}`);
    }
  }
  return stats;
}

module.exports = { deliver, flushQueue, isEnabled: () => config.enabled };
