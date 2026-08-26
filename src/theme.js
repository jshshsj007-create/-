/**
 * المظهر: فاتح أو داكن.
 *
 * ذوق شخصي لا بيانات فريق — فيُحفظ في الجهاز نفسه، لا في الحالة المشتركة.
 * واحد يشتغل بالليل ويحب الداكن، وزميله يحب الفاتح، وما يفرض أحدهما على الآخر.
 */
const KEY = 'faid-theme';
export const THEMES = ['light', 'dark'];

export const readTheme = () => {
  try {
    const v = localStorage.getItem(KEY);
    return THEMES.includes(v) ? v : 'light';
  } catch {
    return 'light';
  }
};

export const writeTheme = (v) => {
  try { localStorage.setItem(KEY, THEMES.includes(v) ? v : 'light'); } catch { /* وضع خاص */ }
};

/** يلوّن الصفحة كلها، وشريط حالة الجوال معها حتى ما يبقى أبيض فوق شاشة داكنة. */
export const applyTheme = (v) => {
  if (typeof document === 'undefined') return;
  const dark = v === 'dark';
  document.documentElement.classList.toggle('dark', dark);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#0B1220' : '#022D71');
};
