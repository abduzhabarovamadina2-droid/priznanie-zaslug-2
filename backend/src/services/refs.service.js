'use strict';
const repo = require('../repositories/refs.repo');
const meritsRepo = require('../repositories/merits.repo');
const AppError = require('../utils/AppError');

/**
 * Правка справочников.
 *
 * До этого права refsView и refsEdit были объявлены в матрице, но применить
 * их было негде: справочники читались с сервера, а правились только в
 * браузере — после перезагрузки страницы правки исчезали.
 */

/** Справочник по имени из адреса. Неизвестное имя — 404, а не 500. */
function kindOf(kind) {
  const meta = repo.describe(kind);
  if (!meta) {
    throw AppError.notFound(`Справочник «${kind}»`);
  }
  return meta;
}

async function list(kind, params = {}) {
  kindOf(kind);
  const items = await repo.list(kind, { activeOnly: String(params.all || '') !== '1' });
  return { items, total: items.length };
}

async function getOne(kind, id) {
  const meta = kindOf(kind);
  const row = await repo.findById(kind, id);
  if (!row) throw AppError.notFound(meta.title);
  return row;
}

/** Проверки, общие для создания и правки. */
async function validate(kind, data, { isNew }) {
  const meta = kindOf(kind);
  const errors = [];

  if (isNew) {
    for (const f of meta.required) {
      const v = data[f];
      if (v === undefined || v === null || String(v).trim() === '') {
        errors.push(`Не заполнено обязательное поле: ${f}`);
      }
    }
  }

  if (data.points !== undefined) {
    const n = Number(data.points);
    if (!Number.isInteger(n) || n <= 0) errors.push('Стоимость номинации — целое число больше нуля');
  }

  // Заслуга без существующей номинации осиротеет.
  if (kind === 'merits' && data.nomination_id !== undefined) {
    const noms = await repo.list('nominations');
    if (!noms.some((n) => n.id === Number(data.nomination_id))) {
      errors.push(`Номинация с id ${data.nomination_id} не найдена`);
    }
  }

  if (errors.length) throw AppError.badRequest('Некорректные данные справочника', errors);
}

async function create(kind, payload, user) {
  const meta = kindOf(kind);
  const data = repo.pick(kind, payload || {});
  await validate(kind, data, { isNew: true });

  // Кто завёл запись — видно в самом справочнике, а не только в журнале.
  if (['phrases', 'faq'].includes(kind) && user) data.created_by = user.login;

  try {
    return await repo.create(kind, data);
  } catch (e) {
    // Код справочника уникален: понятный ответ вместо 500 от базы.
    if (e && e.code === '23505') {
      throw new AppError(`${meta.title} с таким кодом уже есть`, 409);
    }
    throw e;
  }
}

async function update(kind, id, payload) {
  const meta = kindOf(kind);
  const existing = await repo.findById(kind, id);
  if (!existing) throw AppError.notFound(meta.title);

  const data = repo.pick(kind, payload || {});
  if (!Object.keys(data).length) {
    throw AppError.badRequest('Нечего изменять: не передано ни одного поля справочника');
  }
  await validate(kind, data, { isNew: false });

  try {
    return await repo.update(kind, id, data);
  } catch (e) {
    if (e && e.code === '23505') {
      throw new AppError(`${meta.title} с таким кодом уже есть`, 409);
    }
    throw e;
  }
}

/**
 * Выключение записи справочника.
 *
 * Удаления нет намеренно: на номинацию и заслугу ссылаются заявки, и
 * удаление оборвало бы историю. Выключенная запись не предлагается при
 * заполнении новой заявки, но старые заявки читаются как прежде.
 */
async function deactivate(kind, id) {
  const meta = kindOf(kind);
  const existing = await repo.findById(kind, id);
  if (!existing) throw AppError.notFound(meta.title);

  const used = await repo.usageCount(kind, existing.id);
  const row = await repo.setActive(kind, id, false);
  return { item: row, used_in_requests: used };
}

async function activate(kind, id) {
  const meta = kindOf(kind);
  const existing = await repo.findById(kind, id);
  if (!existing) throw AppError.notFound(meta.title);
  return repo.setActive(kind, id, true);
}

/** Заслуги вместе с номинацией — то, что показывает экран справочников. */
async function meritsWithNomination(params = {}) {
  const items = await meritsRepo.findAll({
    nomination: params.nomination || '',
    activeOnly: String(params.all || '') !== '1',
  });
  return { items, total: items.length };
}

module.exports = { list, getOne, create, update, deactivate, activate, meritsWithNomination };
