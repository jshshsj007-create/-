/**
 * اختبارات الدمج الثلاثي: لما شخصان يحفظان في نفس اللحظة، ما يضيع شغل أي واحد منهم.
 */
import assert from 'node:assert/strict';
import { merge3 } from '../src/cloud.js';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('  ✓ ' + name); };

const base = {
  currentYear: '1448',
  programs: [{
    id: 'p1', name: 'جمعة الرواد', dayPrice: 50,
    participants: [{ id: 'a', name: 'سعد', amount: 50 }],
    expenseItems: [],
    weeks: [{ id: 'w1', name: 'اليوم الأول' }],
  }],
  faidAdjustments: [],
  users: [{ id: 'u1', name: 'المدير', role: 'مدير' }],
};

const deep = (v) => JSON.parse(JSON.stringify(v));

test('إضافتان مختلفتان في نفس القائمة تبقيان الاثنتان', () => {
  // الموظف سجّل «فهد» وأنا في نفس اللحظة سجّلت «عمر»
  const mine = deep(base);
  mine.programs[0].participants.push({ id: 'b', name: 'عمر', amount: 50 });
  const theirs = deep(base);
  theirs.programs[0].participants.push({ id: 'c', name: 'فهد', amount: 50 });

  const out = merge3(base, mine, theirs);
  assert.deepEqual(out.programs[0].participants.map((p) => p.name).sort(), ['سعد', 'عمر', 'فهد'].sort());
});

test('تعديل مالي عندي + تسجيل عند الموظف: الاثنان يبقيان', () => {
  const mine = deep(base);
  mine.programs[0].expenseItems.push({ id: 'e1', amount: 200, note: 'ميداليات' });
  const theirs = deep(base);
  theirs.programs[0].participants.push({ id: 'c', name: 'فهد', amount: 50 });

  const out = merge3(base, mine, theirs);
  assert.equal(out.programs[0].expenseItems.length, 1);
  assert.equal(out.programs[0].participants.length, 2);
});

test('اللي حذفه صاحبه ينحذف فعلًا وما يرجع', () => {
  const mine = deep(base);
  mine.programs[0].participants = []; // أنا حذفت سعد
  const theirs = deep(base);
  theirs.programs[0].participants.push({ id: 'c', name: 'فهد', amount: 50 });

  const out = merge3(base, mine, theirs);
  assert.deepEqual(out.programs[0].participants.map((p) => p.id), ['c']);
});

test('تعديل حقل واحد عند كل طرف على نفس السجل يجتمع', () => {
  const mine = deep(base);
  mine.programs[0].participants[0].amount = 80;   // أنا صحّحت المبلغ
  const theirs = deep(base);
  theirs.programs[0].participants[0].note = 'دفع متأخر'; // هو أضاف ملاحظة

  const out = merge3(base, mine, theirs);
  assert.equal(out.programs[0].participants[0].amount, 80);
  assert.equal(out.programs[0].participants[0].note, 'دفع متأخر');
});

test('لو غيّرنا نفس الحقل، تعديلي أنا يفوز (آخر من دمج)', () => {
  const mine = deep(base);
  mine.currentYear = '1449';
  const theirs = deep(base);
  theirs.currentYear = '1450';
  assert.equal(merge3(base, mine, theirs).currentYear, '1449');
});

test('الحقل اللي ما لمسته يأخذ قيمة الخادم', () => {
  const mine = deep(base);
  const theirs = deep(base);
  theirs.currentYear = '1450';
  assert.equal(merge3(base, mine, theirs).currentYear, '1450');
});

test('التسجيل الجزئي: يومان مختلفان لنفس المشترك ما يلغي أحدهما الثاني', () => {
  const b = deep(base);
  b.programs[0].participants[0].days = ['w1'];
  const mine = deep(b);
  mine.programs[0].participants[0].days = ['w1', 'w2']; // أنا سجّلته اليوم الثاني
  const theirs = deep(b);
  theirs.programs[0].attendance = { w1: { a: 'حاضر' } }; // الموظف حضّره اليوم الأول

  const out = merge3(b, mine, theirs);
  assert.deepEqual(out.programs[0].participants[0].days, ['w1', 'w2']);
  assert.equal(out.programs[0].attendance.w1.a, 'حاضر');
});

test('يومان جديدان يُضافان في نفس اللحظة، الاثنان يبقيان', () => {
  const mine = deep(base);
  mine.programs[0].weeks.push({ id: 'w2', name: 'اليوم الثاني' });
  const theirs = deep(base);
  theirs.programs[0].weeks.push({ id: 'w3', name: 'اليوم الثالث' });

  const out = merge3(base, mine, theirs);
  assert.deepEqual(out.programs[0].weeks.map((w) => w.id).sort(), ['w1', 'w2', 'w3']);
});

test('برنامج جديد عندي + عملية فيض عندهم: ما يضيع ولا واحد', () => {
  const mine = deep(base);
  mine.programs.push({ id: 'p2', name: 'خيركم', participants: [], weeks: [] });
  const theirs = deep(base);
  theirs.faidAdjustments.push({ id: 'f1', type: 'مصروف', amount: 300, payee: 'فهد' });

  const out = merge3(base, mine, theirs);
  assert.equal(out.programs.length, 2);
  assert.equal(out.faidAdjustments.length, 1);
});

test('نسختان متطابقتان ترجعان كما هي', () => {
  assert.deepEqual(merge3(base, deep(base), deep(base)), base);
});

test('الدمج ما يطيح على قيم فاضية', () => {
  assert.deepEqual(merge3(undefined, { a: 1 }, {}), { a: 1 });
  assert.deepEqual(merge3(null, [], []), []);
  assert.equal(merge3(undefined, null, null), null);
});

console.log(`\n${passed} اختبار نجح.`);
