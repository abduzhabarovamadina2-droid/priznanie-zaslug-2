'use strict';
const service = require('../services/requests.service');
const asyncHandler = require('../middleware/asyncHandler');

exports.list = asyncHandler(async (req, res) => {
  const data = await service.list(req.query);
  res.json({ ok: true, ...data });
});

exports.getOne = asyncHandler(async (req, res) => {
  const data = await service.getOne(req.params.id);
  res.json({ ok: true, item: data });
});

exports.create = asyncHandler(async (req, res) => {
  const data = await service.create(req.body || {}, req.user);
  res.status(201).json({ ok: true, item: data });
});

exports.patch = asyncHandler(async (req, res) => {
  const data = await service.changeStatus(req.params.id, req.body || {});
  res.json({ ok: true, item: data });
});
