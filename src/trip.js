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

/** الرفقة المعتادة: تظهر خياراتٍ عند إضافة مصروفٍ ولو لم تُكتب في السفرة بعد. */
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
export const nextDay = (trip) => dayName(new Set((trip?.expenseItems || []).map((x) => str(x?.day)).filter(Boolean)).size + 1);

/** اليوم الذي يبدأ به المصروف الجديد: آخر يومٍ كُتب، وإلا اليوم الأول. */
export const currentDay = (trip) => {
  const last = (trip?.expenseItems || []).map((x) => str(x?.day)).filter(Boolean).slice(-1)[0];
  return last || dayName(1);
};

const num = (v) => Number(v || 0) || 0;
const str = (v) => String(v ?? '').trim();

/** اسم اليوم كما كتبه صاحبه، أو «بلا يوم» لما لم يُحدَّد. */
export const NO_DAY = 'بلا يوم';

/** رفقة السفرة: من كتبهم صاحبها، ثم كل من دفع بندًا أو أخذ تسوية ولم يُكتب. */
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

/** مجموع ما بقي عليك لكل الرفقة. */
export const tripOwedTotal = (trip) => tripBalances(trip).reduce((s, b) => s + Math.max(0, b.owed), 0);

/** مصاريف كل يوم: مجموعه، ومجموع كل تصنيف فيه. اليوم بلا اسمٍ يأتي آخرًا. */
export const tripDays = (trip) => {
  const order = [];
  const map = new Map();
  for (const x of trip?.expenseItems || []) {
    const day = str(x?.day) || NO_DAY;
    if (!map.has(day)) { map.set(day, { day, total: 0, cats: {}, items: [] }); order.push(day); }
    const d = map.get(day);
    const cat = str(x?.cat) || 'أخرى';
    d.total += num(x?.amount);
    d.cats[cat] = (d.cats[cat] || 0) + num(x?.amount);
    d.items.push(x);
  }
  const days = order.map((k) => map.get(k));
  return [...days.filter((d) => d.day !== NO_DAY), ...days.filter((d) => d.day === NO_DAY)];
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
export const makeExpense = ({ id, name, amount, day, cat, paidBy }) => ({
  id,
  name: str(name),
  amount: Math.max(0, num(amount)),
  ...(str(day) ? { day: str(day) } : {}),
  ...(str(cat) ? { cat: str(cat) } : {}),
  ...(str(paidBy) ? { paidBy: str(paidBy) } : {}),
});

/** تسوية: ما أُعطيه واحدٌ من الرفقة. */
export const makeSettlement = ({ id, person, amount, date, note }) => ({
  id,
  person: str(person),
  amount: Math.max(0, num(amount)),
  ...(str(date) ? { date: str(date) } : {}),
  ...(str(note) ? { note: str(note) } : {}),
});

/**
 * نصٌّ يُرسل للرفقة: كم له وكم أُعطيه وكم بقي — يُقرأ بلا شرح.
 */
export const tripShareText = (trip, fmt = (n) => String(n)) => {
  const lines = [`حساب ${trip?.name || 'السفرة'}`, ''];
  const b = tripBalances(trip);
  if (!b.length) return lines.concat('ما فيه أحدٌ دفع من جيبه.').join('\n');
  for (const p of b) {
    lines.push(`${p.name}: دفع ${fmt(p.paid)}، أُعطي ${fmt(p.settled)}، ${p.owed > 0 ? `باقي له ${fmt(p.owed)}` : p.owed < 0 ? `أُعطي زيادة ${fmt(-p.owed)}` : 'مسدَّد'}`);
  }
  return lines.join('\n');
};
