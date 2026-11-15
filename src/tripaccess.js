/**
 * من يرى سفرةً ويكتب فيها.
 *
 * صاحب الفريق يسافر مع الشباب لا يغيب، فيختار حسابًا يديرها: يرى كل شيء في هذه
 * السفرة وحدها — مصروفاتها ودافعوها وتسوياتها — ويسجّل فيها. ولا يفتح له ذلك مال
 * البرامج ولا فيض ولا سفرةً لم يُختر لها.
 *
 * وقبل هذا كان يلزم لمن يرى مبالغ السفرة أن يُعطى «المصروفات والتقارير» فيرى معها
 * مال كل البرامج. فلا يوجد طريقٌ يعطيه السفرة وحدها.
 *
 * وكما في بقية الخادم: المنع هنا لا في الواجهة. فمن فتح جهازه وأعاد الزر وصل حفظُه
 * إلى الخادم، فيردّه هنا كما كان.
 */

const isAdmin = (u) => u?.role === 'مدير';

/** هل هذا الحساب مسؤولٌ عن هذه السفرة؟ يرى كل شيء فيها ويكتب. */
export const manages = (trip, me) => Boolean(me?.id) && (trip?.managers || []).includes(me.id);

/**
 * هل هو مُدخِلٌ فيها؟ يضيف مصروفًا ويرى ما أدخله هو وحده.
 *
 * أراد صاحب الفريق أن يُدخِل بعض الشباب مصروفاتهم بأنفسهم، دون أن يروا حساب غيرهم ولا
 * ما أُعطيَه الآخرون ولا مجموع السفرة. فلا يرى كل شيءٍ إلا المدير ومسؤولُها.
 */
export const enters = (trip, me) => Boolean(me?.id) && (trip?.entrants || []).includes(me.id);

/** معرّفات السفرات التي يديرها. */
export const managedIds = (trips, me) => (trips || []).filter((t) => manages(t, me)).map((t) => t.id);

/** معرّفات السفرات التي يُدخِل فيها وليس مسؤولًا عنها. */
export const enteredIds = (trips, me) => (trips || []).filter((t) => enters(t, me) && !manages(t, me)).map((t) => t.id);

/**
 * اسمه في السفرات: الاسم الذي يُكتب دافعًا باسمه (العلوان، تركي، أبو فارس).
 *
 * يربطه صاحب التطبيق بحسابٍ من حساباته، فيدخل صاحبُه ويرى ما دفع وما استلم وما بقي له — وحده، لا غيره.
 */
export const payerOf = (me) => String(me?.payerName ?? '').trim();

/** هل في هذه السفرة حسابٌ لهذا الدافع؟ دفع بندًا أو أخذ تسوية أو كُتب في شبابها. */
export const paysIn = (trip, me) => {
  const n = payerOf(me);
  if (!n) return false;
  return (trip?.expenseItems || []).some((x) => String(x?.paidBy ?? '').trim() === n)
    || (trip?.settlements || []).some((x) => String(x?.person ?? '').trim() === n)
    || (trip?.people || []).some((x) => String(x ?? '').trim() === n);
};

/**
 * ما يراه المُدخِل أو الدافع المربوط من السفرة: ما يخصّه وحده.
 *
 * بنوده (ما أدخله، وما دُفع باسمه ولو أدخله غيره)، وتسوياته هو، واسمه. لا مصروف غيره ولا إيراد
 * ولا تسوية لأحد ولا شباب ولا مجموع. ومنها يحسب جهازُه «دفعتَ وبقي لك» دقيقًا لأن كل ما يخصّه فيها.
 */
export const entrantView = (trip, me) => {
  const n = payerOf(me);
  return {
    ...trip,
    expenseItems: (trip?.expenseItems || []).filter((x) => x?.by === me?.id || (n && String(x?.paidBy ?? '').trim() === n)),
    incomeItems: [],
    settlements: n ? (trip?.settlements || []).filter((x) => String(x?.person ?? '').trim() === n) : [],
    people: n ? [n] : [],
    managers: [],
    // يعرف الجهاز أنه مُدخِلٌ فيها بمعرّفه هو وحده، لا بقائمة غيره
    entrants: enters(trip, me) ? [me.id] : [],
  };
};

/**
 * السفرات التي تُرسل لهذا الحساب.
 *
 * `original` سفراتُ المخزن كاملة، و`visible` ما تبقّى منها بعد حجب المال عمّن لا
 * يراه. فالمسؤول عن سفرةٍ يأخذ نسختها **كاملة** من الأصل، والمُدخِل يأخذ ما أدخله هو
 * وحده، ومن عنده «السفرات» بلا مالٍ يأخذ الباقي كما حُجب، ومن ليست له صلاحيةٌ ولا
 * إدخال فلا سفرة تصله أصلًا. و`fullAccess` لمن يرى كل شيء بصلاحيته (السفرات مع المال).
 */
export const tripsSeen = (original, visible, me, hasTripPerm, fullAccess = false) => {
  if (isAdmin(me) || fullAccess) return visible || [];
  const full = new Map((original || []).map((t) => [t.id, t]));
  return (visible || []).flatMap((t) => {
    const whole = full.get(t.id);
    if (manages(whole, me)) return [whole];
    if (enters(whole, me) || paysIn(whole, me)) return [entrantView(whole, me)];
    return hasTripPerm ? [t] : [];
  });
};

/** أقصى ما يُقبل من مُدخِلٍ في حفظةٍ واحدة، فلا تنفجر السفرة ببنودٍ مرمية. */
const ENTRANT_MAX = 40;

/** بندٌ جديد من مُدخِل: الحقول المعروفة وحدها، ومُدخِلُه هو لا ما ادّعاه. */
const cleanItem = (x, me) => ({
  id: String(x.id),
  name: String(x.name ?? '').slice(0, 80),
  amount: Math.max(0, Number(x.amount) || 0),
  ...(x.day ? { day: String(x.day).slice(0, 40) } : {}),
  ...(x.cat ? { cat: String(x.cat).slice(0, 40) } : {}),
  ...(x.paidBy ? { paidBy: String(x.paidBy).slice(0, 40) } : {}),
  ...(x.sub ? { sub: String(x.sub).slice(0, 40) } : {}),
  // سكنٌ مقسَّمٌ على أيام: معرّف المجموعة وعلامة «جزء ١ من ٣»
  ...(x.grp ? { grp: String(x.grp).slice(0, 40) } : {}),
  ...(x.part ? { part: String(x.part).slice(0, 20) } : {}),
  ...(x.edited ? { edited: true } : {}),
  by: me.id,
});

/**
 * ما يُقبل من حفظةِ هذا الحساب في السفرات.
 *
 * - المدير: كل شيء، وهو وحده يُقفل السفرة ويفتحها.
 * - السفرة المقفلة: لا يُقبل فيها شيءٌ من غير المدير، ولا حذفُها.
 * - من عنده «السفرات» مع المال: يكتب فيها، لكن **لا يغيّر من يديرها ولا من يُدخِل**.
 * - المسؤول: يكتب في سفرته وحدها، ولا يغيّر من يديرها ولا يحذفها.
 * - المُدخِل: يضيف بنودًا مكتوبًا عليها اسمُه، ويعدّل ويحذف **ما أدخله هو وحده**، ولا يمسّ بند غيره
 *   ولا تسويةً ولا إيرادًا ولا شبابًا ولا مسؤولين.
 * - من عنده «السفرات» بلا مال: يكتب الاسم والتاريخ، وما حُجب عنه من المال يُردّ.
 * - غيرهم: ما يصلهم منها شيء، فما يعود منهم شيءٌ يُقبل — تبقى كما كانت.
 *
 * والسفرة الجديدة لا تُولد بمسؤولين ولا مُدخِلين: تعيينهم للمدير وحده.
 */
export const tripsKept = (incoming, current, me, hasTripPerm, seesMoney = false) => {
  if (isAdmin(me)) return incoming;
  const full = hasTripPerm && seesMoney;
  const was = new Map((current || []).map((t) => [t.id, t]));
  const seen = new Set();
  const out = [];
  for (const t of incoming || []) {
    seen.add(t.id);
    const old = was.get(t.id);
    if (!old) {
      if (hasTripPerm) out.push({ ...t, managers: [], entrants: [], closed: false });
      continue;
    }
    // السفرة المقفلة لا يمسّها غير المدير: لا إضافةَ ولا تعديلَ ولا إعادةَ فتحٍ — ولو جاءت من مسؤولها
    if (old.closed) { out.push(old); continue; }
    const roles = { managers: old.managers || [], entrants: old.entrants || [], closed: false };
    if (manages(old, me) || full) out.push({ ...t, ...roles });
    else if (enters(old, me)) {
      /**
       * المُدخِل يضيف ويصحّح ما أدخله هو وحده.
       *
       * إن أخطأ في مبلغٍ أو دافعٍ عدّله أو حذفه، لكن **ما أدخله غيره لا يمسّه** ولو كان باسمه دافعًا:
       * يبقى كما هو. وما يعدّله يظلّ مكتوبًا باسمه، ولا يقدر أن ينسب بندًا قديمًا إلى نفسه.
       */
      const sent = new Map((t.expenseItems || []).filter((x) => x?.id).map((x) => [x.id, x]));
      const kept = (old.expenseItems || []).flatMap((x) => {
        if (x.by !== me.id) return [x];                       // بند غيره: كما هو
        const now = sent.get(x.id);
        if (!now) return [];                                  // حذفه هو
        return [{ ...cleanItem(now, me), edited: true }];     // عدّله هو
      });
      const have = new Set((old.expenseItems || []).map((x) => x.id));
      const fresh = (t.expenseItems || []).filter((x) => x?.id && !have.has(x.id)).slice(0, ENTRANT_MAX).map((x) => cleanItem(x, me));
      out.push({ ...old, expenseItems: [...kept, ...fresh] });
    } else if (hasTripPerm) out.push({ ...t, ...roles });
    else out.push(old);
  }
  // ما غاب من الوارد: صاحب الصلاحية يحذف (والحارس يسجّله)، وغيره لا يحذف شيئًا
  // والمقفلة لا تُحذف إلا من المدير، فلا يمحوها ذو «السفرات» بحفظة
  for (const old of current || []) if (!seen.has(old.id) && (!hasTripPerm || old.closed)) out.push(old);
  return out;
};
