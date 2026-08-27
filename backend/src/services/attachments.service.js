'use strict';
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const repo = require('../repositories/attachments.repo');
const requestsRepo = require('../repositories/requests.repo');
const uploads = require('../config/uploads');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

/** Папку под файлы создаём лениво: до первой загрузки она не нужна. */
async function ensureDir() {
  await fsp.mkdir(uploads.dir, { recursive: true });
}

/**
 * Имя файла на диске придумываем сами.
 *
 * Исходное имя приходит от пользователя и в путь не попадает: в нём могут
 * быть «..», слэши и что угодно ещё. На диске лежит случайное имя с
 * безопасным расширением, а настоящее имя хранится в базе и подставляется
 * при скачивании.
 */
function storageKeyFor(mime) {
  const ext = uploads.allowedMime[mime] || '.bin';
  return crypto.randomUUID() + ext;
}

/** Имя для заголовка ответа: без переводов строк и кавычек. */
function safeFilename(name) {
  return String(name || 'file').replace(/[\r\n"\\]/g, '_').slice(0, 200);
}

async function listForRequest(requestId) {
  const request = await requestsRepo.findById(requestId);
  if (!request) throw AppError.notFound('Заявка');
  const items = await repo.findByRequest(request.id);
  return { items, total: items.length };
}

/**
 * Приём файла. multer уже проверил тип и размер и положил файл в память;
 * здесь — правила заявки, запись на диск и строка в базе.
 */
async function add(requestId, file, user) {
  if (!file) throw AppError.badRequest('Файл не передан. Ожидается поле «file».');

  const request = await requestsRepo.findById(requestId);
  if (!request) throw AppError.notFound('Заявка');

  // К закрытой заявке прикладывать нечего: решение по ней уже принято.
  if (request.status_code !== 'WAIT') {
    throw new AppError(
      `Заявка в статусе «${request.status_name}» — вложения можно добавлять только к заявке на рассмотрении`,
      409);
  }

  const count = await repo.countByRequest(request.id);
  if (count >= uploads.maxPerRequest) {
    throw new AppError(
      `К заявке уже приложено ${count} файлов — больше ${uploads.maxPerRequest} нельзя`, 409);
  }

  const sha256 = crypto.createHash('sha256').update(file.buffer).digest('hex');
  const same = await repo.findSame(request.id, sha256);
  if (same) {
    throw new AppError(`Такой файл уже приложен к заявке: «${same.filename}»`, 409,
      { attachment_id: same.id });
  }

  await ensureDir();
  const storageKey = storageKeyFor(file.mimetype);
  const full = path.join(uploads.dir, storageKey);
  await fsp.writeFile(full, file.buffer);

  let id;
  try {
    id = await repo.create({
      request_id: request.id,
      filename: file.originalname,
      mime_type: file.mimetype,
      size_bytes: file.size,
      storage_key: storageKey,
      sha256,
      uploaded_by: user ? user.id : null,
    });
  } catch (e) {
    // Строка в базе не появилась — файл на диске не нужен, иначе он останется
    // мусором, на который никто не ссылается.
    await fsp.unlink(full).catch(() => {});
    throw e;
  }

  return repo.findById(id);
}

/** Данные для отдачи файла: строка из базы + проверенный путь на диске. */
async function open(id) {
  const row = await repo.findById(id);
  if (!row) throw AppError.notFound('Вложение');

  const full = path.join(uploads.dir, path.basename(row.storage_key || ''));
  if (!full.startsWith(uploads.dir) || !fs.existsSync(full)) {
    logger.error(`Вложение ${row.id}: файл не найден на диске (${row.storage_key})`);
    throw new AppError('Файл вложения не найден в хранилище', 410);
  }
  return { row, fullPath: full, downloadName: safeFilename(row.filename) };
}

/**
 * Удаление вложения. Своё вложение убирает тот, кто его приложил (право
 * attach), любое — администратор (право remove).
 */
async function remove(id, user, can) {
  const row = await repo.findById(id);
  if (!row) throw AppError.notFound('Вложение');

  const own = user && row.uploaded_by === user.id;
  const mayAny = user && can(user.role, 'remove');
  if (!own && !mayAny) {
    throw new AppError('Удалить можно только собственное вложение', 403);
  }

  await repo.remove(row.id);
  // Файл убираем после базы: если удаление строки не прошло, файл ещё на месте.
  await fsp.unlink(path.join(uploads.dir, path.basename(row.storage_key || ''))).catch(() => {});
  return { id: row.id, filename: row.filename };
}

module.exports = { listForRequest, add, open, remove };
