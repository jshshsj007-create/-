/**
 * عمليات فيض ومواسمها: الرصيد تراكمي، والإيراد والمصروف لكل موسم وحده.
 * الترحيل من برنامج يعرف موسمه من برنامجه، واليدوي القديم يُخمَّن بتاريخه
 * أو يبقى بلا موسم — ولا يُدسّ في ترم بالغلط.
 */
import assert from 'node:assert/strict';
import { dateKey, termRanges, guessTerm, migrate, unpaidRows, programRows, dueOf } from './build/app.mjs';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('  ✓ ' + name); };

/* ------------------------------ التاريخ ------------------------------ */

test('التاريخ يُقرأ مهما كُتب، والباقي يُرفض', () => {
  assert.equal(dateKey('1448/2/1'), '1448-02-01');
  assert.equal(dateKey('1448-02-01'), '1448-02-01');
  assert.equal(dateKey(' 1448 / 12 / 30 '), '1448-12-30');
  assert.equal(dateKey('أول الترم'), '');
  assert.equal(dateKey(''), '');
  assert.equal(dateKey(undefined), '');
});

const programs = [
  { id: 'p1', name: 'جمعة الرواد', type: 'منفصل', termKey: '1448-الأول', weeks: [
    { id: 'w1', name: 'الأسبوع الأول', date: '1448/02/05', mode: 'named', participants: [] },
    { id: 'w2', name: 'الأسبوع الثاني', date: '1448/03/10', mode: 'named', participants: [] },
  ] },
  { id: 'p2', name: 'ربيع الرواد', type: 'منفصل', termKey: '1448-الثاني', weeks: [
    { id: 'w3', name: 'الأسبوع الأول', date: '1448/07/01', mode: 'named', participants: [] },
    { id: 'w4', name: 'الأسبوع الثاني', date: '1448/08/20', mode: 'named', participants: [] },
  ] },
];

test('مدى كل موسم من تواريخ أيام برامجه', () => {
  const r = termRanges(programs);
  assert.deepEqual(r.get('1448-الأول'), { from: '1448-02-05', to: '1448-03-10' });
  assert.deepEqual(r.get('1448-الثاني'), { from: '1448-07-01', to: '1448-08-20' });
});

test('العملية تلقى موسمها من تاريخها', () => {
  const r = termRanges(programs);
  assert.equal(guessTerm('1448/02/20', r), '1448-الأول');
  assert.equal(guessTerm('1448/08/01', r), '1448-الثاني');
});

test('اللي برّا المواسم أو بلا تاريخ يبقى بلا موسم', () => {
  const r = termRanges(programs);
  assert.equal(guessTerm('1448/05/01', r), '', 'بين الترمين');
  assert.equal(guessTerm('', r), '');
  assert.equal(guessTerm('أول رمضان', r), '');
});

test('التاريخ اللي يقع في موسمين ما يُخمَّن — التخمين المشكوك فيه أسوأ من لا شيء', () => {
  const overlap = [
    programs[0],
    { ...programs[1], weeks: [{ id: 'x', name: 'يوم', date: '1448/02/06', mode: 'named', participants: [] }] },
  ];
  assert.equal(guessTerm('1448/02/06', termRanges(overlap)), '');
});

/* ---------------------- الترقية: الترحيل يرجع لموسمه ---------------------- */

test('الترحيل القديم يرجع لموسم برنامجه بأثر رجعي', () => {
  const d = migrate({
    years: ['1448'], terms: ['الأول', 'الثاني'], programs,
    faidAdjustments: [
      { id: 'a', accountId: 'c', type: 'إيراد', amount: 400, source: { kind: 'week', programId: 'p1', weekId: 'w1' } },
      { id: 'b', accountId: 'c', type: 'إيراد', amount: 300, source: { kind: 'program', programId: 'p2' } },
      { id: 'c', accountId: 'c', type: 'مصروف', amount: 50, note: 'يدوية' },
    ],
  });
  const by = Object.fromEntries(d.faidAdjustments.map((a) => [a.id, a.termKey]));
  assert.equal(by.a, '1448-الأول');
  assert.equal(by.b, '1448-الثاني');
  assert.equal(by.c, undefined, 'اليدوية ما تُخمَّن في الترقية');
});

test('الموسم المكتوب سابقًا ما يُداس', () => {
  const d = migrate({
    years: ['1448'], terms: ['الأول', 'الثاني'], programs,
    faidAdjustments: [{ id: 'a', termKey: '1448-الثاني', accountId: 'c', type: 'إيراد', amount: 400, source: { programId: 'p1' } }],
  });
  assert.equal(d.faidAdjustments[0].termKey, '1448-الثاني');
});

test('برنامج انحذف: العملية تبقى بلا موسم ولا تنكسر الترقية', () => {
  const d = migrate({
    years: ['1448'], terms: ['الأول'], programs: [],
    faidAdjustments: [{ id: 'a', accountId: 'c', type: 'إيراد', amount: 400, source: { programId: 'ماراح' } }],
  });
  assert.equal(d.faidAdjustments[0].termKey, undefined);
});

/* -------------------------------- ما دفع -------------------------------- */

const P = (id, name, amount, accountId, extra = {}) => ({ id, name, amount, accountId, ...extra });

test('ما دفع: من كل البرامج والأيام', () => {
  const list = unpaidRows([
    { id: 'p1', name: 'جمعة', type: 'منفصل', termKey: '1448-الأول', weeks: [
      { id: 'w1', name: 'الأول', mode: 'named', participants: [P('a', 'سعد', 50, 'unpaid'), P('b', 'خالد', 50, 'cash')] },
      { id: 'w2', name: 'الثاني', mode: 'named', participants: [P('c', 'ماجد', 50, 'unpaid')] },
    ] },
    { id: 'p2', name: 'ربيع', type: 'مجمع', termKey: '1448-الأول', weeks: [{ id: 'd1' }],
      participants: [P('d', 'نايف', 120, 'unpaid')] },
  ]);
  assert.deepEqual(list.map((r) => r.part.name), ['سعد', 'ماجد', 'نايف']);
  assert.equal(list[0].week.name, 'الأول');
  assert.equal(list[2].week, null, 'المجمّع دفتره على البرنامج لا على اليوم');
});

test('المنتظر تأكيده ما هو «ما دفع»', () => {
  const list = unpaidRows([
    { id: 'p1', name: 'جمعة', type: 'منفصل', weeks: [
      { id: 'w1', name: 'الأول', mode: 'named', participants: [P('a', 'زائر', 50, 'unpaid', { pending: true })] },
    ] },
  ]);
  assert.equal(list.length, 0);
});

test('اليوم السريع ما فيه أحد نطالبه', () => {
  const list = unpaidRows([
    { id: 'p1', name: 'جمعة', type: 'منفصل', weeks: [
      { id: 'w1', name: 'الأول', mode: 'quick', quickCount: 30, quickRevenue: 0, participants: [] },
    ] },
  ]);
  assert.equal(list.length, 0);
});

test('المطلوب يُشتقّ من سعر البرنامج، لأن «ما دفع» ينحفظ بصفر', () => {
  const split = { type: 'منفصل', signup: { price: 60 }, weeks: [{ id: 'w1' }] };
  assert.equal(dueOf(split, P('a', 'سعد', 0, 'unpaid')), 60);

  const grouped = { type: 'مجمع', dayPrice: 50, weeks: [{ id: 'd1' }, { id: 'd2' }, { id: 'd3' }] };
  assert.equal(dueOf(grouped, P('a', 'سعد', 0, 'unpaid', { days: ['d1', 'd2'] })), 100, 'يومان × ٥٠');
  assert.equal(dueOf(grouped, P('b', 'خالد', 0, 'unpaid')), 150, 'بلا أيام محددة = كل الأيام');
});

test('بلا سعر مسجّل ما نخترع رقمًا', () => {
  assert.equal(dueOf({ type: 'منفصل', weeks: [{ id: 'w1' }] }, P('a', 'سعد', 0, 'unpaid')), 0);
});

test('سطر «ما دفع» يحمل المطلوب معه', () => {
  const list = unpaidRows([
    { id: 'p1', name: 'جمعة', type: 'منفصل', signup: { price: 45 }, weeks: [
      { id: 'w1', name: 'الأول', mode: 'named', participants: [P('a', 'سعد', 0, 'unpaid')] },
    ] },
  ]);
  assert.equal(list[0].due, 45);
});

/* ----------------------------- صفوف البرامج ----------------------------- */

const two = [
  { id: 'g1', name: 'جمعة الرواد', type: 'منفصل', termKey: '1447-الأول', weeks: [
    { id: 'a1', mode: 'named', participants: [P('a', 'سعد', 40, 'cash'), P('b', 'خالد', 40, 'cash')] },
  ] },
  { id: 'g2', name: 'جمعة الرواد', type: 'منفصل', termKey: '1448-الأول', weeks: [
    { id: 'a2', mode: 'named', participants: [P('c', 'سعد', 60, 'cash')] },
  ] },
  { id: 'g3', name: 'ربيع الرواد', type: 'منفصل', termKey: '1448-الأول', weeks: [
    { id: 'a3', mode: 'named', participants: [P('d', 'سعد', 70, 'cash')] },
  ] },
];

test('صف لكل برنامج، الأحدث فوق', () => {
  const rows = programRows(two, ['الأول', 'الثاني']);
  assert.deepEqual(rows.map((r) => r.id), ['g2', 'g3', 'g1']);
  assert.equal(rows[0].season, 'الترم الأول 1448 هـ');
});

test('اللي سجّل في برنامجين ينحسب في الاثنين', () => {
  const rows = programRows(two, ['الأول', 'الثاني']);
  const byId = Object.fromEntries(rows.map((r) => [r.id, r.people]));
  // سعد في «جمعة» و«ربيع» من نفس الموسم — واحد في كل صف
  assert.equal(byId.g2, 1);
  assert.equal(byId.g3, 1);
  assert.equal(rows.reduce((s, r) => s + r.people, 0), 4, 'مجموع المسجّلين لا الأشخاص');
});

console.log(`\n✅ ${passed} اختبارًا لمواسم فيض وما دفع\n`);
