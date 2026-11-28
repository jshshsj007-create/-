/**
 * من يرى «التسميع اليومي» ويكتب فيه.
 *
 * كل طالبٍ يسمّع للوكيل من حسابه، فتُحفظ نتيجته باسمه. ولا يرى غيرُه نتيجته ولا يكتب فيها، لأن فيها ما يخصّ
 * ولدًا بعينه: متى سمّع وكم أعاد. والمديرُ ومن أُعطي «خيركم» يرون الكل، فهم من يتابعون الطلاب.
 *
 * وكما في بقية الخادم: المنع هنا لا في الواجهة. فمن فتح جهازه وغيّر ما يُرسل لم يصل منه إلا ما يخصّه هو،
 * ولا يُقبل منه إلا حقولٌ معروفةٌ بقيمٍ في حدودها، وباسمه هو مهما ادّعى.
 *
 * ولا يُحفظ صوتٌ ولا نصٌّ مسموع: عددٌ فقط (كم كلمة، وكم مرةً أُعيد). صوت طفلٍ لا يُحفظ.
 */

const LEVELS = ['strict', 'normal', 'lenient'];
/** أقصى ما يحمله طالبٌ واحد: ما بعده يُسقَط الأقدم، فلا تنتفخ البيانات. */
export const DAILY_MAX = 400;
/** أقصى ما يُضاف في حفظةٍ واحدة. */
export const DAILY_BATCH = 10;

const int = (v, lo, hi) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo;
};

/** جلسةٌ نظيفة باسم صاحبها: الحقول المعروفة وحدها، وقيمها في حدودها. ويرجع null لما لا يصحّ. */
export const cleanSession = (x, me, now = Date.now()) => {
  if (!x?.id || !me?.id) return null;
  const surah = int(x.surah, 1, 114);
  const from = int(x.from, 1, 286);
  const to = Math.max(from, int(x.to, 1, 286));
  const words = int(x.words, 1, 20000);
  return {
    id: String(x.id).slice(0, 40),
    userId: me.id,
    ...(x.studentId ? { studentId: String(x.studentId).slice(0, 40) } : {}),
    // التاريخ من الجهاز، لكن لا يسبق الآن بأكثر من يوم ولا يرجع قبل ألفي عام: عددٌ معقول لا حِيلة
    at: Math.min(now + 86400000, Math.max(0, int(x.at, 0, 9e15))),
    surah, from, to, words,
    repeats: int(x.repeats, 0, 500),
    hints: int(x.hints, 0, words),
    level: LEVELS.includes(x.level) ? x.level : 'normal',
    ...(Number(x.ms) > 0 ? { ms: int(x.ms, 0, 6 * 3600 * 1000) } : {}),
  };
};

/** ما يُرسل لهذا الحساب: كلّها لمن يتابع الطلاب (مدير أو «خيركم»)، وإلا ما خصّه. */
export const dailySeen = (sessions, me, all) =>
  (all ? (sessions || []) : (sessions || []).filter((s) => s?.userId && s.userId === me?.id));

/**
 * ما يُقبل من حفظة هذا الحساب.
 *
 * من يتابع الطلاب: يُقبل ما أرسل. وغيره: تبقى جلسات غيره كما هي في المخزن، وتُستبدل جلساته هو بما أرسل
 * منقّحًا (فيحذف ما شاء من جلساته)، ولا يُقبل منه إلا عشرٌ جديدة في الحفظة، وأربعمئة في المجموع.
 */
export const dailyKept = (incoming, current, me, all, now = Date.now()) => {
  if (all) return incoming || [];
  const old = current || [];
  const others = old.filter((s) => s?.userId !== me?.id);
  const mineOld = new Map(old.filter((s) => s?.userId === me?.id).map((s) => [s.id, s]));
  const taken = new Set(others.map((x) => x?.id));
  const seen = new Set();
  const fresh = [];
  const kept = [];
  for (const x of incoming || []) {
    // معرّفُ جلسة غيره لا يُقبل لجلسته (وإلا ظهرت جلستان بمعرّفٍ واحد)، ولا يتكرّر معرّفٌ في الحفظة نفسها
    if (!x?.id || taken.has(x.id) || seen.has(x.id)) continue;
    seen.add(x.id);
    if (mineOld.has(x.id)) kept.push(mineOld.get(x.id));          // جلسةٌ قائمة: لا تُعدَّل بعد حفظها
    else if (fresh.length < DAILY_BATCH) {
      const c = cleanSession(x, me, now);
      if (c) fresh.push(c);
    }
  }
  const mine = [...kept, ...fresh].sort((a, b) => (a.at || 0) - (b.at || 0)).slice(-DAILY_MAX);
  return [...others, ...mine];
};
