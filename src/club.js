/**
 * النادي: المسابقات، والدوري، وسؤال اليوم.
 *
 * ما في هذا الملف حسابٌ خالص بلا واجهة — عشان يُختبر بالكامل. والواجهة في
 * `App.tsx` تستدعيه، وصفحة ولي الأمر تستدعي منه ما يخصّها.
 */

/* ------------------------------ تنظيف الجواب ------------------------------ */

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

/**
 * أعدادٌ تُكتب حروفًا. المفاتيح بعد التنظيف — أي بالهاء لا بالتاء المربوطة،
 * وبلا همزات — فلا نكتبها مرتين.
 *
 * ونقف عند العشرين: ما فوقها يُكتب كلمتين بصيغٍ كثيرة، وتخمينها يفتح باب
 * الخطأ أكثر مما يسدّ.
 */
const NUM_WORDS = {
  صفر: '0',
  واحد: '1', احد: '1', وحده: '1',
  اثنان: '2', اثنين: '2', ثنتان: '2', ثنتين: '2',
  ثلاثه: '3', ثلاث: '3',
  اربعه: '4', اربع: '4',
  خمسه: '5', خمس: '5',
  سته: '6', ست: '6',
  سبعه: '7', سبع: '7',
  ثمانيه: '8', ثمان: '8', ثمانيا: '8',
  تسعه: '9', تسع: '9',
  عشره: '10', عشر: '10',
  'احد عشر': '11', 'احدعشر': '11',
  'اثنا عشر': '12', 'اثني عشر': '12', 'اثناعشر': '12',
  'ثلاثه عشر': '13', 'ثلاث عشره': '13',
  'اربعه عشر': '14', 'اربع عشره': '14',
  'خمسه عشر': '15', 'خمس عشره': '15',
  'سته عشر': '16', 'ست عشره': '16',
  'سبعه عشر': '17', 'سبع عشره': '17',
  'ثمانيه عشر': '18', 'ثمان عشره': '18',
  'تسعه عشر': '19', 'تسع عشره': '19',
  عشرون: '20', عشرين: '20',
};

/**
 * صيغةٌ واحدة للكلمة مهما كُتبت.
 *
 * ولي الأمر يكتب على عجل: «خمسه» بلا تاء، و«احمد» بلا همزة، و«موسي» بياء،
 * ويحطّ نقطةً في الآخر. وكلها هي هي عند من يقرأ، فتصير هي هي عند من يقارن.
 *
 * و«ال» التعريف تُشال ما دام الباقي ثلاثة أحرف فأكثر — فـ«الرياض» تساوي
 * «رياض»، و«الله» تبقى كما هي فلا تصير «له».
 */
export const normalizeAnswer = (s) => {
  let t = String(s ?? '');
  t = t.replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)));
  t = t.replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d)));
  // التشكيل والتطويل والمدّة
  t = t.replace(/[ً-ْٰـ]/g, '');
  t = t.replace(/[أإآٱ]/g, 'ا').replace(/[ىی]/g, 'ي').replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و').replace(/ئ/g, 'ي');
  t = t.toLowerCase();
  // كل ما ليس حرفًا ولا رقمًا يصير فاصلًا
  t = t.replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  t = t.split(' ').map((w) => (w.startsWith('ال') && w.length >= 5 ? w.slice(2) : w)).join(' ');
  return t;
};

/** الجواب عددًا، سواء كُتب رقمًا أو حروفًا. وإلا فارغ. */
export const numberOf = (s) => {
  const t = normalizeAnswer(s);
  if (!t) return '';
  if (/^\d+$/.test(t)) return String(Number(t));
  return NUM_WORDS[t] || '';
};

/** مسافة التحرير — كم حرفًا يفصل بين كلمتين. للحكم على «قريبة ولا بعيدة». */
export const editDistance = (a, b) => {
  if (a === b) return 0;
  if (!a.length || !b.length) return Math.max(a.length, b.length);
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
};

/**
 * الحكم على جوابٍ مفتوح: `ok` أو `no` أو `check`.
 *
 * `check` ليست حكمًا، هي امتناعٌ عنه: الجواب قريبٌ من الصحيح ولا يطابقه بعد
 * التنظيف، فلا يُظلم صاحبه بـ«خطأ» ولا يُمنح ما لم يستحقّ — يُرفع لصاحب
 * السؤال بضغطة.
 */
export const judge = (given, correct, alsoOk = []) => {
  const g = normalizeAnswer(given);
  if (!g) return 'no';
  const keys = [correct, ...(alsoOk || [])].map((k) => normalizeAnswer(k)).filter(Boolean);
  if (!keys.length) return 'check';
  if (keys.includes(g)) return 'ok';

  // عددٌ كُتب حروفًا وآخر كُتب رقمًا: هما واحد
  const gn = numberOf(given);
  if (gn && [correct, ...(alsoOk || [])].some((k) => numberOf(k) === gn)) return 'ok';

  const near = keys.some((k) => editDistance(g, k) <= (Math.max(g.length, k.length) > 5 ? 2 : 1));
  return near ? 'check' : 'no';
};

/** جواب سؤال الاختيارات: مطابقةُ معرّفٍ لا نصّ، فلا تحتمل «راجعها». */
export const judgeChoice = (optionId, correctId) => (optionId && optionId === correctId ? 'ok' : 'no');

/**
 * حكم جوابٍ واحد على سؤاله. وما علّمه صاحب السؤال بيده يفوز على الآلة:
 * `mark` إن وُجدت هي الكلمة الأخيرة.
 */
export const answerVerdict = (q, a) => {
  if (a?.mark === 'ok' || a?.mark === 'no') return a.mark;
  if (q?.mode === 'choice') return judgeChoice(a?.optionId, q?.correctId);
  return judge(a?.text, q?.answer, q?.alsoOk);
};

/** عدّاد أجوبة السؤال: كم جاوب، وكم صحّ، وكم أخطأ، وكم ينتظر مراجعتك. */
export const questionTally = (q) => {
  const rows = q?.answers || [];
  const t = { total: rows.length, ok: 0, no: 0, check: 0 };
  for (const a of rows) {
    const v = answerVerdict(q, a);
    if (v === 'ok') t.ok++; else if (v === 'no') t.no++; else t.check++;
  }
  return t;
};

/* -------------------------------- الدوري -------------------------------- */

export const LEAGUE = 'league';
export const CUP = 'cup';

/** كل فريقٍ يلاقي من بعده مرة. */
export const leagueFixtures = (teams) => {
  const out = [];
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) out.push({ aId: teams[i].id, bId: teams[j].id });
  }
  return out;
};

const played = (m) => m && m.aScore !== '' && m.aScore !== null && m.aScore !== undefined
  && m.bScore !== '' && m.bScore !== null && m.bScore !== undefined;

/** الفائز في مباراة. والتعادل بلا فائز — في الدوري نقطة لكلٍّ، وفي البطولة لا يمرّ أحد. */
export const winnerOf = (m) => {
  if (!played(m)) return '';
  const a = Number(m.aScore), b = Number(m.bScore);
  if (a > b) return m.aId;
  if (b > a) return m.bId;
  return '';
};

/**
 * جدول الدوري. الترتيب بالنقاط، ثم بفارق الأهداف، ثم بما سجّل — وعند
 * التساوي التام يبقى ترتيب الإدخال، فلا يقفز فريقٌ على آخر بلا سبب.
 */
export const leagueTable = (t) => {
  const rows = (t?.teams || []).map((tm) => ({
    id: tm.id, name: tm.name, played: 0, won: 0, draw: 0, lost: 0, for: 0, against: 0, points: 0,
  }));
  const by = Object.fromEntries(rows.map((r) => [r.id, r]));
  for (const m of t?.matches || []) {
    if (!played(m)) continue;
    const A = by[m.aId], B = by[m.bId];
    if (!A || !B) continue;
    const a = Number(m.aScore), b = Number(m.bScore);
    A.played++; B.played++;
    A.for += a; A.against += b; B.for += b; B.against += a;
    if (a > b) { A.won++; B.lost++; A.points += 3; }
    else if (b > a) { B.won++; A.lost++; B.points += 3; }
    else { A.draw++; B.draw++; A.points++; B.points++; }
  }
  return rows
    .map((r, i) => ({ ...r, diff: r.for - r.against, _i: i }))
    .sort((x, y) => y.points - x.points || y.diff - x.diff || y.for - x.for || x._i - y._i)
    .map(({ _i, ...r }) => r);
};

/** اسم الدور بعدد فرقه. */
export const roundName = (teamsInRound) => ({
  2: 'النهائي', 4: 'نصف النهائي', 8: 'ربع النهائي', 16: 'دور الـ١٦', 32: 'دور الـ٣٢',
}[teamsInRound] || `دور الـ${teamsInRound}`);

/** أصغر قوّة للاثنين تسع العدد. */
const pow2 = (n) => { let p = 1; while (p < n) p *= 2; return p; };

/**
 * شجرة البطولة.
 *
 * العدد الذي لا ينقسم يُكمَّل بمقاعد فارغة، ومن قابل مقعدًا فارغًا يعبر بلا
 * مباراة — هذا هو «البايّ» المعروف، وهو أعدل من إقصاء أحدٍ بالقرعة. والمقاعد
 * تُوزَّع على أواخر الدور الأول فيبقى صدره مباريات حقيقية.
 */
export const cupBracket = (t) => {
  const teams = t?.teams || [];
  if (teams.length < 2) return { rounds: [], champion: null };
  const size = pow2(teams.length);
  const slots = [...teams.map((x) => x.id), ...Array(size - teams.length).fill('')];
  const byId = Object.fromEntries(teams.map((x) => [x.id, x.name]));
  const stored = Object.fromEntries((t.matches || []).map((m) => [`${m.round}:${m.slot}`, m]));

  const rounds = [];
  let ids = slots;
  for (let r = 0; ids.length > 1; r++) {
    const games = [];
    const next = [];
    for (let s = 0; s < ids.length; s += 2) {
      const aId = ids[s], bId = ids[s + 1];
      const slot = s / 2;
      const m = stored[`${r}:${slot}`] || { round: r, slot, aScore: '', bScore: '' };
      const g = {
        round: r, slot, aId, bId,
        aName: byId[aId] || '', bName: byId[bId] || '',
        aScore: m.aScore ?? '', bScore: m.bScore ?? '',
        bye: (!!aId && !bId) || (!aId && !!bId),
      };
      // من لا خصم له يعبر، ومن لُعبت مباراته يعبر فائزه
      g.winner = g.bye ? (aId || bId) : winnerOf(g);
      games.push(g);
      next.push(g.winner);
    }
    rounds.push({ name: roundName(ids.length), games });
    ids = next;
  }
  return { rounds, champion: ids[0] ? { id: ids[0], name: byId[ids[0]] || '' } : null };
};

/** بطل الدوري: صدر الجدول، ولا يُتوَّج إلا بعد أن تُلعب مبارياته كلها. */
export const leagueChampion = (t) => {
  const fx = leagueFixtures(t?.teams || []);
  const done = (t?.matches || []).filter(played).length;
  if (!fx.length || done < fx.length) return null;
  const top = leagueTable(t)[0];
  return top ? { id: top.id, name: top.name } : null;
};

/** بطل الدوري بنوعيه. */
export const champion = (t) => (t?.type === CUP ? cupBracket(t).champion : leagueChampion(t));

/* ------------------------------ ربط الجمعة ------------------------------ */

/** ما نُفّذ في أسبوعٍ بعينه: مسابقاته ودورياته وأسئلته. */
export const weekRuns = (data, programId, weekId) => ({
  competitions: (data?.clubRuns || []).filter((r) => r.programId === programId && r.weekId === weekId),
  tournaments: (data?.tournaments || []).filter((t) => t.programId === programId && t.weekId === weekId),
  questions: (data?.questions || []).filter((q) => q.programId === programId && q.weekId === weekId),
});

/** وما نُفّذ في البرنامج كله — الأسبوع الفارغ يعني «البرنامج بلا تحديد». */
export const programRuns = (data, programId) => ({
  competitions: (data?.clubRuns || []).filter((r) => r.programId === programId),
  tournaments: (data?.tournaments || []).filter((t) => t.programId === programId),
  questions: (data?.questions || []).filter((q) => q.programId === programId),
});

/** العدّاد الذي يظهر في التقرير. */
export const clubCounts = (runs) => ({
  competitions: runs.competitions.length,
  leagues: runs.tournaments.filter((t) => t.type === LEAGUE).length,
  cups: runs.tournaments.filter((t) => t.type === CUP).length,
  questions: runs.questions.length,
});

/**
 * أين استُخدمت هذي المسابقة. مرتّبة بالأحدث، لأن آخر مرة أهمّ ما يُسأل عنه.
 */
export const usedIn = (data, compId) => (data?.clubRuns || [])
  .filter((r) => r.compId === compId)
  .map((r) => {
    const p = (data.programs || []).find((x) => x.id === r.programId);
    const w = (p?.weeks || []).find((x) => x.id === r.weekId);
    return { ...r, programName: p?.name || '', weekName: w?.name || '', termKey: p?.termKey || '' };
  })
  .sort((a, b) => (b.at || 0) - (a.at || 0));

/* ------------------------------ سؤال اليوم ------------------------------ */

/** نصوص صفحة السؤال. الفاضي يعني «شِله» — إلا رسائل الخطأ، فالفاضي يرجّعها. */
export const Q_TEXTS = {
  // اسم الفريق في الرأس فوق، فلا يُعاد هنا
  brand: 'سؤال اليوم',
  studentLabel: 'اسم الابن',
  studentHint: '',
  answerLabel: 'جوابك',
  submit: 'أرسل الجواب',
  doneTitle: 'شكرًا لك',
  doneText: 'وصلنا جواب {الطالب}.',
  closedTitle: 'انتهى وقت الجواب',
  closedText: 'هذا السؤال أُقفل. ترقّب سؤال الأسبوع الجاي.',
};

/**
 * رسائل الخطأ. تُعدَّل كبقية النصوص — صاحب الفريق أدرى بمفرداته — لكنّ
 * الفاضي هنا يرجّع الأصل ولا يشيل الرسالة: ولي الأمر يضغط الزر فلا يصير شيء
 * ولا يدري لِمَ، وهذا كسرٌ للصفحة لا تعديلٌ لها.
 */
export const Q_ERRORS = {
  needStudent: 'اكتب اسم ابنك.',
  needAnswer: 'اكتب جوابك.',
  needChoice: 'اختر جوابًا.',
};

export const qText = (q, key, vars = {}) => {
  const raw = (q?.texts || {})[key];
  const val = raw === undefined || raw === null ? (Q_TEXTS[key] ?? '') : raw;
  return String(val).replace(/\{([^}]+)\}/g, (m, k) => (vars[k.trim()] ?? m));
};

export const qError = (q, key) => {
  const raw = String((q?.texts || {})[key] ?? '').trim();
  return raw || Q_ERRORS[key];
};

/** ما تُرسله الصفحة العامة: السؤال بلا الجواب الصحيح وبلا أجوبة غيره. */
export const questionView = (data, token) => {
  const q = (data?.questions || []).find((x) => x.token && x.token === token);
  if (!q) return null;
  return {
    id: q.id,
    open: q.open !== false,
    text: String(q.text || ''),
    mode: q.mode === 'choice' ? 'choice' : 'open',
    options: (q.options || []).map((o) => ({ id: o.id, text: o.text })),
    texts: q.texts || {},
  };
};

/**
 * فحص ما أرسله ولي الأمر. الصفحة تنبّه، وهذا يمنع: الصفحة عامة، ومن تجاوزها
 * وأرسل مباشرةً لا يردّه إلا هذا.
 */
export const validateAnswer = (view, body) => {
  const errors = {};
  const student = String(body?.student || '').trim();
  if (student.length < 2) errors.student = qError(view, 'needStudent');
  if (view?.mode === 'choice') {
    const ok = (view.options || []).some((o) => o.id === body?.optionId);
    if (!ok) errors.answer = qError(view, 'needChoice');
  } else if (!String(body?.text || '').trim()) {
    errors.answer = qError(view, 'needAnswer');
  }
  return { ok: !Object.keys(errors).length, errors };
};

/**
 * حدٌّ لأجوبة الساعة.
 *
 * صفحة التسجيل تحدّ بالجوال، وهذي بلا جوالٍ بطلب صاحبها — فما بقي إلا حدٌّ
 * عام يمنع الإغراق. وهو واسعٌ عمدًا: صفٌّ كامل يجاوب في دقائق، فلا نردّه.
 */
export const answersRateLimited = (log, now = Date.now()) => {
  const hour = 60 * 60 * 1000;
  const recent = (log || []).filter((e) => now - e.at < hour);
  return { blocked: recent.length >= 300, recent };
};

/** إضافة الجواب للسؤال. يرجّع البيانات الجديدة واسم الطالب كما استقرّ. */
export const applyAnswer = (data, q, body, { id, now = Date.now() } = {}) => {
  const student = String(body?.student || '').trim().replace(/\s+/g, ' ');
  const row = q.mode === 'choice'
    ? { id, student, optionId: String(body.optionId), at: now }
    : { id, student, text: String(body.text || '').trim(), at: now };
  return {
    data: {
      ...data,
      questions: data.questions.map((x) => (x.id === q.id ? { ...x, answers: [...(x.answers || []), row] } : x)),
    },
    student,
  };
};
