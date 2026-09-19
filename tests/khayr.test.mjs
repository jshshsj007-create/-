/**
 * خيركم: الحصيلة والمتراكم.
 * المتراكم رقم يُقال للطالب ولوليّ أمره، فالغلط فيه ظلم — يُقفل باختبار.
 */
import assert from 'node:assert/strict';
import {
  SURAHS, PARTS, rangeText, carryAfter, studentTotals, allTotals,
  studentSessions, studentOfUser, emptyWird, khayrRows, khayrReportText,
  memorizedPages, memRangeText, lastStop, lastStopExtra, stopsExtraOf,
  sessionRows, sessionTotals, sessionReportText, seasonBrief,
  khayrSessionSections, khayrSeasonSections,
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

/* ------------------------ الجهة الثانية ------------------------ */

test('المحفوظ من جهتين يُجمع، والمدى يُقال كاملًا', () => {
  const st = { mem: { from: 'النساء', to: 'هود', amount: 12, unit: 'parts',
    extra: { from: 'الملك', to: 'الناس', amount: 2, unit: 'parts' } } };
  assert.equal(memorizedPages(st), 280, '١٤ جزءًا = ٢٨٠ وجهًا');
  assert.equal(memRangeText(st), 'من النساء إلى هود · ومن الملك إلى الناس');
});

test('ومن يحفظ من جهةٍ واحدة ما يتغيّر عليه شيء', () => {
  const st = { mem: { from: 'النساء', to: 'هود', amount: 12, unit: 'parts' } };
  assert.equal(memorizedPages(st), 240);
  assert.equal(memRangeText(st), 'من النساء إلى هود');
  assert.equal(memorizedPages({}), 0);
});

test('وموضعا المراجعة يُحفظان، فلا تُكتب الثانية كل جلسة', () => {
  const st = { id: 's1' };
  const sessions = [
    { id: 'a', date: '1448/01/01', entries: { s1: { present: true,
      review: { to: 'الحديد', toAya: 12, extra: { to: 'الملك', toAya: 8 } } } } },
  ];
  assert.deepEqual(lastStop(st, sessions, 'review'), { from: 'الحديد', fromAya: 12 });
  assert.deepEqual(lastStopExtra(st, sessions, 'review'), { from: 'الملك', fromAya: 8 });
  assert.deepEqual(stopsExtraOf(st, sessions).review, { from: 'الملك', fromAya: 8 });
});

test('ومن ما له جهةٌ ثانية ما يُفتح له موضعٌ ثانٍ', () => {
  const st = { id: 's1' };
  const sessions = [{ id: 'a', date: '1448/01/01', entries: { s1: { present: true, review: { to: 'الحديد' } } } }];
  assert.equal(lastStopExtra(st, sessions, 'review'), null);
});

/* ------------------------ تقرير الجلسة ------------------------ */

const sStudents = [
  { id: 's1', name: 'سعد' }, { id: 's2', name: 'فهد' }, { id: 's3', name: 'تركي' },
];
const oneSession = { id: 'x', date: '1448/04/03', entries: {
  s1: { present: true, review: { from: 'الناس', to: 'النبأ', pages: 20 }, tathbit: { pages: 4 }, hifz: { pages: 2 }, note: 'ممتاز' },
  s2: { present: false, due: 3 },
} };

test('صفوف الجلسة تفرّق بين الغائب ومن لم يُسجَّل بعد', () => {
  const rows = sessionRows(sStudents, oneSession);
  assert.equal(rows[0].present, true);
  assert.equal(rows[1].present, false);
  assert.equal(rows[2].written, false, 'تركي ما سُجّل — وهذا غير الغياب');
  assert.equal(rows[2].present, null);
});

test('ومجاميعها تُحسب ممّن سُجّل وحده', () => {
  const t = sessionTotals(sessionRows(sStudents, oneSession));
  assert.deepEqual(t, { attended: 1, absent: 1, review: 20, tathbit: 4, hifz: 2 });
});

test('ونصُّها يُقرأ في واتساب: اسمٌ وسطورُه', () => {
  const txt = sessionReportText(sessionRows(sStudents, oneSession), { title: 'جلسة خيركم', date: '1448/04/03' });
  assert.ok(txt.startsWith('جلسة خيركم'));
  assert.ok(txt.includes('الحضور: 1 من 2'));
  assert.ok(txt.includes('من الناس إلى النبأ'));
  assert.ok(txt.includes('فهد — غائب'));
  assert.ok(txt.includes('عليه 3 أوجه'));
  assert.ok(txt.includes('تركي — ما سُجّل'));
  assert.ok(txt.includes('ملاحظة: ممتاز'));
});

/* ------------------------ تقرير الموسم ------------------------ */

const seasonRows = [
  { student: { name: 'سعد' }, attended: 4, absent: 1, review: 60, tathbit: 8, hifz: 6, carry: 0 },
  { student: { name: 'فهد' }, attended: 3, absent: 2, review: 20, tathbit: 4, hifz: 2, carry: 3 },
];

test('المختصر: أعدادٌ ونسبة، وأسماءٌ في موضعين يستحقّانها', () => {
  const b = seasonBrief(seasonRows, 5);
  assert.equal(b.percent, 70);
  assert.equal(b.hifz, 8);
  assert.deepEqual(b.top.map((x) => x.name), ['سعد', 'فهد']);
  assert.deepEqual(b.owing.map((x) => x.name), ['فهد'], 'ومن عليه متراكم وحده');
});

test('وأقسام الورقة: المختصر بلا قائمة الطلاب، والكامل بها', () => {
  const brief = khayrSeasonSections(seasonRows, { sessions: 5, brief: true });
  const full = khayrSeasonSections(seasonRows, { sessions: 5, brief: false });
  assert.ok(!brief.some((s) => s.title === 'الطلاب'));
  assert.ok(full.some((s) => s.title === 'الطلاب'));
  assert.equal(full.at(-1).lines.length, 2);
  assert.ok(full.at(-1).lines[1].includes('متراكم'));
});

test('وورقةُ الجلسة فيها الحضور وما سُمِّع والمجموع', () => {
  const secs = khayrSessionSections(sessionRows(sStudents, oneSession));
  assert.deepEqual(secs.map((s) => s.title), ['الحضور', 'ما سُمِّع', 'المجموع']);
  assert.ok(secs[1].lines.some((l) => l.includes('تركي — ما سُجّل')));
});

console.log(`\n✅ ${passed} اختبارًا لخيركم\n`);
