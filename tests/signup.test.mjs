/**
 * اختبارات التسجيل الذاتي: ما يُعرض لولي الأمر، والتحقق من مُدخلاته،
 * ووصول تسجيله للبرنامج بلا تكرار وبلا ما يُحسب إيرادًا قبل التأكيد.
 */
import assert from 'node:assert/strict';
import {
  makeToken, programByToken, publicView, validateSubmission,
  dueFor, totalDue, applySubmission, rateLimited, coversAll, isReceipt, RECEIPT_MAX, packTotal, splitLump, normalizeSubmission,
  waIntl, waLink, fillTemplate, signupVars, txt, TEXTS, varNames, DEFAULT_WA_TEMPLATE,
  orderedDays, weekShares, packSpan, shareAt, subsFor,
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
  assert.equal(validateSubmission(v, { ...goodBody, kids: [{ name: ' ', days: ['w1'] }] }).errors['kid0.name'], 'مطلوب');
});

test('لازم يختار يومًا واحدًا على الأقل', () => {
  const d = baseData();
  const v = publicView(d, d.programs[0]);
  assert.equal(validateSubmission(v, { ...goodBody, kids: [{ name: 'سعد', age: '10', days: [] }] }).errors['kid0.days'],
    'مطلوب');
});

test('ما ينفع يختار حسابًا ما عرضته له', () => {
  const d = baseData();
  const v = publicView(d, d.programs[0]);
  assert.equal(validateSubmission(v, { ...goodBody, accountId: 'qasim' }).errors.accountId, 'مطلوب');
  assert.equal(validateSubmission(v, { ...goodBody, accountId: 'ملفّق' }).errors.accountId, 'مطلوب');
});

/* ------------------------------- الباقات ------------------------------- */

/**
 * الباقة اشتراكُ ما بقي من الموسم: سعرٌ لكل يوم، وأيامها كل يومٍ لم يُقفل.
 * والمفتوح للتسجيل قائمةٌ أخرى، لليومي وحده.
 */
const withPackages = () => {
  const d = baseData();
  d.programs[0].type = 'مجمع';
  d.programs[0].signup.openWeeks = ['w1', 'w2', 'w3'];
  d.programs[0].signup.allowPerDay = false;
  d.programs[0].signup.packages = [{ id: 'pk', name: 'الموسم كامل', price: 120 }];
  return d;
};

test('اليومي والباقة يتعايشان، وولي الأمر يختار', () => {
  const d = withPackages();
  d.programs[0].signup.allowPerDay = true;
  d.programs[0].signup.price = 50;
  const v = publicView(d, d.programs[0]);
  assert.deepEqual(v.packages.map((p) => [p.name, p.price]), [['يومي', 50], ['الموسم كامل', 120]]);
  assert.equal(v.packages[0].perDay, true);
});

test('سعر الباقة مقطوعٌ كما كُتب — هو ما يُعلن', () => {
  const d = withPackages();
  const v = publicView(d, d.programs[0]);
  assert.equal(dueFor(v, { packageId: 'pk' }), 120);
  assert.equal(dueFor(v, { packageId: 'مو موجودة' }), 0);
});

test('وأيامها تنقص مع الإقفال، والمبلغ يبقى كما كتبه صاحبه', () => {
  const d = withPackages();
  d.programs[0].weeks[0].status = 'مغلق';
  const v = publicView(d, d.programs[0]);
  assert.deepEqual(v.packDays.map((x) => x.id), ['w2', 'w3']);
  assert.equal(v.packages.find((p) => p.id === 'pk').price, 120, 'المقطوع ما يتغيّر');
});

test('وأيام الباقة ما تتبع «المتاح للتسجيل»', () => {
  const d = withPackages();
  d.programs[0].signup.openWeeks = ['w2'];   // اليومي: الجمعة القادمة وحدها
  const v = publicView(d, d.programs[0]);
  assert.deepEqual(v.days.map((x) => x.id), ['w2']);
  assert.deepEqual(v.packDays.map((x) => x.id), ['w1', 'w2', 'w3']);
  assert.equal(dueFor(v, { packageId: 'pk' }), 120, 'الاشتراك يبقى على الثلاثة');
});

test('والباقة ما يُسأل عنها أيامًا — تُكتب له', () => {
  const d = withPackages();
  d.programs[0].signup.openWeeks = ['w2'];
  const v = publicView(d, d.programs[0]);
  assert.equal(coversAll(v, v.packages[0]), true);
  const out = normalizeSubmission(v, { kids: [{ name: 'سعد', packageId: 'pk', days: ['w2'] }] });
  assert.deepEqual(out.kids[0].days, ['w1', 'w2', 'w3'], 'ما أرسله يُطرح، ونكتب ما بقي');
});

test('واليومي يبقى على المفتوح', () => {
  const d = withPackages();
  d.programs[0].signup.allowPerDay = true;
  d.programs[0].signup.price = 50;
  d.programs[0].signup.openWeeks = ['w2', 'w3'];
  const v = publicView(d, d.programs[0]);
  const base = { answers: goodBody.answers, accountId: 'rajhi' };
  assert.equal(validateSubmission(v, { ...base, kids: [{ name: 'سعد', age: '10', packageId: '__perday', days: ['w2'] }] }).ok, true);
  assert.equal(validateSubmission(v, { ...base, kids: [{ name: 'سعد', age: '10', packageId: '__perday', days: ['w1'] }] }).errors['kid0.days'],
    'فيه يوم غير متاح', 'المقفل عن التسجيل ما يُشترى يوميًّا');
  assert.equal(dueFor(v, { packageId: '__perday', days: ['w2', 'w3'] }), 100);
});

test('لازم يختار طريقة تسجيل', () => {
  const d = withPackages();
  const v = publicView(d, d.programs[0]);
  const r = validateSubmission(v, { answers: goodBody.answers, accountId: 'rajhi', kids: [{ name: 'سعد', age: '10', days: ['w1'] }] });
  assert.equal(r.errors['kid0.package'], 'مطلوب');
});

test('اليومي بلا سعر ما يُعرض', () => {
  const d = withPackages();
  d.programs[0].signup.allowPerDay = true;
  d.programs[0].signup.price = 0;
  assert.deepEqual(publicView(d, d.programs[0]).packages.map((p) => p.name), ['الموسم كامل']);
});

test('واليومي وحده يكفي — بلا باقات', () => {
  const d = withPackages();
  d.programs[0].signup.allowPerDay = true;
  d.programs[0].signup.price = 40;
  d.programs[0].signup.packages = [];
  const v = publicView(d, d.programs[0]);
  assert.equal(v.blocked, '');
  assert.deepEqual(v.packages.map((p) => p.name), ['يومي']);
});

test('وبلا هذا ولا ذاك يُقفل الرابط', () => {
  const d = withPackages();
  d.programs[0].signup.allowPerDay = false;
  d.programs[0].signup.packages = [];
  assert.equal(publicView(d, d.programs[0]).blocked, 'no_packages');
});

test('وأيامٌ كلها مقفلة تُسقط الباقة', () => {
  const d = withPackages();
  d.programs[0].weeks.forEach((w) => { w.status = 'مغلق'; });
  const v = publicView(d, d.programs[0]);
  assert.deepEqual(v.packages, []);
  assert.equal(v.blocked, 'no_packages');
});

test('التسجيل بباقة يوصل بسعرها واسمها', () => {
  const d = withPackages();
  const v = publicView(d, d.programs[0]);
  const body = normalizeSubmission(v, {
    answers: goodBody.answers, accountId: 'rajhi',
    kids: [{ name: 'سعد', age: '10', packageId: 'pk' }],
  });
  const r = applySubmission(d, d.programs[0], v, body, { newId, now: 1000 });
  const added = r.data.programs[0].participants.find((p) => p.name === 'سعد');
  assert.equal(added.amount, 120);
  assert.equal(added.packageName, 'الموسم كامل');
  assert.deepEqual(added.days, ['w1', 'w2', 'w3']);
  assert.ok(added.pending);
});

test('وباقة النسخة الماضية (سعر اليوم) تُضرب في أيامها', () => {
  assert.equal(packTotal({ price: 300 }, 10), 300, 'المقطوع يفوز');
  assert.equal(packTotal({ perWeek: 30 }, 10), 300, '30 × 10');
  assert.equal(packTotal({ perWeek: 30 }, 0), 0);
});

test('والقسمة تُعطي كل يومٍ نصيبه، والفاضل على أوّله', () => {
  assert.deepEqual(splitLump(300, ['a', 'b', 'c']), { a: 100, b: 100, c: 100 });
  assert.deepEqual(splitLump(300, ['a', 'b', 'c', 'd', 'e', 'f', 'g']),
    { a: 48, b: 42, c: 42, d: 42, e: 42, f: 42, g: 42 });
  assert.equal(Object.values(splitLump(300, ['a', 'b', 'c', 'd', 'e', 'f', 'g'])).reduce((x, y) => x + y), 300);
  assert.deepEqual(splitLump(300, []), {});
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

/* ------------------------- باقة في البرنامج المنفصل ------------------------- */

/** منفصل بخمس جمع، واشتراكٌ مقطوعٌ بـ٣٠٠ — ٦٠ للجمعة. */
const withSubscription = (price = 300) => {
  const d = baseData();
  d.programs[0].weeks = ['w1', 'w2', 'w3', 'w4', 'w5']
    .map((id, i) => ({ id, name: `الأسبوع ${i + 1}`, participants: [] }));
  d.programs[0].signup.openWeeks = ['w1', 'w2', 'w3', 'w4', 'w5'];
  d.programs[0].signup.allowPerDay = false;
  d.programs[0].signup.packages = [{ id: 'sub', name: 'اشتراك', price }];
  return d;
};

const subRows = (r, name = 'سعد القاسم') =>
  r.data.programs[0].weeks.map((w) => (w.participants || []).find((p) => p.name === name));

const enroll = (d, kid) => {
  const v = publicView(d, d.programs[0]);
  const body = normalizeSubmission(v, { answers: goodBody.answers, accountId: 'rajhi', kids: [kid] });
  return applySubmission(d, d.programs[0], v, body, { newId, now: 1000 });
};

test('الباقة تظهر في المنفصل — وبدونها يبقى كما كان', () => {
  const plain = publicView(baseData(), baseData().programs[0]);
  assert.equal(plain.usePackages, false, 'منفصل بلا باقة: سعرٌ واحد بلا اختيار');
  const v = publicView(withSubscription(), withSubscription().programs[0]);
  assert.equal(v.usePackages, true);
  assert.deepEqual(v.packages.map((p) => [p.name, p.price]), [['اشتراك', 300]]);
});

test('واليومي يُعرض جنبها لو تركته مفتوحًا', () => {
  const d = withSubscription();
  d.programs[0].signup.allowPerDay = true;
  const v = publicView(d, d.programs[0]);
  assert.deepEqual(v.packages.map((p) => [p.name, p.price]), [['يومي', 50], ['اشتراك', 300]]);
});

test('٦٠ في دفتر كل جمعة، ومجموعها ما دفعه', () => {
  const r = enroll(withSubscription(), { name: 'سعد القاسم', age: '10', packageId: 'sub' });
  const rows = subRows(r);
  assert.deepEqual(rows.map((x) => x.amount), [60, 60, 60, 60, 60]);
  assert.equal(rows.reduce((s, x) => s + x.amount, 0), 300);
  assert.equal(new Set(rows.map((x) => x.ref)).size, 1, 'رقمٌ واحد يجمعها في إيصال واحد');
  assert.equal(rows[0].packageName, 'اشتراك');
});

test('والمتأخّر ما يدفع عن جمعةٍ أُقفلت', () => {
  const d = withSubscription();
  d.programs[0].weeks[0].status = 'مغلق';
  d.programs[0].weeks[1].status = 'مغلق';
  const v = publicView(d, d.programs[0]);
  assert.equal(v.packages.find((p) => p.id === 'sub').price, 300, 'المقطوع كما هو');
  const r = enroll(d, { name: 'سعد القاسم', age: '10', packageId: 'sub' });
  assert.deepEqual(subRows(r).map((x) => (x ? x.amount : null)), [null, null, 100, 100, 100], '300 على ثلاثة');
});

test('واليومي في المنفصل يبقى سعر الأسبوع لكل أسبوع', () => {
  const d = withSubscription();
  d.programs[0].signup.allowPerDay = true;
  const r = enroll(d, { name: 'سعد القاسم', age: '10', packageId: '__perday', days: ['w1', 'w2'] });
  const rows = subRows(r);
  assert.deepEqual([rows[0].amount, rows[1].amount, rows[2]], [50, 50, undefined]);
});

test('وتعديل الباقة ما يمسّ من سجّل قبله', () => {
  const r = enroll(withSubscription(), { name: 'سعد القاسم', age: '10', packageId: 'sub' });
  // صاحب البرنامج نزّل السعر بعدها
  const after = { ...r.data, programs: r.data.programs.map((p) => ({
    ...p, signup: { ...p.signup, packages: [{ id: 'sub', name: 'اشتراك', price: 200 }] },
  })) };
  const rows = after.programs[0].weeks.map((w) => w.participants.find((p) => p.name === 'سعد القاسم'));
  assert.deepEqual(rows.map((x) => x.amount), [60, 60, 60, 60, 60], 'مبالغ الدفاتر مكتوبةٌ لا تُحسب من جديد');
});

test('ونصيب الجمعة قسمةُ المقطوع على مدّته لا على ما اختير منها', () => {
  const d = withSubscription();
  const v = publicView(d, d.programs[0]);
  assert.deepEqual(weekShares(v, { packageId: 'sub', days: ['w1', 'w2'] }), { w1: 60, w2: 60 });
  assert.deepEqual(orderedDays(v, { packageId: 'sub', days: ['w3', 'w1'] }), ['w1', 'w3'], 'بترتيب البرنامج');
});

/* --------------------------- مدّة الباقة المعلنة --------------------------- */

/** موسمٌ مدّته عشر، وما أُنشئ منه في التطبيق إلا جمعتان — والثانية مقفلة. */
const withSpan = () => {
  const d = withSubscription();
  d.programs[0].weeks = ['w1', 'w2'].map((id, i) => ({
    id, name: `الأسبوع ${i + 1}`, participants: [], status: i === 0 ? 'مغلق' : 'مفتوح',
  }));
  d.programs[0].signup.openWeeks = ['w2'];
  d.programs[0].signup.packages = [{ id: 'sub', name: 'الموسم كامل', price: 300, days: 10 }];
  return d;
};

test('المدّة تُكتب ولا تُحصى من الأيام المنشأة', () => {
  const d = withSpan();
  const v = publicView(d, d.programs[0]);
  const pk = v.packages.find((p) => p.id === 'sub');
  assert.equal(pk.days, 10, 'يُعلن عشرًا وإن لم يُنشأ إلا واحد');
  assert.equal(pk.price, 300);
  assert.equal(v.packDays.length, 1, 'وأيامها الفعلية اليوم واحدة — هي غير المقفلة');
});

test('والإقفال ما يغيّر نصيب اليوم', () => {
  const d = withSpan();
  const r = enroll(d, { name: 'سعد القاسم', age: '10', packageId: 'sub' });
  const rows = subRows(r);
  assert.equal(rows[0], undefined, 'المقفلة ما تمسّه');
  assert.equal(rows[1].amount, 300 - Math.floor(300 / 10) * 9, 'أوّل أيامه يحمل الفاضل');
  assert.equal(rows[1].sub.span, 10);
  assert.equal(rows[1].sub.total, 300);
});

test('وباقةٌ بلا مدّة مكتوبة تمشي على ما بقي من موسمها', () => {
  const d = withSubscription();
  const v = publicView(d, d.programs[0]);
  assert.equal(v.packages.find((p) => p.id === 'sub').days, 5, 'خمس جمع مفتوحة');
});

test('shareAt: الفاضل على أوّل يوم، وما بعد المدّة صفر', () => {
  assert.equal(shareAt(300, 7, 0), 48, '42 وفاضل 6');
  assert.equal(shareAt(300, 7, 1), 42);
  assert.equal(shareAt(300, 7, 7), 0, 'خارج المدّة');
  assert.equal([0, 1, 2, 3, 4, 5, 6].reduce((s, i) => s + shareAt(300, 7, i), 0), 300);
});

/* ------------------- الجمعة الجديدة تجرّ مشتركي الموسم ------------------- */

const subWeeks = (used, span = 10) => [{
  id: 'w1',
  participants: [
    ...Array.from({ length: used }, (_, i) => ({
      id: `p${i}`, name: 'سعد القاسم', ref: 'FA-1448-0001', accountId: 'rajhi',
      amount: shareAt(300, span, i), attendance: 'حاضر', arrivedAt: 5, packageName: 'الموسم كامل',
      sub: { id: 's1', packId: 'sub', total: 300, span, i },
    })),
    { id: 'x', name: 'ماجد', amount: 50, attendance: 'حاضر' },
  ],
}];

test('من لم يستوفِ مدّته ينزل في الجمعة الجديدة بنصيبها', () => {
  let n = 0;
  const seats = subsFor(subWeeks(3), () => `n${++n}`);
  assert.equal(seats.length, 1, 'المشترك وحده — واليومي ما يُجرّ');
  assert.equal(seats[0].name, 'سعد القاسم');
  assert.equal(seats[0].amount, 30, 'اليوم الرابع من عشرة');
  assert.equal(seats[0].sub.i, 3);
  assert.equal(seats[0].attendance, 'معلق', 'الحضور يُسجَّل في يومه');
  assert.equal(seats[0].arrivedAt, undefined);
  assert.equal(seats[0].ref, 'FA-1448-0001', 'ونفس الإيصال');
});

test('ومن استوفاها ما ينزل', () => {
  assert.equal(subsFor(subWeeks(10), () => 'n1').length, 0);
  assert.equal(subsFor(subWeeks(11), () => 'n1').length, 0, 'ولا يتجاوزها');
});

test('ولا يُجرّ من ليس له اشتراك', () => {
  assert.deepEqual(subsFor([{ id: 'w1', participants: [{ id: 'x', name: 'ماجد', amount: 50 }] }], () => 'n1'), []);
});


console.log(`\n${passed} اختبار نجح.`);

test('اسم خيار «يومي» يكتبه صاحب البرنامج', () => {
  const d = withSubscription();
  d.programs[0].signup.allowPerDay = true;
  d.programs[0].signup.texts = { perDayName: 'الجمعة ٥ ربيع' };
  const v = publicView(d, d.programs[0]);
  assert.equal(v.packages.find((p) => p.perDay).name, 'الجمعة ٥ ربيع');
});

test('والفاضي يرجع «يومي» — خيارٌ بلا اسمٍ ما يُختار', () => {
  const d = withSubscription();
  d.programs[0].signup.allowPerDay = true;
  d.programs[0].signup.texts = { perDayName: '   ' };
  const v = publicView(d, d.programs[0]);
  assert.equal(v.packages.find((p) => p.perDay).name, 'يومي');
});

test('كلمة الخانة الناقصة يكتبها صاحب البرنامج', () => {
  const d = baseData();
  d.programs[0].signup.texts = { required: 'لازم تعبّيها' };
  const v = publicView(d, d.programs[0]);
  const r = validateSubmission(v, { ...goodBody, answers: { ...goodBody.answers, gPhone: '' } });
  assert.equal(r.errors.gPhone, 'لازم تعبّيها');
});

test('وما تُمحى: الفاضي يرجع «مطلوب» فما يرفض النموذجُ بصمت', () => {
  const d = baseData();
  d.programs[0].signup.texts = { required: '   ' };
  const v = publicView(d, d.programs[0]);
  const r = validateSubmission(v, { ...goodBody, answers: { ...goodBody.answers, gPhone: '' } });
  assert.equal(r.errors.gPhone, 'مطلوب', 'الحُمرة وقفزة الصفحة معلّقتان على وجود رسالة');
  assert.equal(r.ok, false);
});

test('ورسائل الغلط تبقى كما هي — تصف خطأً لا فراغًا', () => {
  const d = baseData();
  d.programs[0].signup.texts = { required: 'لازم تعبّيها' };
  const v = publicView(d, d.programs[0]);
  const r = validateSubmission(v, { ...goodBody, answers: { ...goodBody.answers, gPhone: '05512' } });
  assert.equal(r.errors.gPhone, 'رقم جوال غير صحيح');
});
