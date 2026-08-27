'use strict';
const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

const bs = String.fromCharCode(92);

describe('Вход и права', () => {
  before(() => h.start());
  after(() => h.stop());

  test('верные логин и пароль выдают токен и профиль', async () => {
    const r = await h.api('POST', '/auth/login', { login: `CORP.NB.RK${bs}1`, password: '12345' });
    assert.equal(r.status, 200);
    assert.ok(r.json.token, 'токен не выдан');
    assert.equal(r.json.user.role, 'initiator');
    assert.ok(r.json.user.employee, 'профиль без сотрудника');
  });

  test('пароль в ответе не появляется ни в каком виде', async () => {
    const r = await h.api('POST', '/auth/login', { login: `CORP.NB.RK${bs}1`, password: '12345' });
    assert.ok(!/12345|password_hash|\$2[aby]\$/.test(r.raw), 'в ответе видны следы пароля');
  });

  test('неверный пароль — 401, и ответ тот же, что для несуществующего логина', async () => {
    const wrongPass = await h.api('POST', '/auth/login', { login: `CORP.NB.RK${bs}1`, password: 'неверный' });
    const noUser = await h.api('POST', '/auth/login', { login: 'НЕТ-ТАКОГО', password: 'неверный' });
    assert.equal(wrongPass.status, 401);
    assert.equal(noUser.status, 401);
    assert.equal(wrongPass.json.error.message, noUser.json.error.message,
      'по разнице ответов можно перебором выяснить, какие учётки существуют');
  });

  test('без токена закрытые маршруты отвечают 401', async () => {
    for (const path of ['/auth/me', '/employees', '/requests', '/notifications']) {
      const r = await h.api('GET', path);
      assert.equal(r.status, 401, `${path} пустил без токена`);
    }
  });

  test('подделанный токен не принимается', async () => {
    const good = await h.login(1);
    const broken = good.slice(0, -3) + 'xxx';
    const r = await h.api('GET', '/auth/me', null, broken);
    assert.equal(r.status, 401);
  });

  test('каждая роль получает свой набор прав', async () => {
    const expected = {
      1: ['create', 'view', 'reports', 'form', 'withdraw', 'attach'],
      3: ['create', 'view', 'reports', 'refsView', 'moderate', 'state'],
      4: ['view', 'reports'],
    };
    for (const [n, perms] of Object.entries(expected)) {
      const token = await h.login(Number(n));
      const r = await h.api('GET', '/auth/me', null, token);
      assert.deepEqual([...r.json.user.permissions].sort(), [...perms].sort(),
        `права роли ${h.LOGINS[n]} разошлись с матрицей`);
    }
  });

  test('ошибки приходят в JSON, а не HTML-страницей', async () => {
    const r = await h.api('POST', '/auth/login', { login: 'нет', password: 'нет' });
    assert.match(r.headers.get('content-type') || '', /application\/json/);
    assert.equal(r.json.ok, false);
    assert.ok(r.json.error.message, 'нет текста ошибки для пользователя');
  });

  test('неизвестный маршрут — 404 в JSON', async () => {
    const r = await h.api('GET', '/такого-маршрута-нет');
    assert.equal(r.status, 404);
    assert.equal(r.json.ok, false);
  });
});
