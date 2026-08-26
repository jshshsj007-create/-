/**
 * خيركم: الحصيلة والمتراكم.
 * المتراكم رقم يُقال للطالب ولوليّ أمره، فالغلط فيه ظلم — يُقفل باختبار.
 */
import assert from 'node:assert/strict';
import {
  SURAHS, PARTS, rangeText, carryAfter, studentTotals, allTotals,
  studentSessions, studentOfUser, emptyWird, khayrRows, khayrReportText,
} from '../src/khayr.js';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('  ✓ ' + name); };

test('السور ١١٤ بترتيب المصحف', () => {
  assert.equal(SURAHS.length, 114);
  assert.equal(SURAHS[0], 'الفاتحة');
  assert.equal(SURAHS[113], 'الناس');
  assert.equal(SURAHS[55], 'الواقعة');
  assert.equal(new Set(SURAHS).size, 114, 'فيه اسم مكرر');
});

test('الأقسام ثلاثة، والحفظ آخرها', () => {
  assert.deepEqual(PARTS.map((p) => p.id), ['review', 'tathbit', 'hifz']);
});

/* ------------------------------- المدى ------------------------------- */

test('المدى يُكتب كلامًا', () => {
  assert.equal(rangeText({ from: 'الناس', to: 'النبأ' }), 'من الناس إلى النبأ');
  assert.equal(rangeText({ from: 'المرسلات', to: 'الواقعة', toAya: 40 }), 'من المرسلات إلى الواقعة 40');
  assert.equal(rangeText({ from: 'الحديد', fromAya: 13, to: 'المجادلة' }), 'من الحديد 13 إلى المجادلة');
});

test('بلا سور: ما فيه نص', () => {
  assert.equal(rangeText({}), '');
  assert.equal(rangeText(null), '');
  assert.equal(rangeText({ fromAya: 5 }), '', 'آية بلا سورة ما تعني شيئًا');
});

test('الآية صفر أو فاضية ما تُذكر', () => {
  assert.equal(rangeText({ from: 'الناس', fromAya: 0, to: 'النبأ', toAya: '' }), 'من الناس إلى النبأ');
});

/* ------------------------------ المتراكم ------------------------------ */

test('حاضر وقصّر: يتراكم الفرق', () => {
  assert.equal(carryAfter(0, { present: true, hifz: { pages: 2 } }, 3), 1);
  assert.equal(carryAfter(3, { present: true, hifz: { pages: 2 } }, 3), 4, 'يضاف لرصيده السابق');
});

test('حاضر وسمّع ورده: ما يتغيّر', () => {
  assert.equal(carryAfter(4, { present: true, hifz: { pages: 3 } }, 3), 4);
});

test('سمّع أكثر: يعوّض من رصيده', () => {
  assert.equal(carryAfter(4, { present: true, hifz: { pages: 5 } }, 3), 2);
});

test('ما ينزل تحت صفر مهما سبق ورده', () => {
  assert.equal(carryAfter(1, { present: true, hifz: { pages: 20 } }, 3), 0);
  assert.equal(carryAfter(0, { present: true, hifz: { pages: 9 } }, 3), 0);
});

test('غائب: الشيخ يكتب العدد — والتطبيق ما يقرّر عنه', () => {
  assert.equal(carryAfter(2, { present: false, due: 3 }, 3), 5, 'حمّله ورده');
  assert.equal(carryAfter(2, { present: false, due: 0 }, 3), 2, 'معذور، فما تحمّل شيئًا');
  assert.equal(carryAfter(2, { present: false }, 3), 2, 'ما كتب شيئًا = ما تحمّل');
});

test('الجلسة اللي ما فيها تسجيل ما تغيّر شيئًا', () => {
  assert.equal(carryAfter(3, null, 3), 3);
});

/* ------------------------------ الحصيلة ------------------------------ */

const saad = { id: 's1', name: 'سعد المطيري', wird: { review: 20, tathbit: 10, hifz: 3 } };
const khalid = { id: 's2', name: 'خالد العتيبي', wird: { review: 10, tathbit: 0, hifz: 2 } };

const sessions = [
  { id: 'a', date: '1448-03-06', entries: {
    s1: { present: true, review: { from: 'الناس', to: 'عبس', pages: 16 }, hifz: { from: 'المجادلة', pages: 1 } },
    s2: { present: true, hifz: { pages: 2 } },
  } },
  { id: 'b', date: '1448-03-13', entries: {
    s1: { present: true, review: { pages: 20 }, tathbit: { pages: 10 }, hifz: { pages: 2 }, note: 'أتقن' },
  } },
  { id: 'c', date: '1448-03-27', entries: {
    s1: { present: false, due: 3, note: 'سفر' },
    s2: { present: false, due: 0 },
  } },
];

test('يجمع الحضور والأوجه', () => {
  const t = studentTotals(saad, sessions);
  assert.equal(t.attended, 2);
  assert.equal(t.absent, 1);
  assert.equal(t.review, 36);
  assert.equal(t.tathbit, 10);
  assert.equal(t.hifz, 3);
});

test('والمتراكم يتراكم بترتيب التواريخ', () => {
  // ٦/٣: ٣−١=٢ · ١٣/٣: ٣−٢=١ (المجموع ٣) · ٢٧/٣ غائب +٣ = ٦
  assert.equal(studentTotals(saad, sessions).carry, 6);
});

test('الترتيب بالتاريخ لا بترتيب الإدخال', () => {
  const shuffled = [sessions[2], sessions[0], sessions[1]];
  assert.equal(studentTotals(saad, shuffled).carry, 6);
});

test('كل طالب بورده هو', () => {
  const t = studentTotals(khalid, sessions);
  assert.equal(t.attended, 1);
  assert.equal(t.hifz, 2);
  assert.equal(t.carry, 0, 'ورده وجهان وسمّع وجهين، وغيابه بلا تحميل');
});

test('اللي ما سُجّل له شي: أصفار بلا انهيار', () => {
  const ghost = { id: 'zz', name: 'ما سجّل', wird: emptyWird() };
  assert.deepEqual(studentTotals(ghost, sessions),
    { attended: 0, absent: 0, carry: 0, review: 0, tathbit: 0, hifz: 0 });
});

test('حصيلة الجميع صف لكل طالب', () => {
  const rows = allTotals([saad, khalid], sessions);
  assert.deepEqual(rows.map((r) => r.student.name), ['سعد المطيري', 'خالد العتيبي']);
  assert.equal(rows[0].carry, 6);
});

test('صفوف التقرير: الأوجه من الموسم، والمتراكم من العمر كله', () => {
  const thisTerm = [sessions[2]];                 // جلسة الغياب وحدها
  const rows = khayrRows([saad], thisTerm, sessions);
  assert.equal(rows[0].attended, 0, 'ما حضر في هذا الموسم');
  assert.equal(rows[0].review, 0);
  assert.equal(rows[0].carry, 6, 'دَينه ما تصفّر بانتهاء الترم');
});

test('التقرير نص يُقرأ في واتساب', () => {
  const text = khayrReportText(khayrRows([khalid], sessions, sessions), 'خيركم — الترم الأول');
  assert.match(text, /^خيركم — الترم الأول/);
  assert.match(text, /خالد العتيبي/);
  assert.match(text, /المتراكم: 0/);
});

/* -------------------------------- السجل -------------------------------- */

test('سجل الطالب من الأحدث للأقدم، وجلساته وحده', () => {
  const list = studentSessions(khalid, sessions);
  assert.deepEqual(list.map((x) => x.session.id), ['c', 'a'], 'ما فيه جلسة ما حضرها أصلًا');
  assert.equal(list[0].entry.present, false);
});

test('الطالب المربوط بحساب', () => {
  const students = [{ id: 's1', name: 'سعد' }, { id: 's2', name: 'محمد', userId: 'u9' }];
  assert.equal(studentOfUser(students, 'u9').name, 'محمد');
  assert.equal(studentOfUser(students, 'u1'), null);
  assert.equal(studentOfUser(students, undefined), null, 'حساب بلا معرّف ما يربط بأحد');
});

console.log(`\n✅ ${passed} اختبارًا لخيركم\n`);
