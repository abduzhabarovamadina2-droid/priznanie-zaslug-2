'use strict';
const { query } = require('../db/pool');

/**
 * Профиль без password_hash — то, что можно отдавать наружу.
 * Хеш выбирается отдельным запросом и только для проверки пароля.
 */
const PROFILE = `
  SELECT u.id, u.login, u.email, u.is_active, u.group_code, u.points_balance,
         u.employee_id, u.created_at, u.tokens_valid_from,
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

/**
 * Отзыв всех выданных токенов пользователя.
 *
 * Сами токены нигде не хранятся — вместо списка отозванных двигаем черту:
 * всё, что выдано раньше tokens_valid_from, перестаёт приниматься. Так
 * уволенный сотрудник теряет доступ сразу, а не через восемь часов.
 */
async function revokeTokens(userId) {
  const { rowCount } = await query(
    'UPDATE users SET tokens_valid_from = now() WHERE id = $1', [userId]);
  return rowCount > 0;
}

/** Отзыв у всех сразу — на случай утечки секрета. */
async function revokeAllTokens() {
  const { rowCount } = await query('UPDATE users SET tokens_valid_from = now()');
  return rowCount;
}

/** Включение и отключение учётной записи. Отключение отзывает токены. */
async function setActive(userId, isActive) {
  const { rows } = await query(
    `UPDATE users
        SET is_active = $1,
            tokens_valid_from = CASE WHEN $1 = false THEN now() ELSE tokens_valid_from END
      WHERE id = $2
      RETURNING id, login, is_active`, [isActive, userId]);
  return rows[0] || null;
}

module.exports = { findById, findByLogin, findPasswordHash, revokeTokens, revokeAllTokens, setActive };
