/**
 * اختبارات معادلة التوزيع:
 *   الصافي = (تحصيل المشاركين + التحصيل الإضافي) − المصروفات
 *   المتبقي = الصافي − (نصيب المدرسة + نصيب فيض)
 */
import assert from 'node:assert/strict';
import { L, sumAmt, paidAmount } from './build/app.mjs';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('  ✓ ' + name); };

// سيناريو أسبوع من برنامج منفصل (جمعة الرواد)
const week = {
  participants: [
    { id: 'a', name: 'طالب 1', amount: 50, accountId: 'rajhi' },
    { id: 'b', name: 'طالب 2', amount: 50, accountId: 'cash' },
    { id: 'c', name: 'طالب 3', amount: 0, accountId: 'unpaid' },
  ],
  collections: [{ id: 'x', amount: 100, accountId: 'cash' }],
  expenseItems: [{ id: 'e', amount: 60, accountId: 'rajhi', note: 'ميداليات' }],
  schoolPayouts: [{ id: 's', amount: 70, accountId: 'cash' }],
  faidPayouts: [{ id: 'f', amount: 70, accountId: 'rajhi' }],
};

test('تحصيل المشاركين يتجاهل «ما دفع»', () => {
  assert.equal(paidAmount(week.participants), 100);
});

test('الإيراد = تحصيل المشاركين + التحصيل الإضافي', () => {
  assert.equal(L.revenue(week), 200);
});

test('الصافي = الإيراد − المصروفات', () => {
  assert.equal(L.net(week), 140);
});

test('التوزيع الكامل يخلّي المتبقي صفر', () => {
  assert.equal(L.school(week), 70);
  assert.equal(L.faid(week), 70);
  assert.equal(L.remaining(week), 0);
});

test('نقص في التوزيع يظهر كمتبقي موجب', () => {
  const w = { ...week, faidPayouts: [{ id: 'f', amount: 40 }] };
  assert.equal(L.remaining(w), 30);
});

test('زيادة في التوزيع تظهر كمتبقي سالب', () => {
  const w = { ...week, faidPayouts: [{ id: 'f', amount: 100 }] };
  assert.equal(L.remaining(w), -30);
});

test('المصروفات تُخصم قبل التوزيع (مو بعده)', () => {
  const noExpense = { ...week, expenseItems: [] };
  assert.equal(L.net(noExpense) - L.net(week), 60);
});

// سيناريو برنامج مجمّع: ٤ أيام، تسجيل واحد بمبلغ كامل
const grouped = {
  type: 'مجمع',
  participants: [
    { id: 'p1', amount: 200, accountId: 'rajhi' },
    { id: 'p2', amount: 200, accountId: 'cash' },
    { id: 'p3', amount: 0, accountId: 'unpaid' },
  ],
  collections: [],
  expenseItems: [{ id: 'e', amount: 150 }],
  schoolPayouts: [{ id: 's', amount: 125 }],
  faidPayouts: [{ id: 'f', amount: 125 }],
  weeks: [{ id: 'd1' }, { id: 'd2' }, { id: 'd3' }, { id: 'd4' }],
  attendance: { d1: { p1: 'حاضر', p2: 'حاضر' }, d2: { p1: 'حاضر', p2: 'غائب' } },
};

test('المجمّع: مبلغ الاشتراك يُحتسب مرة وحدة مهما كانت الأيام', () => {
  assert.equal(L.revenue(grouped), 400);
  assert.equal(grouped.weeks.length, 4);
});

test('المجمّع: الصافي والتوزيع مطابقان', () => {
  assert.equal(L.net(grouped), 250);
  assert.equal(L.remaining(grouped), 0);
});

test('المجمّع: الحضور محسوب لكل يوم على حدة', () => {
  const presentOn = (d) => grouped.participants.filter((p) => grouped.attendance[d]?.[p.id] === 'حاضر').length;
  assert.equal(presentOn('d1'), 2);
  assert.equal(presentOn('d2'), 1);
  assert.equal(presentOn('d3'), 0); // ما سُجّل حضور بعد
});

test('دفتر فاضي ما يطيح', () => {
  const empty = {};
  assert.equal(L.revenue(empty), 0);
  assert.equal(L.net(empty), 0);
  assert.equal(L.remaining(empty), 0);
  assert.equal(sumAmt(undefined), 0);
});

console.log(`\n${passed} اختبار نجح.`);
