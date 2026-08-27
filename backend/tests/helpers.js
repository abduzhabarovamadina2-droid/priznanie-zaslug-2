'use strict';
/**
 * Общая обвязка тестов.
 *
 * Приложение поднимается прямо в процессе теста на свободном порту: так не
 * нужно заранее запускать сервер и не важно, занят ли 4000. База при этом
 * настоящая — та же, что в .env: половина проверок здесь как раз про то,
 * что правила соблюдаются на уровне БД (транзакции, уникальность, откат).
 *
 * Всё созданное тестами помечается TEST_MARK и удаляется в конце прогона.
 */
const { app } = require('./app-handle');
const { query } = require('../src/db/pool');

const TEST_MARK = '[автотест]';
const bs = String.fromCharCode(92);

let server = null;
let base = '';

async function start() {
  if (server) return base;
  server = app.listen(0);
  await new Promise((res) => server.once('listening', res));
  base = `http://127.0.0.1:${server.address().port}/api`;
  return base;
}

async function stop() {
  if (!server) return;
  await new Promise((res) => server.close(res));
  server = null;
}

/** Запрос к API. Тело — JSON, если не передан готовый FormData. */
async function api(method, path, body, token) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  let payload;
  if (body instanceof FormData) {
    payload = body;                       // Content-Type проставит fetch
  } else if (body !== undefined && body !== null) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  const res = await fetch(base + path, { method, headers, body: payload });
  const raw = await res.text();
  let json = null;
  try { json = raw ? JSON.parse(raw) : null; } catch { /* не JSON — вернём как есть */ }
  return { status: res.status, json, raw, headers: res.headers };
}

/** Логин демонстрационной учётки: 1 инициатор, 2 админ, 3 модератор, 4 руководитель. */
const LOGINS = { 1: 'initiator', 2: 'admin', 3: 'moderator', 4: 'head' };

async function login(n) {
  const r = await api('POST', '/auth/login', { login: `CORP.NB.RK${bs}${n}`, password: '12345' });
  if (r.status !== 200 || !r.json || !r.json.token) {
    throw new Error(`Вход не удался для учётки ${n}: ${r.status} ${r.raw.slice(0, 120)}`);
  }
  return r.json.token;
}

/** Все четыре роли разом — так их берёт большинство файлов. */
async function loginAll() {
  const [initiator, admin, moderator, head] = await Promise.all([login(1), login(2), login(3), login(4)]);
  return { initiator, admin, moderator, head };
}

/** Создать заявку от имени токена. Помечается как тестовая. */
async function makeRequest(token, { tnumber = 'T0003', nomination = 'NOM-106', text = 'проверка' } = {}) {
  const r = await api('POST', '/requests', {
    tnumber,
    nomination_code: nomination,
    merit_text: `${TEST_MARK} ${text}`,
  }, token);
  if (r.status !== 201) {
    throw new Error(`Не удалось создать тестовую заявку: ${r.status} ${JSON.stringify(r.json)}`);
  }
  return r.json.item;
}

async function balanceOf(token) {
  const r = await api('GET', '/auth/me', null, token);
  return r.json.user.pointsBalance;
}

/**
 * Выставить баланс баллов учётной записи.
 *
 * Тесты тратят баллы, а их у демонстрационного инициатора всего 50 — без
 * пополнения прогон выдыхается на середине, и падают не те проверки,
 * которые сломаны. Исходные значения возвращаются в restoreBalances.
 */
async function setBalance(loginNumber, value) {
  await query(
    'UPDATE users SET points_balance = $1 WHERE login = $2',
    [value, 'CORP.NB.RK' + bs + loginNumber]);
}

/** Балансы до прогона — их возвращаем на место в конце. */
async function snapshotBalances() {
  const { rows } = await query('SELECT id, points_balance FROM users ORDER BY id');
  return rows;
}

async function restoreBalances(rows) {
  for (const r of rows) {
    await query('UPDATE users SET points_balance = $1 WHERE id = $2', [r.points_balance, r.id]);
  }
}

/**
 * Убрать за собой: заявки с меткой и всё, что к ним привязано.
 * Файлы вложений с диска тоже — иначе останется мусор, на который
 * никто не ссылается.
 */
async function cleanup() {
  const fs = require('fs');
  const path = require('path');
  const uploads = require('../src/config/uploads');

  const { rows } = await query('SELECT id FROM requests WHERE merit_text LIKE $1', [`${TEST_MARK}%`]);
  const ids = rows.map((r) => r.id);
  if (!ids.length) return 0;

  const att = await query('SELECT storage_key FROM attachments WHERE request_id = ANY($1)', [ids]);
  for (const a of att.rows) {
    try { fs.unlinkSync(path.join(uploads.dir, a.storage_key)); } catch { /* уже нет — не беда */ }
  }
  await query('DELETE FROM attachments      WHERE request_id = ANY($1)', [ids]);
  await query('DELETE FROM notifications    WHERE request_id = ANY($1)', [ids]);
  await query('DELETE FROM request_history  WHERE request_id = ANY($1)', [ids]);
  await query('DELETE FROM requests         WHERE id = ANY($1)', [ids]);
  return ids.length;
}

module.exports = {
  TEST_MARK, LOGINS,
  start, stop, api, login, loginAll, makeRequest,
  balanceOf, setBalance, snapshotBalances, restoreBalances, cleanup,
};
