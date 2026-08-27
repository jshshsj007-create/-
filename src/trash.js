/**
 * صندوق المحذوفات.
 *
 * الحذف في التطبيق كان بلا رجعة، فصار كل زر أحمر مخيفًا — والخوف من الزر
 * يخلّي الأخطاء تبقى مكانها بدل ما تُصلَّح. فبدل ما نمنع الحذف، نجعله
 * قابلًا للرجوع: يروح السجل من مكانه، ويقعد هنا شهرًا، ثم يمضي.
 *
 * وشهر لأن الغلط يُكتشف في يومه أو أسبوعه، وما بعد الشهر ما هو غلطًا —
 * هو قرار. ولو خلّيناها للأبد صار الصندوق أرشيفًا يثقل الملف بلا فائدة.
 */

/** ما يمضي عليه شهر يُمسح من نفسه. */
export const TRASH_DAYS = 30;
const DAY = 24 * 60 * 60 * 1000;

/** الأنواع اللي يرجّعها الصندوق، وأسماؤها كما تُعرض. */
export const KINDS = {
  program: 'برنامج',
  competition: 'مسابقة',
  trip: 'سفرة',
  faidAdjustment: 'حركة مالية',
  khayrStudent: 'طالب في خيركم',
  khayrSession: 'جلسة تسميع',
  student: 'طالب',
  guardian: 'ولي أمر',
  participant: 'مشارك',
  week: 'يوم',
};

export const kindLabel = (kind) => KINDS[kind] || 'سجل';

/**
 * سجل محذوف. `where` يحمل ما يلزم لإرجاعه إلى مكانه بالضبط — المشارك
 * ما يكفيه اسمه، لازم نعرف في أي برنامج وأي يوم كان.
 */
export const trashed = (kind, item, { by, label, where } = {}) => ({
  id: `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
  kind,
  label: label || item?.name || kindLabel(kind),
  at: Date.now(),
  by: by || '',
  where: where || null,
  item,
});

/** ما مضى عليه الشهر يسقط — نمرّرها على كل حفظ، فتنظّف نفسها بلا زر. */
export const pruned = (trash, now = Date.now()) =>
  (trash || []).filter((t) => now - (t.at || 0) < TRASH_DAYS * DAY);

/** الأحدث أولًا — اللي حذفته قبل شوي هو اللي تدوّر عليه غالبًا. */
export const sortedTrash = (trash) =>
  [...(trash || [])].sort((a, b) => (b.at || 0) - (a.at || 0));

/** كم بقي له قبل ما يمضي. */
export const daysLeft = (entry, now = Date.now()) =>
  Math.max(0, Math.ceil((TRASH_DAYS * DAY - (now - (entry?.at || 0))) / DAY));

export const leftText = (entry, now) => {
  const d = daysLeft(entry, now);
  if (d <= 0) return 'يمضي اليوم';
  if (d === 1) return 'يمضي غدًا';
  return `يمضي بعد ${d} ${d === 2 ? 'يومين' : d <= 10 ? 'أيام' : 'يومًا'}`;
};
