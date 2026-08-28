'use strict';
/**
 * Разовая утилита: вытаскивает справочники «Фраза» и «Вопрос-Ответ» из
 * прототипа (MR_PHRASE_SEED и MR_QA_SEED) в refs.json рядом с
 * employees.json и merits.json.
 *
 * Как и с заслугами: один раз выгружаем, дальше правится JSON, а сид от
 * разметки прототипа не зависит.
 *
 *   node tools/extract-refs.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const HTML = path.join(__dirname, '..', '..', 'frontend', 'Признание заслуг.html');
const OUT = path.join(__dirname, '..', '..', 'frontend', 'refs.json');

const src = fs.readFileSync(HTML, 'utf8');

/** Читает объявление массива целиком — до закрывающей скобки нулевого уровня. */
function grabArray(marker) {
  const start = src.indexOf(marker);
  if (start < 0) throw new Error(marker + ' в прототипе не найден');
  let depth = 0, end = start;
  for (; end < src.length; end++) {
    const ch = src[end];
    if (ch === '[') depth++;
    else if (ch === ']') { depth--; if (depth === 0) { end += 2; break; } }
  }
  return src.slice(start, end);
}

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(grabArray('var MR_PHRASE_SEED = ['), sandbox);
vm.runInContext(grabArray('var MR_QA_SEED = ['), sandbox);

const phrases = (sandbox.MR_PHRASE_SEED || [])
  .map((t) => String(t).trim())
  .filter(Boolean)
  .map((text_ru) => ({ text_ru, text_kz: '', is_active: true }));

const faq = (sandbox.MR_QA_SEED || [])
  .filter((p) => Array.isArray(p) && p[0] && p[1])
  .map((p, i) => ({
    question_ru: String(p[0]).trim(),
    answer_ru: String(p[1]).trim(),
    question_kz: '',
    answer_kz: '',
    sort_order: i + 1,
    is_active: true,
  }));

if (!phrases.length) throw new Error('фразы не извлеклись');
if (!faq.length) throw new Error('вопросы-ответы не извлеклись');

fs.writeFileSync(OUT, JSON.stringify({ phrases, faq }, null, 2), 'utf8');
console.log(`Выгружено фраз: ${phrases.length}, вопросов-ответов: ${faq.length}`);
console.log('Файл: ' + OUT);
console.log('  пример фразы : ' + phrases[0].text_ru.slice(0, 70));
console.log('  пример вопроса: ' + faq[0].question_ru.slice(0, 70));
