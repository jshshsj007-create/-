/** اختبارات حساب السفرة مع رفقتها: كم لكل واحدٍ، ومصاريف الأيام. */
import assert from 'node:assert/strict';
import {
  tripPeople, tripBalances, tripOwedTotal, tripDays, tripCats, makeExpense, makeSettlement, NO_DAY,
  TRIP_CATS, TRIP_CREW, FOOD_SUBS, HOW, PRE_DAY, editExpense, tripSheetSections, tripReportText, tripCatRows, copyTrip, splitAcross, spanDays, makeSpread, STAY_DAYS, stayLabel, nextDay, currentDay, dayName,
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

test('من لم يُكتب في الشباب ودفع بندًا يظهر مع ذلك', () => {
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

test('سفرةٌ قديمة بلا شباب ولا تسويات لا تنكسر', () => {
  const old = { name: 'قديمة', expenseItems: [{ id: 'x', name: 'أكل', amount: 50 }], incomeItems: [] };
  assert.deepEqual(tripBalances(old), []);
  assert.equal(tripOwedTotal(old), 0);
  assert.equal(tripDays(old)[0].day, NO_DAY);
  assert.deepEqual(tripBalances({}), []);
});

test('الشباب المعتادون والتصنيفات كما حدّدها صاحب الفريق', () => {
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

test('التسوية تحمل كيف سُدِّدت: كاش أو تحويل أو غير ذلك', () => {
  assert.deepEqual(HOW, ['كاش', 'تحويل', 'غير ذلك']);
  assert.equal(makeSettlement({ id: '1', person: 'تركي', amount: 150, how: 'تحويل' }).how, 'تحويل');
  assert.equal(makeSettlement({ id: '2', person: 'تركي', amount: 150 }).how, undefined, 'بلا اختيار لا تُكتب');
});

test('مصروف قبل السفرة: أولًا، ولا يُعدّ يومًا ولا يزيح اليوم الأول', () => {
  const t = trip();
  t.expenseItems.push({ id: 'p', name: 'حجز السكن', amount: 200, day: PRE_DAY, cat: 'سكن', paidBy: 'تركي' });
  const days = tripDays(t);
  assert.equal(days[0].day, PRE_DAY, 'أول البطاقات');
  assert.equal(days[0].total, 200);
  assert.deepEqual(days.slice(1).map((d) => d.day), ['اليوم الأول', 'اليوم الثاني']);
  assert.equal(nextDay(t), 'اليوم الثالث', 'ولا يُحسب يومًا');
  assert.equal(currentDay({ expenseItems: [{ id: 'q', amount: 5, day: PRE_DAY }] }), 'اليوم الأول', 'ومن لم يبدأ يومه يبدأ بالأول');
  assert.equal(tripBalances(t).find((b) => b.name === 'تركي').paid, 300 + 200, 'ويدخل حساب من دفعه');
});

test('تعديل بند: يبقى معرّفه ومن أدخله، وتوضع عليه علامة «عُدّل»', () => {
  const old = makeExpense({ id: 'x1', name: 'سكن', amount: 600, day: 'اليوم الأول', cat: 'سكن', paidBy: 'العلوان', by: 'u4' });
  const now = editExpense(old, { amount: 650, paidBy: 'تركي' });
  assert.deepEqual([now.id, now.by, now.amount, now.paidBy, now.cat, now.day, now.edited], ['x1', 'u4', 650, 'تركي', 'سكن', 'اليوم الأول', true]);
  assert.equal(old.edited, undefined, 'الأصل لا يتغيّر');
  assert.equal(editExpense(old, { amount: -5 }).amount, 0, 'والسالب يُصفَّر كالإضافة');
  const part = { ...old, grp: 'g1', part: '٢ من ٣' };
  assert.deepEqual([editExpense(part, { amount: 300 }).grp, editExpense(part, { amount: 300 }).part], ['g1', '٢ من ٣'], 'جزء السكن يبقى جزءًا');
});

test('كم على كل نوع: السكن والأكل (مفصّلًا) وأخرى ببنودها، وآخرها الإجمالي', () => {
  const t = { expenseItems: [
    { id: '1', name: 'سكن', amount: 600, cat: 'سكن' },
    { id: '2', name: 'حجز', amount: 200, cat: 'سكن' },
    { id: '3', name: 'فطور', amount: 85, cat: 'أكل وشرب', sub: 'فطور' },
    { id: '4', name: 'غداء', amount: 140, cat: 'أكل وشرب', sub: 'غداء' },
    { id: '5', name: 'أكل وشرب', amount: 50, cat: 'أكل وشرب' },
    { id: '6', name: 'بنزين', amount: 150, cat: 'بنزين' },
    { id: '7', name: 'تذاكر الملاهي', amount: 90, cat: 'أخرى' },
  ] };
  assert.deepEqual(tripCatRows(t), [
    ['سكن', '800 ر.س'], ['بنزين', '150 ر.س'],
    ['أكل وشرب', '275 ر.س'], ['منها: فطور', '85 ر.س'], ['منها: غداء', '140 ر.س'], ['منها: غير مفصّل', '50 ر.س'],
    ['أخرى', '90 ر.س'], ['منها: تذاكر الملاهي', '90 ر.س'],
    ['الإجمالي', '1,315 ر.س', true],
  ]);
  assert.deepEqual(tripCatRows({ expenseItems: [] }), [], 'سفرة بلا مصروف: لا صفوف');
});

test('ورقة السفرة مرجعٌ بعد إقفالها: المالية والأنواع والأيام فقط، بلا حساب الشباب ولا تسوياتهم', () => {
  const t = trip();
  t.settlements.push({ id: 's2', person: 'تركي', amount: 40, how: 'تحويل', date: '1448/06/04' });
  const secs = tripSheetSections(t);
  assert.deepEqual(secs.map((s) => s.title), ['المالية', 'المصروفات حسب النوع', 'مصاريف الأيام']);
  assert.ok(!secs.some((s) => s.title === 'الحساب مع الشباب'), 'لا حساب شباب فيها');
  assert.deepEqual(secs[0].rows.map((r) => r[1]), ['0 ر.س', '800 ر.س', '-800 ر.س']);
  assert.ok(secs[1].rows.some((r) => r[0] === 'سكن' && r[1] === '120 ر.س'));
  assert.equal(secs[2].grid[0][0], 'اليوم الأول');
  assert.ok(!JSON.stringify(secs).includes('تحويل') && !JSON.stringify(secs).includes('تركي'), 'لا تسويات ولا أسماء شباب');
  const bare = tripSheetSections({ name: 'فاضية', expenseItems: [], incomeItems: [] });
  assert.deepEqual(bare.map((s) => s.title), ['المالية'], 'لا عناوين بلا شيء');
});

test('نص التقرير: الصافي ثم كم على كل نوع ثم الأيام، بلا الشباب', () => {
  const txt = tripReportText(trip());
  assert.match(txt, /تقرير سفرة الشرقية/);
  assert.match(txt, /المصروفات: 800 ر.س/);
  assert.match(txt, /- سكن: 120 ر.س/);
  assert.match(txt, /- أكل وشرب: 550 ر.س/);
  assert.match(txt, /- اليوم الأول: 460/);
  assert.ok(!txt.includes('الشباب:') && !txt.includes('أُعطي'), 'لا حساب شباب');
});

test('نسخ سفرة: الشباب والمسؤولون والمُدخِلون، بلا مصروف ولا إيراد ولا تسوية، وتُفتح', () => {
  const old = { ...trip(), id: 't1', closed: true, managers: ['u1'], entrants: ['u4'], incomeItems: [{ id: 'i', name: 'اشتراكات', amount: 3000 }] };
  old.expenseItems.push({ id: 'z', name: 'سكن', amount: 50, paidBy: 'فهد' });
  const nu = copyTrip(old, { id: 't2', name: 'أبها', date: '1449/01/10', termKey: '1449-الأول' });
  assert.deepEqual([nu.id, nu.name, nu.date, nu.termKey], ['t2', 'أبها', '1449/01/10', '1449-الأول']);
  assert.deepEqual(nu.people, tripPeople(old), 'الشباب كما كانوا ومن دفع فيها');
  assert.ok(nu.people.includes('فهد'));
  assert.deepEqual([nu.managers, nu.entrants], [['u1'], ['u4']]);
  assert.deepEqual([nu.incomeItems, nu.expenseItems, nu.settlements], [[], [], []]);
  assert.equal(nu.closed, undefined, 'وتُنسخ مفتوحة');
  assert.equal(old.expenseItems.length, 6, 'والأصل لا يتغيّر');
  assert.equal(copyTrip(old, { id: 't3' }).name, `${old.name} (نسخة)`, 'بلا اسمٍ تأخذ اسم الأصل');
  nu.managers.push('x'); assert.deepEqual(old.managers, ['u1'], 'ولا تتشارك القوائم');
});

test('السكن يغطي يومًا أو يومين أو ثلاثة', () => {
  assert.deepEqual(STAY_DAYS, [1, 2, 3]);
  assert.deepEqual(STAY_DAYS.map(stayLabel), ['يوم واحد', 'يومين', 'ثلاثة أيام']);
});

test('قسمة المبلغ على الأيام: صحيحٌ في كل يوم والكسر في أولها، والمجموع مطابق', () => {
  assert.deepEqual(splitAcross(900, 3), [300, 300, 300]);
  assert.deepEqual(splitAcross(1000, 3), [334, 333, 333]);
  // الهللات: تُقسَّم بالهللة ولا تُقرَّب، والمجموع يطابق ما دُفع
  assert.deepEqual(splitAcross(100.5, 2), [50.25, 50.25]);
  assert.deepEqual(splitAcross(100.01, 3), [33.35, 33.33, 33.33]);
  assert.equal(splitAcross(1234.57, 3).reduce((a, b) => Math.round((a + b) * 100) / 100, 0), 1234.57);
  assert.equal(splitAcross(1000, 3).reduce((a, b) => a + b, 0), 1000);
  assert.deepEqual(splitAcross(500, 1), [500]);
  assert.deepEqual(splitAcross(7, 2), [4, 3]);
  assert.deepEqual(splitAcross(-5, 2), [0, 0], 'والسالب يُصفَّر');
});

test('أيام السكن المتتابعة: من يومٍ معلوم، ومن «قبل السفرة» من الأول', () => {
  assert.deepEqual(spanDays('اليوم الأول', 3), ['اليوم الأول', 'اليوم الثاني', 'اليوم الثالث']);
  assert.deepEqual(spanDays('اليوم الثاني', 2), ['اليوم الثاني', 'اليوم الثالث']);
  assert.deepEqual(spanDays(PRE_DAY, 2), ['اليوم الأول', 'اليوم الثاني'], 'ما دُفع مقدّمًا يغطي أيامها من أولها');
  assert.deepEqual(spanDays('', 1), ['اليوم الأول']);
  assert.deepEqual(spanDays('يوم الوصول', 2), ['يوم الوصول', 'يوم الوصول'], 'يومٌ بلا ترتيبٍ يُعرف يبقى كما كتبه');
});

test('سكنٌ لثلاثة أيام: ثلاثة بنود بنصيبٍ لكل يوم وعلامة «جزء ١ من ٣»، والدافع واحد والمجموع ما دفع', () => {
  const parts = makeSpread({ ids: ['g1', 'g2', 'g3'], name: 'سكن', amount: 1000, startDay: 'اليوم الأول', n: 3, cat: 'سكن', paidBy: 'العلوان', by: 'u4' });
  assert.deepEqual(parts.map((p) => [p.id, p.amount, p.day, p.part]), [
    ['g1', 334, 'اليوم الأول', '١ من ٣'], ['g2', 333, 'اليوم الثاني', '٢ من ٣'], ['g3', 333, 'اليوم الثالث', '٣ من ٣']]);
  assert.ok(parts.every((p) => p.grp === 'g1' && p.paidBy === 'العلوان' && p.by === 'u4' && p.cat === 'سكن'));
  const t = { expenseItems: parts, settlements: [] };
  assert.equal(tripBalances(t)[0].paid, 1000, 'حساب الدافع لا يتغيّر');
  assert.equal(tripDays(t).map((d) => d.total).join(','), '334,333,333', 'وكل يومٍ يأخذ نصيبه');
  const one = makeSpread({ ids: ['x1'], name: 'سكن', amount: 400, startDay: 'اليوم الأول', n: 1, cat: 'سكن' });
  assert.equal(one.length, 1);
  assert.equal(one[0].grp, undefined, 'ويومٌ واحد لا علامة له');
});

test('الهللات في حساب الدافع: لا يطلع كسرٌ وهميّ يُقرأ «زيادة»', () => {
  const t = { people: ['تركي'], expenseItems: [{ id: 'a', amount: 0.1, paidBy: 'تركي' }, { id: 'b', amount: 0.2, paidBy: 'تركي' }], settlements: [{ id: 's', person: 'تركي', amount: 0.3 }] };
  const b = tripBalances(t).find((x) => x.name === 'تركي');
  assert.equal(b.paid, 0.3);
  assert.equal(b.owed, 0, 'دفع ٠٫٣ واستلم ٠٫٣: مسدَّد لا ٥٫٥e-17');
  assert.equal(tripBalances({ people: ['ع'], expenseItems: [{ id: 'a', amount: 12.5, paidBy: 'ع' }], settlements: [] })[0].owed, 12.5);
});

console.log(`\n✅ ${passed} اختبارًا لحساب السفرة`);
