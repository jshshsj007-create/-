/**
 * اختبارات التسجيل الذاتي: ما يُعرض لولي الأمر، والتحقق من مُدخلاته،
 * ووصول تسجيله للبرنامج بلا تكرار وبلا ما يُحسب إيرادًا قبل التأكيد.
 */
import assert from 'node:assert/strict';
import {
  makeToken, programByToken, publicView, validateSubmission,
  dueFor, totalDue, applySubmission, rateLimited,
} from '../src/signup.js';
import { studentsOf } from '../src/people.js';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('  ✓ ' + name); };

let n = 0;
const newId = () => `n${++n}`;

const baseData = () => ({
  guardians: [],
  students: [],
  faidAccounts: [
    { id: 'rajhi', name: 'الراجحي', transferInfo: 'SA00 0000 0000' },
    { id: 'cash', name: 'كاش', transferInfo: '' },
    { id: 'qasim', name: 'القاسم', transferInfo: 'سرّي' },
  ],
  signupFields: [
    { id: 'gName', label: 'اسم ولي الأمر', type: 'text', required: true },
    { id: 'gPhone', label: 'جوال ولي الأمر', type: 'phone', required: true },
    { id: 'name', label: 'اسم الطالب', type: 'text', required: true },
    { id: 'age', label: 'العمر', type: 'number', required: true },
    { id: 'school', label: 'المدرسة', type: 'text', required: false },
  ],
  programs: [{
    id: 'p1', name: 'جمعة الرواد', type: 'منفصل', termKey: '1448-الأول',
    participants: [{ id: 'secret1', name: 'مشترك سابق', amount: 500, accountId: 'rajhi' }],
    weeks: [
      { id: 'w1', name: 'الأسبوع الأول', participants: [{ id: 'secret2', name: 'خالد', amount: 50 }] },
      { id: 'w2', name: 'الأسبوع الثاني', participants: [] },
      { id: 'w3', name: 'الأسبوع الثالث', participants: [] },
    ],
    signup: { enabled: true, token: 'abcd1234', price: 50, openWeeks: ['w1', 'w2'], accounts: ['rajhi', 'cash'], extraFields: [] },
  }],
});

/* --------------------------------- الرمز --------------------------------- */

test('الرمز عشوائي وبلا أحرف ملتبسة', () => {
  const t = makeToken();
  assert.equal(t.length, 8);
  assert.ok(!/[ilo01]/.test(t), 'ما فيه i l o 0 1');
  const many = new Set(Array.from({ length: 200 }, () => makeToken()));
  assert.ok(many.size > 190, 'ما يتكرر');
});

test('الرابط المقفول ما يفتح', () => {
  const d = baseData();
  assert.ok(programByToken(d.programs, 'abcd1234'));
  assert.equal(programByToken(d.programs, 'غلط'), null);
  assert.equal(programByToken(d.programs, ''), null);
  d.programs[0].signup.enabled = false;
  assert.equal(programByToken(d.programs, 'abcd1234'), null, 'الإقفال يشتغل فورًا');
});

/* ------------------------- ما يُعرض لولي الأمر ------------------------- */

test('الرابط ما يكشف ولا معلومة عن المسجّلين', () => {
  const d = baseData();
  const v = publicView(d, d.programs[0]);
  const text = JSON.stringify(v);
  assert.ok(!text.includes('secret1') && !text.includes('secret2'), 'ما تخرج تسجيلات');
  assert.ok(!text.includes('مشترك سابق') && !text.includes('خالد'), 'ولا أسماء');
  assert.ok(!text.includes('500'), 'ولا مبالغ');
});

test('الحسابات غير المختارة ما تظهر ولا تفاصيلها', () => {
  const d = baseData();
  const v = publicView(d, d.programs[0]);
  assert.deepEqual(v.accounts.map((a) => a.id), ['rajhi', 'cash']);
  assert.ok(!JSON.stringify(v).includes('سرّي'), 'حساب القاسم ما اختير، فما تخرج بياناته');
  assert.equal(v.accounts[0].transferInfo, 'SA00 0000 0000', 'والمختار تظهر تفاصيل تحويله');
});

test('الأيام المغلقة ما تُعرض للتسجيل', () => {
  const d = baseData();
  const v = publicView(d, d.programs[0]);
  assert.deepEqual(v.days.map((w) => w.id), ['w1', 'w2']);
});

test('أسئلة البرنامج الخاصة تنضم للنموذج العام', () => {
  const d = baseData();
  d.programs[0].signup.extraFields = [{ id: 'transport', label: 'يحتاج نقل؟', type: 'choice', required: true, options: ['نعم', 'لا'] }];
  const v = publicView(d, d.programs[0]);
  assert.ok(v.fields.some((f) => f.id === 'transport'));
  assert.equal(v.fields.length, 6);
});

/* ------------------------------- التحقق ------------------------------- */

const goodBody = {
  answers: { gName: 'محمد العتيبي', gPhone: '0551234567' },
  kids: [{ name: 'سعد', age: '10', days: ['w1', 'w2'] }],
  accountId: 'rajhi',
};

test('التسجيل السليم يمر', () => {
  const d = baseData();
  const v = publicView(d, d.programs[0]);
  assert.equal(validateSubmission(v, goodBody).ok, true);
});

test('خانة الطالب المطلوبة تُنسب للطالب لا لولي الأمر', () => {
  // كانت تُفحص في بيانات ولي الأمر، فيُرفض التسجيل بلا ما يبين وين الخلل
  const d = baseData();
  const v = publicView(d, d.programs[0]);
  const r = validateSubmission(v, { ...goodBody, kids: [{ name: 'سعد', age: '', days: ['w1'] }] });
  assert.equal(r.ok, false);
  assert.equal(r.errors['kid0.age'], 'مطلوب');
  assert.equal(r.errors.age, undefined, 'ما تُنسب لولي الأمر');
});

test('العمر لازم يكون رقمًا', () => {
  const d = baseData();
  const v = publicView(d, d.programs[0]);
  assert.equal(validateSubmission(v, { ...goodBody, kids: [{ name: 'سعد', age: 'عشرة', days: ['w1'] }] }).errors['kid0.age'], 'اكتب رقمًا');
});

test('كل ابن يُفحص على حدة', () => {
  const d = baseData();
  const v = publicView(d, d.programs[0]);
  const r = validateSubmission(v, { ...goodBody, kids: [
    { name: 'سعد', age: '10', days: ['w1'] },
    { name: 'عمر', age: '', days: ['w1'] },
  ] });
  assert.equal(r.errors['kid0.age'], undefined);
  assert.equal(r.errors['kid1.age'], 'مطلوب');
});

test('الخانات المطلوبة تُفرض', () => {
  const d = baseData();
  const v = publicView(d, d.programs[0]);
  const r = validateSubmission(v, { ...goodBody, answers: { ...goodBody.answers, gName: '  ' } });
  assert.equal(r.ok, false);
  assert.equal(r.errors.gName, 'مطلوب');
});

test('الجوال الغلط يُرفض', () => {
  const d = baseData();
  const v = publicView(d, d.programs[0]);
  const r = validateSubmission(v, { ...goodBody, answers: { ...goodBody.answers, gPhone: '05512' } });
  assert.equal(r.errors.gPhone, 'رقم جوال غير صحيح');
});

test('بلا طالب ما فيه تسجيل', () => {
  const d = baseData();
  const v = publicView(d, d.programs[0]);
  assert.equal(validateSubmission(v, { ...goodBody, kids: [] }).errors.kids, 'أضف طالبًا واحدًا على الأقل');
  assert.equal(validateSubmission(v, { ...goodBody, kids: [{ name: ' ', days: ['w1'] }] }).errors['kid0.name'], 'اسم الطالب مطلوب');
});

test('لازم يختار يومًا واحدًا على الأقل', () => {
  const d = baseData();
  const v = publicView(d, d.programs[0]);
  assert.equal(validateSubmission(v, { ...goodBody, kids: [{ name: 'سعد', age: '10', days: [] }] }).errors['kid0.days'],
    'اختر يومًا واحدًا على الأقل');
});

test('ما ينفع يختار حسابًا ما عرضته له', () => {
  const d = baseData();
  const v = publicView(d, d.programs[0]);
  assert.equal(validateSubmission(v, { ...goodBody, accountId: 'qasim' }).errors.accountId, 'اختر طريقة الدفع');
  assert.equal(validateSubmission(v, { ...goodBody, accountId: 'ملفّق' }).errors.accountId, 'اختر طريقة الدفع');
});

/* ------------------------------- المبلغ ------------------------------- */

test('المستحق = السعر × عدد الأيام', () => {
  const d = baseData();
  const v = publicView(d, d.programs[0]);
  assert.equal(dueFor(v, { days: ['w1'] }), 50);
  assert.equal(dueFor(v, { days: ['w1', 'w2'] }), 100);
  assert.equal(totalDue(v, [{ days: ['w1'] }, { days: ['w1', 'w2'] }]), 150, 'الإخوة يُجمعون');
});

/* ---------------------------- وصول التسجيل ---------------------------- */

test('التسجيل يوصل البرنامج جاهزًا وينتظر التأكيد', () => {
  const d = baseData();
  const v = publicView(d, d.programs[0]);
  const r = applySubmission(d, d.programs[0], v, goodBody, { newId, now: 1000 });

  const w1 = r.data.programs[0].weeks[0].participants;
  const w2 = r.data.programs[0].weeks[1].participants;
  assert.equal(w1.length, 2, 'انضاف للأسبوع الأول جنب المسجّل سابقًا');
  assert.equal(w2.length, 1, 'وللثاني');
  const added = w1.find((p) => p.name === 'سعد');
  assert.ok(added.pending, 'معلَّم ينتظر التأكيد');
  assert.equal(added.accountId, 'rajhi');
  assert.equal(added.amount, 50, 'سعر الأسبوع الواحد، مو مجموع أسابيعه');
  assert.equal(added.source, 'link');
  assert.ok(added.studentId, 'ومربوط بسجلّ الطالب');
  assert.equal(added.attendance, 'معلق', 'ويظهر في التحضير من أول لحظة');
});

test('الأسبوع اللي ما اختاره ما ينضاف له', () => {
  const d = baseData();
  const v = publicView(d, d.programs[0]);
  const r = applySubmission(d, d.programs[0], v, { ...goodBody, kids: [{ name: 'سعد', age: '10', days: ['w2'] }] }, { newId, now: 1000 });
  assert.equal(r.data.programs[0].weeks[0].participants.length, 1, 'الأول ما تغيّر');
  assert.equal(r.data.programs[0].weeks[1].participants.length, 1);
});

test('ولي الأمر وابنه ينضافان لقاعدة المشتركين', () => {
  const d = baseData();
  const v = publicView(d, d.programs[0]);
  const r = applySubmission(d, d.programs[0], v, goodBody, { newId, now: 1000 });
  assert.equal(r.data.guardians.length, 1);
  assert.equal(r.data.guardians[0].name, 'محمد العتيبي');
  assert.equal(r.data.students.length, 1);
  assert.equal(r.data.students[0].name, 'سعد');
});

test('سجّل مرة، ثم رجع بعد أسبوع وسجّل — ما يتكرر ولي الأمر ولا ابنه', () => {
  const d = baseData();
  const v = publicView(d, d.programs[0]);
  const first = applySubmission(d, d.programs[0], v, goodBody, { newId, now: 1000 });

  // بعد أسبوع، بصيغة جوال ثانية واسم أطول، ولأسبوع ثالث
  const d2 = first.data;
  d2.programs[0].signup.openWeeks = ['w1', 'w2', 'w3'];
  const v2 = publicView(d2, d2.programs[0]);
  const second = applySubmission(d2, d2.programs[0], v2, {
    answers: { gName: 'محمد', gPhone: '+966 55 123 4567', age: '10' },
    kids: [{ name: 'سعد محمد', age: '10', days: ['w3'] }],
    accountId: 'cash',
  }, { newId, now: 2000 });

  assert.equal(second.data.guardians.length, 1, 'ولي أمر واحد');
  assert.equal(second.data.students.length, 1, 'وابن واحد');
  assert.equal(second.data.programs[0].weeks[2].participants.length, 1, 'والتسجيل الجديد وصل');
  assert.equal(second.data.students[0].name, 'سعد محمد', 'والاسم الأطول فاز');
});

test('يسجّل ابنه الثاني في نفس الطلب', () => {
  const d = baseData();
  const v = publicView(d, d.programs[0]);
  const r = applySubmission(d, d.programs[0], v, {
    ...goodBody,
    kids: [{ name: 'سعد', age: '10', days: ['w1'] }, { name: 'عمر', age: '8', days: ['w1', 'w2'] }],
  }, { newId, now: 1000 });

  assert.equal(r.data.guardians.length, 1, 'ولي أمر واحد');
  assert.equal(studentsOf(r.data.students, r.data.guardians[0].id).length, 2, 'ابنان');
  assert.equal(r.data.programs[0].weeks[0].participants.length, 3, 'الاثنان في الأسبوع الأول');
  assert.equal(r.data.programs[0].weeks[1].participants.length, 1, 'وعمر وحده في الثاني');
  assert.equal(r.count, 2);
});

test('البرنامج المجمّع: تسجيل واحد بأيامه على مستوى البرنامج', () => {
  const d = baseData();
  d.programs[0].type = 'مجمع';
  d.programs[0].signup.openWeeks = ['w1', 'w2', 'w3'];
  const v = publicView(d, d.programs[0]);
  const r = applySubmission(d, d.programs[0], v, {
    ...goodBody, kids: [{ name: 'سعد', age: '10', days: ['w1', 'w3'] }],
  }, { newId, now: 1000 });

  const parts = r.data.programs[0].participants;
  assert.equal(parts.length, 2, 'انضاف للبرنامج نفسه');
  const added = parts.find((p) => p.name === 'سعد');
  assert.deepEqual(added.days, ['w1', 'w3'], 'بأيامه هو');
  assert.equal(added.amount, 100, 'يومان × ٥٠');
  assert.equal(r.data.programs[0].weeks[0].participants.length, 1, 'وما ينضاف للأسابيع');
});

test('أجوبة الأسئلة الخاصة تُحفظ مع التسجيل', () => {
  const d = baseData();
  d.programs[0].signup.extraFields = [{ id: 'transport', label: 'يحتاج نقل؟', type: 'choice', required: false, options: ['نعم', 'لا'] }];
  const v = publicView(d, d.programs[0]);
  const r = applySubmission(d, d.programs[0], v, {
    ...goodBody, answers: { ...goodBody.answers, transport: 'نعم' },
  }, { newId, now: 1000 });
  assert.equal(r.data.programs[0].weeks[0].participants.find((p) => p.name === 'سعد').answers.transport, 'نعم');
});

/* ------------------------------ الحماية ------------------------------ */

test('العبث المتكرر من نفس الجوال يتوقف', () => {
  const now = 100000000;
  const log = Array.from({ length: 5 }, (_, i) => ({ at: now - i * 1000, phone: '551234567' }));
  assert.equal(rateLimited(log, '0551234567', now).blocked, true);
  assert.equal(rateLimited(log, '0559999999', now).blocked, false, 'وغيره ما يتأثر');
});

test('المحاولات القديمة ما تُحسب ضده', () => {
  const now = 100000000;
  const old = Array.from({ length: 5 }, () => ({ at: now - 2 * 60 * 60 * 1000, phone: '551234567' }));
  const r = rateLimited(old, '0551234567', now);
  assert.equal(r.blocked, false);
  assert.equal(r.recent.length, 0, 'وتُنظَّف من السجل');
});

test('طوفان على البرنامج كله يتوقف', () => {
  const now = 100000000;
  const log = Array.from({ length: 40 }, (_, i) => ({ at: now - i * 1000, phone: `55000${String(i).padStart(4, '0')}` }));
  assert.equal(rateLimited(log, '0559999999', now).blocked, true);
});

console.log(`\n${passed} اختبار نجح.`);
