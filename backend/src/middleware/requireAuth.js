'use strict';
const jwt = require('jsonwebtoken');
const config = require('../config');
const AppError = require('../utils/AppError');
const authRepo = require('../repositories/auth.repo');

/**
 * Проверяет Bearer-токен и кладёт пользователя в req.user.
 *
 * 401 — токена нет, формат не тот, подпись неверна, срок истёк,
 *       пользователя больше нет в базе.
 * 403 — пользователь есть, но деактивирован.
 *
 * Токен и секрет никуда не логируются.
 */
module.exports = async function requireAuth(req, _res, next) {
  try {
    if (!config.jwtSecret) {
      return next(new AppError('Аутентификация не настроена: не задан JWT_SECRET', 503));
    }

    const header = req.headers.authorization || '';
    if (!header) return next(new AppError('Требуется авторизация: заголовок Authorization отсутствует', 401));

    const [scheme, token] = header.split(' ');
    if (!/^Bearer$/i.test(scheme || '') || !token) {
      return next(new AppError('Неверный формат заголовка Authorization, ожидается «Bearer <токен>»', 401));
    }

    let payload;
    try {
      payload = jwt.verify(token, config.jwtSecret);
    } catch (err) {
      const msg = err.name === 'TokenExpiredError'
        ? 'Срок действия токена истёк'
        : 'Токен недействителен';
      return next(new AppError(msg, 401));
    }

    // Свежие данные берём из базы: роль могли поменять после выдачи токена.
    const user = await authRepo.findById(payload.userId);
    if (!user) return next(new AppError('Пользователь не найден', 401));
    if (!user.is_active) return next(new AppError('Учётная запись деактивирована', 403));

    req.user = user;
    req.token = { issuedAt: payload.iat, expiresAt: payload.exp };
    return next();
  } catch (err) {
    return next(err);
  }
};
