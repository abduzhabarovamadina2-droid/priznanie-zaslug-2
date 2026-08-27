'use strict';
/**
 * Пересчёт места в рейтинге (ratings.rank) за каждый год.
 *
 * Место считается оконной функцией RANK(): при равных годовых баллах люди
 * делят одно место, а следующее за ними — со сдвигом (1, 1, 3). Именно так
 * читается турнирная таблица.
 *
 * Запускать после каждого импорта рейтинга:
 *   npm run db:rank
 */
const { query, closePool } = require('../src/db/pool');

(async () => {
  try {
    const before = await query(
      'SELECT COUNT(*)::int AS total, COUNT(rank)::int AS filled FROM ratings');
    console.log(`Записей рейтинга: ${before.rows[0].total}, из них с местом: ${before.rows[0].filled}`);

    const { rowCount } = await query(`
      UPDATE ratings r
         SET rank = t.place, updated_at = now()
        FROM (
          SELECT id, RANK() OVER (PARTITION BY period_year ORDER BY year_points DESC) AS place
            FROM ratings
        ) t
       WHERE r.id = t.id
         AND (r.rank IS DISTINCT FROM t.place)`);
    console.log(`Пересчитано мест: ${rowCount}`);

    const top = await query(`
      SELECT r.period_year, r.rank, r.year_points, e.fio
        FROM ratings r JOIN employees e ON e.id = r.employee_id
       ORDER BY r.period_year DESC, r.rank
       LIMIT 8`);
    console.log('\nПервые места:');
    top.rows.forEach((x) => console.log(`  ${x.period_year}  место ${String(x.rank).padStart(2)}  ${String(x.year_points).padStart(5)} б.  ${x.fio}`));
  } catch (e) {
    console.error('Пересчёт прерван: ' + e.message);
    process.exitCode = 1;
  } finally {
    await closePool();
  }
})();
