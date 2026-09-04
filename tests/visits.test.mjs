/** عدّاد فتحات الرابط: للأشخاص لا للفتحات، وبلا ما يعرّف أحدًا. */
import assert from 'node:assert/strict';
import { countVisit, visitsOf, conversion, dayKey, people } from '../src/visits.js';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('  ✓ ' + name); };

const many = (stats, pid, prints, at) => {
  let s = stats;
  for (const p of prints) ({ stats: s } = countVisit(s, pid, p, at));
  return s;
};

test('الفتحة تُعدّ', () => {
  const { stats, changed } = countVisit({}, 'p1', 'أ');
  assert.equal(changed, true);
  assert.equal(visitsOf(stats, 'p1').total, 1);
});

test('ومن فتحه ثلاثًا يُعدّ واحدًا في يومه', () => {
  const s = many({}, 'p1', ['أ', 'أ', 'أ']);
  assert.equal(visitsOf(s, 'p1').total, 1);
});

test('واثنان يُعدّان اثنين', () => {
  assert.equal(visitsOf(many({}, 'p1', ['أ', 'ب']), 'p1').total, 2);
});

test('وكل برنامجٍ عدّاده', () => {
  let s = many({}, 'p1', ['أ', 'ب']);
  s = many(s, 'p2', ['أ']);
  assert.equal(visitsOf(s, 'p1').total, 2);
  assert.equal(visitsOf(s, 'p2').total, 1);
});

test('ومن عاد في الغد يُعدّ من جديد — الغياب يومٌ والحضور يوم', () => {
  const day1 = Date.parse('2026-09-05T09:00:00Z');
  const day2 = day1 + 24 * 3600 * 1000;
  let s = many({}, 'p1', ['أ'], day1);
  s = many(s, 'p1', ['أ'], day2);
  assert.equal(visitsOf(s, 'p1', day2).total, 2);
  assert.equal(visitsOf(s, 'p1', day2).today, 1, 'واحدٌ اليوم');
});

test('وبصمات اليوم وحدها تُحفظ، فما ينمو السجل بلا حدّ', () => {
  const day1 = Date.parse('2026-09-05T09:00:00Z');
  const day2 = day1 + 24 * 3600 * 1000;
  let s = many({}, 'p1', ['أ', 'ب', 'ج'], day1);
  s = many(s, 'p1', ['د'], day2);
  assert.deepEqual(Object.keys(s.p1.seen), [dayKey(day2)], 'بصمات أمس نُسيت');
});

test('وبلا بصمة تُعدّ الفتحة ولا يُميَّز صاحبها', () => {
  assert.equal(visitsOf(many({}, 'p1', ['', '', '']), 'p1').total, 3);
});

test('وبلا برنامجٍ ما يُعدّ شيء', () => {
  assert.equal(countVisit({}, '', 'أ').changed, false);
});

test('النسبة تُقرأ بلا حساب', () => {
  assert.equal(conversion(47, 12), 'واحد من كل 4');
  assert.equal(conversion(20, 20), 'كلُّ من فتحه سجّل');
});

test('ولا نقولها على عددٍ لا تصحّ عليه', () => {
  assert.equal(conversion(3, 1), '', 'ثلاثةٌ لا تُبنى عليها نسبة');
  assert.equal(conversion(10, 0), '', 'ولا نقول «صفر من عشرة» بنسبة');
  assert.equal(conversion(10, 12), '', 'ومسجّلون أكثر من الفاتحين خللٌ لا يُعلن');
});

test('والعدد يُصرَّف كما يُنطق بالعربية', () => {
  assert.equal(people(1), 'شخص');
  assert.equal(people(2), 'شخصان');
  assert.equal(people(8), 'أشخاص');
  assert.equal(people(11), 'شخصًا');
  assert.equal(people(47), 'شخصًا');
});

console.log(`\n✅ ${passed} اختبارًا لعدّاد الفتحات`);
