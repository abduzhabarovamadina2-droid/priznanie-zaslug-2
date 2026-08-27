'use strict';
const { test, before, beforeEach, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');
const loginLimit = require('../src/middleware/loginLimit');

const bs = String.fromCharCode(92);
const USER = 'CORP.NB.RK' + bs + '1';

/** Одна попытка входа с заведомо неверным паролем. */
const badTry = (login) => h.api('POST', '/auth/login', { login, password: 'заведомо-неверный' });

describe('Ограничение попыток входа', () => {
  before(() => h.start());
  // Счётчик живёт в памяти процесса — между проверками его надо обнулять,
  // иначе первый же тест исчерпает лимит для остальных.
  beforeEach(() => loginLimit.reset());
  after(async () => {
    loginLimit.reset();
    await h.stop();
  });

  test('после серии неудачных попыток вход блокируется', async () => {
    for (let i = 0; i < loginLimit.MAX_FAILS; i++) {
      const r = await badTry(USER);
      assert.equal(r.status, 401, `попытка ${i + 1} должна отвечать 401`);
    }

    const blocked = await badTry(USER);
    assert.equal(blocked.status, 429, 'перебор пароля не остановлен');
    assert.match(blocked.json.error.message, /Слишком много неудачных попыток/);
    assert.ok(blocked.json.error.details.retry_after_sec > 0, 'не сказано, когда повторить');
  });

  test('блокировка держится и на верном пароле', async () => {
    for (let i = 0; i < loginLimit.MAX_FAILS; i++) await badTry(USER);

    const r = await h.api('POST', '/auth/login', { login: USER, password: '12345' });
    assert.equal(r.status, 429, 'после блокировки пустили по верному паролю');
  });

  test('удачный вход обнуляет счётчик', async () => {
    for (let i = 0; i < loginLimit.MAX_FAILS - 1; i++) await badTry(USER);

    const good = await h.api('POST', '/auth/login', { login: USER, password: '12345' });
    assert.equal(good.status, 200);

    // Счётчик обнулён — значит снова доступны все попытки.
    for (let i = 0; i < loginLimit.MAX_FAILS; i++) {
      const r = await badTry(USER);
      assert.equal(r.status, 401, `после удачного входа попытка ${i + 1} не должна блокироваться`);
    }
  });

  test('блокировка одной учётки не задевает другие', async () => {
    for (let i = 0; i < loginLimit.MAX_FAILS + 1; i++) await badTry(USER);
    assert.equal((await badTry(USER)).status, 429);

    const other = await h.api('POST', '/auth/login',
      { login: 'CORP.NB.RK' + bs + '3', password: '12345' });
    assert.equal(other.status, 200, 'заблокировали заодно и соседнюю учётную запись');
  });

  test('перебор несуществующих логинов тоже упирается в лимит', async () => {
    for (let i = 0; i < loginLimit.MAX_FAILS; i++) await badTry('НЕТ-ТАКОГО-ЛОГИНА');
    const r = await badTry('НЕТ-ТАКОГО-ЛОГИНА');
    assert.equal(r.status, 429);
  });
});
