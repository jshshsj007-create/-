/**
 * التسجيل الذاتي: ولي الأمر يعبّي رابطًا عامًا، فيوصل التسجيل داخل البرنامج
 * جاهزًا — بلا ما يكتب صاحب التطبيق حرفًا.
 *
 * هذا الملف يشتغل في الطرفين: المتصفح يستخدمه للتحقق قبل الإرسال، والخادم
 * يستخدمه مرة ثانية لأن ما يجي من الشبكة لا يُوثق به أبدًا.
 */
import { isValidPhone, normalizePhone, upsertRegistration } from './people.js';

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

/** خانات النموذج لهذا البرنامج: العامة + أسئلته الخاصة. */
export const fieldsFor = (data, program) => [
  ...(data?.signupFields || []),
  ...(program?.signup?.extraFields || []),
];

/**
 * ما يُعرض لولي الأمر: اسم البرنامج وأيامه المتاحة وسعره وطرق الدفع فقط.
 * ولا حرف عن المسجّلين — الرابط عام، وأي أحد يفتحه.
 */
export const publicView = (data, program) => {
  const s = program.signup || {};
  const openIds = s.openWeeks || [];
  const days = (program.weeks || [])
    .filter((w) => openIds.includes(w.id))
    .map((w) => ({ id: w.id, name: w.name, date: w.date || '' }));

  /**
   * المجمّع يُباع بطريقتين معًا: تسجيل يومي بسعر اليوم، وباقات بأسعارها.
   * ولي الأمر يختار وحدة منها، وبعدها يطلع سعره — فما نجبره على طريقة.
   */
  const grouped = program.type === 'مجمع';
  const perDayPrice = Number(s.price || 0);
  const perDayOn = grouped && s.allowPerDay !== false && perDayPrice > 0;
  const packages = !grouped ? [] : [
    ...(perDayOn ? [{
      id: '__perday', name: 'يومي', price: perDayPrice, dayCount: 0, perDay: true,
    }] : []),
    ...(s.packages || []).map((p) => ({
      id: p.id,
      name: p.name,
      price: Number(p.price || 0),
      // صفر = كل الأيام المتاحة؛ وغيره = يختار هذا العدد من الأيام
      dayCount: Math.min(Number(p.dayCount || 0), days.length),
      perDay: false,
    })),
  ];
  const usePackages = packages.length > 0;

  /**
   * البرنامج اللي له أيام ولا يوم منها مفتوح ما ينفع يستقبل تسجيلًا: المشترك
   * ينزل بلا أيام فيختفي من كل قوائم الحضور. نقفل الرابط بدل ما نقبل تسجيلًا
   * يضيع، ونقول لصاحب التطبيق السبب.
   */
  // ما فيه يوم مفتوح = ما فيه مكان يستقر فيه التسجيل، سواء البرنامج بلا أيام
  // أصلًا أو أيامه كلها مقفلة. الحالتان تنتهيان بمشترك بلا أيام.
  const blocked = days.length === 0 ? 'no_days'
    : grouped && !packages.length ? 'no_packages'
    : '';

  return {
    programId: program.id,
    programName: program.name,
    type: program.type || 'منفصل',
    price: Number(s.price || 0),
    blocked,
    usePackages,
    packages,
    // المجمّع يختار ولي الأمر أيامه؛ المنفصل يختار أي أسابيع يبي
    days,
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
  };
};

/** الباقة المختارة، إن كان البرنامج يُباع باقات. */
export const packageOf = (view, kid) =>
  (view.packages || []).find((p) => p.id === kid?.packageId) || null;

/**
 * كم يومًا يحق لهذا الخيار؟ اليومي مفتوح على كل الأيام المتاحة،
 * والباقة بعددها — وصفر في تعريفها يعني كل الأيام كذلك.
 */
export const daysAllowed = (view, pkg) =>
  (pkg?.perDay || !pkg?.dayCount) ? view.days.length : pkg.dayCount;

/** اليومي يختار أي عدد؛ الباقة لازم بعددها بالضبط. */
export const daysAreFixed = (pkg) => Boolean(pkg) && !pkg.perDay && Number(pkg.dayCount) > 0;

/**
 * باقة المدة الكاملة: أيامها معروفة سلفًا، فما نسأل ولي الأمر يختارها —
 * نعبّيها له ونعرضها عليه.
 */
export const coversAll = (view, pkg) =>
  Boolean(pkg) && !pkg.perDay && !Number(pkg.dayCount) && (view?.days || []).length > 0;

/**
 * يتحقق من مُدخلات ولي الأمر. يرجّع { ok, errors } — errors مفتاحه معرّف الخانة
 * عشان الواجهة تعلّم على الخانة نفسها بدل رسالة عامة.
 */
export const GUARDIAN_FIELDS = ['gName', 'gPhone'];

/** خانات ولي الأمر تُسأل مرة، وبقية الخانات تُسأل لكل ابن على حدة. */
export const isGuardianField = (f) => GUARDIAN_FIELDS.includes(f.id);

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
    if (view.usePackages) {
      const pkg = packageOf(view, kid);
      if (!pkg) errors[`kid${i}.package`] = 'اختر طريقة التسجيل';
      else {
        const n = (kid?.days || []).length;
        const allowed = daysAllowed(view, pkg);
        if (!n) errors[`kid${i}.days`] = 'اختر أيامك';
        else if (daysAreFixed(pkg) && n !== allowed) errors[`kid${i}.days`] = `هذي الباقة ${allowed} أيام — اخترت ${n}`;
      }
    } else if (view.days.length && !(kid?.days || []).length) {
      errors[`kid${i}.days`] = 'اختر يومًا واحدًا على الأقل';
    }
    // أيام ملفّقة ما هي ضمن المعروض
    for (const d of kid?.days || []) {
      if (!view.days.some((x) => x.id === d)) errors[`kid${i}.days`] = 'فيه يوم غير متاح';
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
    // اليومي يُضرب بعدد الأيام، والباقة سعرها مقطوع
    return pkg.perDay ? Number(pkg.price || 0) * ((kid?.days || []).length || 0) : Number(pkg.price || 0);
  }
  const price = Number(view.price || 0);
  if (!price) return 0;
  if (!view.days.length) return price;
  return price * ((kid?.days || []).length || 0);
};

export const totalDue = (view, kids) => (kids || []).reduce((s, k) => s + dueFor(view, k), 0);

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

  const grouped = program.type === 'مجمع';
  const newParts = res.linked.map(({ student }, i) => {
    const kid = kids[i] || {};
    const kidExtras = {};
    for (const id of extraIds) if (kid[id] !== undefined) kidExtras[id] = kid[id];
    return {
      id: newId(),
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
          const forWeek = newParts.filter((_, i) => (kids[i]?.days || []).includes(w.id));
          if (!forWeek.length) return w;
          // المشترك في المنفصل يدفع سعر الأسبوع الواحد، مو مجموع أسابيعه
          const perWeek = forWeek.map((part) => ({ ...part, id: newId(), amount: Number(view.price || 0) }));
          return { ...w, mode: 'named', participants: [...(w.participants || []), ...perWeek] };
        }),
      };
    });
  }

  return {
    data: { ...data, guardians: res.guardians, students: res.students, programs },
    guardian: res.guardian,
    count: newParts.length,
  };
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
