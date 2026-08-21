'use strict';
/**
 * Импорт сотрудников из employees.json → таблица employees.
 * Ключ — табельный номер (tnumber): повторный запуск обновляет запись,
 * а не создаёт дубликат. Исходные идентификаторы сохраняются как есть.
 *
 *   npm run db:seed
 */
const config = require('../src/config');
const { query, closePool } = require('../src/db/pool');
const { readJson, report, newStats } = require('./_shared');

const REQUIRED = ['tnumber', 'fio'];

function validate(person, index) {
  const miss = REQUIRED.filter((f) => !person[f] || !String(person[f]).trim());
  if (miss.length) return `строка ${index + 1}: нет обязательных полей — ${miss.join(', ')}`;
  return null;
}

/** «Фамилия Имя Отчество» → «Имя Фамилия», как это делает прототип. */
function shortName(fio) {
  const w = String(fio).trim().split(/\s+/).filter(Boolean);
  return w.length >= 3 ? `${w[1]} ${w[0]}` : w.join(' ');
}

(async () => {
  const stats = newStats();
  try {
    const { data, path: file } = readJson(config.seed.employeesPath);
    console.log(`Источник: ${file}`);

    const people = Array.isArray(data) ? data : data.people;
    if (!Array.isArray(people)) throw new Error('В файле нет массива people');
    stats.found = people.length;
    if (data.version) console.log(`Версия справочника: ${data.version}`);

    const seen = new Set();
    for (let i = 0; i < people.length; i += 1) {
      const p = people[i];
      const err = validate(p, i);
      if (err) { stats.errors.push(err); stats.skipped += 1; continue; }
      if (seen.has(p.tnumber)) {
        stats.errors.push(`строка ${i + 1}: табельный номер ${p.tnumber} повторяется в файле`);
        stats.skipped += 1; continue;
      }
      seen.add(p.tnumber);

      try {
        const { rows } = await query(
          `INSERT INTO employees (tnumber, fio, short_name, post, branch, dep, dept, seed_badges, photo_key)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           ON CONFLICT (tnumber) DO UPDATE SET
             fio = EXCLUDED.fio, short_name = EXCLUDED.short_name, post = EXCLUDED.post,
             branch = EXCLUDED.branch, dep = EXCLUDED.dep, dept = EXCLUDED.dept,
             seed_badges = EXCLUDED.seed_badges, photo_key = EXCLUDED.photo_key,
             updated_at = now()
           RETURNING (xmax = 0) AS inserted`,
          [p.tnumber, p.fio, shortName(p.fio), p.post || null, p.branch || null,
           p.dep || null, p.dept || null, Number(p.n) || 0, shortName(p.fio)]);
        if (rows[0].inserted) stats.inserted += 1; else stats.updated += 1;
      } catch (e) {
        stats.errors.push(`строка ${i + 1} (${p.tnumber}): ${e.message}`);
        stats.skipped += 1;
      }
    }
    report('Импорт сотрудников', stats);
  } catch (err) {
    console.error('\nИмпорт не выполнен:', err.message);
    process.exitCode = 1;
  } finally {
    await closePool();
  }
})();
