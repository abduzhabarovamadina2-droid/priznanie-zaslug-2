'use strict';
const { query } = require('../db/pool');

async function ping() {
  const { rows } = await query('SELECT now() AS server_time, current_database() AS db');
  return rows[0];
}

async function tableCounts() {
  const { rows } = await query(`
    SELECT 'employees' AS table, count(*)::int AS rows FROM employees
    UNION ALL SELECT 'users',       count(*)::int FROM users
    UNION ALL SELECT 'ratings',     count(*)::int FROM ratings
    UNION ALL SELECT 'requests',    count(*)::int FROM requests
    UNION ALL SELECT 'nominations', count(*)::int FROM nominations`);
  return rows.reduce((acc, r) => ({ ...acc, [r.table]: r.rows }), {});
}

module.exports = { ping, tableCounts };
