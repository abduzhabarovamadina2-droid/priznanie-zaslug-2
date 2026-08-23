'use strict';
const service = require('../services/health.service');
const asyncHandler = require('../middleware/asyncHandler');

exports.get = asyncHandler(async (_req, res) => {
  const data = await service.status();
  res.status(data.ok ? 200 : 503).json(data);
});
