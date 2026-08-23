/** اختبارات التسجيل السريع (عدد ومبلغ) وحالة اليوم. */
import assert from 'node:assert/strict';
import { L, isQuick, headcount, weekState, migrate } from './build/app.mjs';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('  ✓ ' + name); };

const quickWeek = {
  mode: 'quick', quickCount: 25, quickRevenue: 1500, status: 'مفتوح',
  participants: [], collections: [], expenseItems: [{ id: 'e', amount: 300 }],
  schoolPayouts: [{ id: 's', amount: 600 }], faidPayouts: [{ id: 'f', amount: 600 }],
};

test('التسجيل السريع: الإيراد من المبلغ المدخل، والعدد من العدّاد', () => {
  assert.equal(isQuick(quickWeek), true);
  assert.equal(headcount(quickWeek), 25);
  assert.equal(L.revenue(quickWeek), 1500);
});

test('المعادلة نفسها تنطبق على التسجيل السريع', () => {
  assert.equal(L.net(quickWeek), 1200);      // 1500 − 300
  assert.equal(L.remaining(quickWeek), 0);   // 600 + 600
});

test('التحصيل الإضافي ينضاف فوق الإيراد السريع', () => {
  const w = { ...quickWeek, collections: [{ id: 'c', amount: 200 }] };
  assert.equal(L.revenue(w), 1700);
  assert.equal(L.net(w), 1400);
});

test('التسجيل بالأسماء يتجاهل حقول التسجيل السريع', () => {
  const named = {
    mode: 'named', quickCount: 99, quickRevenue: 9999,
    participants: [{ id: 'p1', amount: 50, accountId: 'a' }, { id: 'p2', amount: 50, accountId: 'a' }],
    collections: [], expenseItems: [],
  };
  assert.equal(headcount(named), 2);
  assert.equal(L.revenue(named), 100); // ما ياخذ 9999
});

test('حالة اليوم تُحسب: لم يبدأ ← جاري ← مكتمل', () => {
  const empty = { mode: 'quick', quickCount: 0, quickRevenue: 0, status: 'مفتوح' };
  assert.equal(weekState(empty), 'لم يبدأ');
  assert.equal(weekState(quickWeek), 'جاري');
  assert.equal(weekState({ ...quickWeek, status: 'مغلق' }), 'مكتمل');
  assert.equal(weekState({ ...empty, status: 'مغلق' }), 'مكتمل'); // الإغلاق يغلب
});

test('يوم فيه مصروف بس يُعتبر بدأ', () => {
  const w = { mode: 'quick', quickCount: 0, quickRevenue: 0, status: 'مفتوح', expenseItems: [{ id: 'e', amount: 40 }] };
  assert.equal(weekState(w), 'جاري');
});

test('التسجيل بالأسماء هو الأصل في كل البرامج', () => {
  const d = migrate({ programs: [{ id: 'p', name: 'جمعة', type: 'منفصل', termKey: 'k',
    weeks: [{ id: 'w1', name: 'الأول', participants: [] }] }] });
  assert.equal(d.programs[0].weeks[0].mode, 'named');
});

test('اليوم السريع الفاضي يرجع للأسماء، واللي فيه أرقام يبقى كما هو', () => {
  const empty = migrate({ programs: [{ id: 'p', name: 'ج', type: 'منفصل', termKey: 'k',
    weeks: [{ id: 'w1', name: 'الأول', mode: 'quick', quickCount: 0, quickRevenue: 0 }] }] });
  assert.equal(empty.programs[0].weeks[0].mode, 'named');

  const used = migrate({ programs: [{ id: 'p', name: 'ج', type: 'منفصل', termKey: 'k',
    weeks: [{ id: 'w1', name: 'الأول', mode: 'quick', quickCount: 25, quickRevenue: 1500 }] }] });
  assert.equal(used.programs[0].weeks[0].mode, 'quick'); // ما نضيّع أرقامه
});

test('الترقية: اليوم اللي فيه أسماء مسجّلة يبقى بالأسماء', () => {
  const d = migrate({ programs: [{ id: 'p', name: 'جمعة', type: 'منفصل', termKey: 'k',
    weeks: [{ id: 'w1', name: 'الأول', participants: [{ id: 's1', name: 'سعد', amount: 50, accountId: 'a' }] }] }] });
  assert.equal(d.programs[0].weeks[0].mode, 'named');
  assert.equal(d.programs[0].weeks[0].participants.length, 1);
});

test('الترقية: البرنامج المجمّع دائمًا بالأسماء عشان التحضير', () => {
  const d = migrate({ programs: [{ id: 'p', name: 'الأربعة', type: 'مجمع', termKey: 'k', weeks: [{ id: 'd1', name: 'اليوم الأول' }] }] });
  assert.equal(d.programs[0].mode, 'named');
  assert.equal(d.programs[0].weeks[0].mode, 'named');
});

console.log(`\n${passed} اختبار نجح.`);
