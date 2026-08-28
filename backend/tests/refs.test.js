'use strict';
const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');
const { query } = require('../src/db/pool');

const MARK = '[автотест-справочник]';

describe('Справочники: чтение и правка', () => {
  let t;

  before(async () => {
    await h.start();
    t = await h.loginAll();
  });
  after(async () => {
    // Всё созданное тестом убираем: справочники живут дольше заявок.
    await query('DELETE FROM phrases WHERE text_ru LIKE $1', [MARK + '%']);
    await query('DELETE FROM faq WHERE question_ru LIKE $1', [MARK + '%']);
    await query('DELETE FROM merits WHERE merit_ru LIKE $1', [MARK + '%']);
    await query('DELETE FROM nominations WHERE code LIKE $1', ['NOM-TEST%']);
    await h.stop();
  });

  test('все четыре справочника читаются', async () => {
    for (const kind of ['nominations', 'merits', 'phrases', 'faq']) {
      const r = await h.api('GET', '/refs/' + kind, null, t.admin);
      assert.equal(r.status, 200, kind + ' не читается');
      assert.ok(r.json.items.length > 0, 'справочник ' + kind + ' пуст');
    }
  });

  test('справочники «Фраза» и «Вопрос-Ответ» наполнены', async () => {
    const phrases = await h.api('GET', '/refs/phrases', null, t.admin);
    const faq = await h.api('GET', '/refs/faq', null, t.admin);
    assert.ok(phrases.json.items.length >= 17, 'фраз меньше, чем в прототипе');
    assert.ok(faq.json.items.length >= 16, 'вопросов меньше, чем в прототипе');
    assert.ok(faq.json.items.every((q) => q.question_ru && q.answer_ru),
      'есть вопрос без ответа');
  });

  test('чтение закрыто правом refsView, запись — refsEdit', async () => {
    // У инициатора нет ни того, ни другого.
    assert.equal((await h.api('GET', '/refs/phrases', null, t.initiator)).status, 403);
    // У модератора есть refsView, но нет refsEdit.
    assert.equal((await h.api('GET', '/refs/phrases', null, t.moderator)).status, 200);
    assert.equal((await h.api('POST', '/refs/phrases',
      { text_ru: MARK + ' от модератора' }, t.moderator)).status, 403);
  });

  test('неизвестный справочник — 404', async () => {
    assert.equal((await h.api('GET', '/refs/такого-нет', null, t.admin)).status, 404);
  });

  test('запись переживает перезагрузку страницы', async () => {
    const created = await h.api('POST', '/refs/phrases',
      { text_ru: MARK + ' новая фраза' }, t.admin);
    assert.equal(created.status, 201);
    const id = created.json.item.id;

    const changed = await h.api('PATCH', '/refs/phrases/' + id,
      { text_ru: MARK + ' исправленная фраза' }, t.admin);
    assert.equal(changed.status, 200);

    // Перечитываем с сервера — раньше правки жили только в браузере.
    const again = await h.api('GET', '/refs/phrases/' + id, null, t.admin);
    assert.equal(again.json.item.text_ru, MARK + ' исправленная фраза');
    assert.ok(String(again.json.item.created_by).includes('CORP'), 'не записан автор');
  });

  test('вопрос-ответ создаётся и правится', async () => {
    const created = await h.api('POST', '/refs/faq', {
      question_ru: MARK + ' Как это работает?',
      answer_ru: 'Вот так.',
      sort_order: 99,
    }, t.admin);
    assert.equal(created.status, 201);

    const changed = await h.api('PATCH', '/refs/faq/' + created.json.item.id,
      { answer_ru: 'Вот так, если точнее.' }, t.admin);
    assert.equal(changed.status, 200);
    assert.equal(changed.json.item.answer_ru, 'Вот так, если точнее.');
    assert.equal(changed.json.item.question_ru, MARK + ' Как это работает?',
      'правка ответа затёрла вопрос');
  });

  test('запись выключается, а не удаляется', async () => {
    const created = await h.api('POST', '/refs/phrases',
      { text_ru: MARK + ' на выключение' }, t.admin);
    const id = created.json.item.id;

    const off = await h.api('DELETE', '/refs/phrases/' + id, null, t.admin);
    assert.equal(off.status, 200);
    assert.equal(off.json.item.is_active, false);

    const visible = await h.api('GET', '/refs/phrases', null, t.admin);
    assert.ok(!visible.json.items.some((x) => x.id === id), 'выключенная осталась в списке');

    const all = await h.api('GET', '/refs/phrases?all=1', null, t.admin);
    assert.ok(all.json.items.some((x) => x.id === id), 'выключенную запись удалили насовсем');

    const on = await h.api('POST', '/refs/phrases/' + id + '/activate', {}, t.admin);
    assert.equal(on.json.item.is_active, true);
  });

  test('данные справочника проверяются', async () => {
    // Обязательные поля.
    assert.equal((await h.api('POST', '/refs/nominations',
      { name_ru: 'Без кода и стоимости' }, t.admin)).status, 400);

    // Занятый код.
    assert.equal((await h.api('POST', '/refs/nominations',
      { code: 'NOM-101', name_ru: 'Дубль', points: 10 }, t.admin)).status, 409);

    // Стоимость должна быть положительной.
    assert.equal((await h.api('POST', '/refs/nominations',
      { code: 'NOM-TEST-1', name_ru: 'Отрицательная', points: -5 }, t.admin)).status, 400);

    // Заслуга без существующей номинации осиротеет.
    assert.equal((await h.api('POST', '/refs/merits',
      { nomination_id: 999999, merit_ru: MARK + ' сирота' }, t.admin)).status, 400);
  });

  test('поля, которых нет в справочнике, из запроса не берутся', async () => {
    const created = await h.api('POST', '/refs/phrases', {
      text_ru: MARK + ' подмена полей',
      id: 999999,                 // менять id клиент не должен
      created_at: '1999-01-01',   // и дату создания тоже
    }, t.admin);

    assert.equal(created.status, 201);
    assert.notEqual(created.json.item.id, 999999, 'клиент назначил id записи');
    assert.ok(new Date(created.json.item.created_at).getFullYear() > 2000,
      'клиент назначил дату создания');
  });
});
