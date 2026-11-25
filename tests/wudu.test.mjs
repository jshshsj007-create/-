/** الوضوء: النسبة والإتقان وسطر تقرير البرنامج. */
import assert from 'node:assert/strict';
import { DEFAULT_WUDU_STEPS, wuduDone, wuduPercent, wuduMastered, wuduStats, wuduSummaryLine } from '../src/wudu.js';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('  ✓ ' + name); };

const steps = DEFAULT_WUDU_STEPS();
const all = Object.fromEntries(steps.map((s) => [s.id, true]));
const some = (n) => Object.fromEntries(steps.slice(0, n).map((s) => [s.id, true]));
const stu = (id, st) => ({ id, name: id, steps: st });

test('الإتقان: إكمال كل الخطوات، والنسبة من عددها', () => {
  assert.equal(wuduMastered(stu('a', all), steps), true);
  assert.equal(wuduMastered(stu('b', some(8)), steps), false);
  assert.equal(wuduPercent(stu('b', some(3)), steps), Math.round((3 / 9) * 100));
  assert.equal(wuduDone(stu('c', {}), steps), 0);
});

test('سطر التقرير: كم أتقنه من الكل، ومتوسط الإتقان', () => {
  const list = [stu('a', all), stu('b', all), stu('c', some(3)), stu('d', {})];
  const st = wuduStats(list, steps);
  assert.equal(st.mastered, 2);
  const line = wuduSummaryLine(list, steps);
  assert.match(line, /^تعليم الوضوء: 2 من 4 أتقنوه/);
  assert.ok(line.endsWith(`متوسط الإتقان ${st.avg}٪`));
});

test('وبالأرقام الصريحة لا بالمثنى: ١ من ٢، و٢ من ٣', () => {
  assert.match(wuduSummaryLine([stu('a', all), stu('b', {})], steps), /^تعليم الوضوء: 1 من 2 أتقنوه/);
  assert.match(wuduSummaryLine([stu('a', all), stu('b', all), stu('c', {})], steps), /^تعليم الوضوء: 2 من 3 أتقنوه/);
});

test('ومن لم يُتقنه أحد يُقال صراحةً، وبلا قائمةٍ لا سطر', () => {
  assert.match(wuduSummaryLine([stu('a', some(4)), stu('b', {})], steps), /لم يُتقنه أحدٌ بعد \(من 2\)/);
  assert.equal(wuduSummaryLine([], steps), '');
  assert.equal(wuduSummaryLine(undefined, steps), '');
});

test('وخطوةٌ حُذفت من القائمة لا تُحسب: إتقانٌ يتحدّث من نفسه', () => {
  const fewer = steps.slice(0, 3);
  assert.equal(wuduMastered(stu('a', some(3)), fewer), true);
  assert.match(wuduSummaryLine([stu('a', some(3))], fewer), /1 من 1 أتقنوه/);
});

console.log(`\n✅ ${passed} اختبارًا للوضوء\n`);
