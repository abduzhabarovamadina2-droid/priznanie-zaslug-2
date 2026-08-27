'use strict';
const multer = require('multer');
const uploads = require('../config/uploads');
const AppError = require('../utils/AppError');

/**
 * Приём одного файла в память.
 *
 * В память, а не сразу на диск: до записи файл нужно посчитать (хеш) и
 * проверить правила заявки. При лимите в 10 МБ это безопасно, а мусорных
 * файлов на диске после отказа не остаётся.
 */
const memory = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: uploads.maxBytes, files: 1 },
  // Имя файла в multipart по умолчанию читается как latin1, и «Служебная
  // записка.pdf» превращается в «Ð¡Ð»ÑÐ¶ÐµÐ±Ð½Ð°Ñ...». Русские имена
  // документов здесь норма, поэтому кодировку задаём явно.
  defParamCharset: 'utf8',
  fileFilter(_req, file, cb) {
    if (uploads.isAllowed(file.mimetype)) return cb(null, true);
    return cb(new AppError(
      `Тип файла «${file.mimetype}» не разрешён. Допустимы: ${uploads.allowedExtensions.join(', ')}`,
      415));
  },
}).single('file');

/** Ошибки multer переводим в свои: иначе наружу уйдёт 500 без объяснения. */
module.exports = function uploadSingle(req, res, next) {
  memory(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return next(new AppError(
          `Файл больше ${Math.round(uploads.maxBytes / 1024 / 1024)} МБ`, 413));
      }
      if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
        return next(new AppError('Ожидается один файл в поле «file»', 400));
      }
      return next(new AppError(`Не удалось принять файл: ${err.message}`, 400));
    }
    return next(err);
  });
};
