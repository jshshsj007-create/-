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

/** هل هذا الحساب مسؤولٌ عن هذه السفرة؟ */
export const manages = (trip, me) => Boolean(me?.id) && (trip?.managers || []).includes(me.id);

/** معرّفات السفرات التي يديرها. */
export const managedIds = (trips, me) => (trips || []).filter((t) => manages(t, me)).map((t) => t.id);

/**
 * السفرات التي تُرسل لهذا الحساب.
 *
 * `original` سفراتُ المخزن كاملة، و`visible` ما تبقّى منها بعد حجب المال عمّن لا
 * يراه. فالمسؤول عن سفرةٍ يأخذ نسختها **كاملة** من الأصل، ومن عنده «السفرات»
 * يأخذ الباقي كما حُجب، ومن ليست له الصلاحية ولا هو مسؤول فلا سفرة تصله أصلًا.
 */
export const tripsSeen = (original, visible, me, hasTripPerm) => {
  if (isAdmin(me)) return visible || [];
  const full = new Map((original || []).map((t) => [t.id, t]));
  return (visible || []).flatMap((t) => {
    if (manages(full.get(t.id), me)) return [full.get(t.id)];
    return hasTripPerm ? [t] : [];
  });
};

/**
 * ما يُقبل من حفظةِ هذا الحساب في السفرات.
 *
 * - المدير: كل شيء.
 * - من عنده «السفرات»: يكتب فيها، لكن **لا يغيّر من يديرها**، ولا يعيّن نفسه.
 * - المسؤول: يكتب في سفرته وحدها، ولا يغيّر من يديرها، ولا يحذفها.
 * - غيرهما: ما يصله منها شيء، فما يعود منه شيءٌ يُقبل — تبقى كما كانت.
 *
 * والسفرة الجديدة لا تُولد بمسؤولين: تعيينهم للمدير وحده.
 */
export const tripsKept = (incoming, current, me, hasTripPerm) => {
  if (isAdmin(me)) return incoming;
  const was = new Map((current || []).map((t) => [t.id, t]));
  const seen = new Set();
  const out = [];
  for (const t of incoming || []) {
    seen.add(t.id);
    const old = was.get(t.id);
    if (!old) {
      if (hasTripPerm) out.push({ ...t, managers: [] });
      continue;
    }
    if (manages(old, me) || hasTripPerm) out.push({ ...t, managers: old.managers || [] });
    else out.push(old);
  }
  // ما غاب من الوارد: صاحب الصلاحية يحذف (والحارس يسجّله)، وغيره لا يحذف شيئًا
  if (!hasTripPerm) for (const old of current || []) if (!seen.has(old.id)) out.push(old);
  return out;
};
