/** اختبارات «كم معك»: رصيد الحساب، والمحفوظ، والتسليم. */
import assert from 'node:assert/strict';
import {
  cashOf, cashRows, cashTotals, cashPayers, inHand,
  validHandover, applyHandover, handoverRows, UNPAID,
} from '../src/cash.js';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('  ✓ ' + name); };

/**
 * الأسبوع الأول من عشرة، بأرقام صاحب التطبيق:
 *   أبو فارس 1000 (فهد — اشتراك مدة كاملة، دفعها كلها)
 *   الراجحي   500 (سعد — اشتراك مدة كاملة)
 *   كاش      1200 (تركي 500 مدة كاملة + 700 يومي من ثلاثة)
 * أول أسبوعٍ مؤكَّد، وتسعةٌ مدفوعة مقدّمًا.
 */
const sub = (name, ref, acc, amount, weekId, first) => ({
  id: `${ref}-${weekId}`, name, ref, accountId: acc, amount,
  packageName: 'اشتراك', source: 'link',
  ...(first ? { pending: false, confirmedAt: 10 } : { pending: true, prepaid: true }),
});

const base = () => {
  const weeks = Array.from({ length: 10 }, (_, i) => ({
    id: 'w' + (i + 1), name: `الجمعة ${i + 1}`,
    participants: [], collections: [], expenseItems: [], schoolPayouts: [], faidPayouts: [],
  }));
  for (let i = 0; i < 10; i++) {
    weeks[i].participants.push(sub('فهد', 'r1', 'abu', 100, weeks[i].id, i === 0));
    weeks[i].participants.push(sub('سعد', 'r2', 'rajhi', 50, weeks[i].id, i === 0));
    weeks[i].participants.push(sub('تركي', 'r3', 'cash', 50, weeks[i].id, i === 0));
  }
  // اليومي: ثلاثة في الجمعة الأولى، كلهم كاش ومؤكَّدون
  weeks[0].participants.push(
    { id: 'd1', name: 'خالد', accountId: 'cash', amount: 250 },
    { id: 'd2', name: 'ماجد', accountId: 'cash', amount: 250 },
    { id: 'd3', name: 'نايف', accountId: 'cash', amount: 200 },
  );
  return {
    faidAccounts: [{ id: 'abu', name: 'أبو فارس' }, { id: 'rajhi', name: 'الراجحي' },
      { id: 'cash', name: 'كاش' }, { id: 'qasim', name: 'القاسم' }],
    programs: [{ id: 'p1', name: 'جمعة الرواد', type: 'منفصل', weeks }],
    handovers: [],
  };
};

test('المؤكَّد والمدفوع مقدّمًا في اليد، والمعلّق لا', () => {
  assert.equal(inHand({ accountId: 'abu', amount: 10 }), true);
  assert.equal(inHand({ accountId: 'abu', pending: true, prepaid: true }), true);
  assert.equal(inHand({ accountId: 'abu', pending: true }), false);
  assert.equal(inHand({ accountId: UNPAID }), false);
  assert.equal(inHand({ amount: 10 }), false, 'بلا حساب ما يُنسب لأحد');
});

test('رصيد كل حساب كما وصل', () => {
  const d = base();
  assert.equal(cashOf(d, 'abu').balance, 1000);
  assert.equal(cashOf(d, 'rajhi').balance, 500);
  assert.equal(cashOf(d, 'cash').balance, 1200);
  assert.equal(cashOf(d, 'qasim').balance, 0);
  assert.equal(cashTotals(cashRows(d)).balance, 2700);
});

test('والمحفوظ هو نصيب الأيام التي ما صارت', () => {
  const d = base();
  assert.equal(cashOf(d, 'abu').held, 900, 'تسع جمع × 100');
  assert.equal(cashOf(d, 'rajhi').held, 450);
  assert.equal(cashOf(d, 'cash').held, 450, 'اليومي ما هو محفوظًا');
  assert.equal(cashTotals(cashRows(d)).held, 1800);
});

test('و2,700 = 900 إيراد الأسبوع + 1,800 محفوظ', () => {
  const t = cashTotals(cashRows(base()));
  assert.equal(t.balance - t.held, 900);
});

test('المصروف ونصيب المدارس وفيض تخرج من رصيد حسابها', () => {
  const d = base();
  d.programs[0].weeks[0].expenseItems.push({ id: 'e1', accountId: 'cash', amount: 300 });
  d.programs[0].weeks[0].schoolPayouts.push({ id: 's1', accountId: 'cash', amount: 300 });
  d.programs[0].weeks[0].faidPayouts.push({ id: 'f1', accountId: 'rajhi', amount: 300 });
  assert.equal(cashOf(d, 'cash').balance, 600);
  assert.equal(cashOf(d, 'rajhi').balance, 200);
  assert.equal(cashTotals(cashRows(d)).balance, 1800, 'وما بقي هو المحفوظ');
});

test('والتحصيل الإضافي يدخل', () => {
  const d = base();
  d.programs[0].weeks[0].collections.push({ id: 'c1', accountId: 'qasim', amount: 400 });
  assert.equal(cashOf(d, 'qasim').balance, 400);
});

test('التسليم ينقل ولا يزيد ولا ينقص', () => {
  const d = applyHandover(base(), { id: 'h1', fromId: 'abu', toId: 'rajhi', amount: 1000, at: 5 });
  assert.equal(cashOf(d, 'abu').balance, 0);
  assert.equal(cashOf(d, 'rajhi').balance, 1500);
  assert.equal(cashTotals(cashRows(d)).balance, 2700, 'المجموع ما تغيّر');
  assert.equal(cashTotals(cashRows(d)).held, 1800, 'ولا المحفوظ');
});

test('وما يُقبل تسليمٌ أكبر من الرصيد ولا لنفس الحساب', () => {
  const d = base();
  assert.equal(validHandover(d, { fromId: 'abu', toId: 'rajhi', amount: 1000 }), '');
  assert.ok(validHandover(d, { fromId: 'abu', toId: 'rajhi', amount: 1001 }));
  assert.ok(validHandover(d, { fromId: 'abu', toId: 'abu', amount: 10 }));
  assert.ok(validHandover(d, { fromId: 'abu', toId: 'مخترع', amount: 10 }));
  assert.ok(validHandover(d, { fromId: 'abu', toId: 'rajhi', amount: 0 }));
});

test('والتسليمات تُعرض بأسماء حساباتها، الأحدث أولًا', () => {
  let d = applyHandover(base(), { id: 'h1', fromId: 'abu', toId: 'rajhi', amount: 400, at: 5 });
  d = applyHandover(d, { id: 'h2', fromId: 'cash', toId: 'rajhi', amount: 200, at: 9 });
  assert.deepEqual(handoverRows(d).map((h) => [h.id, h.fromName, h.toName]),
    [['h2', 'كاش', 'الراجحي'], ['h1', 'أبو فارس', 'الراجحي']]);
});

test('«من دفع فيه» يعدّ الصفوف ويعلّم المقدّم', () => {
  const rows = cashPayers(base(), 'cash');
  assert.equal(rows.reduce((s, r) => s + r.amount, 0), 1200);
  assert.equal(rows.filter((r) => r.prepaid).length, 9, 'تسع جمع مدفوعة مقدّمًا');
  assert.ok(rows.every((r) => r.program === 'جمعة الرواد'));
});

test('والمجمّع دفتره على البرنامج لا على أيامه', () => {
  const d = {
    faidAccounts: [{ id: 'abu', name: 'أبو فارس' }],
    programs: [{
      id: 'g1', name: 'مخيم', type: 'مجمع',
      participants: [{ id: 'x1', name: 'فهد', accountId: 'abu', amount: 800 }],
      expenseItems: [{ id: 'e1', accountId: 'abu', amount: 200 }],
      weeks: [{ id: 'w1', participants: [{ id: 'ghost', accountId: 'abu', amount: 999 }] }],
    }],
  };
  assert.equal(cashOf(d, 'abu').balance, 600, 'أيام المجمّع ما لها دفاتر فما تُحسب');
});

console.log(`\n✅ ${passed} اختبارًا لـ«كم معك» والتسليم\n`);

/* --------------- بقيّة الاشتراك: مالٌ في اليد بلا دفتر --------------- */

const withSub = (over = {}) => ({
  faidAccounts: [{ id: 'abu', name: 'أبو فارس' }],
  programs: [{
    id: 'p1', type: 'منفصل', weeks: [
      { id: 'w1', status: 'مفتوح', participants: [{
        id: 'a', name: 'ماجد', amount: 30, accountId: 'abu',
        sub: { id: 's1', packId: 'sub', total: 300, span: 10, i: 0 }, ...over,
      }] },
    ],
  }],
});

test('الاشتراك كله في يده، وما لم ينزل دفترًا محفوظ', () => {
  const r = cashOf(withSub(), 'abu');
  assert.equal(r.balance, 300, 'دفع ثلاثمئة، فثلاثمئة في يده');
  assert.equal(r.held, 270, 'وتسعة أيام ما صارت');
});

test('وما لم يتأكّد وصوله ما يُعدّ', () => {
  assert.equal(cashOf(withSub({ pending: true }), 'abu').balance, 0);
  assert.equal(cashOf(withSub({ pending: true, prepaid: true }), 'abu').balance, 300, 'المقدّم في اليد');
});

test('ومتى نزلت أيامه كلها ما بقي فاضل', () => {
  const d = withSub();
  d.programs[0].weeks[0].participants[0].amount = 300;
  d.programs[0].weeks[0].participants[0].sub.span = 1;
  const r = cashOf(d, 'abu');
  assert.equal(r.balance, 300);
  assert.equal(r.held, 0);
});
