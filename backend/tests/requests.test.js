'use strict';
const { test, before, beforeEach, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

describe('Заявки: создание, правила, статусы', () => {
  let t, balances;

  before(async () => {
    await h.start();
    balances = await h.snapshotBalances();
    t = await h.loginAll();
  });
  // Баллы — расходный материал: пополняем перед каждой проверкой, чтобы
  // порядок тестов не влиял на результат.
  beforeEach(() => h.setBalance(1, 500));

  after(async () => {
    await h.cleanup();
    await h.restoreBalances(balances);
    await h.stop();
  });

  test('заявка создаётся и возвращается клиенту целиком', async () => {
    const item = await h.makeRequest(t.initiator, { text: 'создание' });
    assert.ok(item.id, 'сервер не вернул созданную заявку');
    assert.equal(item.status_code, 'WAIT');
    assert.ok(item.request_no, 'нет номера заявки');
    assert.ok(item.employee_fio, 'в заявке не заполнен сотрудник');
  });

  test('номинацию можно указать кодом или названием — результат один', async () => {
    const byCode = await h.api('POST', '/requests',
      { tnumber: 'T0004', nomination_code: 'NOM-106', merit_text: h.TEST_MARK + ' код' }, t.initiator);
    const byName = await h.api('POST', '/requests',
      { tnumber: 'T0005', nomination: 'За корпоративный дух', merit_text: h.TEST_MARK + ' название' }, t.initiator);
    assert.equal(byCode.status, 201);
    assert.equal(byName.status, 201);
    assert.equal(byCode.json.item.nomination_id, byName.json.item.nomination_id);
  });

  test('неизвестная номинация — 400', async () => {
    const r = await h.api('POST', '/requests',
      { tnumber: 'T0003', nomination_code: 'NOM-999' }, t.initiator);
    assert.equal(r.status, 400);
  });

  test('стоимость берётся из справочника, а не из тела запроса', async () => {
    const noms = await h.api('GET', '/nominations', null, t.initiator);
    const cheap = noms.json.items.find((n) => n.code === 'NOM-106');
    const r = await h.api('POST', '/requests',
      { tnumber: 'T0006', nomination_code: 'NOM-106', points: 9999, merit_text: h.TEST_MARK + ' цена' }, t.initiator);
    assert.equal(r.status, 201);
    assert.equal(r.json.item.points, cheap.points, 'клиент смог назначить цену заявки сам');
  });

  test('баллы списываются при подаче и возвращаются при отзыве', async () => {
    const before = await h.balanceOf(t.initiator);
    const item = await h.makeRequest(t.initiator, { tnumber: 'T0007', text: 'баллы' });
    assert.equal(await h.balanceOf(t.initiator), before - item.points, 'баллы не списаны');

    const w = await h.api('POST', '/requests/' + item.id + '/withdraw', { comment: 'передумал' }, t.initiator);
    assert.equal(w.status, 200);
    assert.equal(await h.balanceOf(t.initiator), before, 'баллы не вернулись после отзыва');
  });

  test('повторная заявка на того же сотрудника по той же номинации — 409', async () => {
    await h.makeRequest(t.initiator, { tnumber: 'T0008', nomination: 'NOM-106', text: 'первая' });
    const before = await h.balanceOf(t.initiator);

    const dup = await h.api('POST', '/requests',
      { tnumber: 'T0008', nomination_code: 'NOM-106', merit_text: h.TEST_MARK + ' дубль' }, t.initiator);
    assert.equal(dup.status, 409);
    assert.match(dup.json.error.message, /уже есть заявка/);
    assert.equal(await h.balanceOf(t.initiator), before, 'за отклонённый дубль списали баллы');

    // Другая номинация на того же человека дублем не считается.
    const other = await h.api('POST', '/requests',
      { tnumber: 'T0008', nomination_code: 'NOM-105', merit_text: h.TEST_MARK + ' другая номинация' }, t.initiator);
    assert.equal(other.status, 201);
  });

  test('без баллов заявку подать нельзя', async () => {
    await h.setBalance(1, 5);            // дешевле любой номинации
    const r = await h.api('POST', '/requests',
      { tnumber: 'T0009', nomination_code: 'NOM-106', merit_text: h.TEST_MARK + ' дорогая' }, t.initiator);
    assert.equal(r.status, 409, 'заявка прошла при недостатке баллов');
    assert.match(r.json.error.message, /Недостаточно баллов/);
  });

  test('согласовать может модератор, но не инициатор и не руководитель', async () => {
    const item = await h.makeRequest(t.initiator, { tnumber: 'T0010', text: 'согласование' });

    assert.equal((await h.api('PATCH', '/requests/' + item.id, { status: 'DONE' }, t.initiator)).status, 403);
    assert.equal((await h.api('PATCH', '/requests/' + item.id, { status: 'DONE' }, t.head)).status, 403);

    const ok = await h.api('PATCH', '/requests/' + item.id, { status: 'DONE' }, t.moderator);
    assert.equal(ok.status, 200);
    assert.equal(ok.json.item.status_code, 'DONE');
  });

  test('отозвать можно только собственную заявку', async () => {
    const mine = await h.makeRequest(t.initiator, { tnumber: 'T0011', text: 'отзыв' });
    // У модератора нет права withdraw вовсе.
    assert.equal((await h.api('POST', '/requests/' + mine.id + '/withdraw', {}, t.moderator)).status, 403);
    assert.equal((await h.api('POST', '/requests/' + mine.id + '/withdraw', {}, t.initiator)).status, 200);
  });

  test('из конечного статуса заявка дальше не двигается', async () => {
    const item = await h.makeRequest(t.initiator, { tnumber: 'T0012', text: 'конечный статус' });
    await h.api('PATCH', '/requests/' + item.id, { status: 'DONE' }, t.moderator);
    const again = await h.api('PATCH', '/requests/' + item.id, { status: 'REJECTED' }, t.moderator);
    assert.equal(again.status, 400);
  });

  test('баллы не возвращаются дважды: отклонение, затем отказ администратора', async () => {
    const item = await h.makeRequest(t.initiator, { tnumber: 'T0013', text: 'двойной возврат' });
    await h.api('PATCH', '/requests/' + item.id, { status: 'REJECTED' }, t.moderator);
    const afterReject = await h.balanceOf(t.initiator);

    await h.api('PATCH', '/requests/' + item.id, { status: 'REJECTED_ADMIN' }, t.admin);
    assert.equal(await h.balanceOf(t.initiator), afterReject, 'баллы вернулись второй раз');
  });

  test('автор действия берётся из токена, а не из тела запроса', async () => {
    const item = await h.makeRequest(t.initiator, { tnumber: 'T0014', text: 'автор' });
    await h.api('PATCH', '/requests/' + item.id,
      { status: 'REJECTED', performed_by_name: 'ПОДСТАВНОЕ ИМЯ' }, t.moderator);

    const full = await h.api('GET', '/requests/' + item.id, null, t.moderator);
    const last = full.json.item.history.at(-1);
    assert.ok(!String(last.performed_by_name).includes('ПОДСТАВНОЕ'),
      'клиент назначил автора записи в истории');
    assert.match(last.performed_by_name, /CORP\.NB\.RK/);
  });

  test('удалить заявку может только администратор, баллы возвращаются', async () => {
    const item = await h.makeRequest(t.initiator, { tnumber: 'T0015', text: 'удаление' });
    const before = await h.balanceOf(t.initiator);

    assert.equal((await h.api('DELETE', '/requests/' + item.id, null, t.initiator)).status, 403);
    assert.equal((await h.api('DELETE', '/requests/' + item.id, null, t.moderator)).status, 403);
    assert.equal((await h.api('DELETE', '/requests/' + item.id, null, t.admin)).status, 200);

    assert.equal(await h.balanceOf(t.initiator), before + item.points, 'баллы за удалённую не вернулись');
    assert.equal((await h.api('GET', '/requests/' + item.id, null, t.admin)).status, 404);
  });

  test('история заявки пишется на каждое действие', async () => {
    const item = await h.makeRequest(t.initiator, { tnumber: 'T0016', text: 'история' });
    await h.api('PATCH', '/requests/' + item.id, { status: 'DONE', comment: 'согласовано' }, t.moderator);

    const full = await h.api('GET', '/requests/' + item.id, null, t.moderator);
    const actions = full.json.item.history.map((x) => x.action);
    assert.deepEqual(actions, ['Создано', 'Согласовано']);
  });
});
