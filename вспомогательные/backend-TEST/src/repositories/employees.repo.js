'use strict';
const { query } = require('../db/pool');

const COLUMNS = `id, tnumber, fio, short_name, post, branch, dep, dept,
                 seed_badges, photo_key, is_active, created_at, updated_at`;

async function findAll({ limit = 100, offset = 0, search = '', dept = '' } = {}) {
  const params = [];
  const where = ['is_active = TRUE'];

  if (search) { params.push(`%${search}%`); where.push(`(fio ILIKE $${params.length} OR tnumber ILIKE $${params.length})`); }
  if (dept)   { params.push(dept);          where.push(`dept = $${params.length}`); }

  params.push(limit, offset);
  const { rows } = await query(
    `SELECT ${COLUMNS} FROM employees
      WHERE ${where.join(' AND ')}
      ORDER BY fio
      LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
  return rows;
}

async function countAll({ search = '', dept = '' } = {}) {
  const params = [];
  const where = ['is_active = TRUE'];
  if (search) { params.push(`%${search}%`); where.push(`(fio ILIKE $${params.length} OR tnumber ILIKE $${params.length})`); }
  if (dept)   { params.push(dept);          where.push(`dept = $${params.length}`); }
  const { rows } = await query(`SELECT count(*)::int AS n FROM employees WHERE ${where.join(' AND ')}`, params);
  return rows[0].n;
}

/** Ищем и по внутреннему id, и по табельному номеру — табельный первичен для бизнеса. */
async function findByIdOrTnumber(idOrTnumber) {
  const asInt = Number.parseInt(idOrTnumber, 10);
  const { rows } = await query(
    `SELECT ${COLUMNS} FROM employees WHERE tnumber = $1 OR ($2::int IS NOT NULL AND id = $2::int) LIMIT 1`,
    [String(idOrTnumber), Number.isNaN(asInt) ? null : asInt]);
  return rows[0] || null;
}

async function findByTnumber(tnumber) {
  const { rows } = await query(`SELECT ${COLUMNS} FROM employees WHERE tnumber = $1`, [tnumber]);
  return rows[0] || null;
}

module.exports = { findAll, countAll, findByIdOrTnumber, findByTnumber };
