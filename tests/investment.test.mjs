/**
 * الاستثمار: الفلوس تطلع من الحساب فينقص رصيده، وتُحجز على حدة —
 * ورصيد الفريق ما يجمعها، ولا تظهر مصروفًا في التقارير.
 */
import assert from 'node:assert/strict';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('  ✓ ' + name); };

/** نفس حساب التطبيق، منقولًا هنا عشان نختبره بمعزل عن الواجهة. */
const isInvestmentMove = (a) => a.kind === 'investment';
const stats = (accounts, txns) => accounts.map((acc) => {
  let rev = 0, exp = 0, moved = 0;
  txns.filter((a) => a.accountId === acc.id).forEach((a) => {
    const amt = Number(a.amount || 0);
    if (isInvestmentMove(a)) { moved += a.type === 'إيراد' ? -amt : amt; return; }
    if (a.type === 'إيراد') rev += amt; else exp += amt;
  });
  return { ...acc, revenue: rev, expenses: exp, invested: moved, balance: rev - exp - moved };
});
const totals = (st) => ({
  revenue: st.reduce((s, a) => s + a.revenue, 0),
  expenses: st.reduce((s, a) => s + a.expenses, 0),
  balance: st.reduce((s, a) => s + a.balance, 0),
  investment: st.reduce((s, a) => s + a.invested, 0),
});

const accounts = [{ id: 'rajhi', name: 'الراجحي' }, { id: 'cash', name: 'كاش' }];

test('السيناريو: رصيد الراجحي ١٠٠ يتحول كله للاستثمار فيصير صفرًا', () => {
  const txns = [
    { id: 't1', accountId: 'rajhi', type: 'إيراد', amount: 100 },
    { id: 't2', accountId: 'rajhi', type: 'مصروف', amount: 100, kind: 'investment' },
  ];
  const st = stats(accounts, txns);
  const rajhi = st.find((a) => a.id === 'rajhi');
  assert.equal(rajhi.balance, 0, 'الراجحي صفر');
  assert.equal(rajhi.invested, 100, 'والمئة محجوزة في الاستثمار');
});

test('رصيد الفريق ما يجمع الاستثمار', () => {
  const txns = [
    { id: 't1', accountId: 'rajhi', type: 'إيراد', amount: 100 },
    { id: 't2', accountId: 'cash', type: 'إيراد', amount: 50 },
    { id: 't3', accountId: 'rajhi', type: 'مصروف', amount: 100, kind: 'investment' },
  ];
  const t = totals(stats(accounts, txns));
  assert.equal(t.balance, 50, 'الرصيد المتاح ٥٠ فقط');
  assert.equal(t.investment, 100);
  assert.notEqual(t.balance, 150, 'ما ينفع يجمعهم');
});

test('التحويل ما يظهر مصروفًا في التقارير', () => {
  const txns = [
    { id: 't1', accountId: 'rajhi', type: 'إيراد', amount: 100 },
    { id: 't2', accountId: 'rajhi', type: 'مصروف', amount: 30, note: 'ميداليات' },
    { id: 't3', accountId: 'rajhi', type: 'مصروف', amount: 70, kind: 'investment' },
  ];
  const t = totals(stats(accounts, txns));
  assert.equal(t.expenses, 30, 'الميداليات فقط — الادخار مو صرفًا');
  assert.equal(t.revenue, 100);
  assert.equal(t.balance, 0, '100 − 30 − 70');
  assert.equal(t.investment, 70);
});

test('السحب من الاستثمار يرجّع الفلوس للحساب', () => {
  const txns = [
    { id: 't1', accountId: 'rajhi', type: 'إيراد', amount: 100 },
    { id: 't2', accountId: 'rajhi', type: 'مصروف', amount: 100, kind: 'investment' },
    { id: 't3', accountId: 'cash', type: 'إيراد', amount: 40, kind: 'investment' },
  ];
  const t = totals(stats(accounts, txns));
  assert.equal(t.investment, 60, '100 − 40');
  assert.equal(t.balance, 40, 'رجعت للكاش');
  assert.equal(t.expenses, 0, 'الحركتان ما هما صرفًا');
  assert.equal(t.revenue, 100, 'والدخل يبقى الإيراد الأصلي وحده');
});

test('السحب لحساب غير اللي حوّل منه يشتغل', () => {
  const txns = [
    { id: 't1', accountId: 'rajhi', type: 'إيراد', amount: 200 },
    { id: 't2', accountId: 'rajhi', type: 'مصروف', amount: 200, kind: 'investment' },
    { id: 't3', accountId: 'cash', type: 'إيراد', amount: 200, kind: 'investment' },
  ];
  const st = stats(accounts, txns);
  assert.equal(st.find((a) => a.id === 'rajhi').balance, 0);
  assert.equal(st.find((a) => a.id === 'cash').balance, 200);
  assert.equal(totals(st).investment, 0, 'رجع كله');
});

test('عدة تحويلات من حسابات مختلفة تتجمّع', () => {
  const txns = [
    { id: 'a', accountId: 'rajhi', type: 'إيراد', amount: 300 },
    { id: 'b', accountId: 'cash', type: 'إيراد', amount: 200 },
    { id: 'c', accountId: 'rajhi', type: 'مصروف', amount: 100, kind: 'investment' },
    { id: 'd', accountId: 'cash', type: 'مصروف', amount: 150, kind: 'investment' },
  ];
  const st = stats(accounts, txns);
  assert.equal(totals(st).investment, 250);
  assert.equal(totals(st).balance, 250, '500 − 250');
  assert.deepEqual(st.map((a) => [a.name, a.invested]), [['الراجحي', 100], ['كاش', 150]]);
});

test('بلا استثمار: الحساب يبقى كما كان', () => {
  const txns = [
    { id: 't1', accountId: 'rajhi', type: 'إيراد', amount: 100 },
    { id: 't2', accountId: 'rajhi', type: 'مصروف', amount: 40 },
  ];
  const t = totals(stats(accounts, txns));
  assert.equal(t.balance, 60);
  assert.equal(t.investment, 0);
  assert.equal(t.balance, t.revenue - t.expenses, 'المعادلة القديمة ما تتأثر');
});

console.log(`\n${passed} اختبار نجح.`);
