/**
 * من يصله إشعار التنبيه.
 *
 * `noticeTargets` هنا كانت تقارن معرّف المستخدم بمصفوفة `to` كاملة — فما
 * تساوت أبدًا، وما وصل إشعارٌ لأحد لأي تنبيه، لا الموجَّه لواحدٍ ولا «للكل»،
 * رغم أن التنبيه نفسه كان يصل التطبيق ويظهر فيه كما يُفترض. فثُبِّتت هنا حتى
 * لا تفترق مرة أخرى عن نظيرتها في `src/taqreer.js`.
 */
import assert from 'node:assert/strict';
import { noticeTargets } from '../netlify/lib/push.mjs';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('  ✓ ' + name); };

const users = [
  { id: 'admin', role: 'مدير' },
  { id: 'a', role: 'مشرف برنامج' },
  { id: 'b', role: 'مشرف برنامج' },
  { id: 'c', role: 'مشرف برنامج', status: 'غير نشط' },
];

test('«للكل» (to فاضية) يصل كل الموظفين، لا المديرَ ولا المعطَّل ولا الكاتب', () => {
  const n = { id: 'n1', to: [], by: 'a' };
  assert.deepEqual(noticeTargets(n, users).sort(), ['b']);
});

test('تنبيهٌ لعدّة أشخاص بأسمائهم يصل هم فقط', () => {
  const n = { id: 'n2', to: ['a', 'b'], by: 'admin' };
  assert.deepEqual(noticeTargets(n, users).sort(), ['a', 'b']);
});

test('تنبيهٌ لواحدٍ بصيغة `to` القديمة (نصًّا لا مصفوفة) يصله هو وحده', () => {
  const n = { id: 'n3', to: 'b', by: 'admin' };
  assert.deepEqual(noticeTargets(n, users), ['b']);
});

test('الموجَّه إليه معطَّل لا يصله شيء', () => {
  const n = { id: 'n4', to: ['c'], by: 'admin' };
  assert.deepEqual(noticeTargets(n, users), []);
});

console.log(`\n✅ ${passed} اختبارًا لمن يصله إشعار التنبيه\n`);
