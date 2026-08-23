'use strict';
const service = require('../services/auth.service');
const asyncHandler = require('../middleware/asyncHandler');

exports.login = asyncHandler(async (req, res) => {
  const { login, password } = req.body || {};
  const data = await service.login({ login, password });
  res.json({ ok: true, ...data });
});

exports.me = asyncHandler(async (req, res) => {
  const data = await service.me(req.user);
  res.json({ ok: true, user: data });
});
