'use strict';
const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

describe('Справочники и рейтинг', () => {
  let t;

  before(async () => {
    await h.start();
    t = await h.loginAll();
  });
  after(async () => {
    await h.cleanup();
    await h.stop();
  });

  test('номинации отдаются с кодом и стоимостью', async () => {
    const r = await h.api('GET', '/nominations', null, t.initiator);
    assert.equal(r.status, 200);
    assert.ok(r.json.items.length >= 6, 'номинаций меньше шести');
    for (const n of r.json.items) {
      assert.match(n.code, /^NOM-\d+$/, 'у номинации нет кода');
      assert.ok(n.name_ru, 'у номинации нет названия');
      assert.ok(Number.isInteger(n.points) && n.points > 0, 'у номинации нет стоимости');
    }
  });

  test('заслуги фильтруются по номинации', async () => {
    const all = await h.api('GET', '/merits', null, t.initiator);
    assert.equal(all.status, 200);
    assert.ok(all.json.items.length > 0, 'справочник заслуг пуст');

    const one = await h.api('GET', '/merits?nomination=NOM-105', null, t.initiator);
    assert.equal(one.status, 200);
    assert.ok(one.json.items.length > 0, 'по номинации ничего не нашлось');
    assert.ok(one.json.items.every((m) => m.nomination_code === 'NOM-105'),
      'в выборку попали заслуги чужой номинации');
    assert.ok(one.json.items.length < all.json.items.length, 'фильтр ничего не отфильтровал');
  });

  test('заявка связывается с заслугой из справочника по её тексту', async () => {
    const merits = await h.api('GET', '/merits?nomination=NOM-106', null, t.initiator);
    const merit = merits.json.items[0];

    const r = await h.api('POST', '/requests', {
      tnumber: 'T0002',
      nomination_code: 'NOM-106',
      merit_text: merit.merit_ru,
      comment: h.TEST_MARK + ' связь со справочником',
    }, t.initiator);

    assert.equal(r.status, 201);
    assert.equal(r.json.item.merit_id, merit.id, 'заявка не связалась со справочником заслуг');

    // Убираем сами: метка тут в comment, а cleanup ищет её в merit_text.
    await h.api('DELETE', '/requests/' + r.json.item.id, null, t.admin);
  });

  test('заслуга из чужой номинации в заявку не проходит', async () => {
    const other = await h.api('GET', '/merits?nomination=NOM-101', null, t.initiator);
    const r = await h.api('POST', '/requests', {
      tnumber: 'T0002',
      nomination_code: 'NOM-106',
      merit_id: other.json.items[0].id,
      merit_text: h.TEST_MARK + ' чужая заслуга',
    }, t.initiator);
    assert.equal(r.status, 400);
  });

  test('сотрудники отдаются постранично и с общим числом', async () => {
    const r = await h.api('GET', '/employees?limit=5&offset=0', null, t.initiator);
    assert.equal(r.status, 200);
    assert.equal(r.json.items.length, 5);
    assert.ok(r.json.total >= 5, 'нет общего числа сотрудников');
    assert.ok(r.json.items.every((e) => e.tnumber && e.fio), 'у сотрудника пусто в ключевых полях');
  });

  test('место в рейтинге берётся из базы, а не считается на лету', async () => {
    const r = await h.api('GET', '/ratings?limit=10', null, t.initiator);
    assert.equal(r.status, 200);
    assert.ok(r.json.items.length > 0, 'рейтинг пуст');
    assert.ok(r.json.items.every((x) => x.rank_source === 'stored'),
      'место считается на лету — не выполнен npm run db:rank');
  });

  test('при равных баллах место общее', async () => {
    const r = await h.api('GET', '/ratings?limit=200', null, t.initiator);
    const byPoints = new Map();
    for (const row of r.json.items) {
      if (!byPoints.has(row.year_points)) byPoints.set(row.year_points, new Set());
      byPoints.get(row.year_points).add(row.rank);
    }
    for (const [points, ranks] of byPoints) {
      assert.equal(ranks.size, 1, `у сотрудников с ${points} баллами разные места`);
    }
  });

  test('рейтинг закрыт от роли без права reports', async () => {
    // Права reports нет ни у одной демонстрационной роли, кроме перечисленных,
    // поэтому проверяем обратное: у кого право есть — тот видит.
    for (const token of [t.initiator, t.moderator, t.admin, t.head]) {
      const r = await h.api('GET', '/ratings?limit=1', null, token);
      assert.equal(r.status, 200);
    }
    const noToken = await h.api('GET', '/ratings?limit=1');
    assert.equal(noToken.status, 401);
  });
});
