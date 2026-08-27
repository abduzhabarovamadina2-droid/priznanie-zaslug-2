'use strict';
const { test, before, beforeEach, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

/** Уведомления пользователя по конкретной заявке. */
async function notesFor(token, requestId) {
  const r = await h.api('GET', '/notifications?limit=200', null, token);
  return (r.json.items || []).filter((n) => n.request_id === requestId);
}

describe('Уведомления', () => {
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

  test('о новой заявке узнают те, кто её рассматривает', async () => {
    const item = await h.makeRequest(t.initiator, { tnumber: 'T0017', text: 'новая заявка' });

    const forModerator = await notesFor(t.moderator, item.id);
    assert.equal(forModerator.length, 1, 'модератор не получил уведомления');
    assert.equal(forModerator[0].type, 'request_created');

    const forAdmin = await notesFor(t.admin, item.id);
    assert.equal(forAdmin.length, 1, 'администратор не получил уведомления');

    const forHead = await notesFor(t.head, item.id);
    assert.equal(forHead.length, 0, 'руководителю пришло уведомление, хотя заявки он не рассматривает');
  });

  test('о согласовании узнают и получатель, и инициатор', async () => {
    // Заявка на сотрудника, у которого есть учётная запись (T0001 — инициатор).
    const item = await h.makeRequest(t.admin, { tnumber: 'T0001', text: 'согласование' });
    await h.api('PATCH', '/requests/' + item.id, { status: 'DONE' }, t.moderator);

    const recipient = await notesFor(t.initiator, item.id);
    assert.ok(recipient.some((n) => n.type === 'thanks_received'),
      'получатель благодарности не уведомлён');

    const author = await notesFor(t.admin, item.id);
    assert.ok(author.some((n) => n.type === 'request_approved'),
      'инициатор не уведомлён о согласовании');
  });

  test('об отклонении узнаёт инициатор, и в тексте сказано про баллы', async () => {
    const item = await h.makeRequest(t.admin, { tnumber: 'T0018', text: 'отклонение' });
    await h.api('PATCH', '/requests/' + item.id, { status: 'REJECTED', comment: 'не обосновано' }, t.moderator);

    const notes = await notesFor(t.admin, item.id);
    const rejected = notes.find((n) => n.type === 'request_rejected');
    assert.ok(rejected, 'инициатор не уведомлён об отклонении');
    assert.match(rejected.text, /Баллы возвращены/);
  });

  test('об отзыве узнают те, кто мог взять заявку в работу', async () => {
    const item = await h.makeRequest(t.admin, { tnumber: 'T0019', text: 'отзыв' });
    await h.api('POST', '/requests/' + item.id + '/withdraw', { comment: 'передумал' }, t.admin);

    const notes = await notesFor(t.moderator, item.id);
    assert.ok(notes.some((n) => n.type === 'request_withdrawn'), 'модератор не узнал об отзыве');
  });

  test('чужое уведомление недоступно', async () => {
    const item = await h.makeRequest(t.initiator, { tnumber: 'T0020', text: 'чужое' });
    const mine = (await notesFor(t.moderator, item.id))[0];
    assert.ok(mine, 'уведомление для проверки не создалось');

    // Инициатору это уведомление не принадлежит: ответ такой же, как для
    // несуществующего, — чтобы перебором нельзя было нащупать чужие id.
    const r = await h.api('PATCH', '/notifications/' + mine.id + '/read', {}, t.initiator);
    assert.equal(r.status, 404);
  });

  test('прочитанное перестаёт считаться непрочитанным', async () => {
    const item = await h.makeRequest(t.initiator, { tnumber: 'T0021', text: 'прочтение' });
    const note = (await notesFor(t.moderator, item.id))[0];

    const read = await h.api('PATCH', '/notifications/' + note.id + '/read', {}, t.moderator);
    assert.equal(read.status, 200);

    const after = (await notesFor(t.moderator, item.id))[0];
    assert.equal(after.is_read, true);
  });

  test('«прочитать всё» обнуляет счётчик', async () => {
    await h.makeRequest(t.initiator, { tnumber: 'T0022', text: 'счётчик' });

    const r = await h.api('POST', '/notifications/read-all', {}, t.moderator);
    assert.equal(r.status, 200);

    const list = await h.api('GET', '/notifications', null, t.moderator);
    assert.equal(list.json.unread, 0, 'счётчик непрочитанных не обнулился');
  });

  test('очередь писем не берёт уведомления без адреса', async () => {
    await h.makeRequest(t.initiator, { tnumber: 'T0023', text: 'очередь' });

    const r = await h.api('POST', '/notifications/flush', {}, t.admin);
    assert.equal(r.status, 200);
    assert.equal(r.json.taken, 0,
      'в очередь попало уведомление без адреса — письмо ушло бы в никуда');
  });

  test('разбирать очередь может не всякий', async () => {
    const r = await h.api('POST', '/notifications/flush', {}, t.head);
    assert.equal(r.status, 403);
  });
});
