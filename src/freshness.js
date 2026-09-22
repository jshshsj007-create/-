/**
 * كشف النسخة القديمة.
 *
 * المتصفح — وخصوصًا التطبيق المضاف للشاشة الرئيسية — يحتفظ بنسخة قديمة
 * ويعرضها، فتصير التحسينات موجودة على الخادم وغير ظاهرة لصاحبها. هنا نقارن
 * ملف التطبيق الشغّال بالمنشور، ونقول له صراحة إن فيه نسخة أحدث.
 */

/** اسم ملف التطبيق اللي يشتغل الآن، من وسم <script> نفسه. */
export const runningBuild = (doc = document) => {
  const el = doc.querySelector('script[type="module"][src]');
  const src = el?.getAttribute('src') || '';
  return (src.match(/index-[A-Za-z0-9_-]+\.js/) || [''])[0];
};

/** اسم الملف المنشور الآن على الخادم. */
export const publishedBuild = async (fetchFn = fetch) => {
  try {
    const res = await fetchFn(`/?_=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return '';
    const html = await res.text();
    return (html.match(/index-[A-Za-z0-9_-]+\.js/) || [''])[0];
  } catch {
    return '';
  }
};

/** فيه نسخة أحدث؟ نتجاهل الفراغ عشان انقطاع الشبكة ما يوهم بتحديث. */
export const isStale = (running, published) =>
  Boolean(running && published && running !== published);

/**
 * إعادة تحميل تتجاوز المحفوظ. تفريغ Cache Storage يلزم للتطبيق المثبّت
 * على الشاشة الرئيسية، وإلا رجع لنفس النسخة القديمة.
 *
 * **ولا يُلغى عاملُ الخدمة هنا.**
 *
 * كان يُلغى — كُتب ذلك ليقتل عاملَ خدمةٍ مخزِّنًا يُبقي النسخة القديمة عند
 * الناس. لكن اشتراكَ الإشعارات يعيش **داخل** تسجيل العامل، فإلغاؤه يقتله
 * معه. فكان القادة يفعّلون إشعاراتهم، ثم تصدر نسخةٌ فيضغطون «تحديث»،
 * فيضيع اشتراكُهم وتعود البطاقة تقول «فعّلها» — بعد كل نشرة.
 *
 * وعاملُنا لا يخزّن شيئًا أصلًا (لا `fetch` فيه ولا `caches`)، فإلغاؤه لا
 * يُفيد في الطزاجة شيئًا، وتفريغُ المخزن وحده هو الذي كان يعمل.
 */
export const hardReload = async () => {
  try {
    if (typeof caches !== 'undefined') {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch { /* المتصفح ما يسمح — نكمل */ }
  location.reload();
};
