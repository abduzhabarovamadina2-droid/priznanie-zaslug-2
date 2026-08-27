'use strict';
/**
 * Разовая утилита: вытаскивает справочник заслуг из прототипа
 * (frontend/Признание заслуг.html, массив MR_MERIT_SEED) в merits.json,
 * рядом с employees.json и Рейтинг.json.
 *
 * Зачем отдельный файл, а не чтение HTML при импорте: сид не должен зависеть
 * от разметки прототипа. Один раз выгрузили — дальше правится JSON.
 *
 *   node tools/extract-merits.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const HTML = path.join(__dirname, '..', '..', 'frontend', 'Признание заслуг.html');
const OUT = path.join(__dirname, '..', '..', 'frontend', 'merits.json');

const src = fs.readFileSync(HTML, 'utf8');
const start = src.indexOf('var MR_MERIT_SEED = [');
if (start < 0) throw new Error('MR_MERIT_SEED в прототипе не найден');

// Читаем до закрывающей скобки массива на нулевом уровне вложенности.
let depth = 0, end = start;
for (; end < src.length; end++) {
  const ch = src[end];
  if (ch === '[') depth++;
  else if (ch === ']') { depth--; if (depth === 0) { end += 2; break; } }
}

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(src.slice(start, end), sandbox);

const rows = sandbox.MR_MERIT_SEED || [];
const merits = rows.map((r, i) => ({
  code: 'MER-' + (i + 1),
  nomination: r[0],
  merit_kz: r[1] || '',
  merit_ru: r[2] || '',
  is_active: true,
}));

const bad = merits.filter((m) => !m.nomination || !m.merit_ru);
if (bad.length) throw new Error('строк без номинации или названия: ' + bad.length);

fs.writeFileSync(OUT, JSON.stringify({ merits }, null, 2), 'utf8');
console.log(`Выгружено заслуг: ${merits.length}`);
console.log('Файл: ' + OUT);
const byNom = {};
merits.forEach((m) => { byNom[m.nomination] = (byNom[m.nomination] || 0) + 1; });
Object.keys(byNom).forEach((k) => console.log(`  ${k}: ${byNom[k]}`));
