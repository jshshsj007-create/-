/**
 * اختبارات معادلة التوزيع:
 *   الصافي = (تحصيل المشاركين + التحصيل الإضافي) − المصروفات
 *   المتبقي = الصافي − (نصيب المدرسة + نصيب فيض)
 */
import assert from 'node:assert/strict';
import { L, sumAmt, paidAmount, isEnrolled, enrolledDays, enrolledIn } from './build/app.mjs';

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

// سيناريو برنامج مجمّع ٤ أيام بسعر يوم 50، والتسجيل جزئي:
//   p1 سجّل الأربعة أيام            = 200
//   p2 سجّل يوم واحد فقط (اليوم 2)  = 50
//   p3 جاء اليوم الثالث وسجّل يومين = 100
//   p4 سجّل يوم واحد وما دفع
const days = [{ id: 'd1' }, { id: 'd2' }, { id: 'd3' }, { id: 'd4' }];
const grouped = {
  type: 'مجمع', dayPrice: 50, weeks: days,
  participants: [
    { id: 'p1', amount: 200, accountId: 'rajhi', days: ['d1', 'd2', 'd3', 'd4'] },
    { id: 'p2', amount: 50, accountId: 'cash', days: ['d2'] },
    { id: 'p3', amount: 100, accountId: 'cash', days: ['d3', 'd4'] },
    { id: 'p4', amount: 0, accountId: 'unpaid', days: ['d1'] },
  ],
  collections: [],
  expenseItems: [{ id: 'e', amount: 150 }],
  schoolPayouts: [{ id: 's', amount: 100 }],
  faidPayouts: [{ id: 'f', amount: 100 }],
  attendance: { d1: { p1: 'حاضر', p4: 'حاضر' }, d2: { p1: 'حاضر', p2: 'غائب' } },
};

test('المجمّع: كل مشترك يُحتسب بمبلغ أيامه هو', () => {
  assert.equal(L.revenue(grouped), 350); // 200 + 50 + 100 + 0
});

test('المجمّع: الصافي والتوزيع مطابقان', () => {
  assert.equal(L.net(grouped), 200);
  assert.equal(L.remaining(grouped), 0);
});

test('التسجيل الجزئي: كل يوم يشوف المسجّلين فيه فقط', () => {
  assert.deepEqual(enrolledIn(grouped.participants, 'd1').map((p) => p.id), ['p1', 'p4']);
  assert.deepEqual(enrolledIn(grouped.participants, 'd2').map((p) => p.id), ['p1', 'p2']);
  assert.deepEqual(enrolledIn(grouped.participants, 'd3').map((p) => p.id), ['p1', 'p3']);
  assert.deepEqual(enrolledIn(grouped.participants, 'd4').map((p) => p.id), ['p1', 'p3']);
});

test('اللي جاء متأخر ما يظهر في الأيام اللي قبله', () => {
  const late = grouped.participants.find((p) => p.id === 'p3');
  assert.equal(isEnrolled(late, 'd1'), false);
  assert.equal(isEnrolled(late, 'd2'), false);
  assert.equal(isEnrolled(late, 'd3'), true);
  assert.equal(enrolledDays(late, days).length, 2);
});

test('نسبة الحضور تُحسب من أيام المشترك مو من كل أيام البرنامج', () => {
  const st = (pid, d) => grouped.attendance[d]?.[pid] || 'معلق';
  const rate = (p) => {
    const mine = enrolledDays(p, days);
    return `${mine.filter((d) => st(p.id, d.id) === 'حاضر').length}/${mine.length}`;
  };
  assert.equal(rate(grouped.participants.find((p) => p.id === 'p1')), '2/4');
  assert.equal(rate(grouped.participants.find((p) => p.id === 'p2')), '0/1'); // غائب في يومه الوحيد
  assert.equal(rate(grouped.participants.find((p) => p.id === 'p4')), '1/1'); // حاضر في يومه الوحيد
});

test('اقتراح المبلغ من سعر اليوم = عدد الأيام × السعر', () => {
  const suggest = (n) => n * grouped.dayPrice;
  assert.equal(suggest(1), 50);
  assert.equal(suggest(2), 100);
  assert.equal(suggest(4), 200);
});

test('البيانات القديمة بدون days تعني «كل الأيام»', () => {
  const old = { id: 'old', amount: 200, accountId: 'cash' };
  assert.equal(isEnrolled(old, 'd1'), true);
  assert.equal(isEnrolled(old, 'd4'), true);
  assert.equal(enrolledDays(old, days).length, 4);
});

test('حذف يوم يشيله من تسجيلات المشتركين', () => {
  const removed = 'd2';
  const after = grouped.participants.map((p) => (p.days ? { ...p, days: p.days.filter((d) => d !== removed) } : p));
  assert.deepEqual(after.find((p) => p.id === 'p2').days, []);
  assert.deepEqual(after.find((p) => p.id === 'p1').days, ['d1', 'd3', 'd4']);
});

test('دفتر فاضي ما يطيح', () => {
  const empty = {};
  assert.equal(L.revenue(empty), 0);
  assert.equal(L.net(empty), 0);
  assert.equal(L.remaining(empty), 0);
  assert.equal(sumAmt(undefined), 0);
});

console.log(`\n${passed} اختبار نجح.`);
