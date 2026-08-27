'use strict';

/**
 * Настройки почты.
 *
 * Пока почтовый сервер банка не назван, модуль работает в режиме журнала:
 * письмо формируется, помечается отправленным и печатается в лог, наружу
 * ничего не уходит. Так поведение системы можно проверить целиком, не
 * рассылая писем живым людям.
 *
 * Как включить настоящую отправку: задать MAIL_HOST в backend/.env.
 * Ничего больше в коде менять не нужно.
 */
const enabled = Boolean(process.env.MAIL_HOST);

module.exports = {
  enabled,
  host: process.env.MAIL_HOST || '',
  port: Number(process.env.MAIL_PORT || 25),
  secure: String(process.env.MAIL_SECURE || '') === '1',
  user: process.env.MAIL_USER || '',
  pass: process.env.MAIL_PASS || '',
  from: process.env.MAIL_FROM || 'Признание заслуг <no-reply@nationalbank.kz>',
  /* Куда слать всё вместо настоящих адресов — для проверки на стенде. */
  redirectTo: process.env.MAIL_REDIRECT_TO || '',
  /* Сколько писем разбирать за один заход очереди. */
  batchSize: Number(process.env.MAIL_BATCH || 20),
  /* Сколько раз пробовать отправить одно письмо, прежде чем сдаться. */
  maxAttempts: Number(process.env.MAIL_MAX_ATTEMPTS || 3),
};
