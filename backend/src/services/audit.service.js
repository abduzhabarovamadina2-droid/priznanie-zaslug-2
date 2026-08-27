'use strict';
const { query } = require('../db/pool');
const logger = require('../utils/logger');

/**
 * Журнал действий.
 *
 * Пишется на каждый значимый запрос: кто, когда, что сделал и чем это
 * кончилось. Отдельно от истории заявки — та описывает жизнь одной заявки,
 * а журнал отвечает на вопрос «что делал этот человек», включая входы и
 * отказы по правам.
 *
 * Запись в журнал никогда не ломает основную операцию: если журнал
 * недоступен, заявка всё равно должна быть согласована. Ошибка уходит
 * в лог сервера, а запрос продолжает жить.
 */

/* Какие маршруты попадают в журнал и как это назвать по-человечески.
   Порядок важен: берётся первое совпадение. */
const RULES = [
  { method: 'POST',   re: /^\/auth\/login$/,                    action: 'вход',                entity: 'user' },
  { method: 'POST',   re: /^\/requests$/,                       action: 'создание заявки',     entity: 'request' },
  { method: 'PATCH',  re: /^\/requests\/([^/]+)$/,              action: 'смена статуса',       entity: 'request' },
  { method: 'POST',   re: /^\/requests\/([^/]+)\/withdraw$/,    action: 'отзыв заявки',        entity: 'request' },
  { method: 'DELETE', re: /^\/requests\/([^/]+)$/,              action: 'удаление заявки',     entity: 'request' },
  { method: 'POST',   re: /^\/requests\/([^/]+)\/attachments$/, action: 'загрузка вложения',   entity: 'request' },
  { method: 'DELETE', re: /^\/attachments\/([^/]+)$/,           action: 'удаление вложения',   entity: 'attachment' },
  { method: 'GET',    re: /^\/attachments\/([^/]+)\/download$/, action: 'скачивание вложения', entity: 'attachment' },
  { method: 'POST',   re: /^\/notifications\/flush$/,           action: 'разбор очереди писем', entity: 'system' },
];

function match(method, path) {
  for (const rule of RULES) {
    if (rule.method !== method) continue;
    const m = rule.re.exec(path);
    if (m) return { action: rule.action, entity: rule.entity, entityId: m[1] || null };
  }
  return null;
}

/** Чем кончился запрос — тремя словами, чтобы журнал читался глазами. */
function resultOf(status) {
  if (status < 400) return 'ok';
  if (status === 401 || status === 403) return 'denied';
  return 'error';
}

async function write(entry) {
  try {
    await query(
      `INSERT INTO audit_log (user_id, user_login, role, action, entity, entity_id,
                              result, status_code, method, path, ip, details)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [entry.userId || null, entry.userLogin || null, entry.role || null,
       entry.action, entry.entity || null, entry.entityId || null,
       entry.result, entry.statusCode || null, entry.method || null,
       String(entry.path || '').slice(0, 255), entry.ip || null,
       entry.details ? JSON.stringify(entry.details) : null]);
  } catch (e) {
    logger.error('Журнал действий: запись не сохранена — ' + e.message);
  }
}

/** Чтение журнала: фильтры по человеку, объекту, действию и результату. */
async function list(params = {}) {
  const where = [];
  const args = [];
  const add = (sql, value) => { args.push(value); where.push(sql.replace('$$', '$' + args.length)); };

  if (params.user)   add('(u.login ILIKE $$ OR a.user_login ILIKE $$)', '%' + params.user + '%');
  if (params.entity) add('a.entity = $$', params.entity);
  if (params.entity_id) add('a.entity_id = $$', String(params.entity_id));
  if (params.action) add('a.action ILIKE $$', '%' + params.action + '%');
  if (params.result) add('a.result = $$', params.result);
  if (params.since)  add('a.at >= $$', params.since);

  const limit = Math.min(Number(params.limit) || 100, 500);
  const offset = Math.max(Number(params.offset) || 0, 0);
  args.push(limit, offset);

  const sql = `
    SELECT a.id, a.at, a.user_id, COALESCE(u.login, a.user_login) AS user_login,
           a.role, a.action, a.entity, a.entity_id, a.result, a.status_code,
           a.method, a.path, a.ip, a.details
      FROM audit_log a
      LEFT JOIN users u ON u.id = a.user_id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY a.at DESC, a.id DESC
     LIMIT $${args.length - 1} OFFSET $${args.length}`;

  const { rows } = await query(sql, args);
  return { items: rows, limit, offset };
}

module.exports = { match, resultOf, write, list, RULES };
