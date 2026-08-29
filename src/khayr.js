/**
 * برنامج «خيركم»: الطالب يسمّع على الشيخ، والشيخ يسجّل — والطالب يقرأ ولا يكتب.
 *
 * هذي القاعدة صمّمنا عليها كل شي: لو قدر الطالب يكتب إنه حفظ وجهًا وهو ما حفظه،
 * انهدم السجل كله. فالكتابة للشيخ وحده، والطالب يشوف نفسه فقط.
 *
 * القسم مستقل عن برامج التسجيل: طلابه قائمته الخاصة، ما لهم علاقة بمشتركي
 * البرامج ولا بأولياء الأمور.
 */

import { PAGE_STARTS } from './pages.js';

/** سور القرآن بترتيب المصحف — تُعرض قائمةً يختار منها الشيخ بدل ما يكتب. */
export const SURAHS = [
  'الفاتحة', 'البقرة', 'آل عمران', 'النساء', 'المائدة', 'الأنعام', 'الأعراف', 'الأنفال',
  'التوبة', 'يونس', 'هود', 'يوسف', 'الرعد', 'إبراهيم', 'الحجر', 'النحل', 'الإسراء',
  'الكهف', 'مريم', 'طه', 'الأنبياء', 'الحج', 'المؤمنون', 'النور', 'الفرقان', 'الشعراء',
  'النمل', 'القصص', 'العنكبوت', 'الروم', 'لقمان', 'السجدة', 'الأحزاب', 'سبأ', 'فاطر',
  'يس', 'الصافات', 'ص', 'الزمر', 'غافر', 'فصلت', 'الشورى', 'الزخرف', 'الدخان', 'الجاثية',
  'الأحقاف', 'محمد', 'الفتح', 'الحجرات', 'ق', 'الذاريات', 'الطور', 'النجم', 'القمر',
  'الرحمن', 'الواقعة', 'الحديد', 'المجادلة', 'الحشر', 'الممتحنة', 'الصف', 'الجمعة',
  'المنافقون', 'التغابن', 'الطلاق', 'التحريم', 'الملك', 'القلم', 'الحاقة', 'المعارج',
  'نوح', 'الجن', 'المزمل', 'المدثر', 'القيامة', 'الإنسان', 'المرسلات', 'النبأ', 'النازعات',
  'عبس', 'التكوير', 'الانفطار', 'المطففين', 'الانشقاق', 'البروج', 'الطارق', 'الأعلى',
  'الغاشية', 'الفجر', 'البلد', 'الشمس', 'الليل', 'الضحى', 'الشرح', 'التين', 'العلق',
  'القدر', 'البينة', 'الزلزلة', 'العاديات', 'القارعة', 'التكاثر', 'العصر', 'الهمزة',
  'الفيل', 'قريش', 'الماعون', 'الكوثر', 'الكافرون', 'النصر', 'المسد', 'الإخلاص',
  'الفلق', 'الناس',
];

/**
 * أول وجه لكل سورة في مصحف المدينة، بترتيب `SURAHS`.
 *
 * يبقى للعرض السريع وللتحقق من فهرس الأوجه — طابقه في السور المئة والأربع
 * عشرة كلها. أمّا حساب المدى فيمرّ على `PAGE_STARTS` لأنه يعرف الآيات.
 */
export const SURAH_PAGE = [
  1, 2, 50, 77, 106, 128, 151, 177, 187, 208, 221, 235, 249, 255, 262, 267, 282,
  293, 305, 312, 322, 332, 342, 350, 359, 367, 377, 385, 396, 404, 411, 415, 418,
  428, 434, 440, 446, 453, 458, 467, 477, 483, 489, 496, 499, 502, 507, 511, 515,
  518, 520, 523, 526, 528, 531, 534, 537, 542, 545, 549, 551, 553, 554, 556, 558,
  560, 562, 564, 566, 568, 570, 572, 574, 575, 577, 578, 580, 582, 583, 585, 586,
  587, 587, 589, 590, 591, 591, 592, 593, 594, 595, 595, 596, 596, 597, 597, 598,
  598, 599, 599, 600, 600, 601, 601, 601, 602, 602, 602, 603, 603, 603, 604, 604, 604,
];

/** أقسام التسميع الثلاثة. الحفظ وحده هو اللي يتراكم لو قصّر عنه. */
export const PARTS = [
  { id: 'review', label: 'مراجعة' },
  { id: 'tathbit', label: 'تثبيت' },
  { id: 'hifz', label: 'حفظ' },
];

export const emptyWird = () => ({ review: 0, tathbit: 0, hifz: 0 });

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** «من الناس إلى النبأ» و«من المرسلات إلى الواقعة ٤٠» — الآية تُذكر لما تُكتب فقط. */
const oneRange = (part) => {
  const from = String(part?.from || '').trim();
  const to = String(part?.to || '').trim();
  if (!from && !to) return '';
  const side = (s, aya) => (s ? `${s}${num(aya) ? ` ${num(aya)}` : ''}` : '');
  if (from && to) return `من ${side(from, part.fromAya)} إلى ${side(to, part.toAya)}`;
  return from ? `من ${side(from, part.fromAya)}` : `إلى ${side(to, part.toAya)}`;
};

/**
 * مدى القسم معروضًا. وبعض الطلاب يسمّعون من موضعين في الجلسة الواحدة، فيُكتب
 * الثاني في `extra` ويُعرض معه — والأصل موضع واحد، فالثاني يبقى فارغًا عند
 * عامّتهم ولا يظهر أثره أصلًا.
 */
export const rangeText = (part) => {
  const main = oneRange(part);
  const extra = oneRange(part?.extra);
  return main && extra ? `${main} · و${extra}` : main || extra;
};

/**
 * أوجه هذا القسم في هذي الجلسة — المديان مجموعان.
 *
 * الجمع هنا عمدًا: كل ما فوقه (المتراكم، الدورة، التقرير) يقرأ من هذي الدالة،
 * فبجمعها في مكان واحد يدخل المدى الثاني الحساب كله بلا ما نلمس شيئًا غيرها.
 */
export const pagesOf = (entry, partId) =>
  num(entry?.[partId]?.pages) + num(entry?.[partId]?.extra?.pages);

/**
 * المتراكم بعد جلسة واحدة.
 *  حاضر: المطلوب ناقص المسمَّع. سمّع أكثر؟ يعوّض من رصيده، وما ينزل تحت صفر.
 *  غائب: الشيخ يكتب العدد بنفسه — التطبيق ما يعرف مين معذور.
 */
export const carryAfter = (before, entry, wirdHifz) => {
  if (!entry) return before;
  if (entry.present === false) return Math.max(0, before + num(entry.due));
  return Math.max(0, before + (num(wirdHifz) - pagesOf(entry, 'hifz')));
};

/** الجلسات مرتّبة بالتاريخ — الترتيب مهم لأن المتراكم يتراكم بترتيبها. */
export const sortedSessions = (sessions) =>
  [...(sessions || [])].sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));

/**
 * حصيلة طالب عبر جلسات: كم حضر، وكم سمّع في كل قسم، وكم تراكم عليه.
 * `sessions` تُمرَّر مفلترة مسبقًا (ترم معيّن أو كل المواسم).
 */
export const studentTotals = (student, sessions) => {
  const wird = student?.wird || emptyWird();
  let attended = 0, absent = 0, carry = 0;
  const pages = { review: 0, tathbit: 0, hifz: 0 };

  for (const s of sortedSessions(sessions)) {
    const entry = s.entries?.[student.id];
    if (!entry) continue;               // ما سُجّل له شي في هذي الجلسة
    if (entry.present === false) absent++;
    else {
      attended++;
      for (const p of PARTS) pages[p.id] += pagesOf(entry, p.id);
    }
    carry = carryAfter(carry, entry, wird.hifz);
  }
  return { attended, absent, carry, ...pages };
};

export const allTotals = (students, sessions) =>
  (students || []).map((st) => ({ student: st, ...studentTotals(st, sessions) }));

/**
 * صفوف التقرير: الحضور والأوجه عن الموسم المعروض، والمتراكم عن العمر كله.
 *
 * المتراكم دَين ما ينمحي بانتهاء الترم — لو حسبناه من جلسات الموسم وحده،
 * صفّرته الإجازة عن اللي قصّر، وهذا كذب على الشيخ وعلى الطالب.
 */
export const khayrRows = (students, scoped, all) =>
  (students || []).map((st) => ({
    student: st,
    ...studentTotals(st, scoped),
    carry: studentTotals(st, all).carry,
  }));

/** تقرير يُنسخ ويُرسل — نص صافٍ بلا جداول، عشان يقرأ في واتساب. */
export const khayrReportText = (rows, title) => {
  const lines = [title];
  for (const r of rows) {
    lines.push('', r.student.name,
      `  الحضور: ${r.attended}${r.absent ? ` · الغياب: ${r.absent}` : ''}`,
      `  مراجعة: ${r.review} · تثبيت: ${r.tathbit} · حفظ: ${r.hifz}`,
      `  المتراكم: ${r.carry}`);
  }
  return lines.join('\n');
};

/** جلسات طالب بعينه، من الأحدث للأقدم — هذا اللي يقراه في سجلّه. */
export const studentSessions = (student, sessions) =>
  sortedSessions(sessions)
    .filter((s) => s.entries?.[student?.id])
    .reverse()
    .map((s) => ({ session: s, entry: s.entries[student.id] }));

/** الطالب المربوط بهذا الحساب، إن وُجد. */
export const studentOfUser = (students, userId) =>
  (students || []).find((s) => s.userId && s.userId === userId) || null;

/* ------------------------- الأجزاء والأوجه ------------------------- */

/** الجزء عشرون وجهًا — الوحدة اللي يتحوّل بها كلام الشيخ إلى رقم واحد. */
export const PAGES_PER_PART = 20;

export const toPages = (n, unit) =>
  Math.round(num(n) * (unit === 'parts' ? PAGES_PER_PART : 1));

/**
 * «جزءان و٧ أوجه» — الشيخ يقول أجزاء والتطبيق يخزّن أوجهًا، فنرجّع كلامه له
 * كما يقوله. الرقم الخام يبقى وحده الحقيقة، وهذا عرضه فقط.
 */
export const partsText = (pages) => {
  const p = num(pages);
  if (!p) return '0';
  const parts = Math.floor(p / PAGES_PER_PART);
  const rest = p % PAGES_PER_PART;
  const partWord = parts === 1 ? 'جزء' : parts === 2 ? 'جزءان' : parts <= 10 ? `${parts} أجزاء` : `${parts} جزءًا`;
  const pageWord = rest === 1 ? 'وجه' : rest === 2 ? 'وجهان' : rest <= 10 ? `${rest} أوجه` : `${rest} وجهًا`;
  if (!parts) return pageWord;
  if (!rest) return partWord;
  return `${partWord} و${pageWord}`;
};

/** محفوظ الطالب بالأوجه — منه تُقاس دورة المراجعة كلها. */
export const memorizedPages = (student) => toPages(student?.mem?.amount, student?.mem?.unit);

/** «من الناس إلى الروم» — حدّ المحفوظ كما يكتبه الشيخ. */
export const memRangeText = (student) => {
  const from = String(student?.mem?.from || '').trim();
  const to = String(student?.mem?.to || '').trim();
  return from && to ? `من ${from} إلى ${to}` : from ? `من ${from}` : to ? `إلى ${to}` : '';
};

/* --------------------------- دورة المراجعة --------------------------- */

/**
 * الدورة: أن يمرّ الطالب على محفوظه كله مراجعةً. ما نطلب من الشيخ يعلّم بدايتها
 * ولا نهايتها — نجمع أوجه مراجعته جلسةً بعد جلسة، فإذا بلغ المجموع محفوظه
 * أُقفلت الدورة وبدأت التالية من نفسها. رقم واحد يدخله، والباقي يُحسب.
 */
export const reviewCycles = (student, sessions) => {
  const total = memorizedPages(student);
  const done = [];
  let cur = { pages: 0, marks: [] };
  for (const s of sortedSessions(sessions)) {
    const entry = s.entries?.[student?.id];
    if (!entry || entry.present === false) continue;
    const pages = pagesOf(entry, 'review');
    if (!pages) continue;
    cur.marks.push({ date: s.date || '', pages });
    cur.pages += pages;
    if (total > 0 && cur.pages >= total) { done.push(cur); cur = { pages: 0, marks: [] }; }
  }
  return { total, done, current: cur };
};

/** هدف الدورة بالجلسات — ثلاث بشكل افتراضي، كما هو عرف الحلقة. */
export const cycleTarget = (student) => {
  const n = num(student?.mem?.target);
  return n > 0 ? n : 3;
};

/**
 * انزلاق الدورة: المحفوظ يكبر كل أسبوع والورد ثابت، فالدورة تطول من نفسها
 * وما أحد ينتبه — الطالب يسمّع نفس القدر كل جلسة ويبدو منضبطًا.
 * فنحسبها بالقسمة: كم جلسة يحتاج ليمرّ على محفوظه بورده الحالي.
 */
export const cycleDrift = (student) => {
  const total = memorizedPages(student);
  const wird = num(student?.wird?.review);
  const target = cycleTarget(student);
  if (!total || !wird) return null;

  /*
   * نقرّب لأقرب عدد لا لأعلاه: عشرة أجزاء بورد ثلاثة تُقال «ثلاث جلسات» كما
   * يقولها الشيخ، لا أربعًا. ولو رفعناها لأعلى لصاح المنبّه على طالب ماشٍ
   * على الخطة تمامًا — ومنبّهٌ يصيح على السليم لا يُسمَع له يوم يصيح على المنزلق.
   */
  const need = Math.max(1, Math.round(total / wird));
  if (need <= target) return { ok: true, need, target };

  // والاقتراح يُرفع لأعلى: لازم يكفي فعلًا، وبأجزاء كاملة لأن الشيخ يفكّر بها
  const raw = Math.ceil(total / target);
  const suggest = student?.wird?.reviewUnit === 'pages'
    ? raw
    : Math.ceil(raw / PAGES_PER_PART) * PAGES_PER_PART;
  return { ok: false, need, target, suggest };
};

/* ---------------------------- موضع الطالب ---------------------------- */

/**
 * وين وقف في آخر جلسة. الشيخ ما يلزمه يفتح الجلسة الماضية ليتذكّر —
 * الموضع يمشي مع الطالب، وخانة «من» تُفتح عليه.
 */
export const lastStop = (student, sessions, partId) => {
  for (const { entry } of studentSessions(student, sessions)) {
    const part = entry?.[partId];
    if (part?.to) return { from: part.to, fromAya: part.toAya || '' };
  }
  return null;
};

/** «الحديد ١٢» — موضعه معروضًا. */
export const stopText = (stop) =>
  !stop?.from ? '' : `${stop.from}${num(stop.fromAya) ? ` ${num(stop.fromAya)}` : ''}`;

/* ------------------------- أوجه المدى تلقائيًا ------------------------- */

export const pageOfSurah = (name) => {
  const i = SURAHS.indexOf(String(name || '').trim());
  return i < 0 ? null : SURAH_PAGE[i];
};

/**
 * وجه أي موضع من المصحف: نبحث في فهرس الأوجه عن آخر وجه بدايته قبل الموضع
 * أو عنده. بحث ثنائي لأن الفهرس مرتّب، فما نمرّ على ستمئة وأربعة في كل ضغطة.
 *
 * بلا آية نأخذ أول السورة — وهو ما كان يفعله الحساب القديم كله.
 */
export const pageOfAyah = (surah, ayah) => {
  const s = SURAHS.indexOf(String(surah || '').trim()) + 1;
  if (s < 1) return null;
  const a = Math.max(1, num(ayah) || 1);
  let lo = 0;
  let hi = PAGE_STARTS.length / 2 - 1;
  let page = 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const ms = PAGE_STARTS[mid * 2];
    const ma = PAGE_STARTS[mid * 2 + 1];
    if (ms < s || (ms === s && ma <= a)) { page = mid + 1; lo = mid + 1; } else hi = mid - 1;
  }
  return page;
};

/**
 * كم وجهًا بين موضعين. الطالب يحفظ من آخر المصحف لأوله، فالمدى يجي مقلوبًا —
 * ولذلك نأخذ الفرق مطلقًا: «من الناس إلى المسد» و«من المسد إلى الناس» سواء.
 *
 * والحدّان داخلان في العدّ (+1)، لأن من سمّع وجهًا واحدًا سمّع وجهًا لا صفرًا.
 */
export const pagesBetween = (from, to, fromAya, toAya) => {
  const a = pageOfAyah(from, fromAya);
  const b = pageOfAyah(to, toAya);
  if (a === null || b === null) return null;
  return Math.abs(b - a) + 1;
};

/** موضع الطالب في الأقسام الثلاثة، لتعبئة «من» عند فتح تسميعه. */
export const stopsOf = (student, sessions) =>
  Object.fromEntries(PARTS.map((p) => [p.id, lastStop(student, sessions, p.id)]));
