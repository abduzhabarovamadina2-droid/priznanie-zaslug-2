'use strict';
const { query } = require('../db/pool');

const SELECT = `
  SELECT r.id, r.employee_id, e.tnumber, e.fio, e.post, e.dept, e.branch,
         r.period_year, r.q1_points, r.q2_points, r.q3_points, r.q4_points,
         r.year_points, r.gold_badges, r.silver_badges, r.bronze_badges,
         r.green_badges, r.blue_badges, r.yellow_badges,
         r.rank, r.department_parent_id, r.source, r.updated_at,
         (r.gold_badges + r.silver_badges + r.bronze_badges
          + r.green_badges + r.blue_badges + r.yellow_badges)::int AS badges_total
    FROM ratings r
    JOIN employees e ON e.id = r.employee_id`;

async function findAll({ year = null, limit = 100, offset = 0 } = {}) {
  const params = [];
  let where = '';
  if (year) { params.push(year); where = `WHERE r.period_year = $${params.length}`; }
  params.push(limit, offset);
  const { rows } = await query(
    `${SELECT} ${where}
      ORDER BY r.year_points DESC, e.fio
      LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
  return rows;
}

async function findByEmployee(idOrTnumber, year = null) {
  const asInt = Number.parseInt(idOrTnumber, 10);
  const params = [String(idOrTnumber), Number.isNaN(asInt) ? null : asInt];
  let where = `WHERE (e.tnumber = $1 OR ($2::int IS NOT NULL AND e.id = $2::int))`;
  if (year) { params.push(year); where += ` AND r.period_year = $${params.length}`; }
  const { rows } = await query(`${SELECT} ${where} ORDER BY r.period_year DESC`, params);
  return rows;
}

module.exports = { findAll, findByEmployee };
