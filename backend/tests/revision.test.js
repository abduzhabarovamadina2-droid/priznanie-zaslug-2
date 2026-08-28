'use strict';
const { test, before, beforeEach, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

describe('Возврат заявки на доработку', () => {
  let t, balances;

  before(async () => {
    await h.start();
    balances = await h.snapshotBalances();
    t = await h.loginAll();
  });
  beforeEach(() => h.setBalance(1, 500));
  after(async () => {
    await h.cleanup();
    await h.restoreBalances(balances);
    await h.stop();
  });

  test('статус «На доработке» есть в справочнике', async () => {
    const item = await h.makeRequest(t.initiator, { tnumber: 'T0017', text: 'справочник статусов' });
    const r = await h.api('PATCH', '/requests/' + item.id,
      { status: 'REVISION', comment: 'уточните формулировку' }, t.moderator);
    assert.equal(r.status, 200);
    assert.equal(r.json.item.status_code, 'REVISION');
    assert.equal(r.json.item.status_name, 'На доработке');
  });

  test('без примечания заявку не вернуть', async () => {
    const item = await h.makeRequest(t.initiator, { tnumber: 'T0018', text: 'без примечания' });

    const empty = await h.api('PATCH', '/requests/' + item.id, { status: 'REVISION' }, t.moderator);
    assert.equal(empty.status, 400, 'заявку вернули, не объяснив что исправить');
    assert.match(empty.json.error.message, /примечание обязательно/i);

    const spaces = await h.api('PATCH', '/requests/' + item.id,
      { status: 'REVISION', comment: '   ' }, t.moderator);
    assert.equal(spaces.status, 400, 'пробелы приняли за примечание');
  });

  test('примечание видно в самой заявке, а не только в истории', async () => {
    const item = await h.makeRequest(t.initiator, { tnumber: 'T0019', text: 'примечание' });
    await h.api('PATCH', '/requests/' + item.id,
      { status: 'REVISION', comment: 'Укажите конкретное достижение' }, t.moderator);

    const full = await h.api('GET', '/requests/' + item.id, null, t.initiator);
    assert.equal(full.json.item.revision_note, 'Укажите конкретное достижение');
  });

  test('вернуть на доработку может модератор, но не инициатор и не руководитель', async () => {
    const item = await h.makeRequest(t.initiator, { tnumber: 'T0020', text: 'права на возврат' });
    const body = { status: 'REVISION', comment: 'исправьте' };

    assert.equal((await h.api('PATCH', '/requests/' + item.id, body, t.initiator)).status, 403);
    assert.equal((await h.api('PATCH', '/requests/' + item.id, body, t.head)).status, 403);
    assert.equal((await h.api('PATCH', '/requests/' + item.id, body, t.moderator)).status, 200);
  });

  test('на доработке баллы остаются списанными', async () => {
    const before = await h.balanceOf(t.initiator);
    const item = await h.makeRequest(t.initiator, { tnumber: 'T0021', text: 'баллы на доработке' });
    const afterCreate = await h.balanceOf(t.initiator);

    await h.api('PATCH', '/requests/' + item.id,
      { status: 'REVISION', comment: 'доработайте' }, t.moderator);

    assert.equal(await h.balanceOf(t.initiator), afterCreate,
      'баллы вернулись, хотя заявка не закрыта');
    assert.equal(afterCreate, before - item.points);
  });

  test('инициатор отправляет доработанную заявку заново', async () => {
    const item = await h.makeRequest(t.initiator, { tnumber: 'T0022', text: 'повторная отправка' });
    await h.api('PATCH', '/requests/' + item.id,
      { status: 'REVISION', comment: 'доработайте' }, t.moderator);
    const afterRevision = await h.balanceOf(t.initiator);

    const back = await h.api('POST', '/requests/' + item.id + '/resubmit',
      { comment: 'исправил' }, t.initiator);
    assert.equal(back.status, 200);
    assert.equal(back.json.item.status_code, 'WAIT');
    assert.equal(back.json.item.revision_note, null, 'замечание осталось после исправления');
    assert.equal(await h.balanceOf(t.initiator), afterRevision,
      'при повторной отправке баллы списались второй раз');
  });

  test('отправить заново может только инициатор своей заявки', async () => {
    const item = await h.makeRequest(t.initiator, { tnumber: 'T0023', text: 'чужая доработка' });
    await h.api('PATCH', '/requests/' + item.id,
      { status: 'REVISION', comment: 'доработайте' }, t.moderator);

    assert.equal((await h.api('POST', '/requests/' + item.id + '/resubmit', {}, t.head)).status, 403);
    assert.equal((await h.api('POST', '/requests/' + item.id + '/resubmit', {}, t.moderator)).status, 403);
    assert.equal((await h.api('POST', '/requests/' + item.id + '/resubmit', {}, t.initiator)).status, 200);
  });

  test('отзыв с доработки возвращает баллы', async () => {
    const before = await h.balanceOf(t.initiator);
    const item = await h.makeRequest(t.initiator, { tnumber: 'T0024', text: 'отзыв с доработки' });
    await h.api('PATCH', '/requests/' + item.id,
      { status: 'REVISION', comment: 'доработайте' }, t.moderator);

    const w = await h.api('POST', '/requests/' + item.id + '/withdraw', { comment: 'передумал' }, t.initiator);
    assert.equal(w.status, 200);
    assert.equal(await h.balanceOf(t.initiator), before, 'баллы не вернулись');
  });

  test('весь цикл записывается в историю', async () => {
    const item = await h.makeRequest(t.initiator, { tnumber: 'T0002', text: 'история доработки' });
    await h.api('PATCH', '/requests/' + item.id, { status: 'REVISION', comment: 'уточните' }, t.moderator);
    await h.api('POST', '/requests/' + item.id + '/resubmit', { comment: 'уточнил' }, t.initiator);
    await h.api('PATCH', '/requests/' + item.id, { status: 'DONE' }, t.moderator);

    const full = await h.api('GET', '/requests/' + item.id, null, t.moderator);
    assert.deepEqual(full.json.item.history.map((x) => x.action),
      ['Создано', 'Направлено на доработку', 'Отправлено повторно', 'Согласовано']);
  });
});
