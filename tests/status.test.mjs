/**
 * حالة المشترك. الرقم هنا يترتب عليه اتصال بولي أمر — فالغلط فيه إما إزعاج
 * لمن هو حاضر، أو سكوت عمّن انقطع. يُقفل باختبار.
 */
import assert from 'node:assert/strict';
import {
  NEW, ON, PART, OFF, STATES, stateOf, marksOf, studentState, stateCounts,
} from '../src/status.js';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('  ✓ ' + name); };

const T = true, F = false;

test('الحالات أربع، والمنقطع أولها عرضًا', () => {
  assert.deepEqual(STATES, [OFF, PART, ON, NEW]);
});

/* ------------------------------ السلسلة ------------------------------ */

test('ما عنده يوم مسجّل: جديد', () => {
  assert.equal(stateOf([]), NEW);
  assert.equal(stateOf(null), NEW);
});

test('حضر في آخر ثلاثة: مستمر', () => {
  assert.equal(stateOf([T]), ON);
  assert.equal(stateOf([F, F, T]), ON);
  assert.equal(stateOf([T, F, F]), ON, 'ثالث يوم من الآخر يكفي');
});

test('غاب الثلاثة وحضر ضمن السبعة: متقطع', () => {
  assert.equal(stateOf([T, F, F, F]), PART);
  assert.equal(stateOf([F, F, F, T, F, F, F]), PART, 'رابع يوم من الآخر');
});

test('غاب السبعة كلها: منقطع', () => {
  assert.equal(stateOf([T, F, F, F, F, F, F, F]), OFF);
  assert.equal(stateOf([F, F, F, F, F, F, F]), OFF);
});

test('اللي حضر قبل ثمانية أيام ما ينفعه حضوره', () => {
  assert.equal(stateOf([T, F, F, F, F, F, F, F, F]), OFF, 'خرج من نافذة السبعة');
});

test('الحدود تُضبط من الخارج لو احتجنا', () => {
  assert.equal(stateOf([T, F, F], { near: 2 }), PART, 'حضوره برّا نافذة اليومين');
  assert.equal(stateOf([T, F, F], { near: 2, far: 2 }), OFF);
});

/* --------------------------- من بيانات البرنامج --------------------------- */

const grouped = {
  type: 'مجمع',
  participants: [
    { id: 'p1', studentId: 's1', days: ['w1', 'w2', 'w3'] },
    { id: 'p2', studentId: 's2', days: ['w3'] },
  ],
  weeks: [{ id: 'w1' }, { id: 'w2' }, { id: 'w3' }, { id: 'w4' }],
  attendance: {
    w1: { p1: 'حاضر' },
    w2: { p1: 'غائب' },
    w3: { p1: 'حاضر', p2: 'غائب' },
    w4: { p1: 'حاضر' },
  },
};

test('المجمّع: يقرأ خريطة الحضور بترتيب الأيام', () => {
  assert.deepEqual(marksOf(grouped, 's1'), [T, F, T], 'اليوم الرابع مو من أيامه');
});

test('والمسجَّل بيوم واحد ما يُحاسب على غيره', () => {
  assert.deepEqual(marksOf(grouped, 's2'), [F]);
});

test('اللي مو في البرنامج أصلًا: سلسلة فاضية', () => {
  assert.deepEqual(marksOf(grouped, 'zz'), []);
});

const separate = {
  type: 'منفصل',
  weeks: [
    { id: 'w1', participants: [{ id: 'a', studentId: 's1', attendance: 'حاضر' }] },
    { id: 'w2', participants: [{ id: 'b', studentId: 's1', attendance: 'معلق' }] },
    { id: 'w3', participants: [{ id: 'c', studentId: 's1', attendance: 'غائب' }] },
  ],
};

test('المنفصل: الحضور على المشارك في كل يوم', () => {
  assert.deepEqual(marksOf(separate, 's1'), [T, F], 'المعلّق ما ينحسب غيابًا');
});

test('اليوم اللي ما سُجّل فيه شي ما يُحسب على أحد', () => {
  const pending = { type: 'مجمع', participants: [{ id: 'p1', studentId: 's1' }], weeks: [{ id: 'w1' }, { id: 'w2' }], attendance: { w1: { p1: 'معلق' } } };
  assert.deepEqual(marksOf(pending, 's1'), [], 'يوم لسه ما جاء ما يخلّيه منقطعًا');
  assert.equal(studentState([pending], 's1'), NEW);
});

/* ----------------------------- عبر البرامج ----------------------------- */

test('يحضر في برنامج ويغيب عن ثانٍ: مستمر', () => {
  const dead = { type: 'مجمع', participants: [{ id: 'x', studentId: 's1' }], weeks: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], attendance: { a: { x: 'غائب' }, b: { x: 'غائب' }, c: { x: 'غائب' } } };
  assert.equal(studentState([dead], 's1'), OFF, 'وحده: منقطع');
  assert.equal(studentState([dead, grouped], 's1'), ON, 'ومع برنامج يحضره: مستمر');
});

test('حالة من ما له برامج: جديد', () => {
  assert.equal(studentState([], 's1'), NEW);
  assert.equal(studentState(null, 's1'), NEW);
});

/* ------------------------------ العدّادات ------------------------------ */

test('العدّادات تجمع كل طالب مرة وحدة', () => {
  const students = [{ id: 's1' }, { id: 's2' }, { id: 'zz' }];
  const c = stateCounts(students, [grouped]);
  assert.equal(c['الكل'], 3);
  assert.equal(c[ON], 1, 'سعد حاضر في آخر يوم له');
  assert.equal(c[PART], 0);
  assert.equal(c[OFF], 1, 'اللي غاب يومه الوحيد');
  assert.equal(c[NEW], 1, 'اللي ما دخل البرنامج');
  assert.equal(c[ON] + c[PART] + c[OFF] + c[NEW], c['الكل'], 'المجموع يساوي الكل');
});

console.log(`\n✅ ${passed} اختبارًا لحالة المشترك\n`);
