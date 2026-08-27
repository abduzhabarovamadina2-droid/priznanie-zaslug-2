'use strict';
const service = require('../services/notifications.service');
const mail = require('../services/mail.service');
const asyncHandler = require('../middleware/asyncHandler');

exports.list = asyncHandler(async (req, res) => {
  const data = await service.listForUser(req.user, req.query);
  res.json({ ok: true, ...data });
});

exports.markRead = asyncHandler(async (req, res) => {
  const item = await service.markRead(req.params.id, req.user);
  res.json({ ok: true, item });
});

exports.markAllRead = asyncHandler(async (req, res) => {
  const data = await service.markAllRead(req.user);
  res.json({ ok: true, ...data });
});

/** Ручной разбор очереди писем — пока нет планировщика. */
exports.flush = asyncHandler(async (_req, res) => {
  const stats = await mail.flushQueue();
  res.json({ ok: true, ...stats });
});
