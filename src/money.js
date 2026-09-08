/**
 * دفتر المال.
 *
 * التسجيلات والأجوبة تصل الخادمَ من بابها، فيكتب كلَّ واحدةٍ سطرًا لا يُمحى
 * ساعةَ وصولها. والمال ليس كذلك: المصروف والتحصيل والتحويل والتسليم تُكتب في
 * التطبيق ثم تُرسل ضمن ملف البيانات كله — فما للخادم بابٌ يرى منه «حركةً
 * جديدة»، ولا سطرٌ يكتبه عندها.
 *
 * فهذا الملف يصنع ذلك الباب: يفرد المالَ كلَّه من البيانات صفوفًا مسطّحة، لكل
 * صفٍّ مفتاحٌ ثابت. فيقابل الخادمُ ما جاءه بما عنده، ويكتب في الدفتر ما جدّ أو
 * تبدّل. وبعدها لا يُمحى: لا بحفظةٍ قديمة، ولا باسترجاع لقطة، ولا بخطأ يدٍ.
 *
 * وهو الجواب عن سؤالٍ سُئلته: «الحسابات المالية ماتروح؟» — لا تروح، لأن لها
 * موضعًا آخر لا يمرّ عليه شيءٌ يحذف.
 */

const num = (v) => Number(v || 0) || 0;
const str = (v) => String(v == null ? '' : v);

/** دفاتر البرنامج: المجمّع دفتره على مستواه، والمنفصل دفتر لكل يوم — ونقرأ الاثنين. */
const ledgersOf = (p) => [p, ...(p?.weeks || [])];

/**
 * أنواع الحركات. مكتوبةٌ بالعربية لأنها تُقرأ في الشاشة كما هي، ولأن الدفتر
 * يُفتح بعد سنةٍ فيقرؤه من لا يعرف أسماء الحقول.
 */
export const MONEY_KINDS = {
  adj: 'حركة حساب',
  handover: 'تسليم',
  collection: 'تحصيل',
  expense: 'مصروف',
  school: 'نصيب المدرسة',
  faid: 'نصيب فيض',
  transfer: 'ترحيل نصيب فيض',
  sub: 'اشتراك',
  quick: 'إيراد سريع',
  tripIn: 'إيراد رحلة',
  tripOut: 'مصروف رحلة',
};

/**
 * مفتاح الصف.
 *
 * النوعُ ثم معرّفُ السجل: فالبندُ الذي يُحرَّر يبقى صفًّا واحدًا في الدفتر لا
 * صفّين، والبندُ الذي يُحذف يبقى مكتوبًا بمفتاحه. والنوع في أوله لأن المعرّفات
 * تتولّد في مواضع شتّى، فلا يُؤمن ألّا يلتقي معرّفُ مصروفٍ بمعرّف تسليم.
 */
export const moneyKey = (kind, id) => `${kind}:${id}`;

/**
 * بصمةُ ما يُهمّ في الصف.
 *
 * لا نكتب في الدفتر إلا ما جدّ أو تبدّل، والتبدّل يُعرف بهذي: المبلغُ والحساب
 * والملاحظة والتاريخ. وما عداها زينةُ عرضٍ لا تستحقّ كتابةً في مفتاحٍ دائم.
 */
export const moneyPrint = (r) => [r.kind, num(r.amount), str(r.accountId), str(r.toId), str(r.note), str(r.date)].join('|');

/**
 * كل حركةٍ مالية في البيانات، صفًّا مسطّحًا.
 *
 * و«أين وقعت» جزءٌ من الصف لا زينة: الدفتر يُقرأ يوم تضيع البيانات، فلو كان
 * فيه «مصروف ٤٠٠» بلا برنامجٍ ولا يوم، ما نفع في إرجاع شيء.
 */
export const moneyRows = (data) => {
  const out = [];
  const push = (kind, id, row) => {
    if (!id) return;
    out.push({ key: moneyKey(kind, id), kind, id, label: MONEY_KINDS[kind] || kind, ...row });
  };

  for (const a of data?.faidAdjustments || []) {
    push('adj', a?.id, {
      amount: num(a?.amount), accountId: str(a?.accountId), note: str(a?.note),
      date: str(a?.date), type: str(a?.type), termKey: str(a?.termKey), batchId: str(a?.batchId),
    });
  }

  for (const h of data?.handovers || []) {
    push('handover', h?.id, {
      amount: num(h?.amount), accountId: str(h?.fromId), toId: str(h?.toId),
      note: str(h?.note), at: num(h?.at),
    });
  }

  for (const p of data?.programs || []) {
    for (const l of ledgersOf(p)) {
      if (!l) continue;
      const where = { programId: str(p.id), programName: str(p.name), weekId: l === p ? '' : str(l.id), weekName: l === p ? '' : str(l.name) };
      const items = (key, kind) => {
        for (const x of l[key] || []) {
          push(kind, x?.id, { amount: num(x?.amount), accountId: str(x?.accountId), note: str(x?.note || x?.name), where });
        }
      };
      items('collections', 'collection');
      items('expenseItems', 'expense');
      items('schoolPayouts', 'school');
      items('faidPayouts', 'faid');

      // الترحيل واحدٌ لا قائمة، ومفتاحه دفعتُه — فما يتكرّر لو أُعيد حسابه
      if (l.faidTransfer?.batchId) {
        push('transfer', l.faidTransfer.batchId, {
          amount: num(l.faidTransfer.amount), date: str(l.faidTransfer.date), where,
        });
      }

      /**
       * الاشتراك مالٌ كذلك.
       *
       * ما جاء من الرابط له سطرُه في دفتر التسجيلات، وما أُدخل باليد ليس له —
       * ولا فرق بينهما في الحساب. والمبلغُ هنا مالٌ في اليد، فيُكتب.
       */
      for (const x of l.participants || []) {
        if (!(num(x?.amount) > 0)) continue;
        push('sub', x?.id, {
          amount: num(x.amount), accountId: str(x.accountId), note: str(x.name),
          at: num(x.confirmedAt || x.submittedAt), pending: !!x.pending, where,
        });
      }

      // الدفتر السريع: عددٌ ومبلغٌ بلا أسماء، ومفتاحه دفترُه لأنه رقمٌ واحد فيه
      if (num(l.quickRevenue) > 0) {
        push('quick', `${p.id}:${l === p ? '_' : l.id}`, { amount: num(l.quickRevenue), where });
      }
    }
  }

  for (const t of data?.trips || []) {
    const where = { tripId: str(t?.id), tripName: str(t?.name) };
    for (const x of t?.incomeItems || []) push('tripIn', x?.id, { amount: num(x?.amount), note: str(x?.name), where });
    for (const x of t?.expenseItems || []) push('tripOut', x?.id, { amount: num(x?.amount), note: str(x?.name), where });
  }

  return out;
};

/**
 * ما جدّ أو تبدّل بين حالين.
 *
 * والمحذوف ليس منه: الدفتر يحفظ ما وقع، والحذفُ لا يمحو ما وقع — السطر مكتوبٌ
 * من قبلُ ويبقى. فلا نكتب عند الحذف شيئًا، ولا نسمح للحذف أن يمسّ المكتوب.
 */
export const moneyChanged = (before, after) => {
  const was = new Map(moneyRows(before).map((r) => [r.key, moneyPrint(r)]));
  return moneyRows(after).filter((r) => was.get(r.key) !== moneyPrint(r));
};

/**
 * ما في الدفتر ولا أثر له في البيانات.
 *
 * تُقرأ عند السؤال: «وين راحت حساباتي؟». والمقصود بها ما ضاع، لا ما حُذف عمدًا —
 * ولذلك يُستثنى ما في صندوق المحذوفات، فالحذفُ باليد قرارٌ لا عطب.
 */
export const moneyMissing = (rows, data, dropped = new Set()) => {
  const here = new Set(moneyRows(data).map((r) => r.key));
  return rows.filter((r) => r?.key && !here.has(r.key) && !dropped.has(r.id));
};

/** مجموعُ صفوفٍ — للعرض جنب العدد، فيُعرف قدرُ ما ضاع لا عددُه فقط. */
export const moneySum = (rows) => (rows || []).reduce((s, r) => s + num(r?.amount), 0);
