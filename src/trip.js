/**
 * حساب السفرة مع رفقتها.
 *
 * في السفرة يدفع غيرُ صاحب الفريق أكثر المصاريف: فطورٌ وغداءٌ وعشاءٌ ومفرحاتٌ
 * وماءٌ وترفيه، يدفعها سعد وخالد ومحمد من جيوبهم، ثم يحاسبهم بعد كل يومٍ أو بعد
 * فترة. فالسؤال الذي لا بدّ أن يجيب عنه التطبيق: كم لكل واحدٍ عليّ الآن؟
 *
 * ولا نحذف شيئًا من المصروفات حين يُدفع لأحدهم: المصروف يبقى مصروفَ السفرة
 * كاملًا، والدفع له تسويةٌ تنقص ما له، لا مصروفٌ جديد — وإلا عددناه مرتين.
 */

/** وش شريت: سكن وبنزين وأكل وشرب، وأخرى يكتب فيها صاحبها بالضبط. */
export const TRIP_CATS = ['سكن', 'بنزين', 'أكل وشرب', 'أخرى'];

/** إذا اختار «أكل وشرب» ظهرت له هذي الخيارات بضغطة، فيعرف ما أُنفق على الفطور من الغداء. */
export const FOOD_SUBS = ['فطور', 'غداء', 'عشاء', 'مفرحات', 'ماء'];

/** الشباب المعتادون: تظهر خياراتٍ عند إضافة مصروفٍ ولو لم تُكتب في السفرة بعد. */
export const TRIP_CREW = ['العلوان', 'تركي', 'أبو فارس'];

/**
 * اسم اليوم بالترتيب: «اليوم الأول»، «الثاني»… لا «اليوم 1».
 *
 * الرقم وسط الكلام العربي ينقلب مكانه على الشاشة فيُقرأ «1 اليوم»، فنكتب الأسماء.
 * وما بعد العاشر يبقى برقمٍ بعد علامة اتجاه تُثبّته.
 */
const ORDINALS = ['الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس', 'السابع', 'الثامن', 'التاسع', 'العاشر'];
export const dayName = (n) => (n >= 1 && n <= ORDINALS.length ? `اليوم ${ORDINALS[n - 1]}` : `اليوم ${n}\u200F`);

/** اسم اليوم التالي، فيقع المصروف في يومه بلا كتابة. */
export const nextDay = (trip) => dayName(new Set((trip?.expenseItems || []).map((x) => str(x?.day)).filter((d) => d && d !== PRE_DAY)).size + 1);

/** اليوم الذي يبدأ به المصروف الجديد: آخر يومٍ كُتب، وإلا اليوم الأول. */
export const currentDay = (trip) => {
  const last = (trip?.expenseItems || []).map((x) => str(x?.day)).filter((d) => d && d !== PRE_DAY).slice(-1)[0];
  return last || dayName(1);
};

const num = (v) => Number(v || 0) || 0;
const str = (v) => String(v ?? '').trim();

/** اسم اليوم كما كتبه صاحبه، أو «بلا يوم» لما لم يُحدَّد. */
export const NO_DAY = 'بلا يوم';

/**
 * ما صُرف قبل أن تبدأ السفرة: حجزٌ وتجهيزاتٌ وما يُشترى مسبقًا.
 *
 * ليس يومًا من أيامها، فلا يُعدّ فيها ولا يزيح «اليوم الأول» عن مكانه، لكنه من مصروف
 * السفرة ويدخل حساب من دفعه كغيره.
 */
export const PRE_DAY = 'قبل السفرة';

/** شباب السفرة: من كتبهم صاحبها، ثم كل من دفع بندًا أو أخذ تسوية ولم يُكتب. */
export const tripPeople = (trip) => {
  const out = [];
  const add = (n) => { const s = str(n); if (s && !out.includes(s)) out.push(s); };
  (trip?.people || []).forEach(add);
  (trip?.expenseItems || []).forEach((x) => add(x?.paidBy));
  (trip?.settlements || []).forEach((x) => add(x?.person));
  return out;
};

/**
 * ما لكل واحدٍ وما عليه.
 *
 * `paid` ما دفعه من جيبه، و`settled` ما أُعطيه، و`owed` الباقي له.
 * والسالب يعني أُعطي أكثر مما دفع (سلفةً مثلًا) فيُعرض كما هو، لا يُخفى.
 */
export const tripBalances = (trip) => tripPeople(trip).map((name) => {
  const paid = (trip?.expenseItems || []).filter((x) => str(x?.paidBy) === name).reduce((s, x) => s + num(x?.amount), 0);
  const settled = (trip?.settlements || []).filter((x) => str(x?.person) === name).reduce((s, x) => s + num(x?.amount), 0);
  return { name, paid, settled, owed: paid - settled };
});

/** مجموع ما بقي عليك لكل الشباب. */
export const tripOwedTotal = (trip) => tripBalances(trip).reduce((s, b) => s + Math.max(0, b.owed), 0);

/** مصاريف كل يوم: مجموعه، ومجموع كل تصنيف فيه. اليوم بلا اسمٍ يأتي آخرًا. */
export const tripDays = (trip) => {
  const order = [];
  const map = new Map();
  for (const x of trip?.expenseItems || []) {
    const day = str(x?.day) || NO_DAY;
    if (!map.has(day)) { map.set(day, { day, total: 0, cats: {}, subs: {}, items: [] }); order.push(day); }
    const d = map.get(day);
    const cat = str(x?.cat) || 'أخرى';
    d.total += num(x?.amount);
    d.cats[cat] = (d.cats[cat] || 0) + num(x?.amount);
    // تفصيل الأكل: فطور وغداء وعشاء… تحت مجموع الأكل لا بدلًا منه
    if (str(x?.sub)) {
      d.subs[cat] = d.subs[cat] || {};
      d.subs[cat][str(x.sub)] = (d.subs[cat][str(x.sub)] || 0) + num(x?.amount);
    }
    d.items.push(x);
  }
  const days = order.map((k) => map.get(k));
  // قبل السفرة أولًا، ثم الأيام بترتيبها، ثم ما بلا يومٍ آخرًا
  return [...days.filter((d) => d.day === PRE_DAY), ...days.filter((d) => d.day !== NO_DAY && d.day !== PRE_DAY), ...days.filter((d) => d.day === NO_DAY)];
};

/** مجموع كل تصنيف في السفرة كلها. */
export const tripCats = (trip) => {
  const m = {};
  for (const x of trip?.expenseItems || []) {
    const c = str(x?.cat) || 'أخرى';
    m[c] = (m[c] || 0) + num(x?.amount);
  }
  // ما كُتب قديمًا بغير هذه التصنيفات يبقى ظاهرًا بعدها، فلا يضيع من الحساب
  const known = TRIP_CATS.filter((c) => m[c]);
  const other = Object.keys(m).filter((c) => !TRIP_CATS.includes(c));
  return [...known, ...other].map((c) => ({ cat: c, total: m[c] }));
};

/**
 * بندٌ جديد. المبلغ موجبٌ دائمًا، والاسم مطلوب، والدافع إن لم يُكتب فهو من
 * صندوق السفرة نفسه لا من جيب أحد.
 */
export const makeExpense = ({ id, name, amount, day, cat, paidBy, sub }) => ({
  id,
  name: str(name),
  amount: Math.max(0, num(amount)),
  ...(str(day) ? { day: str(day) } : {}),
  ...(str(cat) ? { cat: str(cat) } : {}),
  ...(str(paidBy) ? { paidBy: str(paidBy) } : {}),
  ...(str(sub) ? { sub: str(sub) } : {}),
});

/** كيف سُدِّد: نقدًا أو تحويلًا أو غير ذلك. */
export const HOW = ['كاش', 'تحويل', 'غير ذلك'];

/** تسوية: ما أُعطيه واحدٌ من الشباب. */
export const makeSettlement = ({ id, person, amount, date, note, how }) => ({
  id,
  person: str(person),
  amount: Math.max(0, num(amount)),
  ...(str(date) ? { date: str(date) } : {}),
  ...(str(how) ? { how: str(how) } : {}),
  ...(str(note) ? { note: str(note) } : {}),
});
