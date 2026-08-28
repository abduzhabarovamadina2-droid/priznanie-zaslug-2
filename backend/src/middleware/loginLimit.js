'use strict';
const { query } = require('../db/pool');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

/**
 * Ограничение попыток входа.
 *
 * Счётчик лежит в базе, а не в памяти процесса. В памяти он был дырявым
 * дважды: рестарт сервера обнулял его, а за балансировщиком каждый
 * экземпляр вёл свой счёт — и общий лимит умножался на число экземпляров.
 * База у экземпляров одна, поэтому лимит один на всех и переживает рестарт.
 *
 * Считаем по паре «логин + адрес». Только по адресу — заблокировали бы всех
 * за одним корпоративным шлюзом; только по логину — чужую учётку можно было
 * бы заблокировать нарочно, просто перебирая пароли к ней.
 */
const WINDOW_MIN = Number(process.env.LOGIN_WINDOW_MIN || 15);
const MAX_FAILS = Number(process.env.LOGIN_MAX_FAILS || 5);
const BLOCK_MIN = Number(process.env.LOGIN_BLOCK_MIN || 15);

function keyOf(req) {
  const login = String((req.body && req.body.login) || '').trim().toLowerCase();
  const ip = req.ip || (req.socket && req.socket.remoteAddress) || 'неизвестно';
  return `${login}@${ip}`.slice(0, 320);
}

function minutesLeft(until) {
  return Math.max(1, Math.ceil((new Date(until).getTime() - Date.now()) / 60000));
}

/**
 * Ставится перед контроллером входа: отсекает перебор пароля до того, как
 * запрос дойдёт до проверки в базе.
 *
 * Сбой самой проверки вход не ломает: если счётчик недоступен, человека
 * пускают к обычной проверке пароля. Иначе падение одной таблицы закрыло бы
 * вход всем.
 */
async function guard(req, _res, next) {
  const key = keyOf(req);
  req.loginKey = key;

  try {
    const { rows } = await query(
      `SELECT fails, blocked_until,
              (blocked_until IS NOT NULL AND blocked_until > now()) AS is_blocked
         FROM login_attempts WHERE key = $1`, [key]);
    const rec = rows[0];

    if (rec && rec.is_blocked) {
      return next(new AppError(
        `Слишком много неудачных попыток входа. Повторите через ${minutesLeft(rec.blocked_until)} мин.`,
        429,
        { retry_after_sec: Math.max(1, Math.ceil((new Date(rec.blocked_until).getTime() - Date.now()) / 1000)) }));
    }
    return next();
  } catch (e) {
    logger.error('Счётчик попыток входа недоступен: ' + e.message);
    return next();
  }
}

/**
 * Неудачная попытка.
 *
 * Одним запросом: вставка или обновление. Если прошлая серия старше окна —
 * счёт начинается заново, иначе увеличивается. По достижении предела
 * проставляется срок блокировки.
 */
async function registerFailure(req) {
  const key = req.loginKey || keyOf(req);
  try {
    const { rows } = await query(
      `INSERT INTO login_attempts (key, fails, first_at, last_at)
       VALUES ($1, 1, now(), now())
       ON CONFLICT (key) DO UPDATE SET
         fails = CASE
                   WHEN login_attempts.first_at < now() - ($2 || ' minutes')::interval THEN 1
                   ELSE login_attempts.fails + 1
                 END,
         first_at = CASE
                      WHEN login_attempts.first_at < now() - ($2 || ' minutes')::interval THEN now()
                      ELSE login_attempts.first_at
                    END,
         last_at = now(),
         blocked_until = CASE
                           WHEN (CASE
                                   WHEN login_attempts.first_at < now() - ($2 || ' minutes')::interval THEN 1
                                   ELSE login_attempts.fails + 1
                                 END) >= $3
                           THEN now() + ($4 || ' minutes')::interval
                           ELSE NULL
                         END
       RETURNING fails, blocked_until`,
      [key, String(WINDOW_MIN), MAX_FAILS, String(BLOCK_MIN)]);

    const rec = rows[0];
    if (rec && rec.blocked_until) {
      logger.warn(`Вход заблокирован на ${BLOCK_MIN} мин после ${rec.fails} неудачных попыток (${key})`);
    }
    return rec;
  } catch (e) {
    logger.error('Не удалось записать неудачную попытку входа: ' + e.message);
    return null;
  }
}

/** Удачный вход обнуляет счётчик. */
async function registerSuccess(req) {
  const key = req.loginKey || keyOf(req);
  try {
    await query('DELETE FROM login_attempts WHERE key = $1', [key]);
  } catch (e) {
    logger.error('Не удалось обнулить счётчик попыток входа: ' + e.message);
  }
}

/**
 * Уборка протухших записей. Вызывается по расписанию: без неё таблица
 * растёт вместе с числом перебираемых логинов.
 */
async function sweep() {
  const { rowCount } = await query(
    `DELETE FROM login_attempts
      WHERE last_at < now() - ($1 || ' minutes')::interval
        AND (blocked_until IS NULL OR blocked_until < now())`,
    [String(Math.max(WINDOW_MIN, BLOCK_MIN) * 4)]);
  return rowCount;
}

/** Для тестов: полностью очистить счётчик. */
async function reset() {
  await query('DELETE FROM login_attempts');
}

module.exports = { guard, registerFailure, registerSuccess, sweep, reset, MAX_FAILS, BLOCK_MIN, WINDOW_MIN };
