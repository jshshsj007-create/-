/**
 * إشعار الجوّال — ما يُحسب في المتصفح.
 *
 * والحسابُ هنا خالصٌ يُختبر بلا متصفّح، والملامسةُ للمتصفح في آخره محصورةٌ
 * في دالّتين.
 *
 * وأثقلُ ما فيه قيدُ آبل: الإشعار لا يصل جوّال آيفون إلا إذا أُضيف التطبيق
 * إلى الشاشة الرئيسية وفُتح من أيقونته. ومن فتحه في سفاري كصفحةٍ لا يُعرض
 * عليه إذنٌ أصلًا — فلا نقول له «اضغط اسمح» ولا زرَّ عنده، بل نقول له
 * الخطوات.
 */

/**
 * حال الإشعار عند هذا الجهاز.
 *
 * - `unsupported` — متصفّحٌ لا يعرف الإشعارات أصلًا
 * - `needs-home` — آيفون في سفاري: يضيفه للشاشة الرئيسية أولًا
 * - `blocked` — منع الإذن بيده، فلا يُطلب ثانيةً (المتصفح لا يسأل مرتين)
 * - `on` — مفعَّل، يصله
 * - `off` — يقدر يفعّله الآن بضغطة
 */
export const pushStatus = ({ supported, ios, standalone, permission, subscribed } = {}) => {
  if (!supported) return ios ? 'needs-home' : 'unsupported';
  if (ios && !standalone) return 'needs-home';
  if (permission === 'denied') return 'blocked';
  return subscribed ? 'on' : 'off';
};

/** ما يُقال لصاحب الجهاز عند كل حال — بلا وعدٍ لا نملكه. */
export const PUSH_TEXTS = {
  on: { title: 'إشعارات الجوّال مفعّلة', note: 'يصلك التنبيه والتطبيق مقفول.', action: 'أوقفها' },
  off: { title: 'فعّل إشعارات الجوّال', note: 'ليصلك تنبيه الإدارة ولو كان التطبيق مقفولًا.', action: 'فعّلها' },
  blocked: {
    title: 'الإشعارات ممنوعة من إعدادات المتصفح',
    note: 'منعتَها من قبل، والمتصفّح ما يسأل مرتين. افتحها من إعدادات الموقع في متصفّحك.',
    action: '',
  },
  'needs-home': {
    title: 'أضف التطبيق إلى شاشتك ليصلك الإشعار',
    note: 'آبل لا تسمح للإشعار إلا لتطبيقٍ على الشاشة الرئيسية. وهي خطوةٌ واحدة تُعمل مرة.',
    action: '',
  },
  unsupported: { title: '', note: '', action: '' },
};

/** خطوات الآيفون، مرقّمةً كما تُعمل. */
export const HOME_STEPS = [
  'افتح الموقع في سفاري',
  'اضغط زرّ المشاركة ⬆️ تحت',
  'اختر «إضافة إلى الشاشة الرئيسية»',
  'افتح التطبيق من أيقونته الجديدة',
  'وارجع هنا واضغط «فعّل إشعارات الجوّال»',
];

/**
 * مفتاح VAPID يجي نصًّا بترميز base64url، ويطلبه المتصفح بايتاتٍ خامًا.
 *
 * ونصلّح `-` و`_` ونكمل الحشو، وإلا رُفض المفتاح بلا خبرٍ مفهوم.
 */
export const b64ToBytes = (base64) => {
  const s = String(base64 || '').trim();
  if (!s) return new Uint8Array(0);
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
};

/* ------------------------------ ملامسة المتصفح ------------------------------ */

/** ما يقوله هذا الجهاز عن نفسه. */
export const readEnv = () => {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent || '';
  // آيباد الحديث يقول عن نفسه «ماك»، فيُعرف بوجود اللمس
  const ios = /iPad|iPhone|iPod/.test(ua)
    || (/Macintosh/.test(ua) && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1);
  const standalone = typeof window !== 'undefined'
    && (window.matchMedia?.('(display-mode: standalone)')?.matches || window.navigator?.standalone === true);
  const supported = typeof window !== 'undefined'
    && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  return {
    ios,
    standalone: Boolean(standalone),
    supported: Boolean(supported),
    permission: supported ? Notification.permission : 'default',
  };
};

/** تسجيل عامل الخدمة. ويُرجع null بلا ضجيج لو منعه المتصفح. */
export const swReady = async () => {
  try {
    if (!('serviceWorker' in navigator)) return null;
    const reg = await navigator.serviceWorker.register('/sw.js');
    return (await navigator.serviceWorker.ready) || reg;
  } catch {
    return null;
  }
};

/** هل لهذا الجهاز اشتراكٌ قائم؟ */
export const currentSub = async () => {
  try {
    const reg = await navigator.serviceWorker?.getRegistration?.();
    return (await reg?.pushManager?.getSubscription?.()) || null;
  } catch {
    return null;
  }
};

/**
 * التفعيل: إذنٌ ثم اشتراكٌ ثم إرسالُه للخادم.
 *
 * ويُطلب الإذن من ضغطةٍ مباشرة — آبل لا تقبله من غيرها.
 */
export const enablePush = async ({ key, send }) => {
  const reg = await swReady();
  if (!reg) return { ok: false, why: 'ما قدرنا نجهّز الإشعارات في هذا المتصفح.' };
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return { ok: false, why: 'ما أذنتَ للإشعارات.' };
  try {
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: b64ToBytes(key),
    });
    await send(sub.toJSON());
    return { ok: true };
  } catch {
    return { ok: false, why: 'ما قدرنا نسجّل هذا الجهاز. جرّب مرة ثانية.' };
  }
};

/**
 * إصلاحُ اشتراكٍ ضاع وإذنُه قائم.
 *
 * الإذنُ يبقى في المتصفّح ولو ذهب الاشتراك — وذهابُه يقع: يُلغى عاملُ
 * الخدمة (كنّا نفعلها في «تحديث»)، أو يُبطل المتصفّحُ الاشتراكَ من نفسه بعد
 * طول هجر. فيُعاد هنا بلا سؤالٍ ولا ضغطة: `requestPermission` لا يُستدعى،
 * والمتصفّح لا يعرض شيئًا لمن أَذِن مرة.
 *
 * ولا يُعاد لمن لم يأذن، ولا لمن منع: ذاك قرارُه، ولا يُلتفّ عليه.
 */
export const healPush = async ({ key, send }) => {
  const env = readEnv();
  if (!env.supported || env.permission !== 'granted') return false;
  if (await currentSub()) return false;
  const reg = await swReady();
  if (!reg) return false;
  try {
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: b64ToBytes(key),
    });
    await send(sub.toJSON());
    return true;
  } catch {
    return false;
  }
};

/** الإيقاف: يشيل هذا الجهاز وحده. */
export const disablePush = async ({ send }) => {
  const sub = await currentSub();
  if (!sub) return { ok: true };
  try {
    await send(sub.endpoint);
    await sub.unsubscribe();
  } catch { /* ذهب الاشتراك على كل حال */ }
  return { ok: true };
};
