/**
 * تمييز العدد.
 *
 * الدرجات أربع، وأكثر ما يقع الخلل في الرابعة: «١٩ ساعات» بدل «١٩ ساعة» —
 * لأن الذي كتبها اكتفى بصيغتين. فنمتحن الحدود: ٢ و٣ و١٠ و١١، وما حولها.
 */
import assert from 'node:assert/strict';
import { say, UNITS } from '../src/adad.js';
import { agoText } from '../src/trace.js';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('  ✓ ' + name); };

test('الواحد بلا رقم', () => {
  assert.equal(say(1, 'hour'), 'ساعة');
  assert.equal(say(1, 'day'), 'يوم');
  assert.equal(say(1, 'student'), 'طالب');
});

test('والاثنان مثنّى بلا رقم', () => {
  assert.equal(say(2, 'hour'), 'ساعتين');
  assert.equal(say(2, 'minute'), 'دقيقتين');
  assert.equal(say(2, 'signup'), 'تسجيلين');
});

test('ومن ثلاثة إلى عشرة جمعُ قلّة', () => {
  assert.equal(say(3, 'hour'), '3 ساعات');
  assert.equal(say(10, 'hour'), '10 ساعات');
  assert.equal(say(5, 'day'), '5 أيام');
  assert.equal(say(7, 'student'), '7 طلاب');
});

test('ومن أحد عشر فما فوق مفردٌ منصوب — وهذي التي كانت غلطًا', () => {
  assert.equal(say(11, 'hour'), '11 ساعة');
  assert.equal(say(19, 'hour'), '19 ساعة', 'الغلط الذي وُجد: «١٩ ساعات»');
  assert.equal(say(21, 'hour'), '21 ساعة');
  assert.equal(say(23, 'hour'), '23 ساعة');
  assert.equal(say(45, 'minute'), '45 دقيقة');
  assert.equal(say(30, 'day'), '30 يومًا');
  assert.equal(say(40, 'student'), '40 طالبًا');
});

test('والمئات ترجع إلى آخر عددها', () => {
  assert.equal(say(103, 'signup'), '103 تسجيلات', 'آخرها ثلاثة');
  assert.equal(say(115, 'signup'), '115 تسجيلًا');
  assert.equal(say(100, 'signup'), '100 تسجيلًا');
});

test('والآلاف تُفصل بفاصلة فتُقرأ بلمحة', () => {
  assert.equal(say(1532, 'signup'), '1,532 تسجيلًا');
});

test('والصفر لا يُكسر عليه شيء', () => {
  assert.equal(say(0, 'student'), '0 طالبًا');
  assert.equal(say(null, 'student'), '0 طالبًا');
  assert.equal(say(undefined, 'hour'), '0 ساعة');
});

test('والكسر يُقرّب، والسالب يُقرأ عددًا', () => {
  assert.equal(say(2.4, 'hour'), 'ساعتين');
  assert.equal(say(-3, 'hour'), '3 ساعات');
});

test('ويقبل صيغًا مكتوبةً لمعدودٍ ما دخل الجدول', () => {
  const letter = ['حرف', 'حرفين', 'أحرف', 'حرفًا'];
  assert.equal(say(5, letter), '5 أحرف');
  assert.equal(say(16, letter), '16 حرفًا');
});

test('ومعدودٌ مجهول يرجع رقمًا مجرّدًا لا ينكسر', () => {
  assert.equal(say(5, 'ما-له-وجود'), '5');
});

test('كل صيغةٍ في الجدول أربع', () => {
  for (const [id, forms] of Object.entries(UNITS)) {
    assert.equal(forms.length, 4, id);
    assert.ok(forms.every((f) => typeof f === 'string' && f.trim()), id);
  }
});

/* ------------------------- وأثرُ السجل يتبعه ------------------------- */

const ago = (ms) => agoText(Date.now() - ms, Date.now());
const MIN = 60000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

test('«قبل ١٩ ساعة» لا «قبل ١٩ ساعات»', () => {
  assert.equal(ago(19 * HOUR), 'قبل 19 ساعة');
  assert.equal(ago(4 * HOUR), 'قبل 4 ساعات');
  assert.equal(ago(1 * HOUR), 'قبل ساعة');
  assert.equal(ago(2 * HOUR), 'قبل ساعتين');
});

test('و«قبل دقيقتين» لا «قبل ٢ دقيقة»', () => {
  assert.equal(ago(2 * MIN), 'قبل دقيقتين');
  assert.equal(ago(4 * MIN), 'قبل 4 دقائق');
  assert.equal(ago(19 * MIN), 'قبل 19 دقيقة');
});

test('واليوم والأسبوع والشهر على القاعدة', () => {
  assert.equal(ago(DAY), 'أمس');
  assert.equal(ago(2 * DAY), 'قبل يومين');
  assert.equal(ago(4 * DAY), 'قبل 4 أيام');
  assert.equal(ago(14 * DAY), 'قبل أسبوعين');
  assert.equal(ago(21 * DAY), 'قبل 3 أسابيع');
  assert.equal(ago(330 * DAY), 'قبل 11 شهرًا');
});

test('وما دون الدقيقة والنصف «الآن»', () => {
  assert.equal(ago(30000), 'الآن');
  assert.equal(agoText(0), '');
});

console.log(`\n✅ ${passed} اختبارًا لتمييز العدد\n`);
