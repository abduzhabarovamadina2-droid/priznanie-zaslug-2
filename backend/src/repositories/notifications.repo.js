'use strict';
const { query } = require('../db/pool');

const SELECT = `
  SELECT n.id, n.user_id, n.request_id, n.type, n.title, n.text, n.link,
         n.is_read, n.email, n.is_sent, n.sent_at, n.send_error, n.attempts,
         n.created_at, rq.request_no
    FROM notifications n
    LEFT JOIN requests rq ON rq.id = n.request_id`;

/** Уведомления одного пользователя, свежие сверху. */
async function findForUser(userId, { unreadOnly = false, limit = 50, offset = 0 } = {}) {
  const params = [userId];
  let where = 'WHERE n.user_id = $1';
  if (unreadOnly) where += ' AND n.is_read = false';
  params.push(limit, offset);
  const { rows } = await query(
    `${SELECT} ${where} ORDER BY n.created_at DESC, n.id DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
  return rows;
}

async function countUnread(userId) {
  const { rows } = await query(
    'SELECT COUNT(*)::int AS c FROM notifications WHERE user_id = $1 AND is_read = false', [userId]);
  return rows[0].c;
}

async function findById(id) {
  const asId = Number.parseInt(id, 10);
  if (!Number.isInteger(asId)) return null;
  const { rows } = await query(`${SELECT} WHERE n.id = $1`, [asId]);
  return rows[0] || null;
}

async function create(n) {
  const { rows } = await query(
    `INSERT INTO notifications (user_id, request_id, type, title, text, link, email)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [n.user_id || null, n.request_id || null, n.type, n.title, n.text || null,
     n.link || null, n.email || null]);
  return rows[0].id;
}

async function markRead(id, userId) {
  const { rowCount } = await query(
    'UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2', [id, userId]);
  return rowCount > 0;
}

async function markAllRead(userId) {
  const { rowCount } = await query(
    'UPDATE notifications SET is_read = true WHERE user_id = $1 AND is_read = false', [userId]);
  return rowCount;
}

/** Очередь на отправку: письма, которые ещё не ушли и не исчерпали попытки. */
async function pending(limit, maxAttempts) {
  const { rows } = await query(
    `${SELECT} WHERE n.is_sent = false AND n.attempts < $1 AND n.email IS NOT NULL
      ORDER BY n.created_at, n.id LIMIT $2`, [maxAttempts, limit]);
  return rows;
}

async function markSent(id) {
  await query(
    `UPDATE notifications
        SET is_sent = true, sent_at = now(), send_error = NULL, attempts = attempts + 1
      WHERE id = $1`, [id]);
}

async function markFailed(id, message) {
  await query(
    'UPDATE notifications SET send_error = $1, attempts = attempts + 1 WHERE id = $2',
    [String(message || '').slice(0, 500), id]);
}

module.exports = {
  findForUser, countUnread, findById, create,
  markRead, markAllRead, pending, markSent, markFailed,
};
