'use strict';
/** Ошибка приложения с HTTP-статусом. Всё остальное считается 500. */
class AppError extends Error {
  constructor(message, status = 500, details = undefined) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.details = details;
    this.expected = true;
  }
  static notFound(what = 'Ресурс') { return new AppError(`${what} не найден`, 404); }
  static badRequest(msg, details) { return new AppError(msg, 400, details); }
  static notImplemented(msg = 'Не реализовано на текущем этапе') { return new AppError(msg, 501); }
}
module.exports = AppError;
