'use strict';
const { query } = require('../db/pool');

const SELECT = `
  SELECT a.id, a.request_id, a.attach_type, a.filename, a.mime_type,
         a.size_bytes, a.storage_key, a.sha256, a.uploaded_by, a.created_at,
         u.login AS uploaded_by_login
    FROM attachments a
    LEFT JOIN users u ON u.id = a.uploaded_by`;

async function findByRequest(requestId) {
  const { rows } = await query(
    `${SELECT} WHERE a.request_id = $1 ORDER BY a.created_at, a.id`, [requestId]);
  return rows;
}

async function findById(id) {
  const asId = Number.parseInt(id, 10);
  if (!Number.isInteger(asId)) return null;
  const { rows } = await query(`${SELECT} WHERE a.id = $1`, [asId]);
  return rows[0] || null;
}

async function countByRequest(requestId) {
  const { rows } = await query(
    'SELECT COUNT(*)::int AS c FROM attachments WHERE request_id = $1', [requestId]);
  return rows[0].c;
}

/** Тот же файл уже приложен к этой заявке — сравниваем по содержимому. */
async function findSame(requestId, sha256) {
  if (!sha256) return null;
  const { rows } = await query(
    `${SELECT} WHERE a.request_id = $1 AND a.sha256 = $2 LIMIT 1`, [requestId, sha256]);
  return rows[0] || null;
}

async function create(data) {
  const { rows } = await query(
    `INSERT INTO attachments (request_id, attach_type, filename, mime_type,
                              size_bytes, storage_key, sha256, uploaded_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [data.request_id, data.attach_type || 'document', data.filename, data.mime_type,
     data.size_bytes, data.storage_key, data.sha256, data.uploaded_by]);
  return rows[0].id;
}

async function remove(id) {
  const { rowCount } = await query('DELETE FROM attachments WHERE id = $1', [id]);
  return rowCount > 0;
}

module.exports = { findByRequest, findById, countByRequest, findSame, create, remove };
