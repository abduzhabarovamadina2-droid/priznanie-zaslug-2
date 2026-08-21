'use strict';
/**
 * Импорт рейтинга из «Рейтинг.json» → таблица ratings.
 * Сопоставление с сотрудником — по табельному номеру, с запасным вариантом
 * по «фамилия + имя» (так же, как это делает прототип: MR_applyRating
 * ключует словарь по tnumber с откатом на ФИО).
 *
 * Баллы берутся из файла как есть и НЕ пересчитываются из бейджей: в
 * прототипе MR_person берёт баллы из Рейтинг.json, а не из суммы бейджей.
 * Расхождение «бейджи ≠ год» только фиксируется в отчёте.
 *
 * Уникальность — пара (employee_id, period_year), повторный запуск обновляет.
 *
 *   npm run db:seed:ratings
 */
const config = require('../src/config');
const { query, closePool } = require('../src/db/pool');
const { readJson, report, newStats } = require('./_shared');

const F = {
  tnumber: 'tnumber',
  fio: 'ФИО работника',
  q1: 'Суммарный балл за первый квартал',
  q2: 'Суммарный балл за второй квартал',
  q3: 'Суммарный балл за третий квартал',
  q4: 'Суммарный балл за четвертый квартал',
  year: 'Балл за год',
  gold: 'Кол-во золотых бэйджев',
  silver: 'Кол-во серебряных бэйджев',
  bronze: 'Кол-во бронзовых бэйджев',
  green: 'Кол-во зеленых бэйджев',
  blue: 'Кол-во синих бэйджев',
  yellow: 'Кол-во жёлтых бэйджев',
};

// Номиналы бейджей — из MR_NOM_DATA прототипа, в том же порядке.
const BADGE_POINTS = { gold: 160, silver: 110, bronze: 70, green: 40, blue: 20, yellow: 10 };

const PERIOD_YEAR = Number(process.env.SEED_RATING_YEAR) || 2026;

const num = (v) => Number(v) || 0;
const key2 = (fio) => String(fio).trim().toLowerCase().split(/\s+/).slice(0, 2).sort().join(' ');

(async () => {
  const stats = newStats();
  const mismatches = [];
  try {
    const { data, path: file } = readJson(config.seed.ratingsPath);
    console.log(`Источник: ${file}`);
    console.log(`Отчётный год: ${PERIOD_YEAR}`);

    const list = Array.isArray(data) ? data : data.items;
    if (!Array.isArray(list)) throw new Error('Ожидался массив записей рейтинга');
    stats.found = list.length;

    const { rows: emps } = await query('SELECT id, tnumber, fio FROM employees');
    if (!emps.length) throw new Error('Таблица employees пуста — сначала выполните npm run db:seed');
    const byTnumber = new Map(emps.map((e) => [e.tnumber, e]));
    const byName = new Map(emps.map((e) => [key2(e.fio), e]));

    for (let i = 0; i < list.length; i += 1) {
      const r = list[i];
      const fio = String(r[F.fio] || '').trim();
      if (!fio && !r[F.tnumber]) {
        stats.errors.push(`строка ${i + 1}: нет ни табельного номера, ни ФИО`);
        stats.skipped += 1; continue;
      }

      const emp = (r[F.tnumber] && byTnumber.get(r[F.tnumber])) || byName.get(key2(fio));
      if (!emp) {
        stats.errors.push(`строка ${i + 1}: сотрудник не найден в справочнике — ${fio} (${r[F.tnumber] || 'без табельного'})`);
        stats.skipped += 1; continue;
      }

      const badges = {
        gold: num(r[F.gold]), silver: num(r[F.silver]), bronze: num(r[F.bronze]),
        green: num(r[F.green]), blue: num(r[F.blue]), yellow: num(r[F.yellow]),
      };
      const byBadges = Object.entries(badges).reduce((s, [k, v]) => s + v * BADGE_POINTS[k], 0);
      const year = num(r[F.year]);
      if (byBadges !== year) mismatches.push(`${emp.fio}: бейджи дают ${byBadges}, за год указано ${year} (разница ${year - byBadges})`);

      try {
        const { rows } = await query(
          `INSERT INTO ratings (employee_id, period_year, q1_points, q2_points, q3_points, q4_points,
                                year_points, gold_badges, silver_badges, bronze_badges,
                                green_badges, blue_badges, yellow_badges, source)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'import')
           ON CONFLICT (employee_id, period_year) DO UPDATE SET
             q1_points = EXCLUDED.q1_points, q2_points = EXCLUDED.q2_points,
             q3_points = EXCLUDED.q3_points, q4_points = EXCLUDED.q4_points,
             year_points = EXCLUDED.year_points,
             gold_badges = EXCLUDED.gold_badges, silver_badges = EXCLUDED.silver_badges,
             bronze_badges = EXCLUDED.bronze_badges, green_badges = EXCLUDED.green_badges,
             blue_badges = EXCLUDED.blue_badges, yellow_badges = EXCLUDED.yellow_badges,
             updated_at = now()
           RETURNING (xmax = 0) AS inserted`,
          [emp.id, PERIOD_YEAR, num(r[F.q1]), num(r[F.q2]), num(r[F.q3]), num(r[F.q4]), year,
           badges.gold, badges.silver, badges.bronze, badges.green, badges.blue, badges.yellow]);
        if (rows[0].inserted) stats.inserted += 1; else stats.updated += 1;
      } catch (e) {
        stats.errors.push(`строка ${i + 1} (${fio}): ${e.message}`);
        stats.skipped += 1;
      }
    }

    report('Импорт рейтинга', stats);
    if (mismatches.length) {
      console.log(`\n  Расхождение бейджей и годового балла — ${mismatches.length} записей.`);
      console.log('  Баллы импортированы как в файле, пересчёт не делался (см. конфликт C-6).');
      mismatches.forEach((m, i) => console.log(`   ${i + 1}. ${m}`));
    }
  } catch (err) {
    console.error('\nИмпорт не выполнен:', err.message);
    process.exitCode = 1;
  } finally {
    await closePool();
  }
})();
