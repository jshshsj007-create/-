/**
 * وتيرة سؤال الخادم عن تعديلات الزملاء.
 * غلطة هنا إما تستنزف الرصيد بلا فائدة، أو توقف السحب فيشتغل الفريق على
 * بيانات قديمة — فالحدود تُقفل باختبار.
 */
import assert from 'node:assert/strict';
import { pollDelay } from './build/app.mjs';
import { readTheme, writeTheme, applyTheme, THEMES } from '../src/theme.js';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('  ✓ ' + name); };
const S = 1000, M = 60 * 1000;

test('وهو شغّال: عشر ثوانٍ', () => {
  assert.equal(pollDelay(0), 10 * S);
  assert.equal(pollDelay(59 * S), 10 * S, 'إلى آخر الدقيقة');
});

test('سكون دقيقة: نصف دقيقة', () => {
  assert.equal(pollDelay(M), 30 * S);
  assert.equal(pollDelay(4 * M), 30 * S);
});

test('سكون خمس دقائق: دقيقتان', () => {
  assert.equal(pollDelay(5 * M), 2 * M);
  assert.equal(pollDelay(14 * M), 2 * M);
});

test('سكون ربع ساعة: يتوقف تمامًا', () => {
  assert.equal(pollDelay(15 * M), 0);
  assert.equal(pollDelay(5 * 60 * M), 0, 'ومهما طال');
});

test('السلّم يصعد ولا ينزل — ما فيه فترة أقصر من اللي قبلها', () => {
  const points = [0, 30 * S, M, 3 * M, 5 * M, 10 * M].map(pollDelay);
  for (let i = 1; i < points.length; i++) {
    assert.ok(points[i] >= points[i - 1], `الدرجة ${i} أقصر مما قبلها`);
  }
});

test('التوفير الفعلي: ساعة سكون كاملة تكلّف طلبات معدودة', () => {
  // نحاكي ساعة بلا لمسة: كم مرة يسأل؟
  let t = 0, calls = 0;
  while (t < 60 * M) {
    const wait = pollDelay(t);
    if (!wait) break;
    t += wait;
    calls++;
  }
  // ١٩ طلبًا ثم يسكت — مقابل ٥١٤ في النسخة القديمة (كل ٧ ثوانٍ بلا توقف)
  assert.ok(calls <= 25, `صار ${calls} طلبًا في ساعة سكون`);
  assert.ok(calls < 514 / 20, 'التوفير أقل من المتوقع');
  assert.ok(t <= 20 * M, 'ما سكت خلال عشرين دقيقة');
});

/* -------------------------------- المظهر -------------------------------- */

test('بلا اختيار: فاتح', () => {
  assert.deepEqual(THEMES, ['light', 'dark']);
  assert.equal(readTheme(), 'light');
});

test('الاختيار ينحفظ ويُقرأ', () => {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  writeTheme('dark');
  assert.equal(readTheme(), 'dark');
  writeTheme('light');
  assert.equal(readTheme(), 'light');
});

test('قيمة غريبة ترجع فاتحًا بدل ما تعطّل الشاشة', () => {
  globalThis.localStorage.setItem('faid-theme', 'هرج');
  assert.equal(readTheme(), 'light');
});

test('بلا مستند: ما ينكسر (الخادم يستورد الملف كذلك)', () => {
  const doc = globalThis.document;
  delete globalThis.document;
  assert.doesNotThrow(() => applyTheme('dark'));
  if (doc) globalThis.document = doc;
});

console.log(`\n✅ ${passed} اختبارًا للوتيرة والمظهر\n`);
