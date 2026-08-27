'use strict';
const { query } = require('../db/pool');

const SELECT = `
  SELECT m.id, m.nomination_id, n.code AS nomination_code, n.name_ru AS nomination,
         m.merit_ru, m.merit_kz, m.is_active
    FROM merits m
    JOIN nominations n ON n.id = m.nomination_id`;

/** Заслуги, при необходимости — только одной номинации (id, код или название). */
async function findAll({ nomination = '', activeOnly = true } = {}) {
  const params = [];
  const where = [];
  if (activeOnly) where.push('m.is_active = true');
  if (nomination) {
    const asId = Number.parseInt(nomination, 10);
    params.push(Number.isInteger(asId) && asId > 0 ? asId : null, String(nomination).trim());
    where.push(`(($1::int IS NOT NULL AND n.id = $1::int)
                 OR upper(n.code) = upper($2) OR lower(n.name_ru) = lower($2))`);
  }
  const { rows } = await query(
    `${SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY n.points DESC, m.id`, params);
  return rows;
}

/** Заслуга по id — нужна при создании заявки, чтобы проверить связь с номинацией. */
async function findById(id) {
  const asId = Number.parseInt(id, 10);
  if (!Number.isInteger(asId)) return null;
  const { rows } = await query(`${SELECT} WHERE m.id = $1`, [asId]);
  return rows[0] || null;
}

/** Заслуга по её названию внутри номинации: прототип шлёт текст, не id. */
async function findByText(nominationId, text) {
  if (!nominationId || !text) return null;
  const { rows } = await query(
    `${SELECT} WHERE m.nomination_id = $1 AND lower(m.merit_ru) = lower($2) LIMIT 1`,
    [nominationId, String(text).trim()]);
  return rows[0] || null;
}

module.exports = { findAll, findById, findByText };
