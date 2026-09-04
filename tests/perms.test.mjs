/** قاعدة «من يقرأ ومن يكتب» — يقرأها الجوال والخادم معًا. */
import assert from 'node:assert/strict';
import { isAdmin, allowed, canWrite } from '../src/perms.js';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('  ✓ ' + name); };

const viewer = { role: 'معلّم خيركم', permissions: ['خيركم'], readOnly: ['خيركم'] };
const editor = { role: 'معلّم خيركم', permissions: ['خيركم'] };
const admin = { role: 'مدير' };
const nobody = { role: 'مسجل حضور', permissions: [] };

test('«يشوف فقط» يفتح الشاشة ولا يكتب فيها', () => {
  assert.equal(allowed(viewer, 'خيركم'), true);
  assert.equal(canWrite(viewer, 'خيركم'), false);
});

test('ومن له الصلاحية بلا قيد يكتب', () => {
  assert.equal(allowed(editor, 'خيركم'), true);
  assert.equal(canWrite(editor, 'خيركم'), true);
});

test('ومن لا صلاحية له لا يفتح ولا يكتب', () => {
  assert.equal(allowed(nobody, 'خيركم'), false);
  assert.equal(canWrite(nobody, 'خيركم'), false);
});

test('والمدير لا يُقيَّد — تقييده وهمٌ يزول بضغطتين', () => {
  assert.equal(isAdmin(admin), true);
  assert.equal(canWrite(admin, 'خيركم'), true);
  assert.equal(canWrite({ ...admin, readOnly: ['خيركم'] }, 'خيركم'), true);
});

test('والقيد على صلاحيةٍ لا يمسّ أختها', () => {
  const u = { role: 'مشرف برنامج', permissions: ['خيركم', 'البرامج'], readOnly: ['خيركم'] };
  assert.equal(canWrite(u, 'خيركم'), false);
  assert.equal(canWrite(u, 'البرامج'), true);
});

test('وبلا مستخدم لا شيء', () => {
  assert.equal(allowed(null, 'خيركم'), false);
  assert.equal(canWrite(undefined, 'خيركم'), false);
});

console.log(`\n✅ ${passed} اختبارًا للصلاحيات — يقرأ ولا يكتب`);
