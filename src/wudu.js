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

/** إحصائية القسم: كم طالب، وكم أتقن الوضوء كاملًا، ومتوسط النسبة بينهم. */
export const wuduStats = (students, steps) => {
  const list = students || [];
  const mastered = list.filter((s) => wuduMastered(s, steps)).length;
  const avg = list.length
    ? Math.round(list.reduce((a, s) => a + wuduPercent(s, steps), 0) / list.length)
    : 0;
  return { total: list.length, mastered, avg };
};
