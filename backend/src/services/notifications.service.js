'use strict';
const repo = require('../repositories/notifications.repo');
const { query } = require('../db/pool');
const mailConfig = require('../config/mail');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

/**
 * Уведомления о движении заявки.
 *
 * Уведомление всегда появляется в интерфейсе — это работает уже сейчас.
 * Письмо уходит тем же уведомлением, если у получателя известен адрес:
 * в исходном справочнике сотрудников почты нет, поэтому поле email пока
 * пустует и очередь писем его пропускает. Как только адреса появятся в
 * users.email или employees.email, рассылка заработает без правок кода.
 */

/* Кого уведомляем о каждом событии. Роли — из справочника roles. */
const MODERATOR_ROLES = ['moderator', 'admin'];

/** Адрес получателя: свой, затем адрес сотрудника, затем перехват стенда. */
function addressOf(row) {
  return row.user_email || row.employee_email || mailConfig.redirectTo || null;
}

/** Пользователи по ролям — кому уходит «поступила новая заявка». */
async function usersByRoles(roles) {
  const { rows } = await query(
    `SELECT u.id, u.email AS user_email, e.email AS employee_email
       FROM users u
       JOIN roles r ON r.id = u.role_id
       LEFT JOIN employees e ON e.id = u.employee_id
      WHERE r.code = ANY($1) AND u.is_active = true`, [roles]);
  return rows;
}

/** Пользователь, привязанный к сотруднику: получателю благодарности. */
async function userOfEmployee(employeeId) {
  if (!employeeId) return null;
  const { rows } = await query(
    `SELECT u.id, u.email AS user_email, e.email AS employee_email
       FROM users u
       LEFT JOIN employees e ON e.id = u.employee_id
      WHERE u.employee_id = $1 AND u.is_active = true
      LIMIT 1`, [employeeId]);
  return rows[0] || null;
}

async function userById(userId) {
  if (!userId) return null;
  const { rows } = await query(
    `SELECT u.id, u.email AS user_email, e.email AS employee_email
       FROM users u
       LEFT JOIN employees e ON e.id = u.employee_id
      WHERE u.id = $1`, [userId]);
  return rows[0] || null;
}

/** Одна запись уведомления. Ошибку глотаем: заявка важнее уведомления. */
async function push(target, note) {
  if (!target) return null;
  try {
    return await repo.create({
      user_id: target.id,
      request_id: note.request_id,
      type: note.type,
      title: note.title,
      text: note.text,
      link: note.link || 'zaslugi',
      email: addressOf(target),
    });
  } catch (e) {
    logger.error(`Уведомление «${note.type}» не создано: ${e.message}`);
    return null;
  }
}

/**
 * События заявки.
 *
 * Вызывается после того, как изменение уже записано в базу. Уведомление —
 * следствие, а не часть операции: если оно не создалось, заявка всё равно
 * согласована, и падать из-за этого нельзя.
 */
async function onRequestCreated(request) {
  const mods = await usersByRoles(MODERATOR_ROLES);
  const title = 'Новая заявка на рассмотрение';
  const text = `Поступила заявка ${request.request_no} на ${request.employee_fio}`
    + ` по номинации «${request.nomination}».`;
  await Promise.all(mods.map((m) => push(m, {
    request_id: request.id, type: 'request_created', title, text,
  })));
  return mods.length;
}

async function onStatusChanged(request, previousCode, actor) {
  const code = request.status_code;
  const who = actor ? actor.login : 'система';
  const tasks = [];

  if (code === 'DONE') {
    const recipient = await userOfEmployee(request.employee_id);
    tasks.push(push(recipient, {
      request_id: request.id, type: 'thanks_received',
      title: 'Вам направили благодарность',
      text: `Заявка ${request.request_no} по номинации «${request.nomination}» согласована.`,
    }));
    tasks.push(push(await userById(request.initiator_user_id), {
      request_id: request.id, type: 'request_approved',
      title: 'Ваша заявка согласована',
      text: `Заявка ${request.request_no} на ${request.employee_fio} согласована (${who}).`,
    }));
  } else if (code === 'REJECTED' || code === 'REJECTED_ADMIN') {
    tasks.push(push(await userById(request.initiator_user_id), {
      request_id: request.id, type: 'request_rejected',
      title: 'Ваша заявка отклонена',
      text: `Заявка ${request.request_no} на ${request.employee_fio} отклонена (${who}).`
        + ` Баллы возвращены на Ваш счёт.`,
    }));
  } else if (code === 'CANCEL') {
    // Отозвал сам инициатор — уведомляем тех, кто мог взять её в работу.
    const mods = await usersByRoles(MODERATOR_ROLES);
    mods.forEach((m) => tasks.push(push(m, {
      request_id: request.id, type: 'request_withdrawn',
      title: 'Заявка отозвана инициатором',
      text: `Заявка ${request.request_no} отозвана и больше не требует рассмотрения.`,
    })));
  }

  await Promise.all(tasks);
  return { from: previousCode, to: code, sent: tasks.length };
}

/* ---------- чтение из интерфейса ---------- */

async function listForUser(user, params = {}) {
  if (!user) throw new AppError('Требуется авторизация', 401);
  const limit = Math.min(Number(params.limit) || 50, 200);
  const offset = Math.max(Number(params.offset) || 0, 0);
  const items = await repo.findForUser(user.id, {
    unreadOnly: String(params.unread || '') === '1', limit, offset,
  });
  const unread = await repo.countUnread(user.id);
  return { items, unread, limit, offset };
}

async function markRead(id, user) {
  const note = await repo.findById(id);
  if (!note) throw AppError.notFound('Уведомление');
  // Чужое уведомление не читаем и не помечаем: ответ тот же, что для
  // несуществующего, — чтобы нельзя было перебором узнать чужие id.
  if (note.user_id !== user.id) throw AppError.notFound('Уведомление');
  await repo.markRead(id, user.id);
  return { id: Number(id), is_read: true };
}

async function markAllRead(user) {
  const count = await repo.markAllRead(user.id);
  return { marked: count };
}

module.exports = {
  onRequestCreated, onStatusChanged,
  listForUser, markRead, markAllRead,
};
