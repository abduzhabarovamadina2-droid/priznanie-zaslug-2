'use strict';
const fs = require('fs');
const path = require('path');

/** Читает JSON по пути относительно папки backend. Бросает понятную ошибку. */
function readJson(relPath) {
  const full = path.isAbsolute(relPath) ? relPath : path.join(__dirname, '..', relPath);
  if (!fs.existsSync(full)) throw new Error(`Файл не найден: ${full}`);
  const raw = fs.readFileSync(full, 'utf8');
  try { return { data: JSON.parse(raw), path: full }; }
  catch (e) { throw new Error(`Некорректный JSON в ${full}: ${e.message}`); }
}

/** Печатает итоговый отчёт импорта в едином виде. */
function report(title, stats) {
  const line = '─'.repeat(52);
  console.log(`\n${line}\n  ${title}\n${line}`);
  console.log(`  найдено в файле : ${stats.found}`);
  console.log(`  добавлено       : ${stats.inserted}`);
  console.log(`  обновлено       : ${stats.updated}`);
  console.log(`  пропущено       : ${stats.skipped}`);
  console.log(`  ошибок          : ${stats.errors.length}`);
  if (stats.errors.length) {
    console.log('\n  Ошибки:');
    stats.errors.forEach((e, i) => console.log(`   ${i + 1}. ${e}`));
  }
  console.log(line);
}

function newStats() {
  return { found: 0, inserted: 0, updated: 0, skipped: 0, errors: [] };
}

module.exports = { readJson, report, newStats };
