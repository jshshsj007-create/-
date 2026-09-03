/**
 * «كم معك؟» — رصيد كل حساب.
 *
 * التطبيق يعرف من أي حسابٍ وصل كل ريال ومن أيّه خرج، لكنه ما كان يجمعها لك.
 * فيتصل بك أبو فارس آخر الأسبوع يسأل «كم معي؟» وما عندك جواب.
 *
 * والحساب هنا نقدٌ لا ربح: كم في يده الآن، لا كم كسب الفريق. ولهذا يدخله
 * المدفوع مقدّمًا — فلوسٌ قبضها فعلًا وإن كانت جمعتُها ما صارت — ويخرج منه
 * المصروف ونصيب المدارس ونصيب فيض وما سلّمه لغيره.
 */

/** المُعرّف الذي يعني «ما دفع»، لا حسابًا. */
export const UNPAID = 'unpaid';

/** دفاتر البرنامج: المجمّع دفتره واحد على مستواه، والمنفصل دفتر لكل يوم. */
const ledgersOf = (p) => (p?.type === 'مجمع' ? [p] : (p?.weeks || []));

const num = (v) => Number(v || 0) || 0;

/**
 * هل هذا الصف مالٌ في يدك؟
 *
 * المؤكَّد نعم. والمعلّق لا — ما تأكّد وصوله. إلا المدفوع مقدّمًا: صاحبه دفع
 * المدة كلها مرة واحدة، فالمال عندك من يومها وإن بقيت أسابيعه تُدخَل واحدًا
 * واحدًا.
 */
export const inHand = (x) =>
  Boolean(x?.accountId) && x.accountId !== UNPAID && (!x.pending || x.prepaid === true);

const OUT_KEYS = ['expenseItems', 'schoolPayouts', 'faidPayouts'];

/**
 * بقيّة الاشتراك التي ما نزلت دفترًا بعد.
 *
 * من اشترك موسمًا عشرة أيام دفع ثلاثمئة في يومه، وما نزل من دفاتر البرنامج
 * إلا ما أُنشئ منه. فلو عددنا الدفاتر وحدها قلنا لصاحب الحساب «معك ثلاثون»
 * وفي يده ثلاثمئة.
 *
 * فنحسب ما بقي من مبلغ الاشتراك — مالٌ في يده، محفوظٌ لأيامٍ ما صارت، فما
 * يُوزَّع على المدارس وفيض حتى تصير.
 */
export const subRests = (data) => {
  const subs = new Map();
  for (const p of data?.programs || []) {
    for (const l of ledgersOf(p)) {
      for (const x of l?.participants || []) {
        if (!x?.sub?.id) continue;
        const g = subs.get(x.sub.id) || { accountId: x.accountId, total: num(x.sub.total), paid: 0, last: x };
        g.paid += num(x.amount);
        g.accountId = x.accountId;
        g.last = x;
        subs.set(x.sub.id, g);
      }
    }
  }
  const out = [];
  for (const g of subs.values()) {
    const rest = g.total - g.paid;
    // ما تأكّد وصوله ما يُعدّ في اليد، ولا نعدّ فاضلًا سالبًا
    if (rest > 0 && inHand(g.last)) out.push({ accountId: g.accountId, amount: rest });
  }
  return out;
};

/**
 * رصيد حسابٍ واحد، ومعه كم منه محفوظ.
 *
 * `held` جزءٌ من `balance` لا يُطرح منه: هو مالٌ في يدك، لكنه ليس إيرادك بعد
 * — فما يُوزَّع على المدارس وفيض.
 */
export const cashOf = (data, accountId) => {
  let inflow = 0;
  let outflow = 0;
  let held = 0;
  for (const p of data?.programs || []) {
    for (const l of ledgersOf(p)) {
      for (const x of l?.participants || []) {
        if (x.accountId !== accountId || !inHand(x)) continue;
        inflow += num(x.amount);
        if (x.pending) held += num(x.amount);
      }
      for (const c of l?.collections || []) if (c.accountId === accountId) inflow += num(c.amount);
      for (const key of OUT_KEYS) {
        for (const it of l?.[key] || []) if (it.accountId === accountId) outflow += num(it.amount);
      }
    }
  }
  // وبقيّة الاشتراك في يده، محفوظةً لأيامها
  for (const r of subRests(data)) {
    if (r.accountId !== accountId) continue;
    inflow += r.amount;
    held += r.amount;
  }
  // ما سلّمه لغيره يخرج، وما سُلّم إليه يدخل
  for (const h of data?.handovers || []) {
    if (h.fromId === accountId) outflow += num(h.amount);
    if (h.toId === accountId) inflow += num(h.amount);
  }
  return { inflow, outflow, held, balance: inflow - outflow };
};

/** الحسابات كلها بأرصدتها، بترتيبها كما عرّفها صاحب التطبيق. */
export const cashRows = (data) =>
  (data?.faidAccounts || []).map((a) => ({ id: a.id, name: a.name, ...cashOf(data, a.id) }));

export const cashTotals = (rows) => (rows || []).reduce(
  (t, r) => ({ balance: t.balance + r.balance, held: t.held + r.held }),
  { balance: 0, held: 0 },
);

/**
 * من دفع في هذا الحساب: صفوف المشتركين وحدها، مرتّبةً بالأحدث.
 *
 * التحصيل الإضافي والمصروف لهما شاشاتهما في البرنامج، وهذي تجاوب سؤالًا
 * واحدًا: من أين جاءت فلوس هذا الحساب.
 */
export const cashPayers = (data, accountId) => {
  const out = [];
  for (const p of data?.programs || []) {
    for (const l of ledgersOf(p)) {
      for (const x of l?.participants || []) {
        if (x.accountId !== accountId || !inHand(x)) continue;
        out.push({
          id: x.id,
          name: x.name,
          amount: num(x.amount),
          prepaid: !!x.pending,
          packageName: x.packageName || '',
          program: p.name || '',
          week: l === p ? '' : l.name || '',
          at: x.confirmedAt || x.submittedAt || 0,
        });
      }
    }
  }
  return out.sort((a, b) => (b.at || 0) - (a.at || 0));
};

/**
 * تسليمٌ من حسابٍ إلى حساب.
 *
 * ينقل النقد ولا يمسّ إيرادًا ولا أمانة: فلوسٌ من جيبٍ إلى جيب. ولهذا لا
 * يُقيَّد في دفتر برنامجٍ ولا في حركات فيض — هو حركة صناديق لا غير.
 */
export const validHandover = (data, { fromId, toId, amount }) => {
  const has = (id) => (data?.faidAccounts || []).some((a) => a.id === id);
  if (!has(fromId) || !has(toId)) return 'اختر الحسابين';
  if (fromId === toId) return 'الحسابان واحد';
  if (!(num(amount) > 0)) return 'اكتب المبلغ';
  if (num(amount) > cashOf(data, fromId).balance) return 'المبلغ أكبر من رصيده';
  return '';
};

export const applyHandover = (data, row) => ({
  ...data,
  handovers: [...(data?.handovers || []), row],
});

/** التسليمات بأسماء حساباتها، الأحدث أولًا. */
export const handoverRows = (data) => {
  const name = (id) => (data?.faidAccounts || []).find((a) => a.id === id)?.name || 'حساب محذوف';
  return [...(data?.handovers || [])]
    .sort((a, b) => (b.at || 0) - (a.at || 0))
    .map((h) => ({ ...h, fromName: name(h.fromId), toName: name(h.toId) }));
};
