'use strict';
const logger = require('../utils/logger');
const config = require('../config');

// eslint-disable-next-line no-unused-vars
module.exports = (err, req, res, _next) => {
  const status = err.status || 500;
  if (status >= 500) logger.error(`${req.method} ${req.originalUrl}:`, err.message);

  res.status(status).json({
    ok: false,
    error: {
      message: status >= 500 && config.isProd ? 'Внутренняя ошибка сервера' : err.message,
      status,
      ...(err.details ? { details: err.details } : {}),
      ...(config.isProd ? {} : { stack: err.stack }),
    },
  });
};
