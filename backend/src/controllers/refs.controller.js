'use strict';
const service = require('../services/refs.service');
const asyncHandler = require('../middleware/asyncHandler');

exports.list = asyncHandler(async (req, res) => {
  const data = await service.list(req.params.kind, req.query);
  res.json({ ok: true, kind: req.params.kind, ...data });
});

exports.getOne = asyncHandler(async (req, res) => {
  const item = await service.getOne(req.params.kind, req.params.id);
  res.json({ ok: true, item });
});

exports.create = asyncHandler(async (req, res) => {
  const item = await service.create(req.params.kind, req.body, req.user);
  res.status(201).json({ ok: true, item });
});

exports.update = asyncHandler(async (req, res) => {
  const item = await service.update(req.params.kind, req.params.id, req.body);
  res.json({ ok: true, item });
});

exports.deactivate = asyncHandler(async (req, res) => {
  const data = await service.deactivate(req.params.kind, req.params.id);
  res.json({ ok: true, ...data });
});

exports.activate = asyncHandler(async (req, res) => {
  const item = await service.activate(req.params.kind, req.params.id);
  res.json({ ok: true, item });
});
