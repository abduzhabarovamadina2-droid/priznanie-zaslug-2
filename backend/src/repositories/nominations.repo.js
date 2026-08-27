'use strict';
const { query } = require('../db/pool');

/** Справочник номинаций. Порядок — по убыванию стоимости: так его видит человек. */
async function findAll({ activeOnly = true } = {}) {
  const { rows } = await query(
    `SELECT id, code, name_ru, name_kz, points, is_active
       FROM nominations
      ${activeOnly ? 'WHERE is_active = true' : ''}
      ORDER BY points DESC, id`);
  return rows;
}

module.exports = { findAll };
