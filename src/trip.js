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

/** تصنيفات مصروف اليوم، بترتيب ظهورها. */
export const TRIP_CATS = ['فطور', 'غداء', 'عشاء', 'مفرحات', 'ماء', 'ترفيه', 'أخرى'];

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
  return TRIP_CATS.filter((c) => m[c]).map((c) => ({ cat: c, total: m[c] }));
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
