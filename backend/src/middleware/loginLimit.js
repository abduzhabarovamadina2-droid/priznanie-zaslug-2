'use strict';
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

/**
 * Ограничение попыток входа.
 *
 * Без него пароль можно подбирать бесконечно: маршрут входа открыт, а
 * ответ на неверный пароль приходит за доли секунды. Это первое, о чём
 * спрашивает служба информационной безопасности.
 *
 * Считаем по паре «логин + адрес». Только по адресу — заблокировали бы всех
 * за одним корпоративным шлюзом; только по логину — чужую учётку можно было
 * бы заблокировать нарочно, просто перебирая пароли к ней.
 *
 * Счётчик в памяти процесса. Для одного сервера этого достаточно; при
 * нескольких экземплярах за балансировщиком счётчик нужно будет перенести
 * в общее хранилище — иначе лимит умножится на число экземпляров.
 */
const WINDOW_MS = Number(process.env.LOGIN_WINDOW_MIN || 15) * 60 * 1000;
const MAX_FAILS = Number(process.env.LOGIN_MAX_FAILS || 5);
const BLOCK_MS = Number(process.env.LOGIN_BLOCK_MIN || 15) * 60 * 1000;

/** ключ -> { fails, firstAt, blockedUntil } */
const attempts = new Map();

/* Раз в час выбрасываем всё, что давно протухло: иначе карта растёт
   вместе с числом перебираемых логинов и становится утечкой памяти. */
const sweeper = setInterval(() => {
  const now = Date.now();
  for (const [key, rec] of attempts) {
    const expired = now - rec.firstAt > WINDOW_MS && (!rec.blockedUntil || rec.blockedUntil < now);
    if (expired) attempts.delete(key);
  }
}, 60 * 60 * 1000);
sweeper.unref();   // таймер не должен держать процесс живым

function keyOf(req) {
  const login = String((req.body && req.body.login) || '').trim().toLowerCase();
  const ip = req.ip || (req.socket && req.socket.remoteAddress) || 'неизвестно';
  return `${login}@${ip}`;
}

function minutes(ms) {
  return Math.max(1, Math.ceil(ms / 60000));
}

/** Ставится перед контроллером входа. */
function guard(req, _res, next) {
  const key = keyOf(req);
  const rec = attempts.get(key);
  const now = Date.now();

  if (rec && rec.blockedUntil && rec.blockedUntil > now) {
    return next(new AppError(
      `Слишком много неудачных попыток входа. Повторите через ${minutes(rec.blockedUntil - now)} мин.`,
      429, { retry_after_sec: Math.ceil((rec.blockedUntil - now) / 1000) }));
  }

  // Окно прошло — начинаем счёт заново.
  if (rec && now - rec.firstAt > WINDOW_MS) attempts.delete(key);

  req.loginKey = key;
  return next();
}

/** Вызывается из контроллера при неудачном входе. */
function registerFailure(req) {
  const key = req.loginKey || keyOf(req);
  const now = Date.now();
  const rec = attempts.get(key) || { fails: 0, firstAt: now, blockedUntil: 0 };

  rec.fails += 1;
  if (rec.fails >= MAX_FAILS) {
    rec.blockedUntil = now + BLOCK_MS;
    // Логин в сообщение не подставляем: журнал читают не только админы.
    logger.warn(`Вход заблокирован на ${minutes(BLOCK_MS)} мин после ${rec.fails} неудачных попыток (${key})`);
  }
  attempts.set(key, rec);
  return rec;
}

/** Успешный вход обнуляет счётчик. */
function registerSuccess(req) {
  attempts.delete(req.loginKey || keyOf(req));
}

/** Для тестов: сбросить состояние между проверками. */
function reset() {
  attempts.clear();
}

module.exports = { guard, registerFailure, registerSuccess, reset, MAX_FAILS };
