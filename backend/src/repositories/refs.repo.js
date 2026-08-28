'use strict';
const { query } = require('../db/pool');

/**
 * Запись в справочники: номинации, заслуги, фразы, вопрос-ответ.
 *
 * Чтение у каждого справочника своё (у номинаций — стоимость, у заслуг —
 * связь с номинацией), а запись устроена одинаково: создать, изменить,
 * включить или выключить. Поэтому одна таблица описаний вместо четырёх
 * почти одинаковых репозиториев.
 *
 * Справочники не удаляются, а выключаются (is_active = false): на них
 * ссылаются заявки, и удаление оборвало бы историю.
 */
const TABLES = {
  nominations: {
    table: 'nominations',
    title: 'Номинация',
    // Что разрешено записывать. Всё, чего здесь нет, из тела запроса
    // просто не берётся: клиент не должен уметь править id или created_at.
    fields: ['code', 'name_ru', 'name_kz', 'points', 'badge_name', 'badge_word', 'is_active'],
    required: ['code', 'name_ru', 'points'],
  },
  merits: {
    table: 'merits',
    title: 'Заслуга',
    fields: ['nomination_id', 'merit_ru', 'merit_kz', 'is_active'],
    required: ['nomination_id', 'merit_ru'],
  },
  phrases: {
    table: 'phrases',
    title: 'Фраза',
    fields: ['text_ru', 'text_kz', 'is_active'],
    required: ['text_ru'],
  },
  faq: {
    table: 'faq',
    title: 'Вопрос-ответ',
    fields: ['question_ru', 'question_kz', 'answer_ru', 'answer_kz', 'sort_order', 'is_active'],
    required: ['question_ru', 'answer_ru'],
  },
};

/** Есть ли у таблицы колонка updated_at — не у всех справочников она есть. */
const HAS_UPDATED_AT = new Set(['nominations', 'phrases', 'faq']);

function describe(kind) {
  return TABLES[kind] || null;
}

/** Оставляем из тела только разрешённые поля. */
function pick(kind, payload) {
  const meta = TABLES[kind];
  const out = {};
  for (const f of meta.fields) {
    if (payload[f] !== undefined) out[f] = payload[f];
  }
  return out;
}

async function findById(kind, id) {
  const meta = TABLES[kind];
  const asId = Number.parseInt(id, 10);
  if (!Number.isInteger(asId)) return null;
  const { rows } = await query(`SELECT * FROM ${meta.table} WHERE id = $1`, [asId]);
  return rows[0] || null;
}

async function list(kind, { activeOnly = false } = {}) {
  const meta = TABLES[kind];
  const { rows } = await query(
    `SELECT * FROM ${meta.table} ${activeOnly ? 'WHERE is_active = true' : ''} ORDER BY id`);
  return rows;
}

async function create(kind, data) {
  const meta = TABLES[kind];
  const keys = Object.keys(data);
  const holders = keys.map((_, i) => `$${i + 1}`);
  const { rows } = await query(
    `INSERT INTO ${meta.table} (${keys.join(', ')}) VALUES (${holders.join(', ')}) RETURNING *`,
    keys.map((k) => data[k]));
  return rows[0];
}

async function update(kind, id, data) {
  const meta = TABLES[kind];
  const keys = Object.keys(data);
  if (!keys.length) return findById(kind, id);

  const sets = keys.map((k, i) => `${k} = $${i + 1}`);
  if (HAS_UPDATED_AT.has(meta.table)) sets.push('updated_at = now()');

  const { rows } = await query(
    `UPDATE ${meta.table} SET ${sets.join(', ')} WHERE id = $${keys.length + 1} RETURNING *`,
    [...keys.map((k) => data[k]), id]);
  return rows[0] || null;
}

/** Сколько заявок ссылается на запись справочника — проверяем перед выключением. */
async function usageCount(kind, id) {
  if (kind === 'nominations') {
    const { rows } = await query('SELECT COUNT(*)::int AS c FROM requests WHERE nomination_id = $1', [id]);
    return rows[0].c;
  }
  if (kind === 'merits') {
    const { rows } = await query('SELECT COUNT(*)::int AS c FROM requests WHERE merit_id = $1', [id]);
    return rows[0].c;
  }
  return 0;
}

async function setActive(kind, id, isActive) {
  return update(kind, id, { is_active: isActive });
}

module.exports = { TABLES, describe, pick, findById, list, create, update, setActive, usageCount };
