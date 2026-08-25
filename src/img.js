/**
 * قراءة الصور من الجوال وتصغيرها في المتصفح قبل ما ترحل للخادم.
 *
 * صور الجوال تجي بأربعة أو خمسة ميغابايت، وما فيه داعي: صفحة ولي الأمر تعرضها
 * بعرض شاشة جوال. فنصغّرها هنا مرة وحدة بدل ما تتحمّل مع كل زيارة.
 */

export const IMG_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** حدود مختلفة حسب الغرض: الإعلان يستاهل وضوحًا أكثر من صورة في معرض. */
export const POSTER = { max: 1400, cap: 700_000 };
export const GALLERY = { max: 1000, cap: 350_000 };

const dataUrl = (file) => new Promise((resolve, reject) => {
  const fr = new FileReader();
  fr.onerror = () => reject(new Error('ما قدرنا نقرأ الملف.'));
  fr.onload = () => resolve(String(fr.result || ''));
  fr.readAsDataURL(file);
});

/**
 * يرجّع الصورة كـ data URI مضغوطة. يرمي خطأ بنص عربي جاهز للعرض لو الملف
 * مو صورة أو ما نفع الضغط معه.
 */
export const readImage = async (file, { max, cap } = POSTER) => {
  if (!IMG_TYPES.includes(file?.type)) throw new Error('اختر صورة (JPG أو PNG).');
  const src = await dataUrl(file);

  const img = await new Promise((resolve, reject) => {
    const el = new Image();
    el.onerror = () => reject(new Error('الصورة مو سليمة.'));
    el.onload = () => resolve(el);
    el.src = src;
  });

  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(img.width * scale));
  c.height = Math.max(1, Math.round(img.height * scale));
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);

  let q = 0.78;
  let out = c.toDataURL('image/jpeg', q);
  while (out.length > cap && q > 0.35) { q -= 0.1; out = c.toDataURL('image/jpeg', q); }
  if (out.length > cap * 1.5) throw new Error('الصورة كبيرة جدًا. جرّب صورة أصغر.');
  return out;
};
