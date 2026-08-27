/**
 * أثر السجل: من أضافه، ومن عدّله، ومتى.
 *
 * الغرض منه التفويض لا المحاسبة. لما تعطي موظفًا صلاحية وتشوف بعدها رقمًا
 * غريبًا، السؤال الأول: «مين حطّه؟» — بلا جواب تسحب الصلاحية وترجع تسوّي
 * كل شي بنفسك. وبالجواب تسأل صاحبه سؤالًا واحدًا وتمشي.
 *
 * فالأثر يُكتب مرة عند الإضافة، ويُحدَّث عند كل تعديل، ولا يُمحى أبدًا.
 */

/** ختم الإضافة — يُكتب مرة واحدة ولا يتغيّر بعدها. */
export const stampNew = (user) => ({
  addedBy: user?.name || '',
  addedById: user?.id || '',
  addedAt: Date.now(),
});

/** ختم التعديل — يُكتب فوق سابقه، فيبقى آخر من مسّ السجل. */
export const stampEdit = (user) => ({
  editedBy: user?.name || '',
  editedById: user?.id || '',
  editedAt: Date.now(),
});

/**
 * نضيف ختم الإضافة للسجل الجديد، وختم التعديل للقديم.
 * لو كان السجل قديمًا بلا ختم إضافة، ما نخترع له واحدًا — ما نعرف مين أضافه،
 * والصمت أصدق من اسم مكذوب.
 */
export const stamped = (record, user, isNew) =>
  isNew ? { ...record, ...stampNew(user) } : { ...record, ...stampEdit(user) };

/** «قبل ساعتين» · «قبل ٣ أسابيع» — العمر أنفع من التاريخ في السجلات الطازجة. */
export const agoText = (ms, now = Date.now()) => {
  if (!ms) return '';
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 90) return 'الآن';
  const m = Math.round(s / 60);
  if (m < 60) return `قبل ${m} دقيقة`;
  const h = Math.round(m / 60);
  if (h < 24) return h === 1 ? 'قبل ساعة' : h === 2 ? 'قبل ساعتين' : `قبل ${h} ساعات`;
  const d = Math.round(h / 24);
  if (d < 7) return d === 1 ? 'أمس' : d === 2 ? 'قبل يومين' : `قبل ${d} أيام`;
  const w = Math.floor(d / 7);
  if (w < 5) return w === 1 ? 'قبل أسبوع' : w === 2 ? 'قبل أسبوعين' : `قبل ${w} أسابيع`;
  const mo = Math.round(d / 30);
  return mo === 1 ? 'قبل شهر' : mo === 2 ? 'قبل شهرين' : `قبل ${mo} أشهر`;
};

/**
 * سطر الأثر: «أضافه فهد · عدّله عبدالله».
 * ما نذكر التعديل إلا لو صار بعد الإضافة فعلًا — وإلا صار كل سجل «معدَّلًا»
 * وضاعت قيمة الكلمة.
 */
export const traceText = (record) => {
  const parts = [];
  if (record?.addedBy) parts.push(`أضافه ${record.addedBy}`);
  if (record?.editedBy && (record.editedAt || 0) > (record.addedAt || 0)) {
    parts.push(`عدّله ${record.editedBy}`);
  }
  return parts.join(' · ');
};
