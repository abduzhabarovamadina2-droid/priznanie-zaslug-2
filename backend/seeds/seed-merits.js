'use strict';
/**
 * Импорт справочника заслуг из frontend/merits.json → таблица merits.
 *
 * Ключ — пара «номинация + название заслуги»: своего кода у заслуги в
 * прототипе нет, а название внутри номинации уникально. Повторный запуск
 * обновляет казахское название и признак активности, дублей не плодит.
 *
 *   npm run db:seed:merits
 */
const config = require('../src/config');
const { query, closePool } = require('../src/db/pool');
const { readJson, report, newStats } = require('./_shared');

(async () => {
  const stats = newStats();
  try {
    const { data, path: file } = readJson(config.seed.meritsPath);
    console.log(`Источник: ${file}`);

    const merits = Array.isArray(data.merits) ? data.merits : [];
    if (!merits.length) throw new Error('В файле нет массива merits');
    stats.found = merits.length;

    const { rows: nomRows } = await query('SELECT id, name_ru FROM nominations');
    if (!nomRows.length) throw new Error('Справочник номинаций пуст — выполните npm run db:migrate');
    const nomByName = new Map(nomRows.map((n) => [n.name_ru.trim().toLowerCase(), n.id]));

    for (let i = 0; i < merits.length; i += 1) {
      const m = merits[i];
      const nomId = nomByName.get(String(m.nomination || '').trim().toLowerCase());
      if (!nomId) {
        stats.errors.push(`строка ${i + 1}: неизвестная номинация «${m.nomination}»`);
        stats.skipped += 1; continue;
      }
      if (!m.merit_ru) {
        stats.errors.push(`строка ${i + 1}: пустое название заслуги`);
        stats.skipped += 1; continue;
      }

      try {
        const found = await query(
          'SELECT id FROM merits WHERE nomination_id = $1 AND merit_ru = $2',
          [nomId, m.merit_ru]);

        if (found.rows[0]) {
          await query(
            'UPDATE merits SET merit_kz = $1, is_active = $2 WHERE id = $3',
            [m.merit_kz || null, m.is_active !== false, found.rows[0].id]);
          stats.updated += 1;
        } else {
          await query(
            'INSERT INTO merits (nomination_id, merit_kz, merit_ru, is_active) VALUES ($1,$2,$3,$4)',
            [nomId, m.merit_kz || null, m.merit_ru, m.is_active !== false]);
          stats.inserted += 1;
        }
      } catch (e) {
        stats.errors.push(`строка ${i + 1} (${m.merit_ru.slice(0, 40)}): ${e.message}`);
      }
    }

    report('Импорт заслуг', stats);
  } catch (e) {
    console.error('\nИмпорт прерван: ' + e.message);
    process.exitCode = 1;
  } finally {
    await closePool();
  }
})();
