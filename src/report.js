/**
 * نصّ تقرير اليوم كما يُلصق في واتساب.
 *
 * يُقرأ في قروبٍ على جوّال، لا في ورقةٍ على مكتب. فلا جداول ولا رموز تنسيق:
 * واتساب لا يرسم الجداول، وما يفهمه من نجومٍ وشُرَط يطلع على غيره حروفًا
 * زائدة. الترتيبُ وحده هو التنسيق — عناوينُ أقسامٍ وفراغاتٌ بينها.
 *
 * وكان سطورًا مرصوصةً بلا فواصل، فيقرأ المستلم رقمًا ولا يدري أهو إيرادٌ أم
 * نصيب. وكان ما سُوّي من النادي خارجَه، فيكتبه صاحبُ التطبيق بيده تحت
 * الرسالة — فيجي مرةً «أقيمت مسابقة» ومرةً «بطولتين»، ويُنسى مرة.
 */

const clean = (v) => String(v ?? '').trim();
const money = (n) => `${Number(n || 0).toLocaleString('en-US')} ر.س`;

/** سطرُ «عنوان: قيمة» — ويُطوى لو خلا من قيمته. */
const row = (label, value) => (clean(value) ? `${label}: ${value}` : '');

/**
 * قِسمٌ بعنوانه: يُطوى كاملًا إن لم يبقَ فيه سطر.
 *
 * فمن لا صلاحية له في المال ما يرى عنوان «المالية» فارغًا تحته، ومن لم يُقم
 * شيئًا من النادي ما يرى عنوانه.
 */
const section = (title, lines) => {
  const live = (lines || []).filter((l) => clean(l));
  return live.length ? [`— ${title} —`, ...live].join('\n') : '';
};

/**
 * التقرير كاملًا.
 *
 * كلُّ ما فيه اختياري: يُبنى بما وُجد ويُطوى ما غاب، فالنصّ الواحد يخدم
 * البرنامج الذي فيه مالٌ ونادٍ، والبرنامج الذي ما فيه إلا الحضور.
 */
export const weekReport = ({
  week = '', program = '', term = '', date = '',
  students = null, present = null, enrolled = null,
  money: m = null, club = [], summary = [],
} = {}) => {
  const head = [
    `تقرير ${clean(week) || 'اليوم'}`,
    [clean(program), clean(term)].filter(Boolean).join(' · '),
    row('التاريخ', clean(date)),
    /**
     * ملخّصُ اليوم في رأسه: كم مسابقةً أُقيمت، وهل كان قيمي، ومن كُتبت عليه
     * ملاحظة. يُقرأ في سطرين قبل أن يُقرأ التفصيل.
     */
    ...(summary || []).map((s) => clean(s)).filter(Boolean),
  ].filter(Boolean).join('\n');

  const who = section('الحضور', [
    row('الطلاب المسجلون', students == null ? '' : students),
    present == null || enrolled == null ? '' : (() => {
      // النسبة تُقال مع العدد: «٥٦ من ٥٨» يُقرأ رقمين، و«٩٧٪» يُقرأ حكمًا
      const p = enrolled > 0 ? Math.round((present / enrolled) * 100) : null;
      return `الحاضرون: ${present} من ${enrolled}${p == null ? '' : ` · ${p}٪`}`;
    })(),
  ]);

  /**
   * والتوزيع قسمٌ على حِدة لا سطران تحت الصافي.
   *
   * «كم دخل وكم خرج» سؤال، و«كم لكلٍّ منّا» سؤالٌ آخر يقرؤه الطرف الثاني
   * أولًا. وكانا مرصوصين فيُقرأ النصيبُ رقمًا خامسًا في قائمة.
   */
  const mal = m ? section('المالية', [
    row('الإيراد', money(m.revenue)),
    row('المصروفات', money(m.expenses)),
    row('الصافي', money(m.net)),
  ]) : '';
  const split = m ? section('التوزيع', [
    row('نصيب مدارس الرواد', money(m.school)),
    row('نصيب فريق فيض', money(m.faid)),
  ]) : '';

  const nadi = section('النادي', (club || []).map((c) => clean(c)));

  return [head, who, mal, split, nadi].filter(Boolean).join('\n\n');
};
