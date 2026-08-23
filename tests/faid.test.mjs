/** اختبارات تصنيف مصروفات فيض حسب البند والمستفيد. */
import assert from 'node:assert/strict';
import { sumAmt } from './build/app.mjs';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('  ✓ ' + name); };

const T = (type, amount, project, payee, date) => ({ id: Math.random().toString(36), type, amount, project, payee, date });
const txns = [
  T('إيراد', 20000, 'دعم', '', '1448/01/01'),
  T('مصروف', 1500, 'رواتب', 'فهد', '1448/01/10'),
  T('مصروف', 1500, 'رواتب', 'فهد', '1448/02/10'),
  T('مصروف', 1000, 'رواتب', 'فهد', '1448/03/10'),
  T('مصروف', 2000, 'رواتب', 'عبدالعزيز', '1448/01/12'),
  T('مصروف', 3000, 'برنامج خيركم', '', '1448/02/01'),
  T('مصروف', 1200, 'برنامج خيركم', 'عبدالعزيز', '1448/02/05'),
  T('مصروف', 800, 'برنامج خيركم', '', '1448/02/20'),
  T('مصروف', 400, '', '', '1448/03/01'), // بدون تصنيف
];

const groupBy = (key, type) => {
  const totals = new Map();
  txns.filter((a) => a.type === type && (a[key] || '').trim()).forEach((a) => {
    totals.set(a[key], (totals.get(a[key]) || 0) + Number(a.amount));
  });
  const untagged = txns.filter((a) => a.type === type && !(a[key] || '').trim())
    .reduce((s, a) => s + Number(a.amount), 0);
  return { rows: [...totals.entries()].map(([name, amount]) => ({ name, amount })).sort((x, y) => y.amount - x.amount), untagged };
};

test('كم كلّف برنامج خيركم على الفريق', () => {
  const g = groupBy('project', 'مصروف');
  assert.equal(g.rows.find((r) => r.name === 'برنامج خيركم').amount, 5000);
});

test('كم أخذ فهد خلال الترم رغم اختلاف التواريخ', () => {
  const g = groupBy('payee', 'مصروف');
  assert.equal(g.rows.find((r) => r.name === 'فهد').amount, 4000); // 1500+1500+1000
});

test('كم أخذ عبدالعزيز إجمالًا من كل البنود', () => {
  const g = groupBy('payee', 'مصروف');
  assert.equal(g.rows.find((r) => r.name === 'عبدالعزيز').amount, 3200); // 2000 راتب + 1200 خيركم
});

test('التقاطع: كم أخذ عبدالعزيز من برنامج خيركم تحديدًا', () => {
  const cross = txns.filter((a) => a.project === 'برنامج خيركم' && a.payee === 'عبدالعزيز');
  assert.equal(sumAmt(cross), 1200);
  assert.equal(cross.length, 1);
});

test('البند والمستفيد بُعدان مستقلان', () => {
  const byProject = groupBy('project', 'مصروف').rows.reduce((s, r) => s + r.amount, 0);
  const byPayee = groupBy('payee', 'مصروف').rows.reduce((s, r) => s + r.amount, 0);
  assert.equal(byProject, 11000); // كل المصروفات الموسومة ببند
  assert.equal(byPayee, 7200);    // اللي لها مستفيد فقط
  // نفس العملية تُحسب في البُعدين بلا تعارض
  assert.equal(txns.find((a) => a.amount === 1200).project, 'برنامج خيركم');
  assert.equal(txns.find((a) => a.amount === 1200).payee, 'عبدالعزيز');
});

test('غير المصنّف يظهر على حدة ولا يضيع', () => {
  assert.equal(groupBy('project', 'مصروف').untagged, 400);
  assert.equal(groupBy('payee', 'مصروف').untagged, 4200); // 3000 + 800 + 400
});

test('الإيرادات تُجمَّع بنفس الطريقة', () => {
  const g = groupBy('project', 'إيراد');
  assert.equal(g.rows[0].name, 'دعم');
  assert.equal(g.rows[0].amount, 20000);
});

test('الترتيب من الأكبر للأصغر', () => {
  const g = groupBy('project', 'مصروف');
  assert.deepEqual(g.rows.map((r) => r.name), ['رواتب', 'برنامج خيركم']);
});

console.log(`\n${passed} اختبار نجح.`);
