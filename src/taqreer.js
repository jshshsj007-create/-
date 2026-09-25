/**
 * تقرير اليوم، والتنبيهات، والقيمي، ومن أقام ماذا.
 *
 * حسابٌ خالصٌ بلا واجهة — يُختبر في Node بلا متصفّح، وتستدعيه الشاشات.
 *
 * والمقصد من هذا كلّه واحد: أن يُعرف **من عمل ماذا في أي يوم**. فالمسابقة
 * تحمل مشرفيها، والتقرير يحمل كاتبه، والملاحظة تحمل من كتبها — ولا يُبنى شيءٌ
 * من ذلك على الظنّ.
 */

import { say } from './adad.js';

/* ------------------------------ يوم البرنامج ------------------------------ */

/**
 * تاريخ اليوم كما تُكتب تواريخ الأسابيع: `1448/03/19`.
 *
 * أسابيع البرامج تُكتب بالهجري بأرقامٍ لاتينية مفصولةٍ بشرطة مائلة، فنكتب
 * اليوم بالصيغة نفسها لتصحّ المقارنة حرفًا بحرف. ولو عجز المتصفّح عن التقويم
 * رجّعنا فراغًا — فلا يُقال «اليوم يوم البرنامج» على تخمين.
 */
export const hijriKey = (ms) => {
  try {
    const parts = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    }).formatToParts(new Date(ms || Date.now()));
    const get = (t) => parts.find((p) => p.type === t)?.value || '';
    const y = get('year').replace(/\D/g, '');
    const m = get('month'), d = get('day');
    return y && m && d ? `${y}/${m}/${d}` : '';
  } catch {
    return '';
  }
};

/**
 * أجزاء التاريخ كما كُتب بيد صاحبه.
 *
 * ويُكتب بأشكال: «1448/3/9» و«1448/03/09» و**«1448/04/07هـ»** — وهذي
 * الأخيرة أسقطت اليوم كلَّه عند صاحب التطبيق: قرأتُ «07هـ» رقمًا فلم يكن
 * رقمًا، فما طلب التطبيق تقريرًا من أحد وإعداداتُه صحيحة.
 *
 * فما ليس رقمًا يُشال من كل جزء — «هـ» وما شابهها — والأرقام العربية تُردّ
 * إلى صورتها، فالتاريخ يُقرأ كما قُصد لا كما كُتب.
 */
const AR_NUM = '٠١٢٣٤٥٦٧٨٩';
const parts = (s) => String(s || '')
  .replace(/[٠-٩]/g, (d) => String(AR_NUM.indexOf(d)))
  .split('/')
  .map((x) => Number(String(x).replace(/\D+/g, '')));

/** التاريخ كما كُتب قد يجي «1448/3/9» أو بمسافات أو بـ«هـ» — فنوحّده قبل المقارنة. */
export const sameDate = (a, b) => {
  const norm = (s) => { const [y, m, d] = parts(s); return y && m && d ? `${y}/${m}/${d}` : ''; };
  const A = norm(a), B = norm(b);
  return !!A && A === B;
};

/**
 * أيّ يومِ برنامجٍ هو اليوم — أوّلُ أسبوعٍ تاريخُه تاريخُ اليوم.
 *
 * و`sees` تسأل: هل يفتح هذا المستخدم هذا الأسبوع؟ فمن قُيّد بأسابيعَ بعينها
 * لا يُطالَب بتقرير يومٍ ليس له.
 */
export const dayNow = (programs, sees, ms) => {
  const key = hijriKey(ms);
  if (!key) return null;
  for (const p of programs || []) {
    for (const w of p.weeks || []) {
      if (!sameDate(w.date, key)) continue;
      if (sees && !sees(p.id, w.id)) continue;
      return { program: p, week: w };
    }
  }
  return null;
};

/** رقمٌ للترتيب من تاريخٍ هجريٍّ مكتوب — للمقارنة لا للحساب. */
export const dateRank = (s) => {
  const [y, m, d] = parts(s);
  if (!y || !m || !d) return 0;
  return y * 10000 + m * 100 + d;
};

/**
 * الأيام المطلوبة تقاريرُها: يومُ اليوم، وما مضى ولم يُكتب.
 *
 * وثلاثةٌ حدٌّ لا يُتجاوز: لو فُتح على قائدٍ موسمٌ كامل لم يكتبه، يئس فلم
 * يكتب شيئًا. والقليلُ الذي يُكتب خيرٌ من كثيرٍ يُتجاهَل.
 *
 * واليومُ الذي لم يُكتب له تاريخٌ لا يُطالَب به — فلا يُعرف متى كان.
 */
export const owedDays = (programs, sees, ms, { max = 3 } = {}) => {
  const today = dateRank(hijriKey(ms));
  const out = [];
  for (const p of programs || []) {
    for (const w of p.weeks || []) {
      const rank = dateRank(w.date);
      if (!rank || (today && rank > today)) continue;
      if (sees && !sees(p.id, w.id)) continue;
      out.push({ program: p, week: w, rank, late: !!today && rank < today });
    }
  }
  return out.sort((a, b) => b.rank - a.rank).slice(0, max);
};

/* ------------------------------ تقرير اليوم ------------------------------ */

/**
 * خانات التقرير — بيد المدير.
 *
 * كانت ثلاثًا مكتوبةً في الشيفرة، فصارت قائمةً يضيف فيها ويحذف ويرتّب ويجعل
 * الخانة إجبارية أو اختيارية. والافتراضُ هو الثلاث كما كانت، فمن لم يغيّر
 * شيئًا لم يتغيّر عليه شيء.
 *
 * والإجباريةُ ليست تشديدًا بلا معنى: الفرق بين «قال: لم يكن» و«ترك الخانة»
 * هو الفرق بين تقريرٍ وبين صمت — ولذلك يُكتب «لا يوجد» بيده.
 */
export const defaultReportFields = () => ([
  { id: 'comp', label: 'المسابقة', required: true },
  { id: 'league', label: 'الدوري', required: true },
  { id: 'notes', label: 'الطلاب — ملاحظات سلوكية', required: true },
]);

/**
 * الخانات الحيّة: ما لم يُحذف.
 *
 * والمحذوفة تبقى في البيانات مطويّةً لا تُمحى، لأن تقارير الأيام الماضية
 * كُتبت فيها — فلو مُحيت لقُرئ ما كُتب بلا عنوانٍ يقول ما هو.
 */
export const reportFields = (data) => {
  const all = Array.isArray(data?.reportFields) ? data.reportFields : null;
  if (!all) return defaultReportFields();
  const live = all.filter((f) => f && f.id && !f.hidden);
  return live;
};

/** وكلُّها — للقراءة: بها تُعرف عناوينُ ما كُتب في تقريرٍ قديم. */
export const allReportFields = (data) => (Array.isArray(data?.reportFields) && data.reportFields.length
  ? data.reportFields : defaultReportFields());

export const emptyReport = (userId, programId, weekId) => ({
  userId: String(userId || ''), programId: String(programId || ''), weekId: String(weekId || ''),
  values: {}, at: 0,
});

/**
 * ما كُتب في خانةٍ من تقرير.
 *
 * والتقارير المكتوبة قبل الخانات المتغيّرة تحمل قيمها في جذرها (`comp`
 * و`league` و`notes`) — فتُقرأ منه، ولا يضيع منها حرف.
 */
export const fieldValue = (r, id) => String(r?.values?.[id] ?? r?.[id] ?? '');

/** ما بقي فارغًا من الخانات الإجبارية، بأسمائه — لتُقال له لا أن يبحث عنها. */
export const missingParts = (r, fields) => (fields || defaultReportFields())
  .filter((f) => f.required !== false && !fieldValue(r, f.id).trim())
  .map((f) => f.label);

export const reportReady = (r, fields) => missingParts(r, fields).length === 0;

/** نصّ الزرّ: يقول ما ينقص، فلا يبقى مطفأً بلا سبب. */
export const submitLabel = (r, fields) => {
  const live = fields || defaultReportFields();
  const need = live.filter((f) => f.required !== false);
  const miss = missingParts(r, live);
  if (!miss.length) return 'أرسل تقرير اليوم';
  if (need.length && miss.length === need.length) {
    // الثلاث هي الحال الغالبة، و«الخانات الثلاث» تُقرأ أحسن من «3 خانات»
    if (need.length === 3) return 'اكتب الخانات الثلاث';
    return `اكتب ${say(need.length, 'field')}`;
  }
  return `ناقص: ${miss.join(' · ')}`;
};

export const reportOf = (data, userId, programId, weekId) =>
  (data?.dayReports || []).find((r) => r.userId === userId
    && r.programId === programId && r.weekId === weekId) || null;

/** تقارير يومٍ بعينه، بالأحدث — فآخر ما وصل أول ما يُقرأ. */
export const dayReports = (data, programId, weekId) =>
  (data?.dayReports || [])
    .filter((r) => r.programId === programId && r.weekId === weekId)
    .slice()
    .sort((a, b) => (b.at || 0) - (a.at || 0));

/**
 * من يُطالَب بالتقرير.
 *
 * المدير يقرأ ولا يُطالَب، والمعطَّل لا يُطالَب، ومن لا يحضر يوم البرنامج
 * أصلًا — كمعلّم خيركم أو مسؤول فيض — لا يُطالَب. فالمطالَب من يفتح الأسابيع
 * أو النادي، أي من يقف مع الأولاد.
 *
 * و`noReport` مخرجٌ بيد المدير: يرفعه عمّن لا يريد مطالبته، فلا تتحوّل
 * البطاقة إلى ضجيجٍ يُتجاهَل.
 */
export const mustReport = (u, sees, programId, weekId) => {
  if (!u || u.role === 'مدير' || u.status === 'غير نشط' || u.noReport) return false;
  const perms = u.permissions || [];
  if (!perms.includes('الأسابيع والحضور') && !perms.includes('النادي')) return false;
  if (sees && !sees(u, programId, weekId)) return false;
  return true;
};

/**
 * حال اليوم: من كتب ومن لم يكتب.
 *
 * ونرتّب «من لم يكتب» بأسمائهم لا بترتيب إنشاء الحسابات — فالقائمة تُقرأ
 * لتُذكّر، لا لتُؤرَّخ.
 */
export const reportRoll = (data, programId, weekId, sees) => {
  const due = (data?.users || []).filter((u) => mustReport(u, sees, programId, weekId));
  const rows = dayReports(data, programId, weekId);
  const byUser = Object.fromEntries(rows.map((r) => [r.userId, r]));
  /**
   * ويُقاس بالخانات الحيّة لا بالثلاث الأصلية.
   *
   * وقعت في الفحص: حُذفت خانةٌ من النموذج، فصارت تقاريرُ من كتبها كاملةً
   * تُعدّ ناقصةً — لأنها قيست بخانةٍ ما عادت تُطلب منه. فالمقياسُ ما يُطلب
   * اليوم، لا ما كان يُطلب.
   */
  const fields = reportFields(data);
  const done = [], late = [];
  for (const u of due) {
    const r = byUser[u.id];
    (r && reportReady(r, fields) ? done : late).push({ user: u, report: r || null });
  }
  const byName = (a, b) => String(a.user.name || '').localeCompare(String(b.user.name || ''), 'ar');
  return { done: done.sort(byName), late: late.sort(byName), total: due.length };
};

/**
 * جدول «من كتب ماذا» — مبنيٌّ من التقارير التي كتبوها هم.
 *
 * صفٌّ لكل قائد، وأعمدتُه خاناتُ التقرير كما ضبطها المدير — فإن حذف خانةً
 * سقط عمودُها، وإن أضاف «القيمي» صار عمودًا. والخليّة نصُّ صاحبها مقتطعًا
 * ليسع السطر، ومن لم يكتب يُقال فيه ذلك صريحًا.
 */
export const reportTable = (data, programId, weekId, sees, { cut = 42 } = {}) => {
  const fields = reportFields(data);
  const roll = reportRoll(data, programId, weekId, sees);
  const clip = (t) => {
    const x = String(t || '').replace(/\s+/g, ' ').trim();
    return x.length > cut ? `${x.slice(0, cut - 1)}…` : x;
  };
  const rows = [
    ...roll.done.map(({ user, report }) => ({
      user, wrote: true,
      cells: fields.map((f) => ({ id: f.id, text: clip(fieldValue(report, f.id)), full: fieldValue(report, f.id) })),
      reportId: report?.id || '',
    })),
    ...roll.late.map(({ user, report }) => ({
      user, wrote: false,
      cells: fields.map((f) => ({ id: f.id, text: clip(fieldValue(report, f.id)), full: fieldValue(report, f.id) })),
      reportId: report?.id || '',
    })),
  ];
  return { fields, rows, roll };
};

/** «٣ من ٥» — وبالأرقام اللاتينية لأن بقيّة التطبيق كذلك. */
export const rollText = (roll) => `${roll.done.length} من ${roll.total}`;

/* ------------------------------ ملاحظات الطلاب ------------------------------ */

/**
 * الملاحظة تُكتب نصًّا في التقرير، ثم يربطها المديرُ بصاحبها فتدخل سجلّه.
 *
 * والربط بيده وحده عن قصد: ما يُكتب في سجلّ ولدٍ يبقى معه، فلا يُكتب إلا
 * بعد قراءة.
 */
export const noteOn = (studentId, text, by, { programId, weekId, at, studentName, byName } = {}) => ({
  studentId: String(studentId || ''),
  /**
   * واسمُ الطالب يُكتب مع الملاحظة لا يُستخرج منه.
   *
   * لأن قاعدة الأهالي والطلاب محجوبةٌ عمّن لا يملك صلاحيتها، والملاحظات
   * يراها القادة كلُّهم — فلو استخرجناه من القاعدة لرآها بعضُهم بلا أسماء.
   */
  studentName: String(studentName || '').trim(),
  text: String(text || '').trim(),
  by: String(by || ''), byName: String(byName || '').trim(),
  programId: programId || '', weekId: weekId || '', at: at || Date.now(),
});

/** ما على الطالب كلُّه، بالأحدث — فسجلُّه يُقرأ من آخره. */
export const notesOn = (data, studentId) => (data?.studentNotes || [])
  .filter((n) => n.studentId === studentId)
  .slice()
  .sort((a, b) => (b.at || 0) - (a.at || 0));

/**
 * ما كُتب في يومٍ بعينه — وهذا ما يدخل تقرير ذلك اليوم.
 *
 * فالورقة تحمل ما جرى فيها، لا ما تراكم على الولد من قبل: من أخطأ في جمعةٍ
 * لا يُعاد اسمه في ورقة الجمعة التي بعدها.
 */
export const notesOfDay = (data, programId, weekId) => (data?.studentNotes || [])
  .filter((n) => n.programId === programId && n.weekId === weekId)
  .slice()
  .sort((a, b) => (a.at || 0) - (b.at || 0));

/** أسماء من كُتبت عليهم ملاحظةٌ ذلك اليوم، بلا تكرارٍ ولو تعدّدت ملاحظاته. */
export const noteNames = (data, programId, weekId, students) => {
  const nameOf = Object.fromEntries((students || []).map((s) => [s.id, s.name || '']));
  const seen = [];
  for (const n of notesOfDay(data, programId, weekId)) {
    // الاسم الحيّ أولى — فمن صُحّح اسمُه في قاعدته يُقرأ مصحَّحًا
    const nm = nameOf[n.studentId] || n.studentName;
    if (nm && !seen.includes(nm)) seen.push(nm);
  }
  return seen;
};

/* -------------------------------- التنبيهات -------------------------------- */

/** مُددٌ معدودة: التنبيه الذي لا ينتهي يتكدّس حتى يصير خلفيةً لا تُقرأ. */
export const NOTICE_SPANS = [
  { days: 1, label: 'يوم' },
  { days: 3, label: '٣ أيام' },
  { days: 7, label: 'أسبوع' },
  { days: 0, label: 'لا ينتهي' },
];

const DAY_MS = 86_400_000;

/** هل ما زال حيًّا؟ و«لا ينتهي» يعني صفرًا، فلا يموت. */
export const noticeLive = (n, ms) => {
  if (!n) return false;
  const days = Number(n.days || 0);
  if (!days) return true;
  return (ms || Date.now()) - (n.at || 0) < days * DAY_MS;
};

export const hasRead = (n, userId) => (n?.reads || []).some((r) => r.userId === userId);

/**
 * من وُجّه إليهم التنبيه بأسمائهم: دائمًا مصفوفة، ولو كان `to` القديم نصًّا
 * واحدًا (من قبل أن يصير الاختيار متعددًا). والفاضية تعني «للكل».
 */
export const noticeTargets = (n) => {
  const to = n?.to;
  if (!to) return [];
  return Array.isArray(to) ? to.filter(Boolean) : [to];
};

/**
 * ما يظهر لهذا المستخدم الآن: الحيُّ الموجَّه إليه أو إلى الكل، وما لم يقرأه.
 *
 * والأقدم أولًا — فما مضى عليه وقتٌ أحقُّ أن يُقرأ قبل أن يموت.
 */
export const noticesFor = (data, user, ms) => {
  /**
   * والمديرُ لا يُنبَّه بما كتبه هو.
   *
   * وقعت في الفحص: كتب المديرُ تنبيهًا للفريق فقفز عليه هو، وسدّ شاشته حتى
   * يضغط «قرأت» على كلام نفسه. فمن كتبه لا يُعرض عليه، والمديرُ كاتبُ هذي
   * التنبيهات لا قارئُها — كما لا يُعدّ في «قرأه ٣ من ٥».
   */
  const id = typeof user === 'string' ? user : user?.id;
  if (!id || (typeof user === 'object' && user?.role === 'مدير')) return [];
  return (data?.notices || [])
    .filter((n) => {
      const targets = noticeTargets(n);
      return n.by !== id && noticeLive(n, ms) && !hasRead(n, id) && (!targets.length || targets.includes(id));
    })
    .slice()
    .sort((a, b) => (a.at || 0) - (b.at || 0));
};

/**
 * الردّ يُكتب، لا يُضغط.
 *
 * زرُّ «قرأت» وحده يقول إن أحدًا ضغط، ولا يقول إن أحدًا فهم. فطلب صاحبُ
 * التطبيق أن يكتب: «تم» أو ما شاء — فيُقرأ ردُّه أمام اسمه، ويُعرف من
 * استوعب من من مرّ عليه.
 *
 * والقراءة تُكتب مرةً واحدة: ضغطتان لا تصيران قارئين.
 */
export const markRead = (n, userId, ms, text) => (hasRead(n, userId) ? n
  : { ...n, reads: [...(n.reads || []), { userId, at: ms || Date.now(), text: String(text || '').trim() }] });

/** ردُّ فلانٍ على هذا التنبيه، كما كتبه. */
export const replyOf = (n, userId) => String((n?.reads || []).find((r) => r.userId === userId)?.text || '');

/**
 * من قرأ ومن لم يقرأ — وإنما تُحسب على من وُجّه إليهم، لا على كل من في
 * التطبيق: تنبيهٌ لواحدٍ لا يُقال فيه «قرأه ١ من ٥».
 */
export const readTally = (n, users) => {
  const targets = noticeTargets(n);
  const pool = (users || []).filter((u) => u.role !== 'مدير' && u.status !== 'غير نشط'
    && (!targets.length || targets.includes(u.id)));
  const read = pool.filter((u) => hasRead(n, u.id));
  const unread = pool.filter((u) => !hasRead(n, u.id));
  return { read, unread, text: `قرأه ${read.length} من ${pool.length}` };
};

/* --------------------------- المشرفون على ما أُقيم --------------------------- */

/**
 * من أقام المسابقة أو الدوري — اثنان على الأكثر، **بلا أوّلَ وثانٍ**.
 *
 * ولولا ذلك لصار كلٌّ يكتب صاحبه ثانيًا فتُعدّ المسابقة الواحدة مرتين. فهما
 * سواءٌ في سجلٍّ واحد، ومن ساعدهم وليس له حسابٌ يُكتب اسمه في `helper` —
 * يظهر في الورقة ولا يُطالَب بتقرير، فما له حسابٌ يكتب منه.
 */
export const SUPERVISOR_MAX = 2;

export const supervisorsOf = (run) => (run?.supervisors || []).filter(Boolean).slice(0, SUPERVISOR_MAX);

export const toggleSupervisor = (run, userId) => {
  const cur = supervisorsOf(run);
  if (cur.includes(userId)) return { ...run, supervisors: cur.filter((x) => x !== userId) };
  if (cur.length >= SUPERVISOR_MAX) return run;
  return { ...run, supervisors: [...cur, userId] };
};

/** أسماء من أقامها كما تُكتب في الورقة، ومعهم المتطوّع إن وُجد. */
export const supervisorNames = (run, users) => {
  const nameOf = Object.fromEntries((users || []).map((u) => [u.id, u.name || '']));
  const names = supervisorsOf(run).map((id) => nameOf[id]).filter(Boolean);
  const helper = String(run?.helper || '').trim();
  if (helper) names.push(helper);
  return names;
};

/**
 * ما أُقيم ولم يُكتب له مشرف.
 *
 * ولا يُخفى ولا يُحذف: لو سقط من التقارير بلا خبر، ضاع عملٌ عُمل ولم يشعر به
 * أحد. فيظهر للمدير ليُسنِده بضغطة.
 */
export const unassigned = (runs) => (runs || []).filter((r) => !supervisorsOf(r).length
  && !String(r?.helper || '').trim());

/* --------------------------------- القيمي --------------------------------- */

/**
 * القيمي: واحدٌ يُلقي موضوعًا، ويوثَّق بنقاطه أو بسؤالٍ وجواب أو بمقطعٍ
 * يُعرض. والاسم والعنوان إجباريان — فبهما يُعرف من ألقى وماذا ألقى، وما
 * تحتهما شرحٌ لا أصل.
 */
export const qiyamiMissing = (q) => {
  const miss = [];
  if (!supervisorsOf(q).length && !String(q?.helper || '').trim()) miss.push('الملقي');
  if (!String(q?.title || '').trim()) miss.push('العنوان');
  return miss;
};

export const qiyamiReady = (q) => qiyamiMissing(q).length === 0;

export const qiyamiOfDay = (data, programId, weekId) => (data?.qiyami || [])
  .filter((q) => q.programId === programId && q.weekId === weekId)
  .slice()
  .sort((a, b) => (a.at || 0) - (b.at || 0));

/**
 * رابط المقطع كما يُعرض داخل الصفحة.
 *
 * ويوتيوب يُعرض في إطارٍ من عنده — فلا يُحمَّل الفيديو من خادمنا ولا يُحسب
 * على نقله. وما سواه يُفتح خارجًا، فلا نَعِد بعرضٍ لا نملكه.
 */
export const videoEmbed = (url) => {
  const raw = String(url || '').trim();
  if (!raw) return '';
  let id = '';
  const m1 = /(?:youtube\.com|youtube-nocookie\.com)\/.*[?&]v=([A-Za-z0-9_-]{6,20})/.exec(raw);
  const m2 = /youtu\.be\/([A-Za-z0-9_-]{6,20})/.exec(raw);
  const m3 = /(?:youtube\.com|youtube-nocookie\.com)\/(?:embed|shorts|live)\/([A-Za-z0-9_-]{6,20})/.exec(raw);
  id = m1?.[1] || m2?.[1] || m3?.[1] || '';
  return id ? `https://www.youtube-nocookie.com/embed/${id}` : '';
};

/* ------------------------------- ملخّص اليوم ------------------------------- */

/**
 * السطور التي تعلو التقرير: كم مسابقةً أُقيمت، وهل كان قيمي، ومن كُتبت عليه
 * ملاحظة **في ذلك اليوم**.
 *
 * و`names: false` يشيل أسماء الأولاد ويبقي عددهم — لأن الورقة إذا خرجت من
 * التطبيق خرجت من الصلاحيات معها.
 */
export const daySummary = ({ comps = 0, qiyami = [], noteNames: notes = [], roll = null } = {},
  { names = true } = {}) => {
  const out = [];
  if (comps) out.push(`أُقيمت اليوم ${say(comps, 'competition')}`);
  for (const q of qiyami) {
    // `by` تجي اسمًا واحدًا مجموعًا أو قائمةَ أسماء — كلاهما يُقرأ
    const who = (Array.isArray(q.by) ? q.by.filter(Boolean).join(' و') : String(q.by || '')).trim();
    out.push(`القيمي: «${q.title}»${who && names ? ` — ألقاه ${who}` : ''}`);
  }
  if (notes.length) {
    // «على طالبين» لا «٢ طلاب» — يُقرأ كما يُقال
    const who = `ملاحظات سلوكية على ${say(notes.length, 'student')}`;
    out.push(names ? `${who}: ${notes.join(' · ')}` : who);
  }
  if (roll) out.push(`تقارير القادة: ${rollText(roll)}`);
  return out;
};
