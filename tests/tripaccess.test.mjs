/** اختبارات «مسؤول السفرة»: من يرى سفرةً كاملة، ومن يكتب، وما لا يُقبل من غيرهما. */
import assert from 'node:assert/strict';
import { manages, managedIds, tripsSeen, tripsKept } from '../src/tripaccess.js';
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

console.log(`\n✅ ${passed} اختبارًا لمسؤول السفرة`);
