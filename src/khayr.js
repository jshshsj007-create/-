/**
 * برنامج «خيركم»: الطالب يسمّع على الشيخ، والشيخ يسجّل — والطالب يقرأ ولا يكتب.
 *
 * هذي القاعدة صمّمنا عليها كل شي: لو قدر الطالب يكتب إنه حفظ وجهًا وهو ما حفظه،
 * انهدم السجل كله. فالكتابة للشيخ وحده، والطالب يشوف نفسه فقط.
 *
 * القسم مستقل عن برامج التسجيل: طلابه قائمته الخاصة، ما لهم علاقة بمشتركي
 * البرامج ولا بأولياء الأمور.
 */

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
export const rangeText = (part) => {
  const from = String(part?.from || '').trim();
  const to = String(part?.to || '').trim();
  if (!from && !to) return '';
  const side = (s, aya) => (s ? `${s}${num(aya) ? ` ${num(aya)}` : ''}` : '');
  if (from && to) return `من ${side(from, part.fromAya)} إلى ${side(to, part.toAya)}`;
  return from ? `من ${side(from, part.fromAya)}` : `إلى ${side(to, part.toAya)}`;
};

/** أوجه هذا القسم في هذي الجلسة. */
export const pagesOf = (entry, partId) => num(entry?.[partId]?.pages);

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
