'use strict';
const service = require('../services/ratings.service');
const asyncHandler = require('../middleware/asyncHandler');

exports.list = asyncHandler(async (req, res) => {
  const data = await service.list(req.query);
  res.json({ ok: true, ...data });
});

exports.byEmployee = asyncHandler(async (req, res) => {
  const data = await service.byEmployee(req.params.employeeId, req.query);
  res.json({ ok: true, ...data });
});
