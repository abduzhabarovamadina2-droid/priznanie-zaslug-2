'use strict';
const path = require('path');

/**
 * Настройки вложений.
 *
 * Файлы кладём на диск рядом с приложением, а в базе храним только ссылку:
 * складывать документы в PostgreSQL дорого и неудобно для выгрузки. Когда
 * появится сетевой диск или объектное хранилище банка, поменяется только
 * UPLOAD_DIR и функция сохранения — таблица attachments останется прежней.
 */
const MB = 1024 * 1024;

/* Что разрешено прикладывать к заявке: документы, таблицы, картинки, PDF.
   Список закрытый — исполняемые файлы и архивы через модуль не ходят. */
const ALLOWED = {
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'text/plain': '.txt',
};

module.exports = {
  dir: process.env.UPLOAD_DIR
    ? path.resolve(process.env.UPLOAD_DIR)
    : path.join(__dirname, '..', '..', 'uploads'),
  maxBytes: Number(process.env.UPLOAD_MAX_MB || 10) * MB,
  maxPerRequest: Number(process.env.UPLOAD_MAX_PER_REQUEST || 5),
  allowedMime: ALLOWED,
  allowedExtensions: [...new Set(Object.values(ALLOWED))],
  isAllowed: (mime) => Object.prototype.hasOwnProperty.call(ALLOWED, mime),
};
