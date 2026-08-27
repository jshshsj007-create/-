/**
 * حالة المشترك: هل هو مستمر معنا، أو بدأ يتقطّع، أو انقطع؟
 *
 * الغرض منها واحد: الطالب ما ينقطع دفعة وحدة — يغيب مرة، ثم مرتين، ثم تنساه.
 * ولو اتصلت عليه بعد غيبتين رجع، وبعد شهر ما رجع. فالتطبيق يقولها لك مبكرًا.
 *
 * نعدّ **بأيام البرنامج** لا بالتاريخ: «غاب آخر ثلاثة أيام» أصدق من «مرّ عليه
 * واحد وعشرون يومًا»، لأن الطالب اللي برنامجه واقف في الإجازة ما هو منقطعًا —
 * البرنامج هو الواقف. وهذا يعني كذلك أن حالته تبقى على ما كانت عليه في آخر
 * برنامج، ما دام ما فيه أيام جديدة تُحسب عليه.
 */

export const NEW = 'جديد';
export const ON = 'مستمر';
export const PART = 'متقطع';
export const OFF = 'منقطع';

/** بترتيب العرض: الحالة اللي تحتاج تدخّلك أولًا. */
export const STATES = [OFF, PART, ON, NEW];

export const TONES = { [ON]: 'green', [PART]: 'amber', [OFF]: 'red', [NEW]: 'slate' };

/** آخر كم يوم نسأل عنها. */
export const NEAR = 3;
export const FAR = 7;

/**
 * الرقمان يُضبطان من الإعدادات مرة واحدة لكل البرامج — لأن «متقطع» كلمة
 * لها معنى واحد في الفريق، ما تختلف من برنامج لبرنامج.
 * ونضمن `far >= near` وإلا انقلب المعنى: صار المتقطع أضيق من المستمر.
 */
export const stateOpts = (settings) => {
  const near = Math.max(1, Math.round(Number(settings?.stateNear) || NEAR));
  const far = Math.max(near, Math.round(Number(settings?.stateFar) || FAR));
  return { near, far };
};

/** الأقوى يغلب: يحضر في برنامج ويغيب عن ثانٍ = مستمر، لأنه ما انقطع عنّا. */
const RANK = { [ON]: 3, [PART]: 2, [OFF]: 1, [NEW]: 0 };

/**
 * حالة من سلسلة أيام مسجَّلة: `true` حضر و`false` غاب.
 * الأيام اللي ما تسجّل فيها حضور ولا غياب ما تدخل السلسلة أصلًا — اليوم اللي
 * ما جاء بعد ما ينحسب غيابًا على أحد.
 */
export const stateOf = (marks, { near = NEAR, far = FAR } = {}) => {
  const list = marks || [];
  if (!list.length) return NEW;
  if (list.slice(-near).some(Boolean)) return ON;
  if (list.slice(-far).some(Boolean)) return PART;
  return OFF;
};

/** حضور الطالب في يوم من برنامج مجمّع: الخريطة على مستوى البرنامج. */
const groupedMark = (program, weekId, partId) => program?.attendance?.[weekId]?.[partId];

/** مسجّل في هذا اليوم؟ المجمّع يحصر أيام كل مشترك، والمنفصل يومه واحد. */
const enrolled = (part, weekId) => !part?.days || part.days.includes(weekId);

/**
 * سلسلة أيام الطالب في برنامج واحد، بترتيب أيام البرنامج.
 * المجمّع: مشارك واحد على مستوى البرنامج وحضوره في خريطة الأيام.
 * المنفصل: لكل يوم قائمة مشاركين مستقلة.
 */
export const marksOf = (program, studentId) => {
  if (!program || !studentId) return [];
  const out = [];

  if (program.type === 'مجمع') {
    const part = (program.participants || []).find((p) => p.studentId === studentId);
    if (!part) return [];
    for (const w of program.weeks || []) {
      if (!enrolled(part, w.id)) continue;
      const mark = groupedMark(program, w.id, part.id);
      if (mark === 'حاضر') out.push(true);
      else if (mark === 'غائب') out.push(false);
    }
    return out;
  }

  for (const w of program.weeks || []) {
    const part = (w.participants || []).find((p) => p.studentId === studentId);
    if (!part) continue;
    if (part.attendance === 'حاضر') out.push(true);
    else if (part.attendance === 'غائب') out.push(false);
  }
  return out;
};

/** حالة الطالب عبر برامجه كلها — أقواها، لأن حضوره في أي برنامج حضورٌ معنا. */
export const studentState = (programs, studentId, opts) => {
  let best = NEW;
  for (const p of programs || []) {
    const st = stateOf(marksOf(p, studentId), opts);
    if (RANK[st] > RANK[best]) best = st;
  }
  return best;
};

/** عدد كل حالة، لعرضه في قائمة التصفية. */
export const stateCounts = (students, programs, opts) => {
  const out = { الكل: (students || []).length };
  for (const s of STATES) out[s] = 0;
  for (const st of students || []) out[studentState(programs, st.id, opts)] += 1;
  return out;
};
