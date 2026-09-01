/** اختبارات النادي: تصحيح الجواب، والدوري والبطولة، وعدّاد التقرير. */
import assert from 'node:assert/strict';
import {
  normalizeAnswer, numberOf, editDistance, judge, judgeChoice, answerVerdict, questionTally,
  leagueFixtures, leagueTable, winnerOf, cupBracket, roundName, champion, leagueChampion,
  weekRuns, programRuns, clubCounts, usedIn,
  qText, qError, questionView, validateAnswer, applyAnswer, LEAGUE, CUP,
} from '../src/club.js';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('  ✓ ' + name); };

/* ------------------------------ تنظيف الجواب ------------------------------ */

test('التاء المربوطة والهاء سواء', () => {
  assert.equal(normalizeAnswer('خمسة'), normalizeAnswer('خمسه'));
});

test('الهمزات والألف المقصورة تُوحَّد', () => {
  assert.equal(normalizeAnswer('أحمد'), 'احمد');
  assert.equal(normalizeAnswer('إبراهيم'), 'ابراهيم');
  assert.equal(normalizeAnswer('موسى'), normalizeAnswer('موسي'));
});

test('التشكيل والتطويل يُشالان', () => {
  assert.equal(normalizeAnswer('خَمْسَة'), 'خمسه');
  assert.equal(normalizeAnswer('خمســـة'), 'خمسه');
});

test('الترقيم والمسافات الزائدة تُشال', () => {
  assert.equal(normalizeAnswer('  خمسة .  '), 'خمسه');
  assert.equal(normalizeAnswer('الرياض، السعودية'), 'رياض سعوديه');
});

test('الأرقام الهندية تصير لاتينية', () => {
  assert.equal(normalizeAnswer('٥'), '5');
  assert.equal(normalizeAnswer('١٤٤٨'), '1448');
});

test('اللاتيني كبيره وصغيره سواء', () => {
  assert.equal(normalizeAnswer('Riyadh'), 'riyadh');
});

test('«ال» تُشال إذا بقي بعدها ثلاثة أحرف', () => {
  assert.equal(normalizeAnswer('الرياض'), 'رياض');
  assert.equal(normalizeAnswer('الخمسة'), 'خمسه');
});

test('ولا تُشال إذا كسرت الكلمة — «الله» ما تصير «له»', () => {
  assert.equal(normalizeAnswer('الله'), 'الله');
  assert.equal(normalizeAnswer('الأم'), 'الام');
});

test('العدد حروفًا ورقمًا شيء واحد', () => {
  assert.equal(numberOf('خمسة'), '5');
  assert.equal(numberOf('خمسه'), '5');
  assert.equal(numberOf('٥'), '5');
  assert.equal(numberOf('5'), '5');
  assert.equal(numberOf('خمس'), '5');
  assert.equal(numberOf('اثنا عشر'), '12');
  assert.equal(numberOf('عشرين'), '20');
});

test('وما ليس عددًا يرجع فاضيًا', () => {
  assert.equal(numberOf('الرياض'), '');
  assert.equal(numberOf(''), '');
});

test('مسافة التحرير تعدّ الفروق', () => {
  assert.equal(editDistance('خمسه', 'خمسه'), 0);
  assert.equal(editDistance('خمسه', 'خمس'), 1);
  assert.equal(editDistance('', 'خمسه'), 4);
});

/* -------------------------------- الحكم -------------------------------- */

test('المطابق بعد التنظيف صح', () => {
  assert.equal(judge('خمسه', 'خمسة'), 'ok');
  assert.equal(judge('الخمسة .', 'خمسة'), 'ok');
  assert.equal(judge('خَمْسَة', 'خمسة'), 'ok');
});

test('والعدد رقمًا يساوي العدد حروفًا', () => {
  assert.equal(judge('٥', 'خمسة'), 'ok');
  assert.equal(judge('5', 'خمسة'), 'ok');
  assert.equal(judge('خمسة', '5'), 'ok');
});

test('والأجوبة الأخرى المقبولة تُقبل', () => {
  assert.equal(judge('مدينة الرياض', 'الرياض', ['مدينة الرياض']), 'ok');
});

test('والبعيد خطأ', () => {
  assert.equal(judge('جدة', 'الرياض'), 'no');
  assert.equal(judge('عشرة', 'خمسة'), 'no');
});

test('والقريب لا يُحكم عليه — يُرفع للمراجعة', () => {
  assert.equal(judge('الريض', 'الرياض'), 'check');
  assert.equal(judge('ابراهم', 'ابراهيم'), 'check');
});

test('والفاضي خطأ لا مراجعة', () => {
  assert.equal(judge('', 'خمسة'), 'no');
  assert.equal(judge('   ', 'خمسة'), 'no');
});

test('وسؤالٌ بلا جواب صحيح مخزون: كله مراجعة', () => {
  assert.equal(judge('أي شيء', ''), 'check');
});

test('الاختيارات مطابقة معرّف — لا تحتمل مراجعة', () => {
  assert.equal(judgeChoice('o2', 'o2'), 'ok');
  assert.equal(judgeChoice('o1', 'o2'), 'no');
  assert.equal(judgeChoice('', 'o2'), 'no');
});

test('وما علّمه صاحب السؤال بيده يفوز على الآلة', () => {
  const q = { mode: 'open', answer: 'الرياض' };
  assert.equal(answerVerdict(q, { text: 'جدة' }), 'no');
  assert.equal(answerVerdict(q, { text: 'جدة', mark: 'ok' }), 'ok');
  assert.equal(answerVerdict(q, { text: 'الرياض', mark: 'no' }), 'no');
});

test('العدّاد يفرز الثلاثة', () => {
  const q = {
    mode: 'open', answer: 'خمسة',
    answers: [
      { text: 'خمسه' }, { text: '٥' }, { text: 'أربعة' }, { text: 'خمسا' },
    ],
  };
  assert.deepEqual(questionTally(q), { total: 4, ok: 2, no: 1, check: 1 });
});

/* -------------------------------- الدوري -------------------------------- */

const three = {
  type: LEAGUE,
  teams: [{ id: 'a', name: 'الصقور' }, { id: 'b', name: 'النمور' }, { id: 'c', name: 'الأسود' }],
  matches: [],
};

test('كل فريق يلاقي من بعده مرة', () => {
  assert.equal(leagueFixtures(three.teams).length, 3);
  assert.equal(leagueFixtures([{ id: 'a' }]).length, 0);
  assert.equal(leagueFixtures(Array.from({ length: 4 }, (_, i) => ({ id: i }))).length, 6);
});

test('الفائز من النتيجة، والتعادل بلا فائز', () => {
  assert.equal(winnerOf({ aId: 'a', bId: 'b', aScore: 3, bScore: 1 }), 'a');
  assert.equal(winnerOf({ aId: 'a', bId: 'b', aScore: 1, bScore: 3 }), 'b');
  assert.equal(winnerOf({ aId: 'a', bId: 'b', aScore: 2, bScore: 2 }), '');
});

test('وما لم تُلعب ليس لها فائز', () => {
  assert.equal(winnerOf({ aId: 'a', bId: 'b', aScore: '', bScore: '' }), '');
  assert.equal(winnerOf({ aId: 'a', bId: 'b', aScore: 3, bScore: '' }), '');
});

test('جدول الدوري: نقاط وفارق وترتيب', () => {
  const t = {
    ...three,
    matches: [
      { aId: 'a', bId: 'b', aScore: 2, bScore: 0 },
      { aId: 'a', bId: 'c', aScore: 3, bScore: 1 },
      { aId: 'b', bId: 'c', aScore: 1, bScore: 1 },
    ],
  };
  const tbl = leagueTable(t);
  assert.equal(tbl[0].name, 'الصقور');
  assert.equal(tbl[0].points, 6);
  assert.equal(tbl[0].diff, 4);
  assert.equal(tbl[0].played, 2);
  // النمور والأسود: نقطة لكلٍّ وفارقهما −٢، فيفصل ما سجّله كلٌّ منهما
  assert.equal(tbl[1].points, 1);
  assert.equal(tbl[2].points, 1);
  assert.equal(tbl[1].diff, tbl[2].diff);
  assert.equal(tbl[1].name, 'الأسود');   // سجّل ٢
  assert.equal(tbl[1].for, 2);
  assert.equal(tbl[2].name, 'النمور');   // سجّل ١
  assert.equal(tbl[2].for, 1);
});

test('والمباراة غير الملعوبة ما تدخل الجدول', () => {
  const tbl = leagueTable({ ...three, matches: [{ aId: 'a', bId: 'b', aScore: '', bScore: '' }] });
  assert.equal(tbl.every((r) => r.played === 0), true);
});

test('بطل الدوري لا يُتوَّج قبل أن تكتمل مبارياته', () => {
  const half = { ...three, matches: [{ aId: 'a', bId: 'b', aScore: 2, bScore: 0 }] };
  assert.equal(leagueChampion(half), null);
  const full = {
    ...three,
    matches: [
      { aId: 'a', bId: 'b', aScore: 2, bScore: 0 },
      { aId: 'a', bId: 'c', aScore: 3, bScore: 1 },
      { aId: 'b', bId: 'c', aScore: 1, bScore: 0 },
    ],
  };
  assert.equal(leagueChampion(full).name, 'الصقور');
});

/* ------------------------------- البطولة ------------------------------- */

const mk = (n) => Array.from({ length: n }, (_, i) => ({ id: 't' + i, name: 'فريق ' + (i + 1) }));

test('أسماء الأدوار بعدد فرقها', () => {
  assert.equal(roundName(2), 'النهائي');
  assert.equal(roundName(4), 'نصف النهائي');
  assert.equal(roundName(8), 'ربع النهائي');
  assert.equal(roundName(16), 'دور الـ١٦');
});

test('ثمانية فرق: ثلاثة أدوار، أربع مباريات في أوّلها', () => {
  const { rounds } = cupBracket({ type: CUP, teams: mk(8), matches: [] });
  assert.deepEqual(rounds.map((r) => r.name), ['ربع النهائي', 'نصف النهائي', 'النهائي']);
  assert.deepEqual(rounds.map((r) => r.games.length), [4, 2, 1]);
});

test('والعدد الذي لا ينقسم يُكمَّل بمقاعد فارغة، ومن قابلها عبر بلا مباراة', () => {
  const { rounds } = cupBracket({ type: CUP, teams: mk(3), matches: [] });
  assert.equal(rounds.length, 2);
  const byes = rounds[0].games.filter((g) => g.bye);
  assert.equal(byes.length, 1);
  assert.equal(byes[0].winner, 't2');
});

test('ولا يُقصى أحد بالقرعة: كل فريق موجود في الدور الأول', () => {
  for (const n of [3, 5, 6, 7]) {
    const { rounds } = cupBracket({ type: CUP, teams: mk(n), matches: [] });
    const seen = new Set(rounds[0].games.flatMap((g) => [g.aId, g.bId]).filter(Boolean));
    assert.equal(seen.size, n, `العدد ${n}`);
  }
});

test('الفائز يتقدّم وحده للدور اللي بعده', () => {
  const t = {
    type: CUP, teams: mk(4),
    matches: [
      { round: 0, slot: 0, aScore: 3, bScore: 1 },
      { round: 0, slot: 1, aScore: 0, bScore: 2 },
    ],
  };
  const { rounds, champion: ch } = cupBracket(t);
  assert.equal(rounds[1].games[0].aId, 't0');
  assert.equal(rounds[1].games[0].bId, 't3');
  assert.equal(ch, null); // النهائي ما انلعب
});

test('والكأس ما يُرفع إلا بعد النهائي', () => {
  const t = {
    type: CUP, teams: mk(4),
    matches: [
      { round: 0, slot: 0, aScore: 3, bScore: 1 },
      { round: 0, slot: 1, aScore: 0, bScore: 2 },
      { round: 1, slot: 0, aScore: 2, bScore: 1 },
    ],
  };
  assert.equal(cupBracket(t).champion.name, 'فريق 1');
  assert.equal(champion(t).name, 'فريق 1');
});

test('والتعادل في البطولة ما يمرّر أحدًا', () => {
  const t = { type: CUP, teams: mk(2), matches: [{ round: 0, slot: 0, aScore: 1, bScore: 1 }] };
  assert.equal(cupBracket(t).champion, null);
});

test('وفريق واحد أو صفر ما له شجرة', () => {
  assert.deepEqual(cupBracket({ teams: mk(1) }), { rounds: [], champion: null });
  assert.deepEqual(cupBracket({ teams: [] }), { rounds: [], champion: null });
});

/* ------------------------------ ربط الجمعة ------------------------------ */

const data = {
  programs: [{
    id: 'p1', name: 'جمعة الرواد', termKey: '1447-الأول',
    weeks: [{ id: 'w1', name: 'الأسبوع الأول' }, { id: 'w2', name: 'الأسبوع الثاني' }],
  }],
  competitions: [{ id: 'c1', name: 'سباق الأقماع' }],
  clubRuns: [
    { id: 'r1', compId: 'c1', programId: 'p1', weekId: 'w1', at: 100 },
    { id: 'r2', compId: 'c1', programId: 'p1', weekId: 'w2', at: 200 },
  ],
  tournaments: [
    { id: 'g1', type: LEAGUE, programId: 'p1', weekId: 'w1' },
    { id: 'g2', type: CUP, programId: 'p1', weekId: 'w1' },
    { id: 'g3', type: CUP, programId: 'p1', weekId: 'w2' },
  ],
  questions: [{ id: 'q1', programId: 'p1', weekId: 'w1' }],
};

test('ما نُفّذ في أسبوع بعينه', () => {
  const r = weekRuns(data, 'p1', 'w1');
  assert.deepEqual(clubCounts(r), { competitions: 1, leagues: 1, cups: 1, questions: 1 });
});

test('وما نُفّذ في البرنامج كله', () => {
  assert.deepEqual(clubCounts(programRuns(data, 'p1')), {
    competitions: 2, leagues: 1, cups: 2, questions: 1,
  });
});

test('وبرنامجٌ ما فيه شيء عدّاده أصفار', () => {
  assert.deepEqual(clubCounts(programRuns(data, 'nope')), {
    competitions: 0, leagues: 0, cups: 0, questions: 0,
  });
});

test('«استُخدمت في» بأسماء البرنامج والأسبوع، والأحدث أولًا', () => {
  const u = usedIn(data, 'c1');
  assert.equal(u.length, 2);
  assert.equal(u[0].weekName, 'الأسبوع الثاني');
  assert.equal(u[0].programName, 'جمعة الرواد');
  assert.equal(u[1].weekName, 'الأسبوع الأول');
});

/* ------------------------------ سؤال اليوم ------------------------------ */

const q = {
  id: 'q1', token: 'abc123', open: true, text: 'كم عدد أركان الإسلام؟',
  mode: 'choice', correctId: 'o2',
  options: [{ id: 'o1', text: 'أربعة' }, { id: 'o2', text: 'خمسة' }, { id: 'o3', text: 'ستة' }],
  answers: [], texts: {},
};

test('صفحة ولي الأمر ما توصلها الأجوبة ولا الصحيح', () => {
  const v = questionView({ questions: [q] }, 'abc123');
  assert.equal(v.text, 'كم عدد أركان الإسلام؟');
  assert.equal(v.correctId, undefined);
  assert.equal(v.answers, undefined);
  assert.equal(v.options.length, 3);
  assert.equal(v.options[0].correct, undefined);
});

test('والرمز الغلط ما يفتح شيئًا', () => {
  assert.equal(questionView({ questions: [q] }, 'zzz'), null);
  assert.equal(questionView({ questions: [{ ...q, token: '' }] }, ''), null);
});

test('النصوص تُعدَّل، والفاضي يشيلها', () => {
  assert.equal(qText(q, 'submit'), 'أرسل الجواب');
  assert.equal(qText({ texts: { submit: 'أرسل' } }, 'submit'), 'أرسل');
  assert.equal(qText({ texts: { studentHint: '' } }, 'studentHint'), '');
  assert.equal(qText({ texts: { brand: '' } }, 'brand'), '');
});

test('والمتغيّرات تنبدل', () => {
  assert.equal(qText(q, 'doneText', { الطالب: 'فهد' }), 'وصلنا جواب فهد.');
});

test('ورسائل الخطأ تُعدَّل، والفاضي يرجّع الأصل لا يشيله', () => {
  assert.equal(qError(q, 'needStudent'), 'اكتب اسم ابنك.');
  assert.equal(qError({ texts: { needStudent: 'اكتب اسم الطالب' } }, 'needStudent'), 'اكتب اسم الطالب');
  assert.equal(qError({ texts: { needStudent: '   ' } }, 'needStudent'), 'اكتب اسم ابنك.');
});

test('الخانتان إلزاميتان — والمنع في الخادم لا في الصفحة', () => {
  const v = questionView({ questions: [q] }, 'abc123');
  assert.equal(validateAnswer(v, { student: 'فهد', optionId: 'o2' }).ok, true);
  assert.equal(validateAnswer(v, { student: '', optionId: 'o2' }).ok, false);
  assert.equal(validateAnswer(v, { student: 'ف', optionId: 'o2' }).ok, false);
  assert.equal(validateAnswer(v, { student: 'فهد', optionId: '' }).ok, false);
  assert.equal(validateAnswer(v, { student: 'فهد', optionId: 'مخترع' }).ok, false);
});

test('وفي المفتوح يُطلب نصٌّ لا اختيار', () => {
  const open = questionView({ questions: [{ ...q, mode: 'open', options: [] }] }, 'abc123');
  assert.equal(validateAnswer(open, { student: 'فهد', text: 'خمسة' }).ok, true);
  assert.equal(validateAnswer(open, { student: 'فهد', text: '   ' }).ok, false);
  assert.equal(validateAnswer(open, { student: 'فهد' }).ok, false);
});

test('الجواب يُضاف للسؤال وحده', () => {
  const d = { questions: [q, { id: 'q2', answers: [] }] };
  const { data: next, student } = applyAnswer(d, q, { student: '  فهد   العتيبي ', optionId: 'o2' }, { id: 'a1', now: 5 });
  assert.equal(student, 'فهد العتيبي');
  assert.deepEqual(next.questions[0].answers, [{ id: 'a1', student: 'فهد العتيبي', optionId: 'o2', at: 5 }]);
  assert.deepEqual(next.questions[1].answers, []);
  assert.deepEqual(q.answers, []); // ما تغيّر الأصل
});

console.log(`\n✅ ${passed} اختبارًا للنادي — التصحيح والدوري والبطولة وسؤال اليوم\n`);
