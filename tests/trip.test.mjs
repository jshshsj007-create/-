/** اختبارات حساب السفرة مع رفقتها: كم لكل واحدٍ، ومصاريف الأيام. */
import assert from 'node:assert/strict';
import {
  tripPeople, tripBalances, tripOwedTotal, tripDays, tripCats, makeExpense, makeSettlement, tripShareText, NO_DAY,
  TRIP_CATS, TRIP_CREW, FOOD_SUBS, nextDay, currentDay, dayName,
} from '../src/trip.js';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('  ✓ ' + name); };

const trip = () => ({
  name: 'سفرة الشرقية',
  people: ['العلوان', 'تركي', 'أبو فارس'],
  expenseItems: [
    { id: 'a', name: 'سكن', amount: 120, day: 'اليوم الأول', cat: 'سكن', paidBy: 'العلوان' },
    { id: 'b', name: 'أكل وشرب', amount: 300, day: 'اليوم الأول', cat: 'أكل وشرب', paidBy: 'تركي' },
    { id: 'c', name: 'بنزين', amount: 40, day: 'اليوم الأول', cat: 'بنزين', paidBy: 'العلوان' },
    { id: 'd', name: 'أكل وشرب', amount: 250, day: 'اليوم الثاني', cat: 'أكل وشرب', paidBy: 'أبو فارس' },
    { id: 'e', name: 'تذاكر ملاهي', amount: 90, day: 'اليوم الثاني', cat: 'أخرى' },
  ],
  settlements: [{ id: 's1', person: 'العلوان', amount: 100, date: '1448/06/04' }],
});

test('كم دفع كل واحدٍ وكم أُعطي وكم بقي له', () => {
  const b = Object.fromEntries(tripBalances(trip()).map((x) => [x.name, x]));
  assert.deepEqual(b['العلوان'], { name: 'العلوان', paid: 160, settled: 100, owed: 60 });
  assert.equal(b['تركي'].owed, 300);
  assert.equal(b['أبو فارس'].owed, 250);
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
  t.settlements.push({ id: 's2', person: 'تركي', amount: 400 });
  assert.equal(tripBalances(t).find((x) => x.name === 'تركي').owed, -100);
  assert.equal(tripOwedTotal(t), 60 + 250, 'السالب لا ينقص ما على غيره');
});

test('مصاريف الأيام: مجموع اليوم وتصنيفاته، وبلا يوم آخرًا', () => {
  const t = trip();
  t.expenseItems.push({ id: 'g', name: 'متفرقات', amount: 10 });
  const days = tripDays(t);
  assert.deepEqual(days.map((d) => d.day), ['اليوم الأول', 'اليوم الثاني', NO_DAY]);
  assert.equal(days[0].total, 460);
  assert.deepEqual(days[0].cats, { 'سكن': 120, 'أكل وشرب': 300, 'بنزين': 40 });
  assert.equal(days[2].cats['أخرى'], 10, 'بلا تصنيف = أخرى');
});

test('مجموع كل تصنيف في السفرة بترتيب التصنيفات', () => {
  assert.deepEqual(tripCats(trip()).map((c) => [c.cat, c.total]),
    [['سكن', 120], ['بنزين', 40], ['أكل وشرب', 550], ['أخرى', 90]]);
});

test('تصنيفٌ قديم بغير القائمة يبقى ظاهرًا بعدها ولا يضيع', () => {
  const t = { expenseItems: [{ id: '1', name: 'ماء', amount: 30, cat: 'ماء' }, { id: '2', name: 'سكن', amount: 100, cat: 'سكن' }] };
  assert.deepEqual(tripCats(t).map((c) => c.cat), ['سكن', 'ماء']);
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
  assert.match(txt, /العلوان: دفع 160، أُعطي 100، باقي له 60/);
  assert.match(txt, /تركي: دفع 300، أُعطي 0، باقي له 300/);
});

test('الرفقة المعتادة والتصنيفات كما حدّدها صاحب الفريق', () => {
  assert.deepEqual(TRIP_CREW, ['العلوان', 'تركي', 'أبو فارس']);
  assert.deepEqual(TRIP_CATS, ['سكن', 'بنزين', 'أكل وشرب', 'أخرى']);
});

test('اليوم يقع تلقائيًا: آخر يومٍ كُتب، وإلا اليوم الأول، واليوم التالي بعدده', () => {
  assert.equal(currentDay({}), 'اليوم الأول');
  assert.equal(nextDay({}), 'اليوم الأول');
  assert.equal(currentDay(trip()), 'اليوم الثاني');
  assert.equal(nextDay(trip()), 'اليوم الثالث');
});

test('أسماء الأيام بالترتيب، وبعد العاشر برقمٍ يثبّته علامة الاتجاه', () => {
  assert.equal(dayName(1), 'اليوم الأول');
  assert.equal(dayName(10), 'اليوم العاشر');
  assert.equal(dayName(11), 'اليوم 11\u200F');
});

test('الأكل يتفصّل: فطور وغداء وعشاء تحت مجموع الأكل لا بدلًا منه', () => {
  assert.deepEqual(FOOD_SUBS, ['فطور', 'غداء', 'عشاء', 'مفرحات', 'ماء']);
  const x = makeExpense({ id: '1', name: 'فطور', amount: 80, cat: 'أكل وشرب', sub: 'فطور', day: 'اليوم الأول' });
  assert.equal(x.sub, 'فطور');
  const t = { expenseItems: [x, makeExpense({ id: '2', name: 'غداء', amount: 150, cat: 'أكل وشرب', sub: 'غداء', day: 'اليوم الأول' }),
    makeExpense({ id: '3', name: 'سكن', amount: 500, cat: 'سكن', day: 'اليوم الأول' })] };
  const d = tripDays(t)[0];
  assert.equal(d.cats['أكل وشرب'], 230, 'المجموع يبقى كاملًا');
  assert.deepEqual(d.subs['أكل وشرب'], { فطور: 80, غداء: 150 });
  assert.equal(d.subs['سكن'], undefined);
});

console.log(`\n✅ ${passed} اختبارًا لحساب السفرة`);
