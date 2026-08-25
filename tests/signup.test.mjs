/**
 * اختبارات التسجيل الذاتي: ما يُعرض لولي الأمر، والتحقق من مُدخلاته،
 * ووصول تسجيله للبرنامج بلا تكرار وبلا ما يُحسب إيرادًا قبل التأكيد.
 */
import assert from 'node:assert/strict';
import {
  makeToken, programByToken, publicView, validateSubmission,
  dueFor, totalDue, applySubmission, rateLimited, daysAllowed, daysAreFixed, coversAll, isReceipt, RECEIPT_MAX,
  waIntl, waLink, fillTemplate, signupVars, txt, TEXTS, varNames, DEFAULT_WA_TEMPLATE,
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

/* ------------------------------- الباقات ------------------------------- */

const withPackages = () => {
  const d = baseData();
  d.programs[0].type = 'مجمع';
  d.programs[0].signup.openWeeks = ['w1', 'w2', 'w3'];
  d.programs[0].signup.allowPerDay = false;
  d.programs[0].signup.packages = [
    { id: 'pk_all', name: 'الموسم كامل', price: 120, dayCount: 0 },
    { id: 'pk_two', name: 'يومان', price: 90, dayCount: 2 },
    { id: 'pk_one', name: 'يوم واحد', price: 50, dayCount: 1 },
  ];
  return d;
};

test('اليومي والباقات يتعايشان، وولي الأمر يختار', () => {
  const d = withPackages();
  d.programs[0].signup.allowPerDay = true;
  d.programs[0].signup.price = 40;
  const v = publicView(d, d.programs[0]);
  assert.deepEqual(v.packages.map((p) => p.name), ['يومي', 'الموسم كامل', 'يومان', 'يوم واحد']);
  assert.equal(v.packages[0].perDay, true);
  assert.equal(v.packages[0].price, 40, 'سعر اليوم');
});

test('اليومي يُضرب بعدد الأيام، والباقة سعرها مقطوع', () => {
  const d = withPackages();
  d.programs[0].signup.allowPerDay = true;
  d.programs[0].signup.price = 40;
  const v = publicView(d, d.programs[0]);
  assert.equal(dueFor(v, { packageId: '__perday', days: ['w1', 'w2', 'w3'] }), 120, '٤٠ × ٣');
  assert.equal(dueFor(v, { packageId: '__perday', days: ['w1'] }), 40);
  assert.equal(dueFor(v, { packageId: 'pk_two', days: ['w1', 'w2'] }), 90, 'الباقة مقطوعة');
});

test('اليومي يقبل أي عدد أيام، والباقة بعددها بالضبط', () => {
  const d = withPackages();
  d.programs[0].signup.allowPerDay = true;
  d.programs[0].signup.price = 40;
  const v = publicView(d, d.programs[0]);
  const base = { answers: goodBody.answers, accountId: 'rajhi' };

  assert.equal(daysAreFixed(v.packages[0]), false, 'اليومي مفتوح');
  assert.equal(validateSubmission(v, { ...base, kids: [{ name: 'سعد', age: '10', packageId: '__perday', days: ['w1'] }] }).ok, true);
  assert.equal(validateSubmission(v, { ...base, kids: [{ name: 'سعد', age: '10', packageId: '__perday', days: ['w1', 'w2'] }] }).ok, true);
  assert.equal(validateSubmission(v, { ...base, kids: [{ name: 'سعد', age: '10', packageId: '__perday', days: [] }] }).errors['kid0.days'], 'اختر أيامك');
  assert.equal(validateSubmission(v, { ...base, kids: [{ name: 'سعد', age: '10', packageId: 'pk_two', days: ['w1'] }] }).errors['kid0.days'],
    'هذي الباقة 2 أيام — اخترت 1');
});

test('باقة المدة الكاملة تُعرف من غيرها', () => {
  const d = withPackages();
  const v = publicView(d, d.programs[0]);
  const all = v.packages.find((p) => p.id === 'pk_all');
  const two = v.packages.find((p) => p.id === 'pk_two');
  assert.equal(coversAll(v, all), true, 'صفر أيام = المدة كاملة');
  assert.equal(coversAll(v, two), false, 'الباقة بعدد محدد يختار أيامها');
  assert.equal(coversAll(v, null), false);
});

test('المدة الكاملة تُقبل بكل الأيام، وترفض الناقص', () => {
  const d = withPackages();
  const v = publicView(d, d.programs[0]);
  const base = { answers: goodBody.answers, accountId: 'rajhi' };
  const withDays = (days) => ({ ...base, kids: [{ name: 'سعد', age: '10', packageId: 'pk_all', days }] });
  assert.equal(validateSubmission(v, withDays(['w1', 'w2', 'w3'])).ok, true);
  assert.equal(validateSubmission(v, withDays([])).errors['kid0.days'], 'اختر أيامك');
});

test('اليومي بلا سعر ما يُعرض', () => {
  const d = withPackages();
  d.programs[0].signup.allowPerDay = true;
  d.programs[0].signup.price = 0;
  assert.deepEqual(publicView(d, d.programs[0]).packages.map((p) => p.name), ['الموسم كامل', 'يومان', 'يوم واحد']);
});

test('اليومي وحده يكفي — بلا باقات', () => {
  const d = withPackages();
  d.programs[0].signup.allowPerDay = true;
  d.programs[0].signup.price = 40;
  d.programs[0].signup.packages = [];
  const v = publicView(d, d.programs[0]);
  assert.equal(v.blocked, '');
  assert.deepEqual(v.packages.map((p) => p.name), ['يومي']);
});

test('المجمّع بلا يومي وبلا باقات مقفول', () => {
  const d = withPackages();
  d.programs[0].signup.allowPerDay = false;
  d.programs[0].signup.packages = [];
  assert.equal(publicView(d, d.programs[0]).blocked, 'no_packages');
});

test('التسجيل اليومي يوصل بمبلغه', () => {
  const d = withPackages();
  d.programs[0].signup.allowPerDay = true;
  d.programs[0].signup.price = 40;
  const v = publicView(d, d.programs[0]);
  const r = applySubmission(d, d.programs[0], v, {
    answers: goodBody.answers, accountId: 'rajhi',
    kids: [{ name: 'سعد القاسم', age: '10', packageId: '__perday', days: ['w1', 'w3'] }],
  }, { newId, now: 1000 });
  const added = r.data.programs[0].participants.find((p) => p.name === 'سعد القاسم');
  assert.equal(added.amount, 80, '٤٠ × يومين');
  assert.deepEqual(added.days, ['w1', 'w3']);
});

test('الباقات تظهر لولي الأمر بأسعارها', () => {
  const d = withPackages();
  const v = publicView(d, d.programs[0]);
  assert.equal(v.usePackages, true);
  assert.deepEqual(v.packages.map((p) => [p.name, p.price]), [['الموسم كامل', 120], ['يومان', 90], ['يوم واحد', 50]]);
});

test('«كل الأيام» تعني الأيام المفتوحة، وما تزيد لو الباقة أكبر منها', () => {
  const d = withPackages();
  d.programs[0].signup.openWeeks = ['w1', 'w2'];
  d.programs[0].signup.packages.push({ id: 'pk_big', name: 'عشرة أيام', price: 400, dayCount: 10 });
  const v = publicView(d, d.programs[0]);
  assert.equal(daysAllowed(v, v.packages[0]), 2, 'صفر = الأيام المتاحة');
  assert.equal(v.packages.find((p) => p.id === 'pk_big').dayCount, 2, 'ما تتجاوز المتاح');
});

test('سعر الباقة هو المستحق، مو سعر اليوم', () => {
  const d = withPackages();
  const v = publicView(d, d.programs[0]);
  assert.equal(dueFor(v, { packageId: 'pk_two', days: ['w1', 'w2'] }), 90);
  assert.equal(dueFor(v, { packageId: 'pk_all', days: ['w1', 'w2', 'w3'] }), 120);
  assert.equal(dueFor(v, { packageId: 'مو موجودة' }), 0);
});

test('لازم يختار باقة، وبعدد أيامها بالضبط', () => {
  const d = withPackages();
  const v = publicView(d, d.programs[0]);
  const base = { answers: goodBody.answers, accountId: 'rajhi' };

  assert.equal(validateSubmission(v, { ...base, kids: [{ name: 'سعد', age: '10', days: ['w1'] }] }).errors['kid0.package'], 'اختر طريقة التسجيل');
  assert.equal(validateSubmission(v, { ...base, kids: [{ name: 'سعد', age: '10', packageId: 'pk_two', days: ['w1'] }] }).errors['kid0.days'],
    'هذي الباقة 2 أيام — اخترت 1', 'ناقص');
  assert.equal(validateSubmission(v, { ...base, kids: [{ name: 'سعد', age: '10', packageId: 'pk_one', days: ['w1', 'w2'] }] }).errors['kid0.days'],
    'هذي الباقة 1 أيام — اخترت 2', 'زايد');
  assert.equal(validateSubmission(v, { ...base, kids: [{ name: 'سعد', age: '10', packageId: 'pk_two', days: ['w1', 'w2'] }] }).ok, true);
});

test('يوم ملفّق ما هو ضمن المعروض يُرفض', () => {
  const d = withPackages();
  d.programs[0].signup.openWeeks = ['w1', 'w2'];
  const v = publicView(d, d.programs[0]);
  const r = validateSubmission(v, {
    answers: goodBody.answers, accountId: 'rajhi',
    kids: [{ name: 'سعد', age: '10', packageId: 'pk_two', days: ['w1', 'w3'] }],
  });
  assert.equal(r.errors['kid0.days'], 'فيه يوم غير متاح');
});

test('التسجيل بباقة يوصل بسعرها واسمها', () => {
  const d = withPackages();
  const v = publicView(d, d.programs[0]);
  const r = applySubmission(d, d.programs[0], v, {
    answers: goodBody.answers, accountId: 'rajhi',
    kids: [{ name: 'سعد', age: '10', packageId: 'pk_two', days: ['w1', 'w3'] }],
  }, { newId, now: 1000 });

  const added = r.data.programs[0].participants.find((p) => p.name === 'سعد');
  assert.equal(added.amount, 90, 'سعر الباقة');
  assert.equal(added.packageName, 'يومان');
  assert.deepEqual(added.days, ['w1', 'w3']);
  assert.ok(added.pending);
});

test('كل ابن يقدر ياخذ باقة مختلفة', () => {
  const d = withPackages();
  const v = publicView(d, d.programs[0]);
  const r = applySubmission(d, d.programs[0], v, {
    answers: goodBody.answers, accountId: 'rajhi',
    kids: [
      { name: 'سعد', age: '10', packageId: 'pk_all', days: ['w1', 'w2', 'w3'] },
      { name: 'عمر', age: '8', packageId: 'pk_one', days: ['w2'] },
    ],
  }, { newId, now: 1000 });
  const parts = r.data.programs[0].participants;
  assert.equal(parts.find((p) => p.name === 'سعد').amount, 120);
  assert.equal(parts.find((p) => p.name === 'عمر').amount, 50);
  assert.equal(totalDue(v, [{ packageId: 'pk_all' }, { packageId: 'pk_one' }]), 170);
});

/* ---------------------- الاسم اللي يشوفه ولي الأمر ---------------------- */

test('الحساب يظهر لولي الأمر بالاسم اللي يفهمه', () => {
  const d = baseData();
  d.faidAccounts[0].publicName = 'STC Pay';
  const v = publicView(d, d.programs[0]);
  assert.equal(v.accounts[0].name, 'STC Pay', 'ولي الأمر يشوف الاسم المعروض');
  assert.equal(d.faidAccounts[0].name, 'الراجحي', 'واسم الحساب عندك ما يتغيّر');
});

test('بلا اسم معروض يبقى اسم الحساب', () => {
  const d = baseData();
  d.faidAccounts[0].publicName = '   ';
  assert.equal(publicView(d, d.programs[0]).accounts[0].name, 'الراجحي');
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
  // المجمّع يعرض «يومي» تلقائيًا ما دام له سعر يوم
  const r = applySubmission(d, d.programs[0], v, {
    ...goodBody, kids: [{ name: 'سعد', age: '10', packageId: '__perday', days: ['w1', 'w3'] }],
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

/* ------------------------- الأيام المقفلة كليًا ------------------------- */

test('برنامج له أيام وما فُتح منها شي: الرابط ما يقبل تسجيلًا يضيع', () => {
  // كان المشترك ينزل بلا أيام فيختفي من كل قوائم الحضور
  const d = baseData();
  d.programs[0].signup.openWeeks = [];
  const v = publicView(d, d.programs[0]);
  assert.equal(v.blocked, 'no_days');
  const r = validateSubmission(v, { ...goodBody, kids: [{ name: 'سعد', age: '10' }] });
  assert.equal(r.ok, false);
  assert.match(r.errors._, /مو متاح/);
});

test('باقات بلا ولا باقة: مقفول كذلك', () => {
  const d = baseData();
  d.programs[0].type = 'مجمع';
  d.programs[0].signup.allowPerDay = false;
  d.programs[0].signup.packages = [];
  assert.equal(publicView(d, d.programs[0]).blocked, 'no_packages');
});

test('البرنامج اللي ما له أيام أصلًا مقفول كذلك', () => {
  // بلا أيام ما فيه مكان يستقر فيه التسجيل، فينتهي بمشترك يختفي من الحضور
  const d = baseData();
  d.programs[0].weeks = [];
  d.programs[0].signup.openWeeks = [];
  const v = publicView(d, d.programs[0]);
  assert.equal(v.blocked, 'no_days');
  assert.equal(validateSubmission(v, goodBody).ok, false);
});

test('المجمّع بلا أيام مقفول كذلك', () => {
  const d = baseData();
  d.programs[0].type = 'مجمع';
  d.programs[0].weeks = [];
  d.programs[0].signup.openWeeks = [];
  assert.equal(publicView(d, d.programs[0]).blocked, 'no_days');
});

/* -------------------------------- الإيصال -------------------------------- */

const img = (n = 200) => ({ name: 'r.jpg', type: 'image/jpeg', data: 'data:image/jpeg;base64,' + 'A'.repeat(n) });

test('الحساب اللي يطلب إيصالًا ما يمر بدونه', () => {
  const d = baseData();
  d.faidAccounts[0].needsReceipt = true;   // الراجحي
  const v = publicView(d, d.programs[0]);
  assert.equal(v.accounts[0].needsReceipt, true);
  assert.equal(validateSubmission(v, goodBody).errors.receipt, 'أرفق صورة الإيصال أو المستند');
  assert.equal(validateSubmission(v, { ...goodBody, receipt: img() }).ok, true);
});

test('الكاش ما يطلب إيصالًا', () => {
  const d = baseData();
  d.faidAccounts[0].needsReceipt = true;
  const v = publicView(d, d.programs[0]);
  assert.equal(validateSubmission(v, { ...goodBody, accountId: 'cash' }).ok, true, 'يمر بلا إيصال');
});

test('الإيصال الملفّق يُرفض', () => {
  assert.equal(isReceipt(img()), true);
  assert.equal(isReceipt(null), false);
  assert.equal(isReceipt({ type: 'text/html', data: 'data:text/html;base64,AAAA' }), false, 'نوع مرفوض');
  assert.equal(isReceipt({ type: 'image/jpeg', data: '<script>' }), false, 'مو data URL');
  assert.equal(isReceipt({ type: 'image/jpeg', data: 'data:image/png;base64,' + 'A'.repeat(200) }), false, 'النوع ما يطابق المحتوى');
  assert.equal(isReceipt({ type: 'image/jpeg', data: 'data:image/jpeg;base64,AA' }), false, 'فاضي');
  assert.equal(isReceipt({ type: 'image/jpeg', data: 'data:image/jpeg;base64,' + 'A'.repeat(RECEIPT_MAX * 2) }), false, 'كبير');
});

test('الإيصال ينحفظ مع التسجيل مرة وحدة للطلب كله', () => {
  const d = baseData();
  d.faidAccounts[0].needsReceipt = true;
  const v = publicView(d, d.programs[0]);
  const r = applySubmission(d, d.programs[0], v, {
    ...goodBody, receipt: img(),
    kids: [{ name: 'سعد', age: '10', days: ['w1'] }, { name: 'عمر', age: '8', days: ['w1'] }],
  }, { newId, now: 1000 });
  const parts = r.data.programs[0].weeks[0].participants.filter((p) => p.pending);
  assert.equal(parts.length, 2);
  assert.equal(parts.filter((p) => p.receipt).length, 1, 'تحويل واحد = إيصال واحد');
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

/* ------------------------ محتوى الصفحة وواتساب ------------------------ */

test('صور البرنامج ونقاطه ونصوصه تصل لولي الأمر', () => {
  const d = baseData();
  Object.assign(d.programs[0].signup, {
    poster: 'IMG1', gallery: ['A', 'B'], details: 'سطر\nسطر ثاني',
    notice: 'جهّز الإيصال', texts: { intro: 'سجّل في' },
  });
  const v = publicView(d, d.programs[0]);
  assert.equal(v.poster, 'IMG1');
  assert.deepEqual(v.gallery, ['A', 'B']);
  assert.equal(v.details, 'سطر\nسطر ثاني');
  assert.equal(v.notice, 'جهّز الإيصال');
  assert.equal(txt(v, 'intro'), 'سجّل في', 'المكتوب يفوز');
  assert.equal(txt(v, 'guardian'), TEXTS.guardian, 'وغير المكتوب يبقى الافتراضي');
});

test('النص الفاضي يعني «شِله» لا «رجّع الأصلي»', () => {
  const d = baseData();
  d.programs[0].signup.texts = { refLabel: '' };
  const v = publicView(d, d.programs[0]);
  assert.equal(txt(v, 'refLabel'), '', 'الفاضي ما ينقلب افتراضيًا');
});

test('الجوال يتحوّل لصيغة واتساب مهما كُتب', () => {
  assert.equal(waIntl('0557821586'), '966557821586');
  assert.equal(waIntl('٠٥٥٧٨٢١٥٨٦'.replace(/[٠-٩]/g, (x) => '٠١٢٣٤٥٦٧٨٩'.indexOf(x))), '966557821586');
  assert.equal(waIntl('+966 55 782 1586'), '966557821586');
  assert.equal(waIntl('00966557821586'), '966557821586');
  assert.equal(waIntl('557821586'), '966557821586');
  assert.equal(waIntl(''), '', 'وبلا رقم ما فيه رابط');
  assert.equal(waIntl('123'), '');
});

test('بلا رقم صالح ما يطلع زر واتساب', () => {
  assert.equal(waLink('', 'مرحبا'), '');
  assert.ok(waLink('0557821586', 'مرحبا').startsWith('https://wa.me/966557821586?text='));
  assert.equal(waLink('0557821586', ''), 'https://wa.me/966557821586', 'بلا نص = محادثة فاضية');
});

test('المتغيّرات تتعبّى من التسجيل نفسه', () => {
  const d = baseData();
  const v = publicView(d, d.programs[0]);
  const body = {
    answers: { gPhone: '0551234567', gName: 'سعد' },
    kids: [{ name: 'محمد سعد القاسم', age: '10', school: 'الرواد', days: ['w1'] }],
    accountId: 'rajhi',
  };
  const vars = signupVars(v, body, { ref: '0361' });
  assert.equal(vars['الطالب'], 'محمد سعد القاسم');
  assert.equal(vars['البرنامج'], 'جمعة الرواد');
  assert.equal(vars['الأيام'], 'الأسبوع الأول');
  assert.equal(vars['المبلغ'], '50');
  assert.equal(vars['الرقم المرجعي'], '0361');
  assert.equal(vars['طريقة الدفع'], 'الراجحي');
  assert.equal(vars['العمر'], '10', 'وأي خانة بمسمّاها');
  assert.equal(vars['المدرسة'], 'الرواد');
});

test('الرسالة تتكوّن من نص صاحب البرنامج وحده', () => {
  const vars = { 'الطالب': 'محمد', 'الصف': 'رابع' };
  assert.equal(fillTemplate('{الطالب}\n{الصف}', vars), 'محمد\nرابع');
  assert.equal(fillTemplate('اسمه {الطالب} فقط', vars), 'اسمه محمد فقط');
  assert.equal(fillTemplate('{ ألطالب }', vars), '', 'المتغيّر المجهول ينمسح ما ينعرض');
  assert.equal(fillTemplate('بلا متغيّرات', vars), 'بلا متغيّرات');
});

test('ابنان في تسجيل واحد يطلعان في رسالة واحدة', () => {
  const d = baseData();
  const v = publicView(d, d.programs[0]);
  const vars = signupVars(v, {
    answers: { gPhone: '0551234567' },
    kids: [{ name: 'محمد', age: '10', days: ['w1'] }, { name: 'عبدالله', age: '8', days: ['w2'] }],
    accountId: 'cash',
  }, {});
  assert.equal(vars['الطالب'], 'محمد، عبدالله');
  assert.equal(vars['العمر'], '10، 8');
  assert.equal(vars['المبلغ'], '100');
});

test('نص هذا البرنامج يغلب النص العام', () => {
  const d = baseData();
  d.waTemplate = 'عام';
  let v = publicView(d, d.programs[0]);
  assert.equal(v.wa.template, 'عام');
  d.programs[0].signup.waTemplate = 'خاص';
  v = publicView(d, d.programs[0]);
  assert.equal(v.wa.template, 'خاص');
  delete d.waTemplate;
  delete d.programs[0].signup.waTemplate;
  v = publicView(d, d.programs[0]);
  assert.equal(v.wa.template, DEFAULT_WA_TEMPLATE, 'وبلا الاثنين يجي المقترح');
});

test('المفاتيح تقفل الزرين كلٌّ على حدة', () => {
  const d = baseData();
  d.waNumber = '0557821586';
  let v = publicView(d, d.programs[0]);
  assert.equal(v.wa.contact, true);
  assert.equal(v.wa.redirect, true);
  assert.equal(v.wa.number, '966557821586');
  d.programs[0].signup.waContact = false;
  d.programs[0].signup.waRedirect = false;
  v = publicView(d, d.programs[0]);
  assert.equal(v.wa.contact, false);
  assert.equal(v.wa.redirect, false);
});

test('أسئلة البرنامج تصير متغيّرات جاهزة', () => {
  const d = baseData();
  d.programs[0].signup.extraFields = [{ id: 'x1', label: 'هل يحتاج نقل؟', type: 'choice', options: ['نعم', 'لا'] }];
  const v = publicView(d, d.programs[0]);
  assert.ok(varNames(v).includes('هل يحتاج نقل؟'));
  assert.ok(varNames(v).includes('الطالب'));
  assert.ok(!varNames(v).includes('جوال ولي الأمر'), 'خانات ولي الأمر ما تتكرر لكل ابن');
});

console.log(`\n${passed} اختبار نجح.`);
