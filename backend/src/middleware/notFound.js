'use strict';
const AppError = require('../utils/AppError');
module.exports = (req, _res, next) => next(new AppError(`Маршрут ${req.method} ${req.originalUrl} не найден`, 404));
