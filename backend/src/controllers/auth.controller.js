'use strict';
const service = require('../services/auth.service');
const asyncHandler = require('../middleware/asyncHandler');
const loginLimit = require('../middleware/loginLimit');

exports.login = asyncHandler(async (req, res) => {
  const { login, password } = req.body || {};
  try {
    const data = await service.login({ login, password });
    loginLimit.registerSuccess(req);        // удачный вход обнуляет счётчик
    res.json({ ok: true, ...data });
  } catch (e) {
    // Считаем только неверные пары логин-пароль. Ошибка настройки сервера
    // (нет JWT_SECRET) — не повод блокировать человека.
    if (e && e.status === 401) loginLimit.registerFailure(req);
    throw e;
  }
});

exports.me = asyncHandler(async (req, res) => {
  const data = await service.me(req.user);
  res.json({ ok: true, user: data });
});
