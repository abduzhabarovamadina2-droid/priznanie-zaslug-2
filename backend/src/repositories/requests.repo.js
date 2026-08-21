'use strict';
const { query, withTransaction } = require('../db/pool');

const SELECT = `
  SELECT rq.id, rq.request_no, rq.employee_id, e.tnumber, e.fio AS employee_fio,
         e.post AS employee_post, e.dept AS employee_dept,
         rq.initiator_user_id, u.login AS initiator_login,
         rq.nomination_id, n.name_ru AS nomination, n.points AS nomination_points,
         rq.merit_id, rq.merit_text, rq.comment, rq.note, rq.doc_name,
         rq.status_id, s.code AS status_code, s.ui_key AS status_ui_key, s.name AS status_name,
         rq.points, rq.created_at, rq.updated_at
    FROM requests rq
    JOIN employees e   ON e.id = rq.employee_id
    JOIN statuses  s   ON s.id = rq.status_id
    LEFT JOIN users u  ON u.id = rq.initiator_user_id
    LEFT JOIN nominations n ON n.id = rq.nomination_id`;

async function findAll({ status = '', employee = '', limit = 100, offset = 0 } = {}) {
  const params = [];
  const where = [];
  if (status)   { params.push(status);   where.push(`s.code = $${params.length}`); }
  if (employee) { params.push(employee); where.push(`e.tnumber = $${params.length}`); }
  params.push(limit, offset);
  const { rows } = await query(
    `${SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY rq.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
  return rows;
}

async function findById(id) {
  const { rows } = await query(`${SELECT} WHERE rq.id = $1`, [id]);
  return rows[0] || null;
}

async function findHistory(requestId) {
  const { rows } = await query(
    `SELECT h.id, h.request_id, h.action, h.comment, h.created_at,
            h.performed_by, h.performed_by_name,
            so.code AS old_status, sn.code AS new_status
       FROM request_history h
       LEFT JOIN statuses so ON so.id = h.old_status_id
       LEFT JOIN statuses sn ON sn.id = h.new_status_id
      WHERE h.request_id = $1
      ORDER BY h.created_at, h.id`, [requestId]);
  return rows;
}

async function statusIdByCode(code) {
  const { rows } = await query('SELECT id FROM statuses WHERE code = $1', [code]);
  return rows[0] ? rows[0].id : null;
}

/** Создание заявки вместе с первой записью истории — одной транзакцией. */
async function create(data) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO requests (request_no, initiator_user_id, employee_id, nomination_id,
                             merit_id, merit_text, comment, status_id, points)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [data.request_no, data.initiator_user_id, data.employee_id, data.nomination_id,
       data.merit_id, data.merit_text, data.comment, data.status_id, data.points]);
    const id = rows[0].id;
    await client.query(
      `INSERT INTO request_history (request_id, action, new_status_id, performed_by, performed_by_name, comment)
       VALUES ($1, 'Создано', $2, $3, $4, $5)`,
      [id, data.status_id, data.initiator_user_id, data.initiator_name || null, data.comment || '']);
    return id;
  });
}

/** Смена статуса заявки с записью в историю — одной транзакцией. */
async function updateStatus(id, newStatusId, { performedBy = null, performedByName = null, action, comment = '' }) {
  return withTransaction(async (client) => {
    const cur = await client.query('SELECT status_id FROM requests WHERE id = $1 FOR UPDATE', [id]);
    if (!cur.rows[0]) return null;
    const oldStatusId = cur.rows[0].status_id;

    await client.query('UPDATE requests SET status_id = $1, updated_at = now() WHERE id = $2', [newStatusId, id]);
    await client.query(
      `INSERT INTO request_history (request_id, action, old_status_id, new_status_id, performed_by, performed_by_name, comment)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [id, action, oldStatusId, newStatusId, performedBy, performedByName, comment]);
    return id;
  });
}

module.exports = { findAll, findById, findHistory, statusIdByCode, create, updateStatus };
