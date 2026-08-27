'use strict';
const service = require('../services/nominations.service');
const asyncHandler = require('../middleware/asyncHandler');

exports.list = asyncHandler(async (req, res) => {
  const data = await service.list(req.query);
  res.json({ ok: true, ...data });
});
