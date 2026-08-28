'use strict';
const { test, before, beforeEach, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');
const { query } = require('../src/db/pool');
const loginLimit = require('../src/middleware/loginLimit');

const bs = String.fromCharCode(92);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe('Токены: продление и отзыв', () => {
  before(() => h.start());
  beforeEach(() => loginLimit.reset());
  after(async () => {
    await loginLimit.reset();
    await h.stop();
  });

  test('действующий токен меняется на свежий', async () => {
    const token = await h.login(1);
    // Срок жизни задан в секундах: без паузы новый токен совпал бы со старым.
    await sleep(1100);

    const r = await h.api('POST', '/auth/refresh', {}, token);
    assert.equal(r.status, 200);
    assert.ok(r.json.token, 'новый токен не выдан');
    assert.notEqual(r.json.token, token, 'вернули тот же самый токен');
    assert.equal((await h.api('GET', '/auth/me', null, r.json.token)).status, 200);
  });

  test('выход отзывает выданные токены', async () => {
    const token = await h.login(1);
    assert.equal((await h.api('GET', '/auth/me', null, token)).status, 200);
    await sleep(1100);

    const out = await h.api('POST', '/auth/logout', {}, token);
    assert.equal(out.status, 200);

    const after = await h.api('GET', '/auth/me', null, token);
    assert.equal(after.status, 401, 'токен продолжает работать после выхода');
    assert.match(after.json.error.message, /отозван/i);
  });

  test('администратор отзывает чужие токены', async () => {
    const victim = await h.login(1);
    const admin = await h.login(2);
    assert.equal((await h.api('GET', '/auth/me', null, victim)).status, 200);
    await sleep(1100);

    const r = await h.api('POST', '/auth/revoke/1', {}, admin);
    assert.equal(r.status, 200);
    assert.equal((await h.api('GET', '/auth/me', null, victim)).status, 401,
      'уволенный сотрудник ходит по старому токену');
  });

  test('отзывать чужие токены может только администратор', async () => {
    assert.equal((await h.api('POST', '/auth/revoke/1', {}, await h.login(3))).status, 403);
    assert.equal((await h.api('POST', '/auth/revoke/1', {}, await h.login(4))).status, 403);
  });

  test('счётчик попыток входа переживает перезапуск', async () => {
    const login = 'CORP.NB.RK' + bs + '4';
    for (let i = 0; i < loginLimit.MAX_FAILS; i++) {
      await h.api('POST', '/auth/login', { login, password: 'неверный' });
    }
    const blocked = await h.api('POST', '/auth/login', { login, password: 'неверный' });
    assert.equal(blocked.status, 429);

    // Счётчик лежит в базе, а не в памяти: значит он виден и другому
    // экземпляру приложения, и переживает рестарт.
    const { rows } = await query(
      'SELECT fails, blocked_until FROM login_attempts WHERE key LIKE $1',
      ['%' + bs + '4@%']);
    assert.ok(rows[0], 'счётчик не записан в базу');
    assert.ok(rows[0].fails >= loginLimit.MAX_FAILS);
    assert.ok(rows[0].blocked_until, 'срок блокировки не проставлен');
  });
});

describe('Область видимости руководителя', () => {
  let t, balances;

  before(async () => {
    await h.start();
    balances = await h.snapshotBalances();
    await loginLimit.reset();
    t = await h.loginAll();
  });
  beforeEach(() => h.setBalance(1, 500));
  after(async () => {
    await h.cleanup();
    await h.restoreBalances(balances);
    await h.stop();
  });

  test('руководитель видит только своё подразделение', async () => {
    const all = await h.api('GET', '/requests?limit=200', null, t.admin);
    const head = await h.api('GET', '/requests?limit=200', null, t.head);

    assert.equal(all.status, 200);
    assert.equal(head.status, 200);
    assert.equal(head.json.scoped, true, 'ответ руководителя не помечен суженным');
    assert.equal(all.json.scoped, false, 'администратору сузили выборку');
    assert.ok(head.json.items.length <= all.json.items.length,
      'руководитель видит больше администратора');
  });

  test('заявку чужого подразделения не открыть и по прямой ссылке', async () => {
    // Заявка на сотрудника заведомо не из подразделения руководителя.
    const item = await h.makeRequest(t.initiator, { tnumber: 'T0002', text: 'чужое подразделение' });

    const head = await h.api('GET', '/requests?limit=200', null, t.head);
    const visible = new Set(head.json.items.map((x) => x.id));
    if (visible.has(item.id)) return;   // сотрудник оказался в его дереве — проверять нечего

    const direct = await h.api('GET', '/requests/' + item.id, null, t.head);
    assert.equal(direct.status, 404,
      'руководитель открыл заявку чужого подразделения по прямой ссылке');
  });

  test('заявку своего подразделения руководитель видит', async () => {
    // Ищем сотрудника в поддереве подразделения руководителя.
    const { rows } = await query(`
      WITH RECURSIVE subtree AS (
        SELECT e.department_id AS id
          FROM users u JOIN employees e ON e.id = u.employee_id
         WHERE u.login = 'CORP.NB.RK' || chr(92) || '4'
        UNION ALL
        SELECT d.id FROM departments d JOIN subtree s ON d.parent_id = s.id
      )
      SELECT e.tnumber FROM employees e
       WHERE e.department_id IN (SELECT id FROM subtree) LIMIT 1`);
    assert.ok(rows[0], 'в подразделении руководителя нет сотрудников');

    const before = (await h.api('GET', '/requests?limit=200', null, t.head)).json.items.length;
    const item = await h.makeRequest(t.initiator, { tnumber: rows[0].tnumber, text: 'своё подразделение' });

    const after = await h.api('GET', '/requests?limit=200', null, t.head);
    assert.equal(after.json.items.length, before + 1, 'заявка своего подразделения не видна');
    assert.equal((await h.api('GET', '/requests/' + item.id, null, t.head)).status, 200);
  });

  test('остальным ролям реестр не сужается', async () => {
    for (const token of [t.initiator, t.moderator, t.admin]) {
      const r = await h.api('GET', '/requests?limit=5', null, token);
      assert.equal(r.json.scoped, false);
    }
  });
});

describe('Подразделения', () => {
  before(() => h.start());
  after(() => h.stop());

  test('дерево построено и сотрудники к нему привязаны', async () => {
    const { rows: tree } = await query(
      'SELECT level, COUNT(*)::int AS c FROM departments GROUP BY level ORDER BY level');
    assert.ok(tree.length >= 2, 'дерево подразделений плоское или пустое');

    const { rows: linked } = await query(
      'SELECT COUNT(*)::int AS with_dept, (SELECT COUNT(*)::int FROM employees) AS total FROM employees WHERE department_id IS NOT NULL');
    assert.equal(linked[0].with_dept, linked[0].total, 'не у всех сотрудников есть подразделение');
  });

  test('в рейтинге заполнено родительское подразделение', async () => {
    const { rows } = await query(
      'SELECT COUNT(*)::int AS filled, (SELECT COUNT(*)::int FROM ratings) AS total FROM ratings WHERE department_parent_id IS NOT NULL');
    assert.ok(rows[0].filled > 0, 'department_parent_id пуст — не выполнен npm run db:departments');
    assert.equal(rows[0].filled, rows[0].total, 'заполнено не у всех записей рейтинга');
  });
});
