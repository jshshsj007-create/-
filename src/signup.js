/**
 * التسجيل الذاتي: ولي الأمر يعبّي رابطًا عامًا، فيوصل التسجيل داخل البرنامج
 * جاهزًا — بلا ما يكتب صاحب التطبيق حرفًا.
 *
 * هذا الملف يشتغل في الطرفين: المتصفح يستخدمه للتحقق قبل الإرسال، والخادم
 * يستخدمه مرة ثانية لأن ما يجي من الشبكة لا يُوثق به أبدًا.
 */
import { isValidPhone, normalizePhone, upsertRegistration } from './people.js';
import { nextRef, refPrefix, yearOf } from './receipt.js';

/** رمز قصير للرابط: سهل يُقرأ ويُنسخ، وعشوائي بما يكفي إنه ما ينحزر. */
export const makeToken = (rand = Math.random) => {
  const abc = 'abcdefghjkmnpqrstuvwxyz23456789'; // بلا الأحرف اللي تلتبس: i l o 0 1
  let out = '';
  for (let i = 0; i < 8; i++) out += abc[Math.floor(rand() * abc.length)];
  return out;
};

/** البرنامج صاحب هذا الرمز، إن كان رابطه مفتوحًا. */
export const programByToken = (programs, token) => {
  if (!token) return null;
  return (programs || []).find((p) => p.signup?.enabled && p.signup?.token === token) || null;
};

/**
 * البرنامج اللي يفتح عليه الرابط العام.
 *
 * الرابط العام عنوان واحد بلا رمز، والوجهة تُختار من التطبيق. ونشترط
 * `signup.enabled` مثل الرمز تمامًا: إقفال التسجيل الذاتي يقفل البابين معًا،
 * فما يصير برنامج مقفولًا من بابه مفتوحًا من الباركود.
 */
export const publicProgram = (data) => {
  const id = data?.publicLink?.programId;
  if (!id) return null;
  return (data.programs || []).find((p) => p.id === id && p.signup?.enabled) || null;
};

/** الطلب العام لا يحمل رمزًا، فيُميَّز به عن رابط البرنامج الخاص. */
export const programFor = (data, token) =>
  (token ? programByToken(data?.programs, token) : publicProgram(data));

/**
 * رابط خريطة صالح للفتح.
 *
 * يدخل الرابط في `href` في صفحةٍ عامة، فما نقبل إلا الويب: `javascript:` وما
 * شابهه يُرَدّ. ومن ألصق العنوان بلا بادئة كمّلناها له بدل ما نرمي لصقته.
 */
export const mapHref = (url) => {
  const u = String(url || '').trim();
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  return /^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(u) ? 'https://' + u : '';
};

/**
 * مكان اللقاء.
 *
 * مكان الفريق ثابت، فيُكتب مرة في الإعدادات ويجري على كل رابط. والبرنامج الذي
 * يقع في غيره يكتب مكانه فيغلب — والفاضي معناه «خذ مكان الفريق»، فما يُعاد
 * كتابته مع كل برنامج، ولو بدّلتم الجامع بدّلتموه في موضع واحد.
 *
 * والاسم هو ما يُرجَّح به: مكانٌ بلا اسمٍ لا يُقرأ، فلا يصلح أن يغلب.
 */
export const placeOf = (data, program) => {
  const own = program?.signup?.place;
  const pick = String(own?.name || '').trim() ? own : data?.place;
  return {
    name: String(pick?.name || '').trim(),
    map: mapHref(pick?.map),
  };
};

/**
 * رابط مجموعة واتساب.
 *
 * زر «تواصل معنا» أخضر وعليه علامة واتساب، فما نقبل فيه غير واتساب: من ألصق
 * فيه موقعًا آخر — عن غلط أو عبث — أرسل ولي الأمر إلى غير ما وعده الزر.
 * ويرجّع فاضيًا فيرجع الزر إلى رقم الفريق، فلا يبقى بلا وجهة.
 */
export const waGroupLink = (url) => {
  const u = String(url || '').trim().replace(/^https?:\/\//i, '');
  return /^(chat\.whatsapp\.com|wa\.me|api\.whatsapp\.com)\/\S+$/i.test(u) ? 'https://' + u : '';
};

/**
 * وجهة زر «تواصل معنا»: رقم الفريق، أو مجموعة هذا البرنامج.
 *
 * كل برنامج ومجموعته، فالوجهة على البرنامج لا على الفريق. والرابط الساقط
 * يرجع للرقم بدل ما يصير الزر ميتًا.
 */
export const contactUrl = (data, program) => {
  const c = program?.signup?.contact;
  const group = c?.mode === 'group' ? waGroupLink(c?.link) : '';
  return group || waLink(data?.waNumber, '');
};

/**
 * سطر من «وش يصير في اليوم؟».
 *
 * يبدأ الكاتب سطره بإيموجي إن شاء فيصير أيقونة الشارة، وإلا نزلت الشارة بلا
 * صورة. ولا نخمّن نحن أيقونةً من الكلام: تخمينٌ يخطئ مرة فيبقى الخطأ معروضًا
 * على كل من فتح الرابط.
 */
const ICON_AT_START = /^(\p{Extended_Pictographic}️?(?:‍\p{Extended_Pictographic}️?)*)\s*/u;
export const parseChip = (line) => {
  const s = String(line || '').trim();
  const m = ICON_AT_START.exec(s);
  return m ? { icon: m[1], text: s.slice(m[0].length).trim() } : { icon: '', text: s };
};

/** أسطر «وش يصير»، كل سطر شارة. الفاضي ينشال فما تنزل شارة بيضاء. */
export const chipsOf = (text) =>
  String(text || '').split('\n').map((l) => parseChip(l)).filter((c) => c.text || c.icon);

/**
 * الحقائق الثلاث: اليوم والوقت والعمر.
 *
 * كانت تُكتب أسطرًا في التفاصيل فتضيع بين الأنشطة، وهي أول ما يُبحث عنه. فلها
 * خاناتها، وتنزل شريطًا يُمسح بالعين في ثانية. والفاضية منها تُطوى فلا يبقى
 * لها موضع فارغ.
 */
export const factsOf = (s) => [
  { id: 'day', label: 'اليوم', value: String(s?.facts?.day || '').trim() },
  { id: 'time', label: 'الوقت', value: String(s?.facts?.time || '').trim() },
  { id: 'age', label: 'العمر', value: String(s?.facts?.age || '').trim() },
].filter((f) => f.value);

/** خانات النموذج لهذا البرنامج: العامة + أسئلته الخاصة. */
export const fieldsFor = (data, program) => [
  ...(data?.signupFields || []),
  ...(program?.signup?.extraFields || []),
];

/**
 * ما يُعرض لولي الأمر: اسم البرنامج وأيامه المتاحة وسعره وطرق الدفع فقط.
 * ولا حرف عن المسجّلين — الرابط عام، وأي أحد يفتحه.
 */
/**
 * اسم اليوم كما يشوفه ولي الأمر — قد يكون غير اسمه عندك.
 * «الأسبوع الثاني» عندك، و«يوم الجمعة ١٣ رجب» عنده. الاسم المخصّص يفوز دائمًا،
 * وبدونه: `number` يرقّمها، وغيره يعرض اسمها الأصلي.
 */
export const DAY_STYLES = ['text', 'number', 'list'];
export const dayLabel = (style, week, index, custom) => {
  const c = String(custom || '').trim();
  if (c) return c;
  if (style === 'number') return `اليوم ${index + 1}`;
  return week?.name || '';
};

/**
 * مبلغ الاشتراك كاملًا — هو ما يكتبه صاحب البرنامج وما يراه وليّ الأمر.
 *
 * ونصيب اليوم يُشتقّ منه بالقسمة، لا العكس: لو كتبنا سعر اليوم وضربناه، طلع
 * في الإعلان رقمٌ محسوبٌ لا يعرفه أحد. والنسخة الماضية كتبت سعر اليوم، فمجموعها
 * ضربُه في أيامها — فتمشي بلا أن يعيد أحدٌ كتابتها.
 */
export const packTotal = (p, count) => {
  const total = Number(p?.price || 0);
  if (total > 0) return Math.max(0, Math.round(total));
  return Math.max(0, Math.round(Number(p?.perWeek || 0) * (Number(count) || 0)));
};

/**
 * مدّة الباقة — كم يومًا تشمل.
 *
 * وهي عددٌ يكتبه صاحب البرنامج، لا يُحصى من أيامٍ أنشأها في التطبيق: هو يبيع
 * موسمًا مدّته عشرة، ثم ينشئ جمعةً جمعة كلما جاءت، ويقفل ما مضى. فلو عددنا
 * الموجود لقال الإعلان «يوم واحد» وصاحبه يعلن عشرة — وهذا الذي كان.
 *
 * ومن كتب باقةً قبل هذه النسخة ما عنده مدّة، فمدّته ما بقي من موسمه — تمشي
 * كما كانت تمشي.
 */
export const packSpan = (p, fallback) => {
  const n = Number(p?.days || 0);
  if (n > 0) return Math.round(n);
  return Math.max(0, Math.round(Number(fallback) || 0));
};

export const publicView = (data, program) => {
  const s = program.signup || {};
  const openIds = s.openWeeks || [];
  const names = s.dayNames || {};
  const dayStyle = DAY_STYLES.includes(s.dayStyle) ? s.dayStyle : 'text';
  const days = (program.weeks || [])
    .filter((w) => openIds.includes(w.id))
    .map((w, i) => ({ id: w.id, name: dayLabel(dayStyle, w, i, names[w.id]), date: w.date || '' }));

  /**
   * البرنامج يُباع بطريقتين معًا، ولكلٍّ أيامها.
   *
   * **اليومي** يُشترى يومًا يومًا، فأيامه ما فتحه صاحب البرنامج للتسجيل —
   * يفتح الجمعة القادمة وحدها، فما يُعرض على وليّ الأمر عشرُ جمعٍ ليختار
   * منها واحدة.
   *
   * **والباقة** اشتراكُ الموسم، ولها عددان لا واحد:
   *
   * - **مدّتها المعلنة** (`days`) — عددٌ يكتبه صاحب البرنامج، هو ما يُقرأ في
   *   الإعلان وما يُقسَم عليه المبلغ.
   * - **وأيامها الفعلية** (`packDays`) — الجمع التي لم تُقفل، وهي المكان الذي
   *   ينزل فيه المشترك اليوم. تنقص بالإقفال وتزيد بإنشاء جمعةٍ جديدة.
   *
   * ولا تتبع «الأيام المتاحة»: القائمتان تخدمان منتجين لهما أفقان مختلفان،
   * ولو وحّدناهما لزم فتحُ الموسم كله لأجل الاشتراك — فيرى صاحبُ اليوم
   * الواحد عشرَ جمعٍ أمامه.
   *
   * وسعرها مبلغٌ مقطوع يكتبه صاحب البرنامج، ويُقسَّم على مدّتها فينزل نصيبُ
   * كل يومٍ في دفتره. والمقطوع هو ما يُعلن، فلا يرى وليّ الأمر رقمًا محسوبًا.
   */
  const grouped = program.type === 'مجمع';
  const packDays = (program.weeks || [])
    .filter((w) => w.status !== 'مغلق')
    .map((w, i) => ({ id: w.id, name: dayLabel(dayStyle, w, i, names[w.id]), date: w.date || '' }));

  // المخفية ما تنزل الصفحة أصلًا، فما ينفع أحد يسجّل فيها ولو حاول
  const packs = (s.packages || []).filter((p) => p.hidden !== true);
  const perDayPrice = Number(s.price || 0);
  const perDayOn = s.allowPerDay !== false && perDayPrice > 0 && days.length > 0;
  const packages = [
    ...(perDayOn ? [{
      // «يومي» في النوعين: ولي الأمر يقرأ أسماء أيام، فما يُقال له «أسبوعي»
      id: '__perday', name: 'يومي', price: perDayPrice, perDay: true,
    }] : []),
    ...(packDays.length ? packs
      .map((p) => ({
        id: p.id, name: p.name, perDay: false,
        price: packTotal(p, packDays.length),
        days: packSpan(p, packDays.length),
      }))
      .filter((p) => p.price > 0) : []),
  ];
  // المنفصل بلا باقةٍ يبقى كما كان: سعرٌ واحد بلا اختيار
  const usePackages = grouped ? packages.length > 0 : packages.some((p) => !p.perDay);

  /**
   * البرنامج اللي له أيام ولا يوم منها مفتوح ما ينفع يستقبل تسجيلًا: المشترك
   * ينزل بلا أيام فيختفي من كل قوائم الحضور. نقفل الرابط بدل ما نقبل تسجيلًا
   * يضيع، ونقول لصاحب التطبيق السبب.
   */
  // ما فيه ما يُشترى = ما فيه مكان يستقر فيه التسجيل. سواء ما فُتح يومٌ لليومي،
  // أو أُقفلت الأيام كلها فما بقي للباقة شيء. الحالتان تنتهيان بمشترك بلا أيام.
  const blocked = packages.length ? '' : (days.length === 0 ? 'no_days' : 'no_packages');

  return {
    programId: program.id,
    programName: program.name,
    type: program.type || 'منفصل',
    price: Number(s.price || 0),
    blocked,
    usePackages,
    packages,
    // أيام اليومي: ما فُتح للتسجيل. وأيام الباقة: ما لم يُقفل من الموسم
    days,
    packDays,
    dayStyle,
    /**
     * من يختار الأيام.
     *
     * اليوم الواحد ما يُسأل عنه أبدًا: سؤالٌ جوابه واحد ضغطةٌ بلا قرار،
     * وعرضُه يوهم ولي الأمر أن أمامه خيارًا. يُكتب له ويمشي.
     *
     * والباقة ما تُسأل عنها أصلًا — أيامها ما بقي من الموسم، لا اختيار فيه.
     * فهذا لليومي وحده.
     */
    pickDays: days.length > 1 && s.daysMode !== 'fixed',
    accounts: (data.faidAccounts || [])
      .filter((a) => (s.accounts || []).includes(a.id))
      .map((a) => ({
        id: a.id,
        // اسم يفهمه ولي الأمر؛ اسم الحساب عندك يبقى لك
        name: (a.publicName || '').trim() || a.name,
        transferInfo: a.transferInfo || '',
        // التحويل يحتاج إثباتًا؛ الكاش يُدفع عند الحضور فما فيه إيصال
        needsReceipt: !!a.needsReceipt,
      })),
    fields: fieldsFor(data, program),
    // أول سؤالين عند ولي الأمر: «وين» و«متى». والثاني في التفاصيل، وهذا الأول
    place: placeOf(data, program),

    /* ------- المحتوى اللي يكتبه صاحب البرنامج: صور ونصوص، كلها اختيارية ------- */
    poster: s.poster || '',
    gallery: s.gallery || [],
    details: s.details || '',
    notice: s.notice || '',
    texts: s.texts || {},
    // الحقائق تُمسح بالعين، والأنشطة تُغري، وسطر الطمأنة يهمس — ثلاثة أدوار
    // مختلفة كانت في قائمة نقاطٍ واحدة، فما أدّى واحدٌ منها دوره
    facts: factsOf(s),
    chips: chipsOf(s.details),
    trust: String(s.trust || '').trim(),
    wa: {
      // رقم واحد للفريق كله، يُكتب مرة وحدة
      number: waIntl(data.waNumber),
      contact: s.waContact !== false,
      // وجهة زر «تواصل معنا»: رقم الفريق أو مجموعة هذا البرنامج
      contactUrl: contactUrl(data, program),
      redirect: s.waRedirect !== false,
      // نص هذا البرنامج، وإلا النص العام، وإلا المقترح
      template: String(s.waTemplate || data.waTemplate || DEFAULT_WA_TEMPLATE),
    },
  };
};

/* -------------------------------- نصوص الصفحة -------------------------------- */

/**
 * النصوص الافتراضية. صاحب البرنامج يقدر يبدّل أيًّا منها، والقاعدة:
 * ما كتبه يفوز، والفاضي يعني «شِله من الصفحة» — فيقدر يحذف عنصرًا ما يبيه.
 */
export const TEXTS = {
  intro: 'التسجيل في',
  activities: 'وش يصير في اليوم؟',
  goForm: 'سجّل ابنك الآن',
  moreFields: 'تفاصيل إضافية — اختياري',
  priceLabel: 'الاشتراك',
  guardian: 'بيانات ولي الأمر',
  guardianHint: 'جوالك هو اللي نعرفك فيه لو سجّلت مرة ثانية.',
  student: 'بيانات الطالب',
  days: 'الأيام',
  packageLabel: 'طريقة التسجيل',
  dueLabel: 'المبلغ المستحق',
  payLabel: 'طريقة الدفع',
  submit: 'إرسال التسجيل',
  contact: 'تواصل معنا',
  share: 'شارك الرابط',
  successTitle: 'تم تسجيلك',
  successSub: 'سجّلنا {الطالب} في {البرنامج}.',
  refLabel: 'الرقم المرجعي',
  redirectNote: 'نحوّلك الآن لواتساب الفريق…',
  openWa: 'افتح واتساب',
};

/**
 * نصوص صفحة الرابط المنتهي. عامة لا برنامجية: الرابط المنتهي ما عاد يدلّ على
 * برنامج، فما فيه إعدادات برنامجٍ نقرأ منها.
 */
export const CLOSED = {
  title: 'التسجيل مقفل',
  text: 'هذا الرابط ما عاد شغّالًا. تواصل مع الفريق للحصول على رابط جديد.',
};

/** نص الصفحة بعد تبديل المتغيّرات: ما كتبه صاحب البرنامج، وإلا الافتراضي. */
export const txt = (view, key, vars = {}) =>
  fillTemplate(view?.texts?.[key] ?? TEXTS[key] ?? '', vars);

/* ------------------------------ رسالة الواتساب ------------------------------ */

/** النص المقترح لأول مرة. صاحب البرنامج يبدّله كله لو حب. */
export const DEFAULT_WA_TEMPLATE = 'الطالب: {الطالب}\nالبرنامج: {البرنامج}\nالرقم المرجعي: {الرقم المرجعي}';

/**
 * الجوال بصيغة دولية بلا رموز: واتساب ما يقبل غيرها. نقبل 05… و+966… و00966…
 * ويرجّع فاضيًا لو ما كان رقمًا سعوديًا معقولًا — فيختفي الزر بدل ما يعطي رابطًا ميتًا.
 */
export const waIntl = (raw) => {
  const d = String(raw || '').replace(/\D/g, '');
  if (/^05\d{8}$/.test(d)) return '966' + d.slice(1);
  if (/^5\d{8}$/.test(d)) return '966' + d;
  if (/^9665\d{8}$/.test(d)) return d;
  if (/^009665\d{8}$/.test(d)) return d.slice(2);
  return /^\d{10,15}$/.test(d) ? d : '';
};

/** يبدّل {المتغيّر} بقيمته. المتغيّر المجهول ينمسح بدل ما يطلع لولي الأمر كما هو. */
export const fillTemplate = (tpl, vars) =>
  String(tpl || '').replace(/\{\s*([^}]+?)\s*\}/g, (_, k) => String(vars?.[k] ?? ''));

/**
 * قيم المتغيّرات من التسجيل نفسه. أسماء الخانات هي أسماء المتغيّرات، فأي سؤال
 * يضيفه صاحب البرنامج يصير متغيّرًا بلا ما نكتب له سطرًا.
 */
export const signupVars = (view, body, extra = {}) => {
  const kids = Array.isArray(body?.kids) ? body.kids : [];
  const names = kids.map((k) => String(k?.name || '').trim()).filter(Boolean);
  const dayNames = [...new Set(kids.flatMap((k) => k?.days || []))]
    .map((id) => view.days.find((d) => d.id === id)?.name)
    .filter(Boolean);
  const acc = (view.accounts || []).find((a) => a.id === body?.accountId);

  const vars = {
    'الطالب': names.join('، '),
    'ولي الأمر': String(body?.answers?.gName || '').trim(),
    'الجوال': String(body?.answers?.gPhone || '').trim(),
    'البرنامج': view.programName || '',
    'الأيام': dayNames.join('، '),
    'المبلغ': String(totalDue(view, kids)),
    'الرقم المرجعي': String(extra.ref || ''),
    'طريقة الدفع': acc?.name || '',
    // ولي الأمر يوم البرنامج يرجع للرسالة لا للرابط، فالمكان يلزمه فيها
    'المكان': view.place?.name || '',
    'رابط الخريطة': view.place?.map || '',
  };
  // بقية الخانات بمسمياتها: العمر، الصف، المدرسة، وأي سؤال أضافه صاحب البرنامج
  for (const f of view.fields || []) {
    if (f.id === 'name' || isGuardianField(f)) continue;
    const vals = kids.map((k) => String(k?.[f.id] ?? '').trim()).filter(Boolean);
    vars[f.label] = [...new Set(vals)].join('، ');
  }
  return vars;
};

/** رابط محادثة واتساب جاهزة. يرجّع فاضيًا لو ما فيه رقم صالح. */
export const waLink = (number, text) => {
  const n = waIntl(number);
  if (!n) return '';
  const t = String(text || '').trim();
  return `https://wa.me/${n}${t ? `?text=${encodeURIComponent(t)}` : ''}`;
};

/** أسماء المتغيّرات المتاحة لهذا البرنامج — تُعرض لصاحبه وهو يكتب الرسالة. */
export const varNames = (view) => [
  'الطالب', 'البرنامج', 'المكان', 'رابط الخريطة', 'الأيام', 'المبلغ', 'الرقم المرجعي', 'طريقة الدفع', 'الجوال',
  ...(view?.fields || []).filter((f) => f.id !== 'name' && !isGuardianField(f)).map((f) => f.label),
];

/** الباقة المختارة، إن كان البرنامج يُباع باقات. */
export const packageOf = (view, kid) =>
  (view.packages || []).find((p) => p.id === kid?.packageId) || null;

/** أيام هذا الخيار: اليومي من المفتوح، والباقة ما بقي من الموسم. */
export const daysOf = (view, pkg) =>
  (pkg && !pkg.perDay ? view?.packDays : view?.days) || [];

/** كم يومًا يحق لهذا الخيار؟ */
export const daysAllowed = (view, pkg) => daysOf(view, pkg).length;

/**
 * الباقة أيامها معروفة سلفًا — ما بقي من الموسم — فما نسأل ولي الأمر عنها،
 * نعبّيها له ونعرضها عليه. واليومي وحده يُختار.
 */
export const coversAll = (view, pkg) => Boolean(pkg) && !pkg.perDay && daysOf(view, pkg).length > 0;

/**
 * يتحقق من مُدخلات ولي الأمر. يرجّع { ok, errors } — errors مفتاحه معرّف الخانة
 * عشان الواجهة تعلّم على الخانة نفسها بدل رسالة عامة.
 */
export const GUARDIAN_FIELDS = ['gName', 'gPhone'];

/** خانات ولي الأمر تُسأل مرة، وبقية الخانات تُسأل لكل ابن على حدة. */
export const isGuardianField = (f) => GUARDIAN_FIELDS.includes(f.id);

/**
 * تسوية التسجيل قبل التحقق منه.
 *
 * أيامٌ لم تُعرض على ولي الأمر ليست رأيًا يُؤخذ منه: الباقة أيامها ما بقي من
 * الموسم، ومن أطفأ الاختيار كتبها بنفسه. فنكتبها نحن ونطرح ما أُرسل — ولو
 * أُرسل شيء.
 */
export const normalizeSubmission = (view, body) => {
  const fix = (k) => {
    const pkg = view?.usePackages ? packageOf(view, k) : null;
    if (pkg && !pkg.perDay) return { ...k, days: (view.packDays || []).map((d) => d.id) };
    if (view?.pickDays === false) return { ...k, days: (view.days || []).map((d) => d.id) };
    return k;
  };
  const kids = (body?.kids || []).map(fix);
  // ما فيه ما يُصحَّح: نرجّع الطلب كما جاء ولا نلمسه
  return kids.every((k, i) => k === body.kids[i]) ? body : { ...body, kids };
};

export const validateSubmission = (view, body) => {
  const errors = {};
  const kids = Array.isArray(body?.kids) ? body.kids : [];

  // ما ينفع نقبل تسجيلًا ما له مكان يستقر فيه
  if (view.blocked) return { ok: false, errors: { _: 'التسجيل مو متاح حاليًا في هذا البرنامج.' } };

  for (const f of view.fields) {
    if (!isGuardianField(f)) continue;
    const v = String(body?.answers?.[f.id] ?? '').trim();
    if (f.required && !v) errors[f.id] = 'مطلوب';
    else if (f.id === 'gPhone' && v && !isValidPhone(v)) errors[f.id] = 'رقم جوال غير صحيح';
  }

  if (!kids.length) errors.kids = 'أضف طالبًا واحدًا على الأقل';
  kids.forEach((kid, i) => {
    if (!String(kid?.name || '').trim()) errors[`kid${i}.name`] = 'اسم الطالب مطلوب';
    for (const f of view.fields) {
      if (f.id === 'name' || isGuardianField(f)) continue;
      const v = String(kid?.[f.id] ?? '').trim();
      if (f.required && !v) errors[`kid${i}.${f.id}`] = 'مطلوب';
      else if (f.type === 'number' && v && !/^\d{1,3}$/.test(v)) errors[`kid${i}.${f.id}`] = 'اكتب رقمًا';
    }
    const pkg = view.usePackages ? packageOf(view, kid) : null;
    if (view.usePackages && !pkg) {
      errors[`kid${i}.package`] = 'اختر طريقة التسجيل';
    } else {
      const mine = daysOf(view, pkg);
      if (mine.length && !(kid?.days || []).length) errors[`kid${i}.days`] = 'اختر يومًا واحدًا على الأقل';
      // أيامٌ ملفّقة ما هي ضمن ما يخصّ خياره
      for (const d of kid?.days || []) {
        if (!mine.some((x) => x.id === d)) errors[`kid${i}.days`] = 'فيه يوم غير متاح';
      }
    }
  });

  const acc = view.accounts.find((a) => a.id === body?.accountId);
  if (view.accounts.length && !acc) {
    errors.accountId = 'اختر طريقة الدفع';
  } else if (acc?.needsReceipt && !isReceipt(body?.receipt)) {
    errors.receipt = 'أرفق صورة الإيصال أو المستند';
  }
  return { ok: Object.keys(errors).length === 0, errors };
};

/** أنواع الإيصال المقبولة وحجمه الأقصى بعد الضغط. */
export const RECEIPT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
export const RECEIPT_MAX = 900 * 1024;

/** إيصال سليم: نوع مسموح وحجم معقول، ومخزّن كنص data URL. */
export const isReceipt = (r) => {
  if (!r || typeof r.data !== 'string') return false;
  if (!RECEIPT_TYPES.includes(r.type)) return false;
  if (!r.data.startsWith(`data:${r.type};base64,`)) return false;
  return r.data.length > 64 && r.data.length <= RECEIPT_MAX * 1.4;
};

/** المبلغ المستحق: سعر الاشتراك × عدد الأيام المختارة (أو مرة وحدة لو ما فيه أيام). */
export const dueFor = (view, kid) => {
  if (view.usePackages) {
    const pkg = packageOf(view, kid);
    if (!pkg) return 0;
    // اليومي يُضرب بعدد أيامه، والباقة مبلغها مقطوع
    return pkg.perDay ? Number(pkg.price || 0) * ((kid?.days || []).length || 0) : Number(pkg.price || 0);
  }
  const price = Number(view.price || 0);
  if (!price) return 0;
  if (!view.days.length) return price;
  return price * ((kid?.days || []).length || 0);
};

export const totalDue = (view, kids) => (kids || []).reduce((s, k) => s + dueFor(view, k), 0);

/**
 * قسمة الاشتراك على أيامه.
 *
 * ٣٠٠ على ١٠ = ٣٠ لكل يوم. و٣٠٠ على ٧ = ٤٢ ويفضل ٦، فيُحمَّل الفاضل على أول
 * يومٍ له — لا على آخره: الأول أقربُ للدفع، ولأن آخر الأيام قد يُقفل قبل أن
 * يُراجَع فيبقى الفاضل في يومٍ لا يُفتح.
 *
 * ونكتب أعدادًا صحيحة لا كسورًا: الريال يُعدّ، ولو وزّعنا ٤٢٫٨٥ على سبعة
 * دفاتر طلعت أرقامٌ لا تُجمع على ٣٠٠ ولا تُقرأ.
 */
export const shareAt = (total, span, index) => {
  const n = Math.max(1, Math.round(Number(span) || 0));
  const i = Math.round(Number(index) || 0);
  if (i < 0 || i >= n) return 0;
  const sum = Math.max(0, Math.round(Number(total) || 0));
  const each = Math.floor(sum / n);
  return each + (i === 0 ? sum - each * n : 0);
};

/**
 * والقسمة على المدّة المعلنة لا على الأيام الموجودة: من باع موسمًا عشرة أيام
 * فنصيب يومه ثلاثون، أنشأ منها اليوم يومين أو عشرة. ولو قسمنا على الموجود
 * لتغيّر نصيب اليوم كلما أقفل صاحبُ البرنامج يومًا — والمبلغ ما تغيّر.
 */
export const splitLump = (total, ids, span) => {
  const list = ids || [];
  if (!list.length) return {};
  const n = Number(span) > 0 ? Math.round(Number(span)) : list.length;
  return Object.fromEntries(list.map((id, i) => [id, shareAt(total, n, i)]));
};

/** أيام المشترك بترتيب البرنامج لا بترتيب ضغطه، فـ«أول يومٍ له» أوّلٌ حقًّا. */
export const orderedDays = (view, kid) => {
  const pkg = view?.usePackages ? packageOf(view, kid) : null;
  return daysOf(view, pkg).map((d) => d.id).filter((id) => (kid?.days || []).includes(id));
};

/**
 * نصيب كل يومٍ من هذا المشترك في البرنامج المنفصل: الباقة تُقسَم، وغيرها
 * سعرٌ ثابت لكل يوم كما كان.
 */
export const weekShares = (view, kid) => {
  const ids = orderedDays(view, kid);
  const pkg = view?.usePackages ? packageOf(view, kid) : null;
  if (pkg && !pkg.perDay) return splitLump(Number(pkg.price || 0), ids, pkg.days);
  const per = Number((pkg ? pkg.price : view?.price) || 0);
  return Object.fromEntries(ids.map((id) => [id, per]));
};

/**
 * يطبّق التسجيل على البيانات: يوحّد ولي الأمر وأبناءه بلا تكرار، ويضيف كل ابن
 * مشاركًا في البرنامج معلَّمًا «ينتظر التأكيد» — فما يُحسب إيرادًا قبل ما
 * يتأكد صاحب التطبيق إن الفلوس وصلت فعلًا.
 */
export const applySubmission = (data, program, view, body, { newId, now = Date.now() }) => {
  const answers = body.answers || {};
  const kids = body.kids || [];

  const res = upsertRegistration({ guardians: data.guardians, students: data.students, newId }, {
    guardian: { name: String(answers.gName || '').trim(), phone: answers.gPhone },
    kids: kids.map((k) => ({
      name: k.name, age: k.age || '', grade: k.grade || '',
      school: k.school || '', health: k.health || '',
    })),
  }, now);

  // الأجوبة الإضافية تُحفظ على التسجيل نفسه، فتبقى مربوطة ببرنامجها
  const extraIds = (program.signup?.extraFields || []).map((f) => f.id);
  const extras = {};
  for (const id of extraIds) if (answers[id] !== undefined) extras[id] = answers[id];

  /**
   * رقم الإيصال يُختم عند التسجيل لا عند التأكيد: ولي الأمر يشوفه في صفحة
   * النجاح، فلازم يكون هو نفسه الذي تلقاه أنت في قائمتك. ورقمٌ لكل ابن —
   * لأن التأكيد يمشي على المشترك لا على العائلة، فقد يُؤكَّد أحدهما دون أخيه.
   */
  const pre = refPrefix(yearOf(program.termKey));
  const first = parseInt(nextRef(data, yearOf(program.termKey)).slice(pre.length), 10);
  const refFor = (i) => pre + String(first + i).padStart(4, '0');

  const grouped = program.type === 'مجمع';
  const newParts = res.linked.map(({ student }, i) => {
    const kid = kids[i] || {};
    const kidExtras = {};
    for (const id of extraIds) if (kid[id] !== undefined) kidExtras[id] = kid[id];
    return {
      id: newId(),
      ref: refFor(i),
      name: student.name,
      studentId: student.id,
      amount: dueFor(view, kid),
      accountId: body.accountId,
      attendance: 'معلق',
      pending: true,          // ينتظر تأكيد وصول المبلغ
      source: 'link',
      submittedAt: now,
      ...(view.usePackages && packageOf(view, kid) ? { packageName: packageOf(view, kid).name } : {}),
      // الإيصال يُحفظ مع أول ابن فقط — تحويل واحد للطلب كله
      ...(i === 0 && isReceipt(body.receipt) ? { receipt: body.receipt } : {}),
      ...(Object.keys({ ...extras, ...kidExtras }).length ? { answers: { ...extras, ...kidExtras } } : {}),
      ...(grouped ? { days: kid.days || [] } : {}),
    };
  });

  // المجمّع دفتره على البرنامج، والمنفصل على كل أسبوع
  const shares = kids.map((kid) => weekShares(view, kid));
  // معرّفٌ واحد لاشتراك الابن يجمع صفوفه في كل الجمع، فيُعرف أنها اشتراكٌ واحد
  const subIds = kids.map(() => newId());
  let programs;
  if (grouped) {
    programs = data.programs.map((p) => (p.id !== program.id ? p
      : { ...p, participants: [...(p.participants || []), ...newParts] }));
  } else {
    programs = data.programs.map((p) => {
      if (p.id !== program.id) return p;
      return {
        ...p,
        weeks: (p.weeks || []).map((w) => {
          const forWeek = newParts
            .map((part, i) => ({ part, i }))
            .filter(({ i }) => (kids[i]?.days || []).includes(w.id));
          if (!forWeek.length) return w;
          /**
           * المشترك في المنفصل ينزل في دفتر كل يومٍ بنصيبه منه، لا بمجموع
           * أيامه: سعر اليوم الواحد، أو حصّته من الباقة. والإيصال يجمعها
           * كلها برقمه المشترك، فيبقى المبلغ الذي دفعه واحدًا كما هو.
           */
          const perWeek = forWeek.map(({ part, i }) => {
            const pkg = view.usePackages ? packageOf(view, kids[i]) : null;
            const order = orderedDays(view, kids[i]).indexOf(w.id);
            return {
              ...part, id: newId(), amount: shares[i]?.[w.id] ?? 0,
              // ختمُ الاشتراك: به تعرف الجمعةُ الجديدة من يستحق النزول فيها
              ...(pkg && !pkg.perDay ? {
                sub: { id: subIds[i], packId: pkg.id, total: Number(pkg.price || 0), span: pkg.days, i: order },
              } : {}),
            };
          });
          return { ...w, mode: 'named', participants: [...(w.participants || []), ...perWeek] };
        }),
      };
    });
  }

  return {
    data: { ...data, guardians: res.guardians, students: res.students, programs },
    guardian: res.guardian,
    count: newParts.length,
    refs: newParts.map((p) => p.ref),
  };
};

/**
 * المشتركون الذين يستحقّون النزول في جمعةٍ أُنشئت الآن.
 *
 * من اشترك في الموسم دفع مرةً واحدة عن أيامٍ كثيرة، فما يُعقل أن يُعاد تسجيله
 * كلما جاءت جمعة. نجمع صفوفه في الجمع الماضية بختم اشتراكه، فإن كان ما نزل
 * إلا في ثلاثٍ ومدّته عشر، نزل في هذه الرابعةَ بنصيبها.
 *
 * ومن استوفى مدّته ما ينزل: العشرة عشرة، ولو بقي في الموسم جمعٌ بعدها.
 */
export const subsFor = (weeks, newId, { attendance = 'معلق' } = {}) => {
  const groups = new Map();
  for (const w of weeks || []) {
    for (const x of w?.participants || []) {
      if (!x?.sub?.id) continue;
      const g = groups.get(x.sub.id) || [];
      g.push(x);
      groups.set(x.sub.id, g);
    }
  }
  const out = [];
  for (const rows of groups.values()) {
    // الحضور والإيصال يخصّان يومهما، فما يُورَّثان إلى يومٍ لم يجئ
    const { arrivedAt, receipt, ...last } = rows[rows.length - 1];
    const span = Math.max(0, Math.round(Number(last.sub.span) || 0));
    const used = rows.length;
    if (!span || used >= span) continue;
    out.push({
      ...last,
      id: newId(),
      amount: shareAt(last.sub.total, span, used),
      sub: { ...last.sub, i: used },
      attendance,
    });
  }
  return out;
};

/**
 * حماية الرابط العام: نفس الجوال ما يرسل أكثر من ٥ مرات في الساعة، والبرنامج
 * ما يستقبل أكثر من ٤٠ في الساعة. يمنع العبث بلا ما يزعج ولي أمر عادي.
 */
export const rateLimited = (log, phone, now = Date.now()) => {
  const hour = 60 * 60 * 1000;
  const recent = (log || []).filter((e) => now - e.at < hour);
  const mine = recent.filter((e) => e.phone === normalizePhone(phone));
  return { blocked: mine.length >= 5 || recent.length >= 40, recent };
};
