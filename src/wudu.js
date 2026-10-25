/**
 * تعليم الوضوء، داخل تبويب النادي.
 *
 * قائمة طلاب مستقلة عن مشتركي البرامج — كخيركم تمامًا، ما لهم علاقة بتسجيل
 * ولا بولي أمر. ولكل طالب خطوات الوضوء يُعلَّم على ما أتقنه منها، ونسبة
 * إتقانه تُحسب من عددها لا تُكتب رقمًا يدويًا: رقمٌ يكتبه المعلّم بنفسه
 * يُنسى تحديثه فيصير كذبًا بعد أول خطوة جديدة يتقنها الطالب.
 */

/** الخطوات الافتراضية أول مرة — والمعلّم يقدر يعدّلها أو يحذف منها أو يضيف. */
export const DEFAULT_WUDU_STEPS = () => [
  { id: 'niyyah', text: 'النية' },
  { id: 'tasmiyah', text: 'التسمية' },
  { id: 'hands', text: 'غسل الكفين ثلاثًا' },
  { id: 'mouth-nose', text: 'المضمضة والاستنشاق' },
  { id: 'face', text: 'غسل الوجه ثلاثًا' },
  { id: 'arms', text: 'غسل اليدين إلى المرفقين ثلاثًا' },
  { id: 'head-ears', text: 'مسح الرأس والأذنين' },
  { id: 'feet', text: 'غسل الرجلين إلى الكعبين ثلاثًا' },
  { id: 'order', text: 'الترتيب والموالاة' },
];

/** كم خطوة من خطوات اليوم أتقنها — خطوةٌ حُذفت من القائمة لا تُحسب على أحد. */
export const wuduDone = (student, steps) =>
  (steps || []).filter((s) => student?.steps?.[s.id]).length;

/** نسبة الإتقان: مُشتقّة من عدد الخطوات، فتتحدّث من نفسها كل ما أُضيفت خطوة أو حُذفت. */
export const wuduPercent = (student, steps) => {
  const total = (steps || []).length;
  return total ? Math.round((wuduDone(student, steps) / total) * 100) : 0;
};

/** أتقن = أكمل كل الخطوات. مُشتقّةٌ لا مخزَّنة، حتى ما تكذب خانةٌ على نسبةٍ تغيّرت. */
export const wuduMastered = (student, steps) =>
  (steps || []).length > 0 && wuduDone(student, steps) === (steps || []).length;

/**
 * بداية أسبوع «هذا الأسبوع»: الاثنين الذي يقع فيه `now`، منتصف الليل.
 *
 * النادي يلتقي الجمعة، والتقرير يُفحص غالبًا الأحد أو الاثنين بعدها —
 * فلو انتهى الأسبوع السبت (الأحد-السبت)، صفّر العدّاد نفسه بعد الجمعة بيوم
 * أو يومين، وطلعت نتيجة جمعة طازة «صفرًا». والاثنين-الأحد يمنح الجمعة
 * والسبت مهلةً كاملة إلى الأحد قبل ما يبدأ أسبوعٌ جديد فيصفّرها.
 */
const weekStart = (now) => {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
};

/**
 * كم طالبًا أتقن الوضوء خلال أسبوع الفريق الحالي (الاثنين إلى الأحد).
 *
 * من `masteredAt`، وهو تاريخٌ يُختم آليًا لحظة اكتمال آخر خطوة — لا من حالة
 * الطالب الآن: من أتقن ثم عاد خطوةً ثم أكملها لا يُحسب مرتين، ومن أتقن قبل
 * أسبوعٍ لا يظهر في عدّاد هذا الأسبوع رغم بقاء شارة «أتقن» على اسمه.
 */
export const wuduMasteredThisWeek = (students, now = Date.now()) => {
  const start = weekStart(now);
  const end = start + 7 * 24 * 60 * 60 * 1000;
  return (students || []).filter((s) => s.masteredAt && s.masteredAt >= start && s.masteredAt < end).length;
};

/** إحصائية القسم: كم طالب، وكم أتقن الوضوء كاملًا، وكم أتقنه هذا الأسبوع، ومتوسط النسبة. */
export const wuduStats = (students, steps, now = Date.now()) => {
  const list = students || [];
  const mastered = list.filter((s) => wuduMastered(s, steps)).length;
  const avg = list.length
    ? Math.round(list.reduce((a, s) => a + wuduPercent(s, steps), 0) / list.length)
    : 0;
  return { total: list.length, mastered, avg, week: wuduMasteredThisWeek(list, now) };
};
