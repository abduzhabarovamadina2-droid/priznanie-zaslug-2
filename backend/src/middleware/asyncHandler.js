'use strict';
/** Оборачивает async-обработчик, чтобы отказ промиса уходил в next(). */
module.exports = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
