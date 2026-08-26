/**
 * موعد النسخة الاحتياطية — يقرأه التطبيق والخادم من نفس المكان.
 *
 * جدول Netlify ثابت لا يتغيّر إلا بنشرة جديدة، فالمهمة تصحى كل ساعة وتسأل هنا:
 * هل هذي الساعة هي الموعد؟ وبكذا يقدر صاحب التطبيق يبدّل الموعد من داخل
 * التطبيق، والموعد ينحفظ مع بقية البيانات.
 */

/** يوم الأسبوع (٠ الأحد … ٦ السبت) وساعة بتوقيت السعودية. */
export const DEFAULT_SCHEDULE = { day: 5, hour: 4 };
export const DAY_NAMES = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
export const KSA_OFFSET = 3 * 60 * 60 * 1000;

/** «4 ص» و«1 م» — الساعة تُقرأ كما ينطقها صاحبها. */
export const hourLabel = (h) => {
  const n = Number(h) || 0;
  return `${(n % 12) || 12} ${n < 12 ? 'ص' : 'م'}`;
};

/** يقرأ الموعد من بيانات التطبيق، ويصحّح أي قيمة خارج المدى. */
export const scheduleOf = (data) => {
  const s = data?.backupSchedule || {};
  // `null` و`''` يتحوّلان صفرًا لو مرّرناهما لـ Number، فيصير «الأحد ١٢ ص» بلا ما يطلبه أحد
  const num = (v) => (v === null || v === undefined || v === '' ? NaN : Number(v));
  const day = num(s.day);
  const hour = num(s.hour);
  return {
    day: Number.isInteger(day) && day >= 0 && day <= 6 ? day : DEFAULT_SCHEDULE.day,
    hour: Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : DEFAULT_SCHEDULE.hour,
  };
};

/** أقل فاصل بين نسختين تلقائيتين — يمنع التكرار لو صحت المهمة مرتين. */
export const MIN_GAP = 6 * 60 * 60 * 1000;

/** هل حان الموعد؟ الوقت يُقارن بتوقيت السعودية، لأن صاحبه يعيش فيه. */
export const dueNow = (schedule, now, lastAt) => {
  const t = new Date(now + KSA_OFFSET);
  if (t.getUTCDay() !== schedule.day || t.getUTCHours() !== schedule.hour) return false;
  return !(lastAt && now - lastAt < MIN_GAP);
};
