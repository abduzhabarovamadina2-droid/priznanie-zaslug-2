'use strict';
/**
 * Построение справочника подразделений из текстовых полей сотрудника.
 *
 * До этого структуры не было вовсе: подразделение существовало тремя
 * строками в карточке сотрудника (branch / dep / dept). Из-за этого
 * department_parent_id в рейтинге заполнить было нечем, а область видимости
 * руководителя не с чем было сравнивать — он видел все заявки.
 *
 * Строим дерево из трёх уровней: филиал -> департамент -> управление.
 * Других данных о структуре нет, поэтому источник — те же поля.
 * Скрипт идемпотентен: повторный запуск ничего не дублирует.
 *
 *   npm run db:departments
 */
const { query, closePool } = require('../src/db/pool');

/** Найти или создать узел дерева. Ключ — пара «название + родитель». */
async function ensureNode(name, level, parentId) {
  const clean = String(name || '').trim();
  if (!clean) return null;

  const found = await query(
    `SELECT id FROM departments
      WHERE name = $1 AND parent_id IS NOT DISTINCT FROM $2`, [clean, parentId]);
  if (found.rows[0]) return found.rows[0].id;

  const { rows } = await query(
    'INSERT INTO departments (name, level, parent_id) VALUES ($1,$2,$3) RETURNING id',
    [clean, level, parentId]);
  return rows[0].id;
}

(async () => {
  try {
    const { rows: employees } = await query(
      'SELECT id, tnumber, branch, dep, dept FROM employees ORDER BY id');
    console.log(`Сотрудников: ${employees.length}`);

    let linked = 0;
    let withoutDept = 0;

    for (const e of employees) {
      const branchId = await ensureNode(e.branch, 1, null);
      const depId = await ensureNode(e.dep, 2, branchId);
      // Самый нижний уровень, до которого дотянулись: управление, иначе
      // департамент, иначе филиал.
      const deptId = await ensureNode(e.dept, 3, depId);
      const nodeId = deptId || depId || branchId;

      if (!nodeId) { withoutDept += 1; continue; }
      await query('UPDATE employees SET department_id = $1 WHERE id = $2', [nodeId, e.id]);
      linked += 1;
    }

    // Рейтинг ссылается на родителя подразделения: по нему строятся сводки
    // «по департаменту», а не по каждому управлению отдельно.
    const { rowCount: ratingsFilled } = await query(`
      UPDATE ratings r
         SET department_parent_id = COALESCE(d.parent_id, d.id), updated_at = now()
        FROM employees e
        JOIN departments d ON d.id = e.department_id
       WHERE r.employee_id = e.id
         AND r.department_parent_id IS DISTINCT FROM COALESCE(d.parent_id, d.id)`);

    const tree = await query(`
      SELECT d.level, COUNT(*)::int AS c FROM departments d GROUP BY d.level ORDER BY d.level`);

    console.log(`Сотрудников связано с подразделением: ${linked}` +
      (withoutDept ? `, без подразделения: ${withoutDept}` : ''));
    console.log(`Записей рейтинга с родительским подразделением: ${ratingsFilled}`);
    console.log('\nДерево подразделений:');
    const names = { 1: 'филиалов', 2: 'департаментов', 3: 'управлений и отделов' };
    tree.rows.forEach((x) => console.log(`  уровень ${x.level} — ${names[x.level] || 'узлов'}: ${x.c}`));

    const sample = await query(`
      SELECT child.name AS unit, parent.name AS parent
        FROM departments child
        LEFT JOIN departments parent ON parent.id = child.parent_id
       WHERE child.level = 3 ORDER BY child.id LIMIT 5`);
    console.log('\nПримеры связей:');
    sample.rows.forEach((x) => console.log(`  ${x.unit}  ←  ${x.parent}`));
  } catch (e) {
    console.error('Построение прервано: ' + e.message);
    process.exitCode = 1;
  } finally {
    await closePool();
  }
})();
