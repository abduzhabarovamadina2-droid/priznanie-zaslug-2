'use strict';
const { test, before, beforeEach, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');
const { query } = require('../src/db/pool');
const loginLimit = require('../src/middleware/loginLimit');

const bs = String.fromCharCode(92);

/**
 * Журнал пишется после того, как ответ уже ушёл клиенту, поэтому запись
 * появляется чуть позже самого запроса. Ждём её появления, а не гадаем
 * с фиксированной паузой.
 */
async function waitForEntry(where, args, tries = 20) {
  for (let i = 0; i < tries; i++) {
    const { rows } = await query(
      'SELECT * FROM audit_log WHERE ' + where + ' ORDER BY id DESC LIMIT 1', args);
    if (rows[0]) return rows[0];
    await new Promise((r) => setTimeout(r, 150));
  }
  return null;
}

describe('Журнал действий', () => {
  let t, balances, since;

  before(async () => {
    await h.start();
    balances = await h.snapshotBalances();
    t = await h.loginAll();
  });
  beforeEach(async () => {
    loginLimit.reset();
    await h.setBalance(1, 500);
    since = new Date().toISOString();
  });
  after(async () => {
    await h.cleanup();
    await h.restoreBalances(balances);
    loginLimit.reset();
    await h.stop();
  });

  test('удачный вход попадает в журнал', async () => {
    await h.api('POST', '/auth/login', { login: 'CORP.NB.RK' + bs + '3', password: '12345' });

    const row = await waitForEntry("action = 'вход' AND result = 'ok' AND at >= $1", [since]);
    assert.ok(row, 'вход не записан в журнал');
    assert.equal(row.method, 'POST');
    assert.equal(row.status_code, 200);
    assert.ok(row.ip, 'не записан адрес');
  });

  test('неудачный вход записывается вместе с логином, но без пароля', async () => {
    await h.api('POST', '/auth/login',
      { login: 'CORP.NB.RK' + bs + '3', password: 'СЕКРЕТНЫЙ-ПАРОЛЬ' });

    const row = await waitForEntry("action = 'вход' AND result = 'denied' AND at >= $1", [since]);
    assert.ok(row, 'неудачный вход не записан');
    assert.match(String(row.user_login), /CORP\.NB\.RK/, 'не видно, какую учётку перебирали');

    const dump = JSON.stringify(row);
    assert.ok(!dump.includes('СЕКРЕТНЫЙ-ПАРОЛЬ'), 'пароль попал в журнал');
    assert.ok(!/\$2[aby]\$/.test(dump), 'хеш пароля попал в журнал');
  });

  test('создание заявки записывается с автором и объектом', async () => {
    const item = await h.makeRequest(t.initiator, { tnumber: 'T0017', text: 'журнал' });

    const row = await waitForEntry(
      "action = 'создание заявки' AND result = 'ok' AND at >= $1", [since]);
    assert.ok(row, 'создание заявки не записано');
    assert.equal(row.entity, 'request');
    assert.equal(row.role, 'initiator');
    assert.match(String(row.user_login), /CORP\.NB\.RK/);
    assert.ok(item.id, 'заявка не создалась');
  });

  test('смена статуса записывается вместе с новым статусом', async () => {
    const item = await h.makeRequest(t.initiator, { tnumber: 'T0018', text: 'статус в журнале' });
    await h.api('PATCH', '/requests/' + item.id, { status: 'DONE' }, t.moderator);

    const row = await waitForEntry(
      "action = 'смена статуса' AND entity_id = $1 AND at >= $2", [String(item.id), since]);
    assert.ok(row, 'смена статуса не записана');
    assert.equal(row.role, 'moderator');
    assert.equal(row.details && row.details.new_status, 'DONE');
  });

  test('отказ по правам записывается как denied', async () => {
    const item = await h.makeRequest(t.initiator, { tnumber: 'T0019', text: 'отказ' });
    const denied = await h.api('PATCH', '/requests/' + item.id, { status: 'DONE' }, t.head);
    assert.equal(denied.status, 403);

    const row = await waitForEntry(
      "action = 'смена статуса' AND result = 'denied' AND entity_id = $1 AND at >= $2",
      [String(item.id), since]);
    assert.ok(row, 'попытка превысить права не записана');
    assert.equal(row.role, 'head');
    assert.equal(row.status_code, 403);
  });

  test('загрузка вложения записывается с именем и размером файла', async () => {
    const item = await h.makeRequest(t.initiator, { tnumber: 'T0020', text: 'вложение в журнале' });
    const fd = new FormData();
    fd.append('file', new Blob([Buffer.from('содержимое')], { type: 'text/plain' }), 'акт.txt');
    await h.api('POST', '/requests/' + item.id + '/attachments', fd, t.initiator);

    const row = await waitForEntry(
      "action = 'загрузка вложения' AND entity_id = $1 AND at >= $2", [String(item.id), since]);
    assert.ok(row, 'загрузка вложения не записана');
    assert.equal(row.details && row.details.file && row.details.file.name, 'акт.txt');
    assert.ok(row.details.file.size > 0, 'не записан размер файла');
  });

  test('чтение справочников журнал не засоряет', async () => {
    await h.api('GET', '/employees?limit=1', null, t.initiator);
    await h.api('GET', '/nominations', null, t.initiator);

    const { rows } = await query(
      "SELECT COUNT(*)::int AS c FROM audit_log WHERE at >= $1 AND path LIKE '%employees%'", [since]);
    assert.equal(rows[0].c, 0, 'обычное чтение справочника попало в журнал');
  });

  test('журнал открыт администратору и закрыт остальным', async () => {
    assert.equal((await h.api('GET', '/audit?limit=5', null, t.initiator)).status, 403);
    assert.equal((await h.api('GET', '/audit?limit=5', null, t.moderator)).status, 403);
    assert.equal((await h.api('GET', '/audit?limit=5', null, t.head)).status, 403);

    const ok = await h.api('GET', '/audit?limit=5', null, t.admin);
    assert.equal(ok.status, 200);
    assert.ok(Array.isArray(ok.json.items), 'журнал не отдал список');
  });

  test('журнал фильтруется по результату и объекту', async () => {
    const item = await h.makeRequest(t.initiator, { tnumber: 'T0021', text: 'фильтры' });
    await h.api('PATCH', '/requests/' + item.id, { status: 'DONE' }, t.head);   // 403
    await waitForEntry("entity_id = $1 AND result = 'denied' AND at >= $2", [String(item.id), since]);

    const denied = await h.api('GET', '/audit?result=denied&limit=20', null, t.admin);
    assert.equal(denied.status, 200);
    assert.ok(denied.json.items.length > 0, 'отказы не нашлись');
    assert.ok(denied.json.items.every((x) => x.result === 'denied'), 'в выборку попало лишнее');

    const byEntity = await h.api('GET',
      '/audit?entity=request&entity_id=' + item.id, null, t.admin);
    assert.equal(byEntity.status, 200);
    assert.ok(byEntity.json.items.every((x) => x.entity_id === String(item.id)),
      'фильтр по объекту не сработал');
  });
});
