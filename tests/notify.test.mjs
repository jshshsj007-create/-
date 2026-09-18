/**
 * إشعار الجوّال.
 *
 * وأثقلُ ما يُحرس هنا قيدُ آبل: من فتح التطبيق في سفاري على آيفون لا يُعرض
 * عليه زرُّ تفعيلٍ لا ينفع — بل تُقال له الخطوات. فوعدٌ لا نملكه أسوأ من
 * صمت.
 */
import assert from 'node:assert/strict';
import { pushStatus, PUSH_TEXTS, HOME_STEPS, b64ToBytes } from '../src/notify.js';
import { noticeTargets } from '../netlify/lib/push.mjs';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('  ✓ ' + name); };

test('الآيفون في سفاري: خطواتٌ لا زرّ', () => {
  assert.equal(pushStatus({ supported: true, ios: true, standalone: false, permission: 'default' }), 'needs-home');
  // وحتى لو ما عرف المتصفحُ الإشعارات أصلًا — فآبل تفتحها بعد الإضافة
  assert.equal(pushStatus({ supported: false, ios: true }), 'needs-home');
  assert.equal(PUSH_TEXTS['needs-home'].action, '', 'ما فيه زرٌّ يُضغط');
  assert.ok(HOME_STEPS.length >= 4);
});

test('وبعد ما يضيفه للشاشة يصير الزرّ نافعًا', () => {
  assert.equal(pushStatus({ supported: true, ios: true, standalone: true, permission: 'default' }), 'off');
  assert.equal(PUSH_TEXTS.off.action, 'فعّلها');
});

test('والأندرويد يفعّلها من المتصفح بلا شرط', () => {
  assert.equal(pushStatus({ supported: true, ios: false, standalone: false, permission: 'default' }), 'off');
});

test('ومن فعّلها يُقال له إنها مفعّلة، ومعه إيقافها', () => {
  assert.equal(pushStatus({ supported: true, ios: false, permission: 'granted', subscribed: true }), 'on');
  assert.equal(PUSH_TEXTS.on.action, 'أوقفها');
});

test('ومن منعها لا يُطلب منه ثانيةً — المتصفح لا يسأل مرتين', () => {
  assert.equal(pushStatus({ supported: true, ios: false, permission: 'denied' }), 'blocked');
  assert.equal(PUSH_TEXTS.blocked.action, '');
});

test('ومتصفّحٌ لا يعرفها أصلًا: لا وعدَ ولا زرّ', () => {
  assert.equal(pushStatus({ supported: false, ios: false }), 'unsupported');
  assert.equal(PUSH_TEXTS.unsupported.title, '');
  assert.equal(pushStatus(), 'unsupported');
});

test('مفتاح base64url يُقرأ بايتاتٍ، بحشوه وبحرفيه المبدَّلين', () => {
  assert.equal(b64ToBytes('').length, 0);
  // «-» و«_» هما «+» و«/» في هذا الترميز
  assert.deepEqual([...b64ToBytes('-_8')], [251, 255]);
  assert.deepEqual([...b64ToBytes('QUJD')], [65, 66, 67]);
});

/* ------------------------------ من يصله الإشعار ------------------------------ */

const users = [
  { id: 'a', role: 'مدير', status: 'نشط' },
  { id: 'b', role: 'مشرف برنامج', status: 'نشط' },
  { id: 'c', role: 'مسؤول النادي', status: 'نشط' },
  { id: 'd', role: 'مشرف برنامج', status: 'غير نشط' },
];

test('تنبيهُ الكل يصل الموظفين، لا المديرَ ولا المعطَّل', () => {
  assert.deepEqual(noticeTargets({ id: 'n1', by: 'a', to: '' }, users), ['b', 'c']);
});

test('وتنبيهُ الواحد يصله وحده', () => {
  assert.deepEqual(noticeTargets({ id: 'n1', by: 'a', to: 'c' }, users), ['c']);
});

test('ولا يصل كاتبَه — يكتبه لا ينتظره', () => {
  assert.deepEqual(noticeTargets({ id: 'n1', by: 'b', to: '' }, users), ['c']);
});

console.log(`\n✅ ${passed} اختبارًا لإشعار الجوّال\n`);
