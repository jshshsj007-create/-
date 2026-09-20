/** قاعدة «من يقرأ ومن يكتب» — يقرأها الجوال والخادم معًا. */
import assert from 'node:assert/strict';
import { isAdmin, allowed, canWrite, readsReports, READ_REPORTS } from '../src/perms.js';

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

/* ------------------------ قراءة تقارير اليوم ------------------------ */

test('ومن أُعطي «قراءة تقارير اليوم» قرأها، ومن لا فلا', () => {
  assert.equal(readsReports({ role: 'مشرف برنامج', permissions: [READ_REPORTS] }), true);
  assert.equal(readsReports({ role: 'مشرف برنامج', permissions: ['الأسابيع والحضور'] }), false);
  assert.equal(readsReports(null), false);
});

/** وكتابةُ التقرير غيرُ قراءته: من يُطالَب بتقريره لا يرى تقارير زملائه. */
test('وهي غيرُ كتابته — الواحدةُ لا تجرّ الأخرى', () => {
  const writer = { role: 'مشرف برنامج', permissions: ['الأسابيع والحضور'] };
  assert.equal(readsReports(writer), false, 'يكتب ولا يقرأ');
  const reader = { role: 'مسجل حضور', permissions: [READ_REPORTS] };
  assert.equal(readsReports(reader), true);
  assert.equal(allowed(reader, 'الأسابيع والحضور'), false, 'يقرأ ولا تُفتح له البرامج');
  assert.equal(allowed(reader, 'أولياء الأمور'), false);
  assert.equal(allowed(reader, 'فيض - الإيرادات والمصروفات'), false);
});

test('والمديرُ يقرؤها بلا إعطاء — هو من يسأل عنها', () => {
  assert.equal(readsReports(admin), true);
});

console.log(`\n✅ ${passed} اختبارًا للصلاحيات — يقرأ ولا يكتب`);
