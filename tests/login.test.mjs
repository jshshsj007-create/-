/** حراسة باب الدخول: عدّ المحاولات الفاشلة. */
import assert from 'node:assert/strict';
import { loginBlocked, noteFail, clearFails, PER_USER, PER_ALL, WINDOW } from '../src/login.js';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('  ✓ ' + name); };

const fails = (n, u, at = 1000) => Array.from({ length: n }, (_, i) => ({ at: at + i, u }));

test('خمس محاولاتٍ فاشلة تقفل الحساب', () => {
  assert.equal(loginBlocked(fails(PER_USER - 1, 'saad'), 'saad', 2000).blocked, false);
  assert.equal(loginBlocked(fails(PER_USER, 'saad'), 'saad', 2000).blocked, true);
});

test('والقفل على حسابه وحده — لا يُعاقَب غيره بغلطه', () => {
  const log = fails(PER_USER, 'saad');
  assert.equal(loginBlocked(log, 'saad', 2000).blocked, true);
  assert.equal(loginBlocked(log, 'ahmad', 2000).blocked, false);
});

test('ورشُّ الحسابات كلها يُصَدّ بالمجموع', () => {
  // كلمةٌ واحدة على ثلاثين اسمًا: ما بلغ أحدُهم خمسًا، والمجموع بلغ الحد
  const log = Array.from({ length: PER_ALL }, (_, i) => ({ at: 1000 + i, u: 'u' + i }));
  assert.equal(loginBlocked(log, 'جديد', 2000).blocked, true);
});

test('والقديم يسقط بعد ربع ساعة', () => {
  const log = fails(PER_USER, 'saad', 1000);
  assert.equal(loginBlocked(log, 'saad', 1000 + WINDOW + 1).blocked, false, 'انقضت النافذة');
});

test('ويقول متى يعود، فلا يقف أمام بابٍ لا يدري متى يُفتح', () => {
  const r = loginBlocked(fails(PER_USER, 'saad', 1000), 'saad', 1000);
  assert.ok(r.retryIn > 0 && r.retryIn <= WINDOW / 1000);
});

test('والدخول الناجح يمحو أثر صاحبه وحده', () => {
  const log = [...fails(PER_USER, 'saad'), ...fails(2, 'ahmad')];
  const after = clearFails(log, 'saad');
  assert.equal(loginBlocked(after, 'saad', 2000).blocked, false);
  assert.equal(after.filter((e) => e.u === 'ahmad').length, 2, 'أثر غيره باقٍ');
});

test('والاسم يُوحَّد: فرق الأحرف والمسافات ما ينفع للتهرّب', () => {
  const log = fails(PER_USER, 'saad');
  assert.equal(loginBlocked(log, '  SAAD  ', 2000).blocked, true);
  assert.equal(noteFail([], ' Saad ')[0].u, 'saad');
});

console.log(`\n✅ ${passed} اختبارًا لحراسة باب الدخول`);
