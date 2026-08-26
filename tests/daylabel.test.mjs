/**
 * اسم اليوم عند ولي الأمر، والنصوص اللي يقدر صاحب البرنامج يبدّلها.
 * الغلط هنا يوصل الأهالي قبل ما يوصلنا، فيُقفل باختبار.
 */
import assert from 'node:assert/strict';
import { dayLabel, publicView, TEXTS, txt } from '../src/signup.js';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('  ✓ ' + name); };

const week = (id, name, date = '') => ({ id, name, date, mode: 'named', participants: [] });
const base = {
  id: 'p1', name: 'جمعة الرواد', type: 'منفصل', termKey: '1448-الأول',
  weeks: [week('w1', 'الأسبوع الأول', '1448/03/13'), week('w2', 'الأسبوع الثاني'), week('w3', 'الأسبوع الثالث')],
};
const data = { faidAccounts: [], signupFields: [], waNumber: '0551234567' };
const withSignup = (s) => ({ ...base, signup: { enabled: true, token: 't', openWeeks: ['w1', 'w2', 'w3'], accounts: [], ...s } });

test('بلا إعداد: الاسم اللي عندك هو اللي يشوفه', () => {
  assert.equal(dayLabel('text', base.weeks[1], 1, ''), 'الأسبوع الثاني');
  const v = publicView(data, withSignup({}));
  assert.deepEqual(v.days.map((d) => d.name), ['الأسبوع الأول', 'الأسبوع الثاني', 'الأسبوع الثالث']);
  assert.equal(v.dayStyle, 'text');
});

test('الاسم المخصّص يفوز على كل شي', () => {
  const v = publicView(data, withSignup({ dayNames: { w2: 'يوم الجمعة 13 رجب' } }));
  assert.deepEqual(v.days.map((d) => d.name), ['الأسبوع الأول', 'يوم الجمعة 13 رجب', 'الأسبوع الثالث']);
});

test('المرقّم يرقّم اللي ما له اسم مخصّص فقط', () => {
  const v = publicView(data, withSignup({ dayStyle: 'number', dayNames: { w2: 'يوم الجمعة' } }));
  assert.deepEqual(v.days.map((d) => d.name), ['اليوم 1', 'يوم الجمعة', 'اليوم 3']);
});

test('الترقيم يتبع المعروض لا الأصل: اليوم المقفول ما يأخذ رقمًا', () => {
  const v = publicView(data, withSignup({ dayStyle: 'number', openWeeks: ['w2', 'w3'] }));
  assert.deepEqual(v.days.map((d) => d.name), ['اليوم 1', 'اليوم 2']);
});

test('الاسم الفاضي أو المسافات يرجّع الأصلي', () => {
  const v = publicView(data, withSignup({ dayNames: { w1: '   ' } }));
  assert.equal(v.days[0].name, 'الأسبوع الأول');
});

test('شكل «قائمة» ما يغيّر الأسماء، يغيّر العرض فقط', () => {
  const v = publicView(data, withSignup({ dayStyle: 'list' }));
  assert.equal(v.dayStyle, 'list');
  assert.deepEqual(v.days.map((d) => d.name), ['الأسبوع الأول', 'الأسبوع الثاني', 'الأسبوع الثالث']);
});

test('الشكل المجهول يرجع للأصلي بدل ما يكسر الصفحة', () => {
  const v = publicView(data, withSignup({ dayStyle: 'هرج' }));
  assert.equal(v.dayStyle, 'text');
});

test('التاريخ يبقى معروضًا مهما تغيّر الاسم', () => {
  const v = publicView(data, withSignup({ dayStyle: 'number' }));
  assert.equal(v.days[0].date, '1448/03/13');
});

/* -------------------------------- النصوص -------------------------------- */

test('النصوص الجديدة لها قيم افتراضية', () => {
  for (const k of ['days', 'packageLabel', 'dueLabel', 'payLabel', 'share']) {
    assert.ok(TEXTS[k], `ناقص نص ${k}`);
  }
  assert.equal(TEXTS.days, 'الأيام');
});

test('صاحب البرنامج يبدّل «الأيام» لأي كلمة', () => {
  const v = publicView(data, withSignup({ texts: { days: 'تاريخ البرنامج' } }));
  assert.equal(txt(v, 'days'), 'تاريخ البرنامج');
  assert.equal(txt(v, 'payLabel'), 'طريقة الدفع', 'وباقي النصوص تبقى على أصلها');
});

test('النص الفاضي يعني «شِله» لا «رجّع الأصلي»', () => {
  const v = publicView(data, withSignup({ texts: { share: '' } }));
  assert.equal(txt(v, 'share'), '');
});

console.log(`\n✅ ${passed} اختبارًا لأسماء الأيام ونصوص الصفحة\n`);
