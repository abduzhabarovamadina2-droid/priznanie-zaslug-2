'use strict';
const service = require('../services/auth.service');
const asyncHandler = require('../middleware/asyncHandler');
const loginLimit = require('../middleware/loginLimit');

exports.login = asyncHandler(async (req, res) => {
  const { login, password } = req.body || {};
  try {
    const data = await service.login({ login, password });
    await loginLimit.registerSuccess(req);   // удачный вход обнуляет счётчик
    res.json({ ok: true, ...data });
  } catch (e) {
    // Считаем только неверные пары логин-пароль. Ошибка настройки сервера
    // (нет JWT_SECRET) — не повод блокировать человека.
    if (e && e.status === 401) await loginLimit.registerFailure(req);
    throw e;
  }
});

exports.refresh = asyncHandler(async (req, res) => {
  const data = await service.refresh(req.user);
  res.json({ ok: true, ...data });
});

exports.logout = asyncHandler(async (req, res) => {
  const data = await service.logout(req.user);
  res.json({ ok: true, ...data });
});

exports.revoke = asyncHandler(async (req, res) => {
  const data = await service.revoke(req.params.id);
  res.json({ ok: true, ...data });
});

exports.me = asyncHandler(async (req, res) => {
  const data = await service.me(req.user);
  res.json({ ok: true, user: data });
});
