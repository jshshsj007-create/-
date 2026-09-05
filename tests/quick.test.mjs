/** اختبارات التسجيل السريع (عدد ومبلغ) وحالة اليوم. */
import assert from 'node:assert/strict';
import { L, isQuick, headcount, weekState, started, booked, migrate, sumAmt } from './build/app.mjs';

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
  // بدأ ووُزّع صافيه كله على المدارس وفيض
  assert.equal(weekState(quickWeek), 'مكتمل');
  // وما دام في صافيه ما لم يُوزَّع فهو جارٍ
  assert.equal(weekState({ ...quickWeek, faidPayouts: [{ id: 'f', amount: 100 }] }), 'جاري');
  assert.equal(weekState({ ...quickWeek, schoolPayouts: [], faidPayouts: [] }), 'جاري');
});

test('و«مقفل» غير «مكتمل»: هذا وُزّع إيراده، وذاك أقفلتَه بيدك', () => {
  const empty = { mode: 'quick', quickCount: 0, quickRevenue: 0, status: 'مفتوح' };
  assert.equal(weekState({ ...quickWeek, status: 'مغلق' }), 'مقفل');
  assert.equal(weekState({ ...empty, status: 'مغلق' }), 'مقفل', 'القفل يغلب على كل شيء');
});

test('واليوم الفارغ ما يصير مكتملًا لأن باقيه صفر', () => {
  // صافيه صفر وما وُزّع فيه ريال — فهو جارٍ لا مكتمل
  const w = { mode: 'quick', quickCount: 3, quickRevenue: 0, status: 'مفتوح',
    schoolPayouts: [], faidPayouts: [] };
  assert.equal(L.remaining(w), 0);
  assert.equal(weekState(w), 'جاري');
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

test('التسجيل بالاسم في يوم سريع يحوّله للأسماء وينقل مبلغه لتحصيل إضافي', () => {
  const day = { mode: 'quick', quickCount: 20, quickRevenue: 1000, collections: [], participants: [] };
  const converted = (l) => {
    const rev = Number(l.quickRevenue || 0);
    return { mode: 'named', quickCount: 0, quickRevenue: 0,
      ...(rev > 0 ? { collections: [...(l.collections || []), { id: 'c', amount: rev, note: 'تحصيل من التسجيل السريع' }] } : {}) };
  };
  const after = { ...day, participants: [{ id: 'p', name: 'عبدالله', amount: 50, accountId: 'a1' }], ...converted(day) };
  assert.equal(after.mode, 'named');
  assert.equal(after.quickRevenue, 0);
  assert.equal(sumAmt(after.collections), 1000);       // المبلغ ما ضاع
  assert.equal(L.revenue(after), 1050);                // 1000 محوّل + 50 من الطالب الجديد
});

test('يوم سريع فاضي يتحوّل بلا بند تحصيل زائد', () => {
  const day = { mode: 'quick', quickCount: 0, quickRevenue: 0, collections: [] };
  const rev = Number(day.quickRevenue || 0);
  const patch = { mode: 'named', quickCount: 0, quickRevenue: 0, ...(rev > 0 ? { collections: [{ id: 'c', amount: rev }] } : {}) };
  assert.equal(patch.collections, undefined);
});

/* --------------------- المحجوز بالموسم لا يبدأ يومه --------------------- */

/** مشترك بالموسم: صفٌّ في كل يوم من يوم تسجيله، بلا أن يصير اليوم. */
const seat = (i, extra) => ({ id: 'x' + i, name: 'فهد', amount: 50, accountId: 'rajhi',
  attendance: 'معلق', pending: true, prepaid: true,
  sub: { id: 's1', packId: 'pk', total: 150, span: 3, i }, ...extra });
const day = (parts) => ({ mode: 'named', status: 'مفتوح', participants: parts,
  collections: [], expenseItems: [], schoolPayouts: [], faidPayouts: [] });

test('اليوم الذي فيه محجوزٌ بالموسم وحده ما بدأ', () => {
  assert.equal(booked(seat(1)), true);
  assert.equal(started(day([seat(1)])), false);
  assert.equal(weekState(day([seat(1)])), 'لم يبدأ');
});

test('فإذا سُجّل حضوره صار اليوم جاريًا', () => {
  const came = { attendance: 'حاضر', pending: false, prepaid: false };
  assert.equal(booked(seat(1, came)), false);
  assert.equal(weekState(day([seat(1, came)])), 'جاري');
  // والغياب تسجيلٌ كذلك: اليوم صار، وقد نُودي عليه فلم يحضر
  assert.equal(weekState(day([seat(1, { ...came, attendance: 'غائب' })])), 'جاري');
});

test('واليوم الذي أكّدتَ فيه وصولَ مبلغه بدأ ولو ما نُودي', () => {
  // التأكيد أثرٌ منك على هذا اليوم بعينه
  assert.equal(booked(seat(0, { pending: false, prepaid: false, confirmedAt: 1 })), false);
  assert.equal(weekState(day([seat(0, { pending: false, prepaid: false, confirmedAt: 1 })])), 'جاري');
});

test('ومن سجّلته بيدك يبدأ يومَه كما كان', () => {
  // بلا ختم اشتراك: ليس محجوزًا، فوجودُه بداية
  const byHand = { id: 'h1', name: 'سعد', amount: 50, accountId: 'rajhi', attendance: 'معلق' };
  assert.equal(booked(byHand), false);
  assert.equal(weekState(day([byHand])), 'جاري');
});

test('ومصروفٌ أو تحصيلٌ في يومٍ محجوزٍ يبدؤه', () => {
  const d = { ...day([seat(1)]), expenseItems: [{ id: 'e', amount: 40 }] };
  assert.equal(weekState(d), 'جاري');
  const c = { ...day([seat(1)]), collections: [{ id: 'c', amount: 20 }] };
  assert.equal(weekState(c), 'جاري');
});

test('والقفل يغلب على الحجز', () => {
  assert.equal(weekState({ ...day([seat(1)]), status: 'مغلق' }), 'مقفل');
});

console.log(`\n${passed} اختبار نجح.`);
