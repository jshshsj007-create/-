/**
 * تقرير اليوم، والتنبيهات، والقيمي، ومن أقام ماذا.
 *
 * والذي يحرسه هذا الملف ثلاثة أشياء وقعت في الشرح مرارًا، فتُثبَّت هنا حتى
 * لا تُنقض بتعديلٍ عابر: أن الخانات الثلاث لا تُتجاوز، وأن المسابقة الواحدة
 * لا تُنسب لاثنين مرتين، وأن ورقة اليوم تحمل ملاحظات يومها لا ما تراكم.
 */
import assert from 'node:assert/strict';
import {
  defaultReportFields, reportFields, allReportFields, fieldValue,
  emptyReport, missingParts, reportReady, submitLabel, replyOf,
  reportOf, dayReports, mustReport, reportRoll, rollText,
  hijriKey, sameDate, dayNow, dateRank, owedDays,
  noteOn, notesOn, notesOfDay, noteNames,
  NOTICE_SPANS, noticeLive, hasRead, noticesFor, markRead, readTally,
  supervisorsOf, toggleSupervisor, supervisorNames, unassigned, SUPERVISOR_MAX,
  qiyamiMissing, qiyamiReady, qiyamiOfDay, videoEmbed,
  daySummary,
} from '../src/taqreer.js';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('  ✓ ' + name); };

/* ------------------------------ الخانات الثلاث ------------------------------ */

const fill = (v) => ({ ...emptyReport('u1', 'p1', 'w1'), values: v });

test('التقرير الفاضي ناقصٌ ثلاثًا، وتُسمّى له', () => {
  const r = emptyReport('u1', 'p1', 'w1');
  assert.deepEqual(missingParts(r), ['المسابقة', 'الدوري', 'الطلاب — ملاحظات سلوكية']);
  assert.equal(reportReady(r), false);
  assert.equal(submitLabel(r), 'اكتب الخانات الثلاث');
});

test('وما نقص منه واحدة يُقال له أيّها', () => {
  const r = fill({ comp: 'أقمنا الكنز', notes: 'لا يوجد' });
  assert.deepEqual(missingParts(r), ['الدوري']);
  assert.equal(submitLabel(r), 'ناقص: الدوري');
});

test('و«لا يوجد» جوابٌ يُقبل — المقصود أن يقول، لا أن يملأ', () => {
  const r = fill({ comp: 'لا يوجد', league: 'لا يوجد', notes: 'لا يوجد' });
  assert.equal(reportReady(r), true);
  assert.equal(submitLabel(r), 'أرسل تقرير اليوم');
});

test('والفراغ وحده لا يمرّ ولو كان مسافات', () => {
  const r = fill({ comp: '   ', league: '\n', notes: 'شيء' });
  assert.deepEqual(missingParts(r), ['المسابقة', 'الدوري']);
});

/* --------------------------- والخانات بيد المدير --------------------------- */

test('الافتراض ثلاثٌ إجبارية — فمن لم يغيّر لم يتغيّر عليه شيء', () => {
  assert.deepEqual(defaultReportFields().map((f) => f.id), ['comp', 'league', 'notes']);
  assert.ok(defaultReportFields().every((f) => f.required));
  assert.deepEqual(reportFields({}).map((f) => f.id), ['comp', 'league', 'notes']);
  assert.deepEqual(reportFields(null).map((f) => f.id), ['comp', 'league', 'notes']);
});

test('ويضيف خانةً ويحذف ويرتّب', () => {
  const data = { reportFields: [
    { id: 'x1', label: 'القيمي', required: true },
    { id: 'comp', label: 'المسابقة', required: true },
    { id: 'league', label: 'الدوري', required: true, hidden: true },
  ] };
  assert.deepEqual(reportFields(data).map((f) => f.label), ['القيمي', 'المسابقة']);
  const r = fill({ x1: 'برّ الوالدين' });
  assert.deepEqual(missingParts(r, reportFields(data)), ['المسابقة']);
});

test('والمحذوفة تبقى مطويّةً، فما كُتب فيها يُقرأ بعنوانه', () => {
  const data = { reportFields: [{ id: 'league', label: 'الدوري', required: true, hidden: true }] };
  assert.deepEqual(reportFields(data), []);
  assert.deepEqual(allReportFields(data).map((f) => f.label), ['الدوري']);
  assert.equal(fieldValue(fill({ league: 'فاز النسور' }), 'league'), 'فاز النسور');
});

test('والاختيارية لا تمنع الإرسال', () => {
  const fields = [
    { id: 'a', label: 'أ', required: true },
    { id: 'b', label: 'ب', required: false },
  ];
  const r = fill({ a: 'كتبت' });
  assert.deepEqual(missingParts(r, fields), []);
  assert.equal(reportReady(r, fields), true);
  assert.equal(submitLabel(r, fields), 'أرسل تقرير اليوم');
});

test('ونصّ الزرّ يتبع عدد الإجباري لا الثلاث', () => {
  const one = [{ id: 'a', label: 'أ', required: true }];
  const two = [{ id: 'a', label: 'أ', required: true }, { id: 'b', label: 'ب', required: true }];
  assert.equal(submitLabel(emptyReport('u', 'p', 'w'), one), 'اكتب الخانة');
  assert.equal(submitLabel(emptyReport('u', 'p', 'w'), two), 'اكتب خانتين');
});

test('وتقريرٌ كُتب قبل الخانات المتغيّرة يُقرأ من جذره، فلا يضيع حرف', () => {
  const old = { userId: 'u1', programId: 'p1', weekId: 'w1', comp: 'أ', league: 'ب', notes: 'ج', at: 5 };
  assert.equal(fieldValue(old, 'comp'), 'أ');
  assert.equal(reportReady(old), true);
  assert.deepEqual(missingParts(old), []);
});

/* ------------------------------- من لم يكتب ------------------------------- */

const users = [
  { id: 'a', name: 'المدير', role: 'مدير', status: 'نشط', permissions: [] },
  { id: 'b', name: 'عبدالله', role: 'مشرف برنامج', status: 'نشط', permissions: ['الأسابيع والحضور'] },
  { id: 'c', name: 'سعود', role: 'مسؤول النادي', status: 'نشط', permissions: ['النادي'] },
  { id: 'd', name: 'ماجد', role: 'معلّم خيركم', status: 'نشط', permissions: ['خيركم'] },
  { id: 'e', name: 'تركي', role: 'مشرف برنامج', status: 'غير نشط', permissions: ['الأسابيع والحضور'] },
  { id: 'f', name: 'نايف', role: 'مشرف برنامج', status: 'نشط', permissions: ['الأسابيع والحضور'], noReport: true },
];

test('المطالَب من يقف مع الأولاد — لا المدير ولا معلّم خيركم ولا المعطَّل', () => {
  const due = users.filter((u) => mustReport(u)).map((u) => u.id);
  assert.deepEqual(due, ['b', 'c']);
});

test('و«لا يُطالَب» مخرجٌ بيد المدير', () => {
  assert.equal(mustReport(users.find((u) => u.id === 'f')), false);
});

test('ومن قُيّد بأسابيع لا يُطالَب بيومٍ ليس له', () => {
  const sees = (u, pid, wid) => !(u.id === 'c' && wid === 'w1');
  const due = users.filter((u) => mustReport(u, sees, 'p1', 'w1')).map((u) => u.id);
  assert.deepEqual(due, ['b']);
});

test('حال اليوم: من كتب ومن لم يكتب، والناقص ما يُعدّ مكتوبًا', () => {
  const data = {
    users,
    dayReports: [
      { userId: 'b', programId: 'p1', weekId: 'w1', comp: 'أ', league: 'ب', notes: 'ج', at: 5 },
      { userId: 'c', programId: 'p1', weekId: 'w1', comp: 'أ', league: '', notes: '', at: 6 },
    ],
  };
  const roll = reportRoll(data, 'p1', 'w1');
  assert.deepEqual(roll.done.map((x) => x.user.id), ['b']);
  assert.deepEqual(roll.late.map((x) => x.user.id), ['c']);
  assert.equal(rollText(roll), '1 من 2');
});

test('وتُقاس التقارير بالخانات الحيّة لا بالمحذوفة', () => {
  // وقعت في الفحص: حُذفت خانة، فصار تقريرٌ كاملٌ يُعدّ ناقصًا
  const data = {
    users,
    reportFields: [
      { id: 'comp', label: 'المسابقة', required: true },
      { id: 'notes', label: 'الطلاب', required: true, hidden: true },
    ],
    dayReports: [{ userId: 'b', programId: 'p1', weekId: 'w1', values: { comp: 'أقمنا الكنز' }, at: 5 }],
  };
  const roll = reportRoll(data, 'p1', 'w1');
  assert.deepEqual(roll.done.map((x) => x.user.id), ['b']);
});

test('وتقرير يومٍ آخر ما يُحسب لهذا اليوم', () => {
  const data = { users, dayReports: [{ userId: 'b', programId: 'p1', weekId: 'w9', comp: 'أ', league: 'ب', notes: 'ج' }] };
  assert.equal(reportRoll(data, 'p1', 'w1').done.length, 0);
  assert.equal(reportOf(data, 'b', 'p1', 'w1'), null);
  assert.equal(dayReports(data, 'p1', 'w9').length, 1);
});

/* -------------------------------- يوم البرنامج -------------------------------- */

test('تاريخ اليوم يُكتب كما تُكتب تواريخ الأسابيع', () => {
  const key = hijriKey(Date.now());
  assert.match(key, /^\d{4}\/\d{2}\/\d{2}$/);
});

test('والمقارنة لا تنكسر على صفرٍ زائد ولا مسافة ولا «هـ»', () => {
  assert.equal(sameDate('1448/03/09', '1448/3/9'), true);
  assert.equal(sameDate(' 1448/03/09 ', '1448/03/09'), true);
  // وقعت عند صاحب التطبيق: يومٌ تاريخُه «1448/04/07هـ» ما طُلب عنه تقرير
  assert.equal(sameDate('1448/04/07هـ', '1448/04/07'), true);
  assert.equal(sameDate('1448/04/07 هـ', '1448/04/07'), true);
  assert.equal(sameDate('١٤٤٨/٠٤/٠٧', '1448/04/07'), true);
  assert.equal(sameDate('', '1448/03/09'), false);
  assert.equal(sameDate('1448/03/09', '1448/03/10'), false);
});

test('والترتيب كذلك: «هـ» في آخر التاريخ لا تُسقط اليوم', () => {
  assert.equal(dateRank('1448/04/07هـ'), dateRank('1448/04/07'));
  assert.equal(dateRank('١٤٤٨/٠٤/٠٧'), dateRank('1448/04/07'));
  assert.ok(dateRank('1448/04/07هـ') > 0);
});

test('واليوم المكتوب بـ«هـ» يُطالَب بتقريره', () => {
  const [y, m, d] = hijriKey(Date.now()).split('/');
  const programs = [{ id: 'p1', weeks: [{ id: 'w1', name: 'الأسبوع الثاني', date: `${y}/${m}/${d}هـ` }] }];
  const got = owedDays(programs, null, Date.now());
  assert.equal(got.length, 1);
  assert.equal(got[0].late, false);
});

test('يوم اليوم هو الأسبوع الذي تاريخه اليوم', () => {
  const today = hijriKey(Date.now());
  const programs = [{ id: 'p1', weeks: [{ id: 'w1', date: '1400/01/01' }, { id: 'w2', date: today }] }];
  assert.equal(dayNow(programs, null, Date.now())?.week.id, 'w2');
  assert.equal(dayNow([{ id: 'p1', weeks: [{ id: 'w1', date: '1400/01/01' }] }], null, Date.now()), null);
});

test('ومن لا يفتح ذاك الأسبوع ما يُفتح له يومه', () => {
  const today = hijriKey(Date.now());
  const programs = [{ id: 'p1', weeks: [{ id: 'w2', date: today }] }];
  assert.equal(dayNow(programs, () => false, Date.now()), null);
});

test('ترتيب التواريخ يُقارن ولا يُحسب', () => {
  assert.ok(dateRank('1448/03/19') > dateRank('1448/03/18'));
  assert.ok(dateRank('1448/01/01') > dateRank('1447/12/29'));
  assert.equal(dateRank(''), 0);
  assert.equal(dateRank('كلام'), 0);
});

test('يُطالَب بيوم اليوم وبما مضى، لا بما لم يجئ', () => {
  const today = hijriKey(Date.now());
  const programs = [{ id: 'p1', weeks: [
    { id: 'past', date: '1440/01/01' },
    { id: 'now', date: today },
    { id: 'soon', date: '1499/12/29' },
    { id: 'nodate', date: '' },
  ] }];
  const got = owedDays(programs, null, Date.now());
  assert.deepEqual(got.map((d) => d.week.id), ['now', 'past']);
  assert.equal(got[0].late, false);
  assert.equal(got[1].late, true);
});

test('وثلاثةٌ حدٌّ فلا يُفتح عليه موسمٌ كامل', () => {
  const weeks = Array.from({ length: 9 }, (_, i) => ({ id: 'w' + i, date: `1440/01/0${i + 1}` }));
  assert.equal(owedDays([{ id: 'p1', weeks }], null, Date.now()).length, 3);
  assert.equal(owedDays([{ id: 'p1', weeks }], null, Date.now(), { max: 5 }).length, 5);
});

/* ------------------------------ ملاحظات الطلاب ------------------------------ */

const noteData = {
  studentNotes: [
    { studentId: 's1', text: 'تأخّر', by: 'b', programId: 'p1', weekId: 'w1', at: 10 },
    { studentId: 's1', text: 'ساعد', by: 'c', programId: 'p1', weekId: 'w2', at: 20 },
    { studentId: 's2', text: 'ممتاز', by: 'b', programId: 'p1', weekId: 'w1', at: 12 },
    { studentId: 's1', text: 'ثانية', by: 'b', programId: 'p1', weekId: 'w1', at: 14 },
  ],
};
const students = [{ id: 's1', name: 'سعد' }, { id: 's2', name: 'فهد' }];

test('سجلّ الطالب يتراكم، والأحدث أولًا', () => {
  assert.deepEqual(notesOn(noteData, 's1').map((n) => n.at), [20, 14, 10]);
});

test('وورقة اليوم تحمل ملاحظات يومها وحده', () => {
  assert.deepEqual(notesOfDay(noteData, 'p1', 'w1').map((n) => n.at), [10, 12, 14]);
  assert.deepEqual(notesOfDay(noteData, 'p1', 'w2').map((n) => n.at), [20]);
});

test('فمن أخطأ في جمعةٍ لا يُعاد اسمه في ورقة التي بعدها', () => {
  assert.deepEqual(noteNames(noteData, 'p1', 'w1', students), ['سعد', 'فهد']);
  assert.deepEqual(noteNames(noteData, 'p1', 'w2', students), ['سعد']);
});

test('والاسم لا يتكرّر ولو تعدّدت ملاحظاته في اليوم', () => {
  const names = noteNames(noteData, 'p1', 'w1', students);
  assert.equal(names.filter((n) => n === 'سعد').length, 1);
});

test('والملاحظة تحمل من كتبها واسم صاحبها', () => {
  const n = noteOn('s1', '  تأخّر  ', 'b', {
    programId: 'p1', weekId: 'w1', at: 7, studentName: ' سعد ', byName: 'عبدالله',
  });
  assert.equal(n.text, 'تأخّر');
  assert.equal(n.by, 'b');
  assert.equal(n.byName, 'عبدالله');
  assert.equal(n.studentName, 'سعد');
  assert.equal(n.at, 7);
});

test('والاسم المكتوب فيها يكفي من لا يفتح قاعدة الطلاب', () => {
  const data = { studentNotes: [noteOn('s9', 'ملاحظة', 'b', { programId: 'p1', weekId: 'w1', studentName: 'راكان' })] };
  assert.deepEqual(noteNames(data, 'p1', 'w1', []), ['راكان']);
  assert.deepEqual(noteNames(data, 'p1', 'w1', [{ id: 's9', name: 'راكان القحطاني' }]), ['راكان القحطاني']);
});

/* -------------------------------- التنبيهات -------------------------------- */

const DAY = 86_400_000;
const notice = (over = {}) => ({ id: 'n1', text: 'تنبيه', to: '', at: 1_000_000, days: 3, reads: [], ...over });

test('التنبيه يموت بعد مدّته، و«لا ينتهي» لا يموت', () => {
  const n = notice();
  assert.equal(noticeLive(n, n.at + 2 * DAY), true);
  assert.equal(noticeLive(n, n.at + 4 * DAY), false);
  assert.equal(noticeLive(notice({ days: 0 }), n.at + 400 * DAY), true);
});

test('والمديرُ لا يُنبَّه بما كتبه هو', () => {
  const data = { notices: [notice({ id: 'mine', by: 'a', at: 100 })] };
  assert.deepEqual(noticesFor(data, 'a', 400), []);
  assert.deepEqual(noticesFor(data, users[0], 400), [], 'ولا يُنبَّه بغيره — هو كاتبُها لا قارئُها');
  assert.deepEqual(noticesFor(data, 'b', 400).map((n) => n.id), ['mine']);
});

test('وما ظهر لمن قرأه، ولا لمن لم يُوجَّه إليه', () => {
  const data = {
    notices: [
      notice({ id: 'all', at: 100 }),
      notice({ id: 'toB', to: 'b', at: 200 }),
      notice({ id: 'read', at: 300, reads: [{ userId: 'b', at: 310 }] }),
    ],
  };
  assert.deepEqual(noticesFor(data, 'b', 400).map((n) => n.id), ['all', 'toB']);
  assert.deepEqual(noticesFor(data, 'c', 400).map((n) => n.id), ['all', 'read']);
});

test('والأقدم يُقرأ أولًا', () => {
  const data = { notices: [notice({ id: 'b', at: 500 }), notice({ id: 'a', at: 100 })] };
  assert.deepEqual(noticesFor(data, 'x', 600).map((n) => n.id), ['a', 'b']);
});

test('والقراءة تُكتب مرة: ضغطتان لا تصيران قارئين', () => {
  const once = markRead(notice(), 'b', 5);
  const twice = markRead(once, 'b', 9);
  assert.equal(once.reads.length, 1);
  assert.equal(twice, once);
  assert.equal(hasRead(twice, 'b'), true);
});

test('والردّ يُكتب فيُعرف من استوعب، لا من ضغط', () => {
  const n = markRead(notice(), 'b', 5, '  تم، بس بتأخّر ربع ساعة  ');
  assert.equal(replyOf(n, 'b'), 'تم، بس بتأخّر ربع ساعة');
  assert.equal(replyOf(n, 'c'), '');
  // وأول ردٍّ هو المحفوظ: لا يُبدَّل بضغطةٍ ثانية
  assert.equal(replyOf(markRead(n, 'b', 9, 'غيّرته'), 'b'), 'تم، بس بتأخّر ربع ساعة');
});

test('وتنبيهٌ لواحدٍ لا يُقال فيه «قرأه ١ من ٥»', () => {
  const one = readTally(notice({ to: 'b', reads: [{ userId: 'b', at: 1 }] }), users);
  assert.equal(one.text, 'قرأه 1 من 1');
  const all = readTally(notice({ reads: [{ userId: 'b', at: 1 }] }), users);
  assert.equal(all.read.length, 1);
  assert.ok(all.unread.some((u) => u.id === 'c'));
  assert.ok(!all.read.concat(all.unread).some((u) => u.role === 'مدير'), 'المدير كاتبُه لا قارئُه');
  assert.ok(!all.unread.some((u) => u.id === 'e'), 'والمعطَّل ما يُنتظر منه');
});

test('والمُدد معدودة وفيها «لا ينتهي»', () => {
  assert.ok(NOTICE_SPANS.some((s) => s.days === 0));
  assert.ok(NOTICE_SPANS.length >= 3);
});

/* -------------------------------- المشرفون -------------------------------- */

test('اثنان على الأكثر، والثالث لا يدخل', () => {
  let run = { id: 'r1', supervisors: [] };
  run = toggleSupervisor(run, 'b');
  run = toggleSupervisor(run, 'c');
  const before = run;
  run = toggleSupervisor(run, 'd');
  assert.deepEqual(supervisorsOf(run), ['b', 'c']);
  assert.equal(run, before, 'ما تغيّر شيء');
  assert.equal(SUPERVISOR_MAX, 2);
});

test('ومن كُتب خطأً يشيل نفسه', () => {
  const run = toggleSupervisor({ supervisors: ['b', 'c'] }, 'b');
  assert.deepEqual(supervisorsOf(run), ['c']);
});

test('وأسماؤهم تُكتب ومعهم المتطوّع', () => {
  const names = supervisorNames({ supervisors: ['b', 'c'], helper: ' فيصل ' }, users);
  assert.deepEqual(names, ['عبدالله', 'سعود', 'فيصل']);
});

test('وما أُقيم بلا مشرفٍ يظهر ولا يسقط', () => {
  const runs = [
    { id: '1', supervisors: ['b'] },
    { id: '2', supervisors: [] },
    { id: '3', helper: 'فيصل' },
    { id: '4' },
  ];
  assert.deepEqual(unassigned(runs).map((r) => r.id), ['2', '4']);
});

/* --------------------------------- القيمي --------------------------------- */

test('القيمي لا يُحفظ بلا ملقٍ ولا عنوان', () => {
  assert.deepEqual(qiyamiMissing({}), ['الملقي', 'العنوان']);
  assert.deepEqual(qiyamiMissing({ supervisors: ['b'] }), ['العنوان']);
  assert.deepEqual(qiyamiMissing({ helper: 'ضيف', title: 'برّ الوالدين' }), []);
  assert.equal(qiyamiReady({ supervisors: ['b'], title: 'برّ الوالدين' }), true);
});

test('وما تحتهما اختياريٌّ كلُّه', () => {
  assert.equal(qiyamiReady({ supervisors: ['b'], title: 'ت', points: '', qa: '', video: '' }), true);
});

test('وقيمي اليوم يومُه وحده', () => {
  const data = { qiyami: [
    { id: 'q1', programId: 'p1', weekId: 'w1', at: 2 },
    { id: 'q2', programId: 'p1', weekId: 'w2', at: 3 },
  ] };
  assert.deepEqual(qiyamiOfDay(data, 'p1', 'w1').map((q) => q.id), ['q1']);
});

test('ورابط يوتيوب يُعرض من عنده، وغيره لا يُدّعى عرضه', () => {
  const want = 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ';
  assert.equal(videoEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), want);
  assert.equal(videoEmbed('https://youtu.be/dQw4w9WgXcQ'), want);
  assert.equal(videoEmbed('https://www.youtube.com/embed/dQw4w9WgXcQ'), want);
  assert.equal(videoEmbed('https://www.youtube.com/shorts/dQw4w9WgXcQ'), want);
  assert.equal(videoEmbed('https://drive.google.com/file/d/abc/view'), '');
  assert.equal(videoEmbed(''), '');
});

/* ------------------------------- ملخّص اليوم ------------------------------- */

test('الملخّص يقول ما جرى، ويميّز العدد', () => {
  const lines = daySummary({
    comps: 3,
    qiyami: [{ title: 'برّ الوالدين', by: ['ماجد الدوسري'] }],
    noteNames: ['سعد', 'فهد'],
    roll: { done: [1, 2, 3], total: 5 },
  });
  assert.ok(lines[0].includes('3 مسابقات'));
  assert.ok(lines[1].includes('«برّ الوالدين»'));
  assert.ok(lines[1].includes('ماجد الدوسري'));
  assert.ok(lines[2].includes('على طالبين'));
  assert.ok(lines[2].includes('سعد · فهد'));
  assert.ok(lines[3].includes('3 من 5'));
});

test('واسمُ الملقي يُقرأ اسمًا واحدًا أو قائمة', () => {
  // وقعت في الفحص: كان يُمرَّر اسمًا مجموعًا فانكسر الرسم كلُّه
  assert.ok(daySummary({ qiyami: [{ title: 'ت', by: 'ماجد الدوسري' }] })[0].includes('ألقاه ماجد الدوسري'));
  assert.ok(daySummary({ qiyami: [{ title: 'ت', by: ['ماجد', 'سعود'] }] })[0].includes('ماجد و سعود'.replace(' و ', ' و')));
  assert.ok(daySummary({ qiyami: [{ title: 'ت' }] })[0].endsWith('«ت»'));
});

test('وواحدةٌ تُقال «مسابقة» لا «١ مسابقات»', () => {
  assert.ok(daySummary({ comps: 1 })[0].endsWith('مسابقة'));
  assert.ok(daySummary({ comps: 2 })[0].endsWith('مسابقتين'));
});

test('وبلا أسماء: العدد يبقى والأسماء تسقط', () => {
  const lines = daySummary({ noteNames: ['سعد', 'فهد'], qiyami: [{ title: 'ت', by: ['ماجد'] }] }, { names: false });
  assert.ok(lines.join('\n').includes('طالبين'));
  assert.ok(!lines.join('\n').includes('سعد'));
  assert.ok(!lines.join('\n').includes('ماجد'));
  assert.ok(lines.join('\n').includes('«ت»'), 'والعنوان يبقى');
});

test('وما لم يجرِ لا يُكتب له سطر', () => {
  assert.deepEqual(daySummary({}), []);
  assert.deepEqual(daySummary(), []);
});

console.log(`\n✅ ${passed} اختبارًا لتقرير اليوم والتنبيهات والقيمي\n`);
