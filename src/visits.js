/**
 * كم واحدًا فتح رابط البرنامج؟
 *
 * التطبيق يعرف من سجّل، ولا يعرف من فتح ومضى. والفرق بينهما هو الخبر: إن كان
 * الفاتحون قليلًا فالخلل في التوزيع — ما وصل الرابطُ أحدًا. وإن كانوا كثيرًا
 * والمسجّلون قليلًا فالخلل في الصفحة — السعر أو الصورة أو الشرح.
 *
 * والعدّ للأشخاص لا للفتحات: من فتحه ثلاث مراتٍ يُعدّ واحدًا في يومه، وإلا
 * صار الرقم يكذب على صاحبه — يفتحه هو وأهلُه فيظنّ الناس أقبلوا.
 *
 * ولا نحفظ عن أحدٍ ما يعرّفه: بصمةٌ مشفّرة لا يُرجع منها إلى صاحبها، وتُنسى
 * مع انقضاء يومها. وظيفتها الوحيدة ألّا يُعدّ الواحد مرتين.
 */

/** اليوم بتوقيت الرياض — فالجمعة تُعدّ جمعةً لا تنقسم على منتصف ليل لندن. */
export const dayKey = (at = Date.now()) =>
  new Date(at + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);

/**
 * زيارةٌ جديدة تُضاف.
 *
 * ويرجّع `changed: false` إن كان قد عُدّ اليوم — فيعرف الخادم أنه لا يكتب،
 * ولا يُثقَل المخزن بكتابةٍ لكل صورةٍ تُحمَّل في الصفحة.
 *
 * @param stats  ما هو محفوظ: { [programId]: { total, days: {يوم: عدد}, seen: {يوم: [بصمات]} } }
 * @param print  بصمة الزائر المشفّرة — وفاضيةً تُعدّ الفتحة ولا تُميَّز
 */
export const countVisit = (stats, programId, print, at = Date.now()) => {
  if (!programId) return { stats: stats || {}, changed: false };
  const day = dayKey(at);
  const all = { ...(stats || {}) };
  const one = all[programId] || { total: 0, days: {}, seen: {} };

  // بصمات اليوم وحده تُحفظ، وما قبله يُنسى — فما ينمو السجل بلا حدّ
  const seenToday = one.seen?.[day] || [];
  if (print && seenToday.includes(print)) return { stats: all, changed: false };

  all[programId] = {
    total: (one.total || 0) + 1,
    days: { ...(one.days || {}), [day]: (one.days?.[day] || 0) + 1 },
    seen: { [day]: print ? [...seenToday, print] : seenToday },
  };
  return { stats: all, changed: true };
};

/** ما يُعرض: كم فتحه، وكم منهم اليوم. */
export const visitsOf = (stats, programId, at = Date.now()) => {
  const one = (stats || {})[programId];
  return { total: Number(one?.total || 0), today: Number(one?.days?.[dayKey(at)] || 0) };
};

/**
 * «واحد من كل أربعة» — نسبةٌ تُقرأ بلا حساب.
 *
 * والكسور المئوية لا تُقال في مجلس: «٢٥٪» تحتاج وقفةً، و«واحد من كل أربعة»
 * تُفهم وهي تُسمع. ودون الفاتحين لا نقول شيئًا — نسبةٌ من ثلاثة كذبٌ مهذّب.
 */
export const conversion = (visits, signups) => {
  const v = Number(visits || 0);
  const s = Number(signups || 0);
  if (v < 5 || s <= 0 || s > v) return '';
  const one = Math.round(v / s);
  return one <= 1 ? 'كلُّ من فتحه سجّل' : `واحد من كل ${one}`;
};

/**
 * تمييز العدد في العربية: «شخصٌ واحد»، و«شخصان»، و«ثمانية أشخاص»، و«أحد عشر
 * شخصًا». والتطبيق يكتب بالعربية لا بترجمةٍ عنها، فالعدد يُصرَّف كما يُنطق.
 */
export const people = (n) => {
  const c = Number(n) || 0;
  if (c === 1) return 'شخص';
  if (c === 2) return 'شخصان';
  return c >= 3 && c <= 10 ? 'أشخاص' : 'شخصًا';
};
