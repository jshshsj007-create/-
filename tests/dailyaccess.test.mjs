/** التسميع اليومي: من يرى ومن يكتب. */
import assert from 'node:assert/strict';
import { cleanSession, dailySeen, dailyKept, DAILY_MAX, DAILY_BATCH } from '../src/dailyaccess.js';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('  ✓ ' + name); };

const A = { id: 'uA', role: 'مسجل حضور', permissions: [] };
const B = { id: 'uB', role: 'مسجل حضور', permissions: [] };
const s = (id, user, extra = {}) => ({ id, userId: user, surah: 112, from: 1, to: 4, words: 15, repeats: 1, hints: 0, level: 'normal', at: 1000, ...extra });

test('الطالب يرى جلساته هو فقط، ومن يتابع الطلاب يرى الكل', () => {
  const all = [s('1', 'uA'), s('2', 'uB'), s('3', 'uA')];
  assert.deepEqual(dailySeen(all, A, false).map((x) => x.id), ['1', '3']);
  assert.equal(dailySeen(all, { id: 'm' }, true).length, 3);
  assert.deepEqual(dailySeen(all, { id: 'z' }, false), []);
});

test('يضيف جلسةً باسمه هو مهما ادّعى، وتبقى جلسات غيره كما هي', () => {
  const cur = [s('1', 'uA'), s('2', 'uB')];
  const sent = [s('1', 'uA'), s('n1', 'uB'), s('2', 'uB')];       // ادّعى أن الجديدة لغيره
  const out = dailyKept(sent, cur, A, false);
  const n1 = out.find((x) => x.id === 'n1');
  assert.equal(n1.userId, 'uA', 'باسمه لا بما ادّعاه');
  assert.equal(out.find((x) => x.id === '2').userId, 'uB');
  assert.equal(out.length, 3);
});

test('لا يمسّ جلسة غيره: لا يعدّلها ولا يحذفها ولا يسطو عليها بمعرّفها', () => {
  const cur = [s('2', 'uB', { repeats: 3 })];
  const sent = [s('2', 'uB', { repeats: 0 })];                     // تعديلٌ على جلسة غيره
  assert.equal(dailyKept(sent, cur, A, false).find((x) => x.id === '2').repeats, 3);
  assert.equal(dailyKept([], cur, A, false).length, 1, 'ولا يحذفها بإغفالها');
  // يدّعي معرّفها لجلسته: تبقى لصاحبها وتُضاف له نسخةٌ بمعرّفٍ آخر لا تعوّضها
  const out = dailyKept([s('2', 'uA')], cur, A, false);
  assert.equal(out.find((x) => x.id === '2').userId, 'uB');
});

test('جلسةٌ قائمة لا تُعدَّل بعد حفظها، ويحذف ما شاء من جلساته', () => {
  const cur = [s('1', 'uA', { repeats: 2 }), s('2', 'uA')];
  const out = dailyKept([s('1', 'uA', { repeats: 0, words: 999 })], cur, A, false);
  assert.equal(out.length, 1, 'حذف الثانية بإغفالها');
  assert.equal(out[0].repeats, 2, 'والأولى كما حُفظت');
});

test('الحقول في حدودها: سورة ١..١١٤، وتلميحات لا تزيد على الكلمات، ومستوى معروف', () => {
  const c = cleanSession({ id: 'x', surah: 500, from: -3, to: 99999, words: 10, repeats: 9999, hints: 99, level: 'سري', at: 5 }, A);
  assert.equal(c.surah, 114);
  assert.equal(c.from, 1);
  assert.ok(c.to <= 286 && c.to >= c.from);
  assert.equal(c.hints, 10);
  assert.equal(c.repeats, 500);
  assert.equal(c.level, 'normal');
  assert.equal(cleanSession({ surah: 1 }, A), null, 'بلا معرّف');
  assert.equal(cleanSession({ id: 'q' }, null), null, 'بلا صاحب');
});

test('لا حقولَ غريبة: صوتٌ ولا نصٌّ مسموع لا يُحفظان', () => {
  const c = cleanSession({ ...s('x', 'uA'), audio: 'data:audio/webm;base64,AAAA', heard: 'نصٌّ مسموع', evil: '<script>' }, A);
  assert.deepEqual(Object.keys(c).sort(), ['at', 'from', 'hints', 'id', 'level', 'repeats', 'surah', 'to', 'userId', 'words']);
});

test('تاريخٌ في المستقبل البعيد يُردّ إلى الغد', () => {
  const now = 1_700_000_000_000;
  assert.ok(cleanSession(s('x', 'uA', { at: now * 10 }), A, now).at <= now + 86400000);
});

test('حدّ الحفظة الواحدة، وحدّ المجموع فيُسقَط الأقدم', () => {
  const many = Array.from({ length: 50 }, (_, i) => s('n' + i, 'uA', { at: i }));
  assert.equal(dailyKept(many, [], A, false).length, DAILY_BATCH);
  const cur = Array.from({ length: DAILY_MAX }, (_, i) => s('o' + i, 'uA', { at: i }));
  const out = dailyKept([...cur, s('new', 'uA', { at: 99999 })], cur, A, false);
  assert.equal(out.length, DAILY_MAX);
  assert.ok(out.some((x) => x.id === 'new') && !out.some((x) => x.id === 'o0'), 'سقط الأقدم');
});

test('من يتابع الطلاب يكتب كما شاء', () => {
  const sent = [s('1', 'uA'), s('2', 'uB')];
  assert.deepEqual(dailyKept(sent, [], { id: 'm' }, true), sent);
});

console.log(`\n✅ ${passed} اختبارًا لصلاحية التسميع اليومي\n`);
