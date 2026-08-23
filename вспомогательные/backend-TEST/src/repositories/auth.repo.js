'use strict';
const { query } = require('../db/pool');

/**
 * Профиль без password_hash — то, что можно отдавать наружу.
 * Хеш выбирается отдельным запросом и только для проверки пароля.
 */
const PROFILE = `
  SELECT u.id, u.login, u.email, u.is_active, u.group_code, u.points_balance,
         u.employee_id, u.created_at,
         r.code AS role, r.name AS role_name,
         e.tnumber, e.fio, e.short_name, e.post, e.dept, e.branch, e.dep
    FROM users u
    JOIN roles r ON r.id = u.role_id
    LEFT JOIN employees e ON e.id = u.employee_id`;

async function findById(id) {
  const { rows } = await query(`${PROFILE} WHERE u.id = $1`, [id]);
  return rows[0] || null;
}

async function findByLogin(login) {
  const { rows } = await query(`${PROFILE} WHERE u.login = $1`, [login]);
  return rows[0] || null;
}

/** Только хеш, отдельно — чтобы он не попадал в объекты профиля. */
async function findPasswordHash(userId) {
  const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [userId]);
  return rows[0] ? rows[0].password_hash : null;
}

module.exports = { findById, findByLogin, findPasswordHash };
