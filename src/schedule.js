/**
 * موعد النسخة الاحتياطية — يقرأه التطبيق والخادم من نفس المكان.
 *
 * جدول Netlify ثابت لا يتغيّر إلا بنشرة جديدة، فالمهمة تصحى كل ساعة وتسأل هنا:
 * هل هذي الساعة هي الموعد؟ وبكذا يقدر صاحب التطبيق يبدّل الموعد من داخل
 * التطبيق، والموعد ينحفظ مع بقية البيانات.
 */

/**
 * يوم الأسبوع (٠ الأحد … ٦ السبت) وساعة بتوقيت السعودية، و`day: -1` معناه
 * **كل يوم**.
 *
 * وهو الأصل الآن: كانت أسبوعية، فما أُنشئ يوم الأحد وضاع يوم الأحد لا تجده
 * في شيء — وهذا ما وقع بسؤالٍ نُشر على الأولاد فضاع في ساعتين. والنسخة
 * تشتغل مرةً في اليوم، فما تكلّف شيئًا يُذكر.
 */
export const EVERY_DAY = -1;

/**
 * وأقصرُ من اليوم: كل أربع ساعاتٍ أو ستّ أو اثنتي عشرة.
 *
 * النسخة اليومية تحمي من موت الصندوق، لكنها تترك بينك وبينها يومًا كاملًا —
 * تسجيلاتُه ومالُه وحضورُه. والصندوق لو مات الساعة الحادية عشرة ليلًا، ضاع
 * شغلُ اليوم كلِّه. فمن أراد أن يُضيّق الفجوة اختار ساعاتٍ بدل يوم.
 *
 * و`every` يغلب اليوم والساعة: من اختار «كل أربع ساعات» ما عاد لموعدٍ من
 * الأسبوع معنى. وصفرٌ يعني «اتبع اليوم والساعة».
 */
export const EVERY_HOURS = [4, 6, 12];
export const DEFAULT_SCHEDULE = { day: EVERY_DAY, hour: 4, every: 0 };
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
  const every = num(s.every);
  return {
    day: Number.isInteger(day) && day >= EVERY_DAY && day <= 6 ? day : DEFAULT_SCHEDULE.day,
    hour: Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : DEFAULT_SCHEDULE.hour,
    every: EVERY_HOURS.includes(every) ? every : 0,
  };
};

/**
 * أقل فاصل بين نسختين تلقائيتين — يمنع التكرار لو صحت المهمة مرتين.
 *
 * وكان ستّ ساعاتٍ ثابتة، فلو اختار صاحبُه «كل أربع» لَمنعه هذا الحدُّ من
 * ثلثِ نسخه. فصار يتبع ما اختار: أقصرُ بقليلٍ من الفاصل نفسه، حتى لا تُفوَّت
 * نسخةٌ لأن المهمة صحت متأخّرةً دقيقة.
 */
export const MIN_GAP = 6 * 60 * 60 * 1000;
const gapOf = (schedule) => (schedule.every > 0 ? (schedule.every * 60 - 10) * 60 * 1000 : MIN_GAP);

/** هل حان الموعد؟ الوقت يُقارن بتوقيت السعودية، لأن صاحبه يعيش فيه. */
export const dueNow = (schedule, now, lastAt) => {
  const gap = gapOf(schedule);
  // «كل كذا ساعة» لا موعدَ لها من الأسبوع: تُقاس من آخر نسخةٍ وقعت
  if (schedule.every > 0) return !(lastAt && now - lastAt < gap);
  const t = new Date(now + KSA_OFFSET);
  if (schedule.day !== EVERY_DAY && t.getUTCDay() !== schedule.day) return false;
  if (t.getUTCHours() !== schedule.hour) return false;
  return !(lastAt && now - lastAt < gap);
};

/** كيف يُقرأ الموعد في سطرٍ واحد. */
export const scheduleText = (s) => {
  if (s.every > 0) return `كل ${s.every === 4 ? 'أربع' : s.every === 6 ? 'ست' : 'اثنتي عشرة'} ساعات`;
  return `${s.day === EVERY_DAY ? 'كل يوم' : `كل ${DAY_NAMES[s.day]}`} ${hourLabel(s.hour)}`;
};
