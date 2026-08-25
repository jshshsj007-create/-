/**
 * مقارنة المواسم: تجميع البرامج بالموسم، وترتيبها، وحساب المشتركين والحضور.
 * الخطأ الوارد هنا صامت — رقم أكبر مما هو، ولا أحد ينتبه — فنقفله باختبار.
 */
import assert from 'node:assert/strict';
import {
  seasonRows, seasonLabel, parseTermKey, programNames, programTotals,
  peopleOf, quickHeads, attendanceStats, pct, changePct, seasonsReportText, countSeasons,
} from './build/app.mjs';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('  ✓ ' + name); };

const TERMS = ['الأول', 'الثاني'];

/** برنامج منفصل: كل يوم دفتره وأسماؤه. */
const split = (name, termKey, weeks) => ({ id: name + termKey, name, type: 'منفصل', termKey, weeks });
const week = (id, parts, extra = {}) => ({
  id, mode: 'named', participants: parts, collections: [], expenseItems: [],
  schoolPayouts: [], faidPayouts: [], ...extra,
});
const P = (id, name, amount, attendance) => ({ id, name, amount, accountId: 'cash', attendance });

test('مفتاح الموسم يتفكّك لسنة وترم', () => {
  assert.deepEqual(parseTermKey('1448-الأول'), { year: '1448', term: 'الأول' });
  assert.equal(seasonLabel('1448-الثاني'), 'الترم الثاني 1448 هـ');
});

test('الترم اللي فيه شرطة ما ينكسر', () => {
  // الاسم يُقسم عند أول شرطة فقط، فالباقي يبقى ترمًا كما كُتب
  assert.deepEqual(parseTermKey('1448-الصيفي-أ'), { year: '1448', term: 'الصيفي-أ' });
});

test('المشترك يُحسب مرة وحدة مهما كثرت أيامه', () => {
  const p = split('جمعة الرواد', '1448-الأول', [
    week('w1', [P('a', 'سعد المطيري', 50, 'حاضر'), P('b', 'خالد العتيبي', 50, 'غائب')]),
    week('w2', [P('c', 'سعد المطيري', 50, 'حاضر')]),
  ]);
  assert.equal(peopleOf(p).size, 2, 'سعد في يومين شخص واحد');
  assert.equal(programTotals(p).people, 2);
});

test('اختلاف الهمزة والتاء المربوطة ما يصير شخصين', () => {
  const p = split('برنامج', '1448-الأول', [
    week('w1', [P('a', 'أسامة الحربي', 50, 'حاضر')]),
    week('w2', [P('b', 'اسامه الحربي', 50, 'حاضر')]),
  ]);
  assert.equal(peopleOf(p).size, 1);
});

test('رقم المشترك في قاعدة البيانات أقوى من الاسم', () => {
  const p = split('برنامج', '1448-الأول', [
    week('w1', [{ ...P('a', 'سعد', 50, 'حاضر'), studentId: 's1' }]),
    week('w2', [{ ...P('b', 'سعد بن ناصر', 50, 'حاضر'), studentId: 's1' }]),
  ]);
  assert.equal(peopleOf(p).size, 1, 'نفس الطالب ولو انكتب اسمه ناقصًا مرة');
});

test('المنتظر تأكيده ما يُعد مشتركًا', () => {
  const p = split('برنامج', '1448-الأول', [
    week('w1', [P('a', 'سعد', 50, 'حاضر'), { ...P('b', 'زائر', 50, 'معلق'), pending: true }]),
  ]);
  assert.equal(programTotals(p).people, 1, 'مثل الإيراد: ما يدخل قبل التأكيد');
});

test('اليوم السريع عدد بلا أسماء، يُجمع كما هو', () => {
  const p = split('برنامج', '1448-الأول', [
    week('w1', [P('a', 'سعد', 50, 'حاضر')]),
    week('w2', [], { mode: 'quick', quickCount: 30, quickRevenue: 900 }),
  ]);
  assert.equal(quickHeads(p), 30);
  assert.equal(programTotals(p).people, 31);
});

test('نسبة الحضور تتجاهل الأيام السريعة بدل ما تنزّلها', () => {
  const p = split('برنامج', '1448-الأول', [
    week('w1', [P('a', 'سعد', 50, 'حاضر'), P('b', 'خالد', 50, 'غائب')]),
    week('w2', [], { mode: 'quick', quickCount: 30, quickRevenue: 900 }),
  ]);
  assert.deepEqual(attendanceStats(p), { slots: 2, present: 1 });
  assert.equal(pct(1, 2), 50);
});

test('البرنامج المجمّع: الحضور من خريطة البرنامج، والمسجّل في يومه فقط', () => {
  const grouped = {
    id: 'g', name: 'ربيع الرواد', type: 'مجمع', termKey: '1448-الأول',
    mode: 'named', collections: [], expenseItems: [], schoolPayouts: [], faidPayouts: [],
    weeks: [{ id: 'd1' }, { id: 'd2' }],
    participants: [
      { id: 'a', name: 'سعد', amount: 100, accountId: 'cash', days: ['d1', 'd2'] },
      { id: 'b', name: 'خالد', amount: 50, accountId: 'cash', days: ['d1'] },
    ],
    attendance: { d1: { a: 'حاضر', b: 'حاضر' }, d2: { a: 'غائب' } },
  };
  // خالد مسجّل في يوم واحد، فما ينحسب غائبًا في اليوم الثاني
  assert.deepEqual(attendanceStats(grouped), { slots: 3, present: 2 });
  assert.equal(programTotals(grouped).people, 2);
  assert.equal(programTotals(grouped).revenue, 150);
});

/* ------------------------------ صفوف المواسم ------------------------------ */

const programs = [
  split('جمعة الرواد', '1447-الأول', [week('a1', [P('a', 'سعد', 40, 'حاضر'), P('b', 'خالد', 40, 'غائب')])]),
  split('جمعة الرواد', '1447-الثاني', [week('b1', [P('c', 'سعد', 50, 'حاضر'), P('d', 'خالد', 50, 'حاضر'), P('e', 'ماجد', 50, 'حاضر')])]),
  split('ربيع الرواد', '1447-الثاني', [week('c1', [P('f', 'نايف', 60, 'حاضر')])]),
  split('جمعة الرواد', '1448-الأول', [week('d1', [P('g', 'سعد', 60, 'حاضر'), P('h', 'ماجد', 60, 'حاضر')])]),
];

test('كل موسم بسطر، والأحدث فوق', () => {
  const rows = seasonRows(programs, TERMS);
  assert.deepEqual(rows.map((r) => r.key), ['1448-الأول', '1447-الثاني', '1447-الأول']);
});

test('ترتيب الترم من الإعدادات، لا من ترتيب الإدخال', () => {
  const rows = seasonRows([programs[1], programs[0]], TERMS);
  assert.deepEqual(rows.map((r) => r.key), ['1447-الثاني', '1447-الأول'], 'الثاني فوق الأول');
});

test('أرقام الموسم مجموع برامجه', () => {
  const [, mid] = seasonRows(programs, TERMS);
  assert.equal(mid.key, '1447-الثاني');
  assert.equal(mid.programs, 2);
  assert.equal(mid.revenue, 210);
  assert.equal(mid.people, 4, 'سعد وخالد وماجد ونايف');
});

test('المشترك في برنامجين داخل الموسم شخص واحد', () => {
  const two = [
    split('أ', '1448-الأول', [week('x', [P('a', 'سعد المطيري', 50, 'حاضر')])]),
    split('ب', '1448-الأول', [week('y', [P('b', 'سعد المطيري', 50, 'حاضر')])]),
  ];
  assert.equal(seasonRows(two, TERMS)[0].people, 1);
});

test('الفلترة ببرنامج واحد تعطي مواسمه هو', () => {
  const only = programs.filter((p) => p.name === 'جمعة الرواد');
  const rows = seasonRows(only, TERMS);
  assert.deepEqual(rows.map((r) => r.key), ['1448-الأول', '1447-الثاني', '1447-الأول']);
  assert.deepEqual(rows.map((r) => r.revenue), [120, 150, 80]);
  assert.deepEqual(rows.map((r) => r.people), [2, 3, 2]);
});

test('أسماء البرامج تتجمع، والأكثر تكرارًا أول', () => {
  const names = programNames(programs);
  assert.deepEqual(names.map((n) => n.name), ['جمعة الرواد', 'ربيع الرواد']);
  assert.deepEqual(names.map((n) => n.count), [3, 1]);
});

test('الاسم المكتوب بهجاء مختلف برنامج واحد', () => {
  const names = programNames([
    split('جمعة الرواد', '1447-الأول', []),
    split('جمعه الرواد', '1448-الأول', []),
  ]);
  assert.equal(names.length, 1);
  assert.equal(names[0].count, 2);
});

test('البرنامج بلا موسم ما يكسّر القائمة', () => {
  const rows = seasonRows([{ id: 'x', name: 'قديم', type: 'منفصل', weeks: [] }], TERMS);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].label, 'بلا موسم');
});

/* -------------------------------- الفروق -------------------------------- */

test('الفرق نسبة مئوية، والصفر ما ينقسم عليه', () => {
  assert.equal(changePct(120, 80), 50);
  assert.equal(changePct(80, 120), -33);
  assert.equal(changePct(100, 100), 0);
  assert.equal(changePct(100, 0), null, 'ابتداء لا نمو');
  assert.equal(pct(0, 0), null);
});

test('العدد يُقرأ كلامًا عربيًا', () => {
  assert.equal(countSeasons(1), 'موسم واحد');
  assert.equal(countSeasons(2), 'موسمين');
  assert.equal(countSeasons(3), '3 مواسم');
  assert.equal(countSeasons(11), '11 موسمًا');
});

test('نص المقارنة يذكر كل موسم بأرقامه', () => {
  const rows = seasonRows(programs.filter((p) => p.name === 'جمعة الرواد'), TERMS);
  const text = seasonsReportText(rows, 'مقارنة مواسم «جمعة الرواد»');
  assert.ok(text.startsWith('مقارنة مواسم «جمعة الرواد»'));
  assert.ok(text.includes('الترم الأول 1448 هـ'));
  assert.ok(text.includes('الترم الأول 1447 هـ'));
  assert.ok(text.includes('الإيراد: 120 ر.س'));
  assert.ok(text.includes('الحضور: 100%'));
});

console.log(`\n✅ ${passed} اختبارًا لمقارنة المواسم\n`);
