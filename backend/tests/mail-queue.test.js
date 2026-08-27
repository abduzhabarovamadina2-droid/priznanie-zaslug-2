'use strict';
const { test, before, beforeEach, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');
const { query } = require('../src/db/pool');
const scheduler = require('../src/services/mail-scheduler');

const TEST_EMAIL = 'проверка.очереди@nationalbank.kz';

/** Уведомления тестовых заявок — им подставляем адрес, чтобы очередь их взяла. */
async function addressTestNotifications() {
  const { rowCount } = await query(
    `UPDATE notifications SET email = $1
      WHERE request_id IN (SELECT id FROM requests WHERE merit_text LIKE $2)
        AND is_sent = false`,
    [TEST_EMAIL, h.TEST_MARK + '%']);
  return rowCount;
}

describe('Очередь писем', () => {
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

  test('уведомление без адреса в очередь не попадает', async () => {
    await h.makeRequest(t.initiator, { tnumber: 'T0017', text: 'без адреса' });

    const r = await h.api('POST', '/notifications/flush', {}, t.admin);
    assert.equal(r.status, 200);
    assert.equal(r.json.taken, 0, 'письмо без адреса ушло бы в никуда');
  });

  test('уведомление с адресом отправляется и помечается', async () => {
    await h.makeRequest(t.initiator, { tnumber: 'T0018', text: 'с адресом' });
    const prepared = await addressTestNotifications();
    assert.ok(prepared > 0, 'не нашлось уведомлений для проверки');

    const r = await h.api('POST', '/notifications/flush', {}, t.admin);
    assert.equal(r.status, 200);
    assert.equal(r.json.taken, prepared);
    assert.equal(r.json.sent, prepared, 'не все письма отправлены');
    assert.equal(r.json.failed, 0);

    const { rows } = await query(
      'SELECT is_sent, sent_at, attempts FROM notifications WHERE email = $1', [TEST_EMAIL]);
    assert.ok(rows.every((x) => x.is_sent), 'не проставлена отметка об отправке');
    assert.ok(rows.every((x) => x.sent_at), 'не проставлено время отправки');
    assert.ok(rows.every((x) => x.attempts === 1), 'счётчик попыток не увеличился');
  });

  test('повторный разбор те же письма не шлёт', async () => {
    await h.makeRequest(t.initiator, { tnumber: 'T0019', text: 'без дублей' });
    await addressTestNotifications();

    const first = await h.api('POST', '/notifications/flush', {}, t.admin);
    assert.ok(first.json.taken > 0, 'первый разбор ничего не взял');

    const second = await h.api('POST', '/notifications/flush', {}, t.admin);
    assert.equal(second.json.taken, 0, 'письма ушли бы второй раз');
  });

  test('планировщик разбирает очередь сам', async () => {
    await h.makeRequest(t.initiator, { tnumber: 'T0020', text: 'планировщик' });
    const prepared = await addressTestNotifications();
    assert.ok(prepared > 0);

    // Дёргаем такт напрямую, не дожидаясь интервала в несколько минут.
    await scheduler.tick();

    const { rows } = await query(
      'SELECT COUNT(*)::int AS c FROM notifications WHERE email = $1 AND is_sent = false',
      [TEST_EMAIL]);
    assert.equal(rows[0].c, 0, 'планировщик оставил письма неразобранными');
  });

  test('пока MAIL_HOST не задан, очередь работает в режиме журнала', async () => {
    const r = await h.api('POST', '/notifications/flush', {}, t.admin);
    assert.equal(r.json.mode, 'log',
      'режим отправки изменился — проверьте MAIL_HOST в .env');
  });
});
