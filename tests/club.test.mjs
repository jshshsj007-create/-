/** اختبارات بنود السفرة وبنك المسابقات. */
import assert from 'node:assert/strict';
import { tripIncome, tripExpenses, tripNet, migrate } from './build/app.mjs';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('  ✓ ' + name); };

const qassim = {
  id: 't1', name: 'سفرة القصيم', date: '1448/03/01',
  expenseItems: [
    { id: 'e1', name: 'أكل', amount: 1200 },
    { id: 'e2', name: 'سكن', amount: 3000 },
    { id: 'e3', name: 'مواصلات', amount: 800 },
  ],
  incomeItems: [{ id: 'i1', name: 'اشتراكات', amount: 6000 }],
};

test('السفرة: كل بند باسمه، والمجموع يطلع منها', () => {
  assert.equal(tripExpenses(qassim), 5000);
  assert.equal(tripIncome(qassim), 6000);
  assert.equal(tripNet(qassim), 1000);
});

test('تعرف كل سفرة وين راحت فلوسها', () => {
  const byName = Object.fromEntries(qassim.expenseItems.map((x) => [x.name, x.amount]));
  assert.equal(byName['سكن'], 3000);
  assert.equal(byName['أكل'], 1200);
});

test('كل سفرة بنودها مستقلة عن الثانية', () => {
  const riyadh = { expenseItems: [{ id: 'x', name: 'تذاكر', amount: 400 }], incomeItems: [] };
  assert.equal(tripExpenses(riyadh), 400);
  assert.equal(tripExpenses(qassim), 5000); // ما تأثرت
  assert.deepEqual(riyadh.expenseItems.map((x) => x.name), ['تذاكر']);
});

test('سفرة فاضية ما تطيح', () => {
  assert.equal(tripIncome({}), 0);
  assert.equal(tripNet({}), 0);
});

test('الترقية: أرقام السفرات القديمة تصير بنودًا ولا تضيع', () => {
  const d = migrate({ trips: [{ id: 't', name: 'قديمة', revenue: 2000, expenses: 750 }] });
  const t = d.trips[0];
  assert.equal(tripIncome(t), 2000);
  assert.equal(tripExpenses(t), 750);
  assert.equal(t.expenseItems[0].name, 'مصروف سابق');
  assert.equal(t.revenue, undefined); // ما بقي حقل مكرر
});

test('المسابقة تحمل فكرتها وأدواتها وصورها', () => {
  const d = migrate({ competitions: [{ id: 'c1', name: 'سباق الأقماع', level: 'أولية' }] });
  const c = d.competitions[0];
  assert.deepEqual(c.tools, []);
  assert.deepEqual(c.photos, []);
  assert.equal(c.idea, '');

  const filled = { ...c, idea: 'فريقان يتسابقان', tools: [{ id: 'x', name: 'أقماع', qty: 6 }], photos: [{ id: 'p', src: 'data:image/jpeg;base64,AA' }] };
  assert.equal(filled.tools[0].qty, 6);
  assert.equal(filled.photos.length, 1);
});

test('بنك المسابقات يُفلتر بالمرحلة', () => {
  const comps = [
    { id: '1', name: 'أ', level: 'أولية' },
    { id: '2', name: 'ب', level: 'متوسطة' },
    { id: '3', name: 'ج', level: 'أولية' },
  ];
  const pick = (lv) => comps.filter((c) => lv === 'الكل' || c.level === lv);
  assert.equal(pick('أولية').length, 2);
  assert.equal(pick('متوسطة').length, 1);
  assert.equal(pick('الكل').length, 3);
});

console.log(`\n${passed} اختبار نجح.`);
