/** اختبارات حساب السفرة مع رفقتها: كم لكل واحدٍ، ومصاريف الأيام. */
import assert from 'node:assert/strict';
import {
  tripPeople, tripBalances, tripOwedTotal, tripDays, tripCats, makeExpense, makeSettlement, tripShareText, NO_DAY,
} from '../src/trip.js';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('  ✓ ' + name); };

const trip = () => ({
  name: 'سفرة الشرقية',
  people: ['سعد', 'خالد', 'محمد'],
  expenseItems: [
    { id: 'a', name: 'فطور', amount: 120, day: 'اليوم الأول', cat: 'فطور', paidBy: 'سعد' },
    { id: 'b', name: 'غداء', amount: 300, day: 'اليوم الأول', cat: 'غداء', paidBy: 'خالد' },
    { id: 'c', name: 'ماء', amount: 40, day: 'اليوم الأول', cat: 'ماء', paidBy: 'سعد' },
    { id: 'd', name: 'عشاء', amount: 250, day: 'اليوم الثاني', cat: 'عشاء', paidBy: 'محمد' },
    { id: 'e', name: 'ترفيه', amount: 90, day: 'اليوم الثاني', cat: 'ترفيه' },
  ],
  settlements: [{ id: 's1', person: 'سعد', amount: 100, date: '1448/06/04' }],
});

test('كم دفع كل واحدٍ وكم أُعطي وكم بقي له', () => {
  const b = Object.fromEntries(tripBalances(trip()).map((x) => [x.name, x]));
  assert.deepEqual(b['سعد'], { name: 'سعد', paid: 160, settled: 100, owed: 60 });
  assert.equal(b['خالد'].owed, 300);
  assert.equal(b['محمد'].owed, 250);
});

test('ما دفعه الفريق نفسه (بلا دافع) لا يُحسب لأحد', () => {
  assert.equal(tripOwedTotal(trip()), 60 + 300 + 250);
});

test('من لم يُكتب في الرفقة ودفع بندًا يظهر مع ذلك', () => {
  const t = trip();
  t.expenseItems.push({ id: 'f', name: 'بنزين', amount: 80, paidBy: 'فهد' });
  assert.ok(tripPeople(t).includes('فهد'));
  assert.equal(tripBalances(t).find((x) => x.name === 'فهد').owed, 80);
});

test('أُعطي أكثر مما دفع: يظهر سالبًا ولا يُخفى', () => {
  const t = trip();
  t.settlements.push({ id: 's2', person: 'خالد', amount: 400 });
  assert.equal(tripBalances(t).find((x) => x.name === 'خالد').owed, -100);
  assert.equal(tripOwedTotal(t), 60 + 250, 'السالب لا ينقص ما على غيره');
});

test('مصاريف الأيام: مجموع اليوم وتصنيفاته، وبلا يوم آخرًا', () => {
  const t = trip();
  t.expenseItems.push({ id: 'g', name: 'متفرقات', amount: 10 });
  const days = tripDays(t);
  assert.deepEqual(days.map((d) => d.day), ['اليوم الأول', 'اليوم الثاني', NO_DAY]);
  assert.equal(days[0].total, 460);
  assert.deepEqual(days[0].cats, { فطور: 120, غداء: 300, ماء: 40 });
  assert.equal(days[2].cats['أخرى'], 10, 'بلا تصنيف = أخرى');
});

test('مجموع كل تصنيف في السفرة بترتيب التصنيفات', () => {
  assert.deepEqual(tripCats(trip()).map((c) => [c.cat, c.total]),
    [['فطور', 120], ['غداء', 300], ['عشاء', 250], ['ماء', 40], ['ترفيه', 90]]);
});

test('المبلغ السالب يُصفَّر، والخانات الفاضية لا تُكتب', () => {
  const x = makeExpense({ id: '1', name: ' فطور ', amount: -5, day: '', cat: '', paidBy: '' });
  assert.deepEqual(x, { id: '1', name: 'فطور', amount: 0 });
  const s = makeSettlement({ id: '2', person: 'سعد', amount: '75', date: '', note: '' });
  assert.deepEqual(s, { id: '2', person: 'سعد', amount: 75 });
});

test('سفرةٌ قديمة بلا رفقة ولا تسويات لا تنكسر', () => {
  const old = { name: 'قديمة', expenseItems: [{ id: 'x', name: 'أكل', amount: 50 }], incomeItems: [] };
  assert.deepEqual(tripBalances(old), []);
  assert.equal(tripOwedTotal(old), 0);
  assert.equal(tripDays(old)[0].day, NO_DAY);
  assert.deepEqual(tripBalances({}), []);
});

test('نص المشاركة يُقرأ بلا شرح', () => {
  const txt = tripShareText(trip(), (n) => String(n));
  assert.match(txt, /سعد: دفع 160، أُعطي 100، باقي له 60/);
  assert.match(txt, /خالد: دفع 300، أُعطي 0، باقي له 300/);
});

console.log(`\n✅ ${passed} اختبارًا لحساب السفرة`);
