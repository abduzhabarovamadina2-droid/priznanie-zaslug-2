'use strict';
const service = require('../services/employees.service');
const asyncHandler = require('../middleware/asyncHandler');

exports.list = asyncHandler(async (req, res) => {
  const data = await service.list(req.query);
  res.json({ ok: true, ...data });
});

exports.getOne = asyncHandler(async (req, res) => {
  const data = await service.getOne(req.params.id);
  res.json({ ok: true, item: data });
});
