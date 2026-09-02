/**
 * الإيصال ووجهة التواصل وصفحة التسجيل.
 *
 * الرقم هو الأصل هنا: ورقةٌ تُعطى ولي أمرٍ ويرجع بها بعد شهرين، فإن لم يكن
 * رقمها محفوظًا عند الطرفين ومتفرّدًا فما هي إيصالًا. ولذلك أكثر ما يُختبر
 * الترقيم: أنه يُحفظ، ولا يتكرّر، ولا يبني على تكرارٍ وقع.
 */
import assert from 'node:assert/strict';
import { nextRef, refPrefix, yearOf, receiptRows, recOn, defaultReceipt, REC_FIELDS } from '../src/receipt.js';
import { waGroupLink, contactUrl, parseChip, chipsOf, factsOf, publicView, applySubmission, normalizeSubmission } from '../src/signup.js';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('  ✓ ' + name); };

/* ------------------------------- الترقيم ------------------------------- */

const withParts = (...refs) => ({
  programs: [{
    id: 'p1', termKey: '1448-الترم الأول',
    participants: refs.map((r, i) => ({ id: 'x' + i, ref: r })),
    weeks: [],
  }],
});

test('أول رقم في السنة واحد', () => {
  assert.equal(nextRef({ programs: [] }, '1448'), 'FA-1448-0001');
});

test('والذي بعده يتلوه', () => {
  assert.equal(nextRef(withParts('FA-1448-0001'), '1448'), 'FA-1448-0002');
});

test('ويُشتقّ من الأكبر لا من العدد — فالحذف ما يعيد رقمًا استُعمل', () => {
  // حُذف الثاني والثالث؛ لو عددنا الصفوف لأعطينا 0002 وهو مطبوعٌ عند أحدهم
  assert.equal(nextRef(withParts('FA-1448-0001', 'FA-1448-0009'), '1448'), 'FA-1448-0010');
});

test('ولو تكرّر رقمٌ يومًا، تجاوزه ما بعده ولا يبني عليه', () => {
  assert.equal(nextRef(withParts('FA-1448-0004', 'FA-1448-0004'), '1448'), 'FA-1448-0005');
});

test('وكل سنة تبدأ من جديد', () => {
  const d = withParts('FA-1448-0031');
  assert.equal(nextRef(d, '1449'), 'FA-1449-0001', 'ما ورث رقم السنة الماضية');
  assert.equal(nextRef(d, '1448'), 'FA-1448-0032');
});

test('ويقرأ المشتركين داخل الأسابيع كما يقرأ الذين على البرنامج', () => {
  const d = {
    programs: [{
      id: 'p1', participants: [{ id: 'a', ref: 'FA-1448-0002' }],
      weeks: [{ id: 'w1', participants: [{ id: 'b', ref: 'FA-1448-0007' }] }],
    }],
  };
  assert.equal(nextRef(d, '1448'), 'FA-1448-0008', 'وإلا أعاد رقمًا في يد أحدهم');
});

test('وما يخلط بين الأرقام وما ليس رقمًا', () => {
  assert.equal(nextRef(withParts('FA-1448-قديم', '', null, 'FA-1448-0003'), '1448'), 'FA-1448-0004');
});

test('والسنة تُقرأ من مفتاح الموسم', () => {
  assert.equal(yearOf('1448-الترم الأول'), '1448');
  assert.equal(yearOf('1449'), '1449');
  assert.equal(yearOf(''), '');
  assert.equal(refPrefix(''), 'FA-0000-');
});

/* --------------------- الرقم يُختم على التسجيل --------------------- */

const base = () => ({
  guardians: [], students: [], faidAccounts: [], signupFields: [],
  programs: [{
    id: 'p1', name: 'جمعة الرواد', type: 'منفصل', termKey: '1448-الترم الأول',
    weeks: [{ id: 'w1', name: 'الأول' }, { id: 'w2', name: 'الثاني' }],
    signup: { openWeeks: ['w1', 'w2'], price: 70 },
  }],
});
const submit = (data, kids) => {
  const prog = data.programs[0];
  const view = publicView(data, prog);
  let n = 0;
  return applySubmission(data, prog, view, {
    answers: { gName: 'سعد', gPhone: '0551234567' }, kids,
  }, { newId: () => 'id' + (++n), now: 1 });
};

test('التسجيل ينزل ومعه رقمه — فيلقاه صاحب التطبيق كما رآه ولي الأمر', () => {
  const r = submit(base(), [{ name: 'محمد سعد', days: ['w1', 'w2'] }]);
  assert.deepEqual(r.refs, ['FA-1448-0001']);
  const rows = r.data.programs[0].weeks.flatMap((w) => w.participants || []);
  assert.equal(rows.length, 2, 'أسبوعان فصفّان');
  assert.ok(rows.every((x) => x.ref === 'FA-1448-0001'), 'والصفّان تحت رقمٍ واحد');
});

test('ولكل ابنٍ رقمه — لأن التأكيد يمشي على المشترك لا على العائلة', () => {
  const r = submit(base(), [
    { name: 'محمد سعد', days: ['w1'] },
    { name: 'عبدالله سعد', days: ['w1'] },
  ]);
  assert.deepEqual(r.refs, ['FA-1448-0001', 'FA-1448-0002']);
});

test('والتسجيل الثاني يكمل ولا يعيد', () => {
  const one = submit(base(), [{ name: 'محمد سعد', days: ['w1'] }]);
  const two = submit(one.data, [{ name: 'خالد فهد', days: ['w1'] }]);
  assert.deepEqual(two.refs, ['FA-1448-0002']);
});

/* -------------------------------- الحقول -------------------------------- */

const info = {
  ref: 'FA-1448-0001', date: '١٣ / ٠١ / ١٤٤٨ هـ', student: 'محمد سعد',
  guardian: 'سعد القاسم', phone: '0551234567', program: 'جمعة الرواد',
  days: 'الأول، الثاني', place: 'جامع الأمير سلطان',
};

test('الحقول المطفأة ما تنزل الورقة', () => {
  const rec = { fields: { guardian: false, gPhone: false, place: false } };
  const ids = receiptRows(rec, info).map((r) => r.id);
  assert.ok(!ids.includes('guardian'));
  assert.ok(!ids.includes('gPhone'));
  assert.ok(!ids.includes('place'));
  assert.ok(ids.includes('student'), 'وما بقي على حاله');
});

test('والثلاثة المقفولة ما تنشال ولو أُطفئت', () => {
  const rec = { fields: { ref: false, date: false, amount: false } };
  const ids = receiptRows(rec, info).map((r) => r.id);
  assert.ok(ids.includes('ref'), 'ورقةٌ بلا رقم ما هي إيصالًا');
  assert.ok(ids.includes('date'));
});

test('والحقل الفاضي ما يترك سطرًا فاضيًا', () => {
  const rows = receiptRows(defaultReceipt(), { ...info, place: '', guardian: '  ' });
  assert.ok(!rows.some((r) => r.id === 'place'));
  assert.ok(!rows.some((r) => r.id === 'guardian'));
});

test('والحقل الذي ما ذُكر في الإعدادات يظهر — الجديد ما يُطفأ على أحد', () => {
  assert.equal(recOn({ fields: {} }, 'place'), true);
  assert.equal(recOn(undefined, 'student'), true);
  assert.equal(recOn({ fields: { place: false } }, 'place'), false);
  // وكل ما في القائمة له اسم يُعرض
  REC_FIELDS.forEach(([id, label]) => { assert.ok(id && label); });
});

test('وترتيب الصفوف ثابت: الرقم فالتاريخ ثم الطالب', () => {
  const ids = receiptRows(defaultReceipt(), info).map((r) => r.id);
  assert.deepEqual(ids.slice(0, 3), ['ref', 'date', 'student']);
});

/* --------------------------- وجهة زر التواصل --------------------------- */

test('رابط المجموعة يُقبل بالبادئة وبدونها', () => {
  assert.equal(waGroupLink('https://chat.whatsapp.com/AbC123'), 'https://chat.whatsapp.com/AbC123');
  assert.equal(waGroupLink('chat.whatsapp.com/AbC123'), 'https://chat.whatsapp.com/AbC123');
  assert.equal(waGroupLink('wa.me/966551234567'), 'https://wa.me/966551234567');
});

test('وما ليس واتساب يُرَدّ — الزر أخضر وعليه علامته', () => {
  assert.equal(waGroupLink('https://x.com/faydh'), '');
  assert.equal(waGroupLink('javascript:alert(1)'), '');
  assert.equal(waGroupLink('chat.whatsapp.com'), '', 'بلا رمز الدعوة ما هو رابط مجموعة');
  assert.equal(waGroupLink(''), '');
});

test('الوجهة الافتراضية رقم الفريق', () => {
  const d = { waNumber: '0551234567' };
  assert.equal(contactUrl(d, { signup: {} }), 'https://wa.me/966551234567');
});

test('والمجموعة تغلب عليه لمّا تُختار', () => {
  const d = { waNumber: '0551234567' };
  const p = { signup: { contact: { mode: 'group', link: 'chat.whatsapp.com/xyz' } } };
  assert.equal(contactUrl(d, p), 'https://chat.whatsapp.com/xyz');
});

test('والرابط الساقط يرجع للرقم — فما يبقى الزر ميتًا', () => {
  const d = { waNumber: '0551234567' };
  const p = { signup: { contact: { mode: 'group', link: 'موقعنا' } } };
  assert.equal(contactUrl(d, p), 'https://wa.me/966551234567');
});

test('وكل برنامج ووجهته', () => {
  const d = { waNumber: '0551234567' };
  const a = { signup: { contact: { mode: 'group', link: 'chat.whatsapp.com/aaa' } } };
  const b = { signup: { contact: { mode: 'number' } } };
  assert.equal(contactUrl(d, a), 'https://chat.whatsapp.com/aaa');
  assert.equal(contactUrl(d, b), 'https://wa.me/966551234567');
});

/* ---------------------------- صفحة التسجيل ---------------------------- */

test('الإيموجي في أول السطر يصير أيقونة الشارة', () => {
  assert.deepEqual(parseChip('⚽ بطولة كرة قدم'), { icon: '⚽', text: 'بطولة كرة قدم' });
  assert.deepEqual(parseChip('🏅ميداليات'), { icon: '🏅', text: 'ميداليات' });
});

test('وبلا إيموجي تنزل الشارة بلا أيقونة — ولا نخمّن له واحدة', () => {
  assert.deepEqual(parseChip('تعليم وضوء'), { icon: '', text: 'تعليم وضوء' });
});

test('والأسطر الفاضية تنشال فما تنزل شارة بيضاء', () => {
  const chips = chipsOf('⚽ كرة\n\n   \n🎈 لعبة هوائية');
  assert.equal(chips.length, 2);
  assert.deepEqual(chips.map((c) => c.text), ['كرة', 'لعبة هوائية']);
  assert.deepEqual(chipsOf(''), []);
});

test('والحقائق الفاضية تُطوى فما يبقى لها موضع', () => {
  assert.deepEqual(factsOf({ facts: { day: 'الجمعة', time: '', age: '٧ — ١٤' } }).map((f) => f.id), ['day', 'age']);
  assert.deepEqual(factsOf({}), []);
});

test('وكلها تنزل في صفحة ولي الأمر', () => {
  const d = base();
  d.programs[0].signup = {
    ...d.programs[0].signup,
    facts: { day: 'الجمعة', time: '٤ — ٨ م', age: '٧ — ١٤' },
    details: '⚽ كرة قدم\n🫧 ملعب صابوني',
    trust: 'طاقم سعودي',
  };
  const v = publicView(d, d.programs[0]);
  assert.equal(v.facts.length, 3);
  assert.equal(v.chips.length, 2);
  assert.equal(v.chips[0].icon, '⚽');
  assert.equal(v.trust, 'طاقم سعودي');
  assert.equal(v.wa.contactUrl, '', 'بلا رقم ولا مجموعة ما فيه وجهة');
});

/* --------------------------- من يختار الأيام --------------------------- */

const daysView = (mode, weeks = ['w1', 'w2']) => {
  const d = base();
  d.programs[0].signup = { ...d.programs[0].signup, daysMode: mode, openWeeks: weeks };
  return publicView(d, d.programs[0]);
};

test('الأصل أن يختار ولي الأمر — فالبرامج القائمة ما تتغيّر', () => {
  assert.equal(daysView(undefined).pickDays, true);
  assert.equal(daysView('parent').pickDays, true);
});

test('و«أنا أحدّدها» تُخفي القسم عنه', () => {
  assert.equal(daysView('fixed').pickDays, false);
});

test('والمُباع باقاتٍ يبقى الاختيار فيه — الباقة نفسها اختيار أيام', () => {
  const d = base();
  d.programs[0].type = 'مجمع';
  d.programs[0].signup = {
    ...d.programs[0].signup, daysMode: 'fixed',
    packages: [{ id: 'k1', name: 'المدة كاملة', price: 200, dayCount: 0 }],
  };
  assert.equal(publicView(d, d.programs[0]).pickDays, true);
});

test('واليوم الواحد ما يُسأل عنه — سؤالٌ جوابه واحد', () => {
  assert.equal(daysView('parent', ['w1']).pickDays, false);
  assert.equal(daysView(undefined, ['w1']).pickDays, false);
  // ويُكتب له مع ذلك، فلا ينزل بلا أيام
  const v = daysView('parent', ['w1']);
  const out = normalizeSubmission(v, { kids: [{ name: 'محمد' }] });
  assert.deepEqual(out.kids[0].days, ['w1']);
});

test('وباقة المدة الكاملة ما فيها ما يُختار، فتُخفى مع «أنا أحدّدها»', () => {
  const d = base();
  d.programs[0].signup = {
    ...d.programs[0].signup, daysMode: 'fixed', price: 0, allowPerDay: false,
    packages: [{ id: 'k1', name: 'المدة كاملة', price: 200, dayCount: 0 }],
  };
  assert.equal(publicView(d, d.programs[0]).pickDays, false);
});

test('والباقة بعددٍ أقل تُبطل الإخفاء — عددها هو الاختيار', () => {
  const d = base();
  d.programs[0].signup = {
    ...d.programs[0].signup, daysMode: 'fixed', price: 0, allowPerDay: false,
    packages: [{ id: 'k2', name: 'أسبوع واحد', price: 90, dayCount: 1 }],
  };
  assert.equal(publicView(d, d.programs[0]).pickDays, true);
});

test('وأيامه تُكتب له كما فتحها صاحب البرنامج', () => {
  const v = daysView('fixed');
  const out = normalizeSubmission(v, { kids: [{ name: 'محمد' }, { name: 'خالد' }] });
  assert.deepEqual(out.kids.map((k) => k.days), [['w1', 'w2'], ['w1', 'w2']]);
});

test('وما أرسله من أيام يُطرح — ما عُرضت عليه فما هي رأيه', () => {
  // ولو تلاعب أحدٌ بالطلب واختار يومًا واحدًا ليدفع أقلّ
  const v = daysView('fixed');
  const out = normalizeSubmission(v, { kids: [{ name: 'محمد', days: ['w1'] }] });
  assert.deepEqual(out.kids[0].days, ['w1', 'w2']);
});

test('ولمّا يكون الاختيار له، يمرّ ما اختاره كما هو', () => {
  const v = daysView('parent');
  const body = { kids: [{ name: 'محمد', days: ['w1'] }] };
  assert.equal(normalizeSubmission(v, body), body, 'ما نلمس الطلب أصلًا');
});

test('والمبلغ يُحسب على الأيام المكتوبة لا على فراغ', () => {
  const d = base();
  d.programs[0].signup = { ...d.programs[0].signup, daysMode: 'fixed' };
  const prog = d.programs[0];
  const view = publicView(d, prog);
  let n = 0;
  const r = applySubmission(d, prog, view,
    normalizeSubmission(view, { answers: { gName: 'سعد', gPhone: '0551234567' }, kids: [{ name: 'محمد سعد' }] }),
    { newId: () => 'id' + (++n), now: 1 });
  const rows = r.data.programs[0].weeks.flatMap((w) => w.participants || []);
  assert.equal(rows.length, 2, 'نزل في الأسبوعين بلا ما يضغط شيئًا');
  assert.ok(rows.every((x) => x.amount === 70));
});

console.log(`\n✅ ${passed} اختبارًا للإيصال ووجهة التواصل وصفحة التسجيل\n`);
