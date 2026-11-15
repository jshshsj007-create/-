/** اختبارات «مسؤول السفرة»: من يرى سفرةً كاملة، ومن يكتب، وما لا يُقبل من غيرهما. */
import assert from 'node:assert/strict';
import { manages, enters, managedIds, enteredIds, entrantView, tripsSeen, tripsKept } from '../src/tripaccess.js';
import { blindMoney, restoreMoney } from '../src/money.js';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('  ✓ ' + name); };

const admin = { id: 'a', role: 'مدير', permissions: [] };
const saad = { id: 'u1', role: 'مشرف برنامج', permissions: [] };                 // مسؤول عن سفرة واحدة، بلا صلاحية السفرات
const khalid = { id: 'u2', role: 'مسؤول فيض', permissions: ['السفرات'] };        // يفتح السفرات، بلا مال
const nobody = { id: 'u3', role: 'مسجل حضور', permissions: [] };

const trips = () => [
  { id: 't1', name: 'الشرقية', managers: ['u1'], expenseItems: [{ id: 'e1', name: 'سكن', amount: 600 }], incomeItems: [], settlements: [{ id: 's1', person: 'العلوان', amount: 100 }], people: ['العلوان'] },
  { id: 't2', name: 'الجنوب', managers: [], expenseItems: [{ id: 'e2', name: 'بنزين', amount: 150 }], incomeItems: [], settlements: [] },
];
const blind = (ts) => blindMoney({ trips: ts }).trips;

test('المسؤول يأخذ سفرته كاملةً وحدها، ولا يصله غيرها', () => {
  const seen = tripsSeen(trips(), blind(trips()), saad, false);
  assert.deepEqual(seen.map((t) => t.id), ['t1']);
  assert.equal(seen[0].expenseItems.length, 1, 'المصروفات كاملة');
  assert.equal(seen[0].settlements[0].amount, 100, 'والتسويات كذلك');
  assert.deepEqual(seen[0].people, ['العلوان']);
});

test('من عنده «السفرات» بلا مال: سفراته محجوبة المبالغ، إلا ما يديره فكاملة', () => {
  const t = trips(); t[1].managers = ['u2'];
  const seen = tripsSeen(t, blind(t), khalid, true);
  assert.equal(seen.find((x) => x.id === 't1').expenseItems.length, 0, 'غير المدارة محجوبة');
  assert.equal(seen.find((x) => x.id === 't2').expenseItems.length, 1, 'المدارة كاملة');
});

test('من لا صلاحية له ولا إدارة: لا سفرة تصله', () => {
  assert.deepEqual(tripsSeen(trips(), blind(trips()), nobody, false), []);
});

test('المدير يرى كل شيء كما هو', () => {
  const t = trips();
  assert.equal(tripsSeen(t, t, admin, true), t);
});

test('المسؤول يكتب في سفرته: مصروفٌ جديد يُقبل ويبقى مسؤولوها كما هم', () => {
  const cur = trips();
  const inc = [{ ...cur[0], expenseItems: [...cur[0].expenseItems, { id: 'e3', name: 'بنزين', amount: 80 }], managers: ['u1', 'u3'] }];
  const kept = tripsKept(inc, cur, saad, false);
  assert.equal(kept.find((t) => t.id === 't1').expenseItems.length, 2, 'المصروف قُبل');
  assert.deepEqual(kept.find((t) => t.id === 't1').managers, ['u1'], 'لا يضيف مسؤولًا ولا يعيّن غيره');
});

test('المسؤول لا يمسّ سفرةً غير سفرته ولو أرسلها', () => {
  const cur = trips();
  const inc = [cur[0], { ...cur[1], name: 'اخترقت', expenseItems: [] }];
  const kept = tripsKept(inc, cur, saad, false);
  assert.deepEqual(kept.find((t) => t.id === 't2'), cur[1], 'تبقى كما كانت');
});

test('وما غاب من حفظته يُعاد: لا يحذف سفرةً ولا سفرة غيره', () => {
  const cur = trips();
  const kept = tripsKept([], cur, saad, false);
  assert.deepEqual(kept.map((t) => t.id).sort(), ['t1', 't2']);
});

test('ولا يُنشئ سفرةً جديدة، ولا يعيّن نفسه فيها', () => {
  const cur = trips();
  const kept = tripsKept([...cur, { id: 't9', name: 'جديدة', managers: ['u1'] }], cur, saad, false);
  assert.ok(!kept.some((t) => t.id === 't9'));
});

test('من عنده «السفرات» يكتب في السفرات لكن لا يعيّن مسؤولًا', () => {
  const cur = trips();
  const kept = tripsKept([{ ...cur[1], managers: ['u2'] }, cur[0]], cur, khalid, true);
  assert.deepEqual(kept.find((t) => t.id === 't2').managers, [], 'تعيين المسؤولين للمدير وحده');
  const made = tripsKept([...cur, { id: 't9', name: 'جديدة', managers: ['u2'] }], cur, khalid, true);
  assert.deepEqual(made.find((t) => t.id === 't9').managers, [], 'ولا تُولد بمسؤولين');
});

test('المدير يعيّن المسؤولين', () => {
  const cur = trips();
  const inc = [{ ...cur[0], managers: ['u1', 'u2'] }, cur[1]];
  assert.deepEqual(tripsKept(inc, cur, admin, true)[0].managers, ['u1', 'u2']);
});

test('إعادة المال المحجوب لا تمحو ما كتبه المسؤول في سفرته', () => {
  const cur = trips();
  const mine = [{ ...cur[0], expenseItems: [...cur[0].expenseItems, { id: 'e3', name: 'ماء', amount: 40 }] }, { ...cur[1], expenseItems: [] }];
  const back = restoreMoney({ trips: mine }, { trips: cur }, undefined, managedIds(cur, saad)).trips;
  assert.equal(back.find((t) => t.id === 't1').expenseItems.length, 2, 'ما كتبه يبقى');
  assert.equal(back.find((t) => t.id === 't2').expenseItems.length, 1, 'وما لم يره يُردّ');
});

test('manages لا تقبل حسابًا بلا معرّف ولا سفرةً بلا مسؤولين', () => {
  assert.equal(manages({ managers: [undefined] }, {}), false);
  assert.equal(manages({}, saad), false);
  assert.deepEqual(managedIds([{ id: 'x' }], saad), []);
});

/* ---------------- المُدخِل: يضيف ويرى ما أدخله هو وحده ---------------- */
const alawan = { id: 'u4', role: 'مسجل حضور', permissions: [] };
const withEntrant = () => {
  const ts = trips();
  ts[1].entrants = ['u4'];
  ts[1].expenseItems = [{ id: 'e2', name: 'بنزين', amount: 150, paidBy: 'تركي', by: 'u1' }, { id: 'm1', name: 'سكن', amount: 90, paidBy: 'العلوان', by: 'u4' }];
  ts[1].settlements = [{ id: 's2', person: 'تركي', amount: 70 }];
  ts[1].people = ['تركي', 'العلوان'];
  return ts;
};

test('المُدخِل يرى ما أدخله هو وحده: لا مصروف غيره ولا تسوية ولا شباب ولا إيراد', () => {
  const ts = withEntrant();
  const seen = tripsSeen(ts, blind(ts), alawan, false);
  assert.deepEqual(seen.map((t) => t.id), ['t2'], 'سفرته وحدها');
  assert.deepEqual(seen[0].expenseItems.map((x) => x.id), ['m1'], 'ما أدخله هو');
  assert.deepEqual([seen[0].settlements, seen[0].people, seen[0].incomeItems], [[], [], []]);
  assert.deepEqual([enters(ts[1], alawan), manages(ts[1], alawan), enteredIds(ts, alawan)], [true, false, ['t2']]);
});

test('المُدخِل يضيف بنودًا جديدة: تُكتب باسمه ولو ادّعى غيره، وما كان يبقى كما هو', () => {
  const cur = withEntrant();
  const mine = entrantView(cur[1], alawan);
  const inc = [{ ...mine, expenseItems: [...mine.expenseItems, { id: 'n1', name: 'ماء', amount: 30, paidBy: 'العلوان', by: 'u1', evil: 'x' }] }];
  const kept = tripsKept(inc, cur, alawan, false);
  const t2 = kept.find((t) => t.id === 't2');
  assert.deepEqual(t2.expenseItems.map((x) => x.id), ['e2', 'm1', 'n1'], 'بنود غيره باقية، وبنده أُضيف');
  const n1 = t2.expenseItems.find((x) => x.id === 'n1');
  assert.equal(n1.by, 'u4', 'مُدخِلُه هو لا ما ادّعاه');
  assert.equal(n1.evil, undefined, 'حقولٌ لا يعرفها لا تدخل');
  assert.equal(t2.settlements.length, 1, 'وتسوياتهم كما كانت');
  assert.deepEqual(t2.people, ['تركي', 'العلوان']);
});

test('المُدخِل لا يعدّل بندًا قائمًا ولا يحذفه ولا يمسّ التسويات والمسؤولين', () => {
  const cur = withEntrant();
  const inc = [{ ...cur[1], name: 'اخترقت', expenseItems: [{ id: 'm1', name: 'سكن', amount: 1 }], settlements: [], managers: ['u4'], entrants: ['u4', 'u3'] }];
  const kept = tripsKept(inc, cur, alawan, false).find((t) => t.id === 't2');
  assert.equal(kept.name, 'الجنوب', 'الاسم كما كان');
  assert.deepEqual(kept.expenseItems.map((x) => [x.id, x.amount]), [['e2', 150], ['m1', 90]], 'لا تعديل ولا حذف');
  assert.equal(kept.settlements.length, 1);
  assert.deepEqual([kept.managers, kept.entrants], [[], ['u4']], 'لا يعيّن أحدًا');
});

test('المُدخِل لا يمسّ سفرةً غير سفرته، ولا يحذف شيئًا', () => {
  const cur = withEntrant();
  assert.deepEqual(tripsKept([], cur, alawan, false).map((t) => t.id).sort(), ['t1', 't2']);
  const forged = [{ ...cur[0], name: 'مزوّرة', expenseItems: [] }];
  assert.deepEqual(tripsKept(forged, cur, alawan, false).find((t) => t.id === 't1'), cur[0]);
});

test('وما يُلقى من بنودٍ كثيرة يُقطع عند حدّ', () => {
  const cur = withEntrant();
  const spam = Array.from({ length: 100 }, (_, i) => ({ id: 'z' + i, name: 'x', amount: 1 }));
  const kept = tripsKept([{ ...cur[1], expenseItems: spam }], cur, alawan, false).find((t) => t.id === 't2');
  assert.equal(kept.expenseItems.length, 2 + 40);
});

test('من عنده «السفرات» مع المال يرى كل شيء ولو كان مُدخِلًا، والمدير يعيّن المُدخِلين', () => {
  const cur = withEntrant();
  const rich = { id: 'u4', role: 'مسؤول فيض', permissions: ['السفرات'] };
  assert.equal(tripsSeen(cur, cur, rich, true, true).length, 2);
  const inc = [{ ...cur[1], entrants: ['u4', 'u3'] }];
  assert.deepEqual(tripsKept(inc, cur, admin, true)[0].entrants, ['u4', 'u3']);
  assert.deepEqual(tripsKept(inc, cur, rich, true, true).find((t) => t.id === 't2').entrants, ['u4'], 'غير المدير لا يعيّن');
});

/* ---------------- السفرة المقفلة ---------------- */
test('السفرة المقفلة: لا يقبل منها شيءٌ من مسؤول ولا مُدخِل ولا ذي «السفرات»', () => {
  const cur = withEntrant(); cur[0].closed = true; cur[1].closed = true;
  const add = (t, extra) => ({ ...t, expenseItems: [...t.expenseItems, { id: 'late', name: 'متأخر', amount: 9, ...extra }] });
  const byManager = tripsKept([add(cur[0])], cur, saad, false).find((t) => t.id === 't1');
  assert.deepEqual(byManager, cur[0], 'المسؤول لا يضيف في مقفلة');
  const byEntrant = tripsKept([add(entrantView(cur[1], alawan))], cur, alawan, false).find((t) => t.id === 't2');
  assert.deepEqual(byEntrant, cur[1], 'والمُدخِل لا يضيف');
  const rich = { id: 'u7', role: 'مسؤول فيض', permissions: ['السفرات'] };
  assert.deepEqual(tripsKept([add(cur[1])], cur, rich, true, true).find((t) => t.id === 't2'), cur[1], 'ولا من يرى كل شيء بصلاحيته');
});

test('ولا يفتحها غير المدير ولا يحذفها، والمدير يفتحها ويعدّل', () => {
  const cur = withEntrant(); cur[0].closed = true;
  const reopen = [{ ...cur[0], closed: false, name: 'مفتوحة' }, cur[1]];
  assert.equal(tripsKept(reopen, cur, saad, false).find((t) => t.id === 't1').closed, true, 'غير المدير لا يفتح');
  const rich = { id: 'u7', role: 'مسؤول فيض', permissions: ['السفرات'] };
  assert.equal(tripsKept([cur[1]], cur, rich, true, true).some((t) => t.id === 't1'), true, 'ولا يحذف المقفلة');
  assert.equal(tripsKept(reopen, cur, admin, true)[0].closed, false, 'المدير يفتحها');
});

test('ومن لا يقفل بحفظةٍ: «closed» لا يُكتب من غير المدير في سفرةٍ مفتوحة', () => {
  const cur = trips();
  const kept = tripsKept([{ ...cur[0], closed: true }, cur[1]], cur, saad, false).find((t) => t.id === 't1');
  assert.equal(kept.closed, false, 'المسؤول لا يقفل');
  assert.equal(tripsKept([{ ...cur[0], closed: true }, cur[1]], cur, admin, true).find((t) => t.id === 't1').closed, true, 'والمدير يقفل');
});

console.log(`\n✅ ${passed} اختبارًا لمسؤول السفرة`);
