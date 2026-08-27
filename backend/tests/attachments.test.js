'use strict';
const { test, before, beforeEach, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

/** Файл для отправки в multipart. */
function filePart(name, type, buf) {
  const fd = new FormData();
  fd.append('file', new Blob([buf], { type }), name);
  return fd;
}

const PDF = Buffer.from('%PDF-1.4 содержимое проверочного документа', 'utf8');

describe('Вложения', () => {
  let t, balances, req;

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

  test('файл загружается, скачивается и возвращается байт в байт', async () => {
    req = await h.makeRequest(t.initiator, { tnumber: 'T0017', text: 'вложения' });

    const up = await h.api('POST', '/requests/' + req.id + '/attachments',
      filePart('Служебная записка.pdf', 'application/pdf', PDF), t.initiator);
    assert.equal(up.status, 201);
    assert.equal(up.json.item.filename, 'Служебная записка.pdf', 'русское имя файла исказилось');
    assert.equal(up.json.item.size_bytes, PDF.length);
    assert.match(up.json.item.sha256 || '', /^[0-9a-f]{64}$/);

    const res = await h.api('GET', '/attachments/' + up.json.item.id + '/download', null, t.initiator);
    assert.equal(res.status, 200);
    assert.equal(res.raw, PDF.toString('utf8'), 'скачанный файл отличается от загруженного');
    assert.ok(String(res.headers.get('content-disposition')).includes("filename*=UTF-8''"),
      'русское имя не передано в заголовке скачивания');
  });

  test('имя файла не попадает в путь на диске', async () => {
    const r = await h.makeRequest(t.initiator, { tnumber: 'T0018', text: 'путь' });
    const up = await h.api('POST', '/requests/' + r.id + '/attachments',
      filePart('../../../подмена.pdf', 'application/pdf', Buffer.from('подмена')), t.initiator);

    assert.equal(up.status, 201);
    assert.ok(!String(up.json.item.storage_key).includes('..'), 'в имени на диске остались «..»');
    assert.ok(!String(up.json.item.storage_key).includes('подмена'),
      'пользовательское имя попало в имя файла на диске');
  });

  test('запрещённый тип файла не принимается', async () => {
    const r = await h.makeRequest(t.initiator, { tnumber: 'T0019', text: 'тип файла' });
    const up = await h.api('POST', '/requests/' + r.id + '/attachments',
      filePart('вирус.exe', 'application/x-msdownload', Buffer.from('MZ')), t.initiator);
    assert.equal(up.status, 415);
  });

  test('файл больше лимита не принимается', async () => {
    const r = await h.makeRequest(t.initiator, { tnumber: 'T0020', text: 'размер' });
    const big = Buffer.alloc(11 * 1024 * 1024);
    const up = await h.api('POST', '/requests/' + r.id + '/attachments',
      filePart('большой.pdf', 'application/pdf', big), t.initiator);
    assert.equal(up.status, 413);
  });

  test('один и тот же файл дважды не прикладывается', async () => {
    const r = await h.makeRequest(t.initiator, { tnumber: 'T0021', text: 'повтор' });
    const first = await h.api('POST', '/requests/' + r.id + '/attachments',
      filePart('акт.pdf', 'application/pdf', PDF), t.initiator);
    assert.equal(first.status, 201);

    const again = await h.api('POST', '/requests/' + r.id + '/attachments',
      filePart('акт-копия.pdf', 'application/pdf', PDF), t.initiator);
    assert.equal(again.status, 409, 'тот же файл принят второй раз');
  });

  test('к закрытой заявке вложение не добавляется', async () => {
    const r = await h.makeRequest(t.initiator, { tnumber: 'T0022', text: 'закрытая' });
    await h.api('PATCH', '/requests/' + r.id, { status: 'DONE' }, t.moderator);

    const up = await h.api('POST', '/requests/' + r.id + '/attachments',
      filePart('поздно.txt', 'text/plain', Buffer.from('после решения')), t.initiator);
    assert.equal(up.status, 409);
  });

  test('роль без права attach приложить не может', async () => {
    const r = await h.makeRequest(t.initiator, { tnumber: 'T0023', text: 'права' });
    const up = await h.api('POST', '/requests/' + r.id + '/attachments',
      filePart('от руководителя.txt', 'text/plain', Buffer.from('текст')), t.head);
    assert.equal(up.status, 403);
  });

  test('чужое вложение удаляет только администратор', async () => {
    const r = await h.makeRequest(t.initiator, { tnumber: 'T0024', text: 'удаление вложения' });
    const up = await h.api('POST', '/requests/' + r.id + '/attachments',
      filePart('документ.txt', 'text/plain', Buffer.from('содержимое')), t.initiator);
    const id = up.json.item.id;

    assert.equal((await h.api('DELETE', '/attachments/' + id, null, t.head)).status, 403);
    assert.equal((await h.api('DELETE', '/attachments/' + id, null, t.admin)).status, 200);
    assert.equal((await h.api('GET', '/attachments/' + id + '/download', null, t.initiator)).status, 404);
  });

  test('вложения видны в реестре заявок', async () => {
    const r = await h.makeRequest(t.initiator, { tnumber: 'T0002', text: 'реестр' });
    await h.api('POST', '/requests/' + r.id + '/attachments',
      filePart('в реестре.txt', 'text/plain', Buffer.from('видно в списке')), t.initiator);

    const list = await h.api('GET', '/requests?limit=200', null, t.initiator);
    const row = list.json.items.find((x) => x.id === r.id);
    assert.equal(row.attachments_count, 1);
    assert.equal(row.attachment_name, 'в реестре.txt');
    assert.ok(row.attachment_id, 'нет id вложения — кнопка «Скачать» не появится');
  });
});
