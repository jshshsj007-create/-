/**
 * كلمات المرور: تُخزَّن مُعمّاةً لا كما كُتبت.
 *
 * كانت تُحفظ نصًّا صريحًا في المخزن وفي كل نسخةٍ احتياطية تذهب إلى درايف —
 * فمن وصل إلى أيٍّ منهما قرأ كلمة كل واحدٍ في الفريق. وأكثر الناس يعيد كلمته
 * في مواضع أخرى، فالضرر يتجاوز التطبيق.
 *
 * و`scrypt` يُبطئ التخمين عمدًا: مليون محاولةٍ في الثانية تصير عشرات. ولكلٍّ
 * ملحُه، فجدولُ الكلمات الشائعة المحسوب سلفًا لا ينفع فيها.
 */
import crypto from 'node:crypto';

const N = 16384, R = 8, P = 1, LEN = 32;
const TAG = 'scrypt$';

/** هل هذي كلمةٌ معمّاة أصلًا؟ فما نعمّي المعمّى مرتين. */
export const isHashed = (v) => typeof v === 'string' && v.startsWith(TAG);

export const hash = (plain) => {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(String(plain), salt, LEN, { N, r: R, p: P });
  return `${TAG}${salt.toString('base64url')}$${key.toString('base64url')}`;
};

/**
 * المقارنة بزمنٍ ثابت: لو قارنّا حرفًا حرفًا لَعرف المخمِّن كم حرفًا أصاب من
 * فرق الزمن وحده، فبنى الكلمة حرفًا بعد حرف.
 *
 * ونقبل القديم الصريح مرةً أخيرة — وإلا انقفل الفريق كله خارج التطبيق يوم
 * النشر. ويُعمّى في نفس اللحظة (`upgraded` تقول للخادم أن يكتبه).
 */
export const verify = (stored, entered) => {
  if (typeof stored !== 'string' || typeof entered !== 'string') return { ok: false, upgraded: null };
  if (!isHashed(stored)) {
    const a = Buffer.from(stored);
    const b = Buffer.from(entered);
    const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
    return { ok, upgraded: ok ? hash(entered) : null };
  }
  const [, salt, key] = stored.split('$');
  if (!salt || !key) return { ok: false, upgraded: null };
  const want = Buffer.from(key, 'base64url');
  const got = crypto.scryptSync(entered, Buffer.from(salt, 'base64url'), want.length, { N, r: R, p: P });
  return { ok: crypto.timingSafeEqual(want, got), upgraded: null };
};
