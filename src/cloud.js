/**
 * طبقة المزامنة: تخلي كل الأجهزة تشتغل على نفس البيانات.
 *
 * الفكرة: الخادم يحمل نسخة واحدة مع رقم مراجعة (rev). كل حفظ يقول للخادم
 * «أنا بانٍ على المراجعة كذا» — فإذا كان أحد ثاني حفظ قبلي، الخادم يرفض ويرجّع
 * نسخته، وأنا أدمج تعديلي فوقها بدل ما أطمس شغله.
 */

const API = '/api/state';

/**
 * مهلةُ النداء.
 *
 * الشبكةُ لا تنقطع دائمًا بضجّة: أحيانًا يخرج الطلبُ ولا يرجع — شبكةٌ ضعيفة،
 * أو خادمٌ تأخّر تحت الضغط. و`fetch` بلا مهلةٍ ينتظر أبدًا، فيقف الحفظُ ولا
 * يقول شيئًا، وتظنّ التطبيق «علّق». وقد وقع لنا هذا يوم النشر.
 *
 * والمهلةُ تحوّل الانتظارَ الصامت إلى «ما وصل» — وهذي حالٌ يعرفها التطبيق:
 * يحفظ محليًّا ويعيد الإرسال. فالانقطاعُ المعلَن أرحمُ من الانتظار الأبدي.
 *
 * ودرجتان: الحفظُ يحمل بيانات الفريق كلها فيحتاج نفَسًا أطول، وما عداه
 * سؤالٌ وجوابٌ قصير.
 */
export const TIMEOUT = 25000;
export const TIMEOUT_FAST = 12000;
const SLOW = new Set(['push', 'init', 'snapshot_restore', 'backup_now', 'money', 'ledger', 'img_put']);

/**
 * نداء واحد للخادم. ما يرمي استثناء: يرجّع status = 0 لو الشبكة فاصلة أو
 * طالت المهلة — والاثنان عند التطبيق سواء: «ما وصل، أعِد».
 */
export const api = async (op, payload = {}) => {
  const ms = SLOW.has(op) ? TIMEOUT : TIMEOUT_FAST;
  // `AbortSignal.timeout` ما هو في كل المتصفحات، فنبنيها بأيدينا
  const stop = typeof AbortController === 'function' ? new AbortController() : null;
  const bell = stop ? setTimeout(() => stop.abort(), ms) : null;
  try {
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ op, ...payload }),
      ...(stop ? { signal: stop.signal } : {}),
    });
    let body = null;
    try { body = await res.json(); } catch { /* رد بلا JSON */ }
    return { status: res.status, ok: res.ok, body };
  } catch {
    return { status: 0, ok: false, body: null };
  } finally {
    if (bell) clearTimeout(bell);
  }
};

export const clone = (v) => JSON.parse(JSON.stringify(v ?? null));

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
/** مصفوفة سجلات لها معرّفات — نقدر ندمجها عنصرًا عنصرًا. */
const isIdArray = (v) => Array.isArray(v) && v.every((x) => isObj(x) && x.id !== undefined);
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * دمج ثلاثي: `base` النسخة اللي انطلقنا منها، `mine` تعديلي، `theirs` نسخة الخادم.
 *
 * القاعدة: اللي أضافه أي طرف يبقى، واللي حذفه صاحبه ينحذف، والقيمة اللي غيّرتها
 * أنا تفوز. فلو الموظف سجّل مشتركًا وأنا في نفس اللحظة عدّلت مصروفًا، يبقى الاثنان.
 */
export const merge3 = (base, mine, theirs) => {
  if (same(mine, theirs)) return theirs;

  if (isIdArray(mine) && isIdArray(theirs)) {
    const inBase = new Set((isIdArray(base) ? base : []).map((x) => x.id));
    const baseById = new Map((isIdArray(base) ? base : []).map((x) => [x.id, x]));
    const mineById = new Map(mine.map((x) => [x.id, x]));
    const theirsById = new Map(theirs.map((x) => [x.id, x]));
    const out = [];
    const seen = new Set();
    // ترتيب الخادم أولًا، وإضافاتي تلحق في النهاية
    for (const id of [...theirs.map((x) => x.id), ...mine.map((x) => x.id)]) {
      if (seen.has(id)) continue;
      seen.add(id);
      const m = mineById.get(id);
      const t = theirsById.get(id);
      if (m && t) out.push(merge3(baseById.get(id), m, t));
      else if (m) { if (!inBase.has(id)) out.push(m); }   // أنا أضفته؛ لو كان في الأساس فهم حذفوه
      else if (t) { if (!inBase.has(id)) out.push(t); }   // هم أضافوه؛ لو كان في الأساس فأنا حذفته
    }
    return out;
  }

  if (isObj(mine) && isObj(theirs)) {
    const out = { ...theirs };
    for (const k of new Set([...Object.keys(mine), ...Object.keys(theirs)])) {
      const b = isObj(base) ? base[k] : undefined;
      if (!(k in mine)) {
        // أنا شلت المفتاح: ينحذف فقط لو ما لمسوه هم
        if (k in theirs && same(b, theirs[k])) delete out[k];
        continue;
      }
      if (!(k in theirs)) { out[k] = mine[k]; continue; }
      out[k] = merge3(b, mine[k], theirs[k]);
    }
    return out;
  }

  // قيم بسيطة (أو أنواع مختلفة): تعديلي يفوز، وإذا ما غيّرت شيئًا فنسخة الخادم
  return same(mine, base) ? theirs : mine;
};

/* ------------------------------- جلسة المتصفح ------------------------------- */

const SESSION_KEY = 'faid-session-v1';

export const readSession = () => {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; }
};
export const writeSession = (s) => {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch { /* وضع خاص */ }
};
export const clearSession = () => {
  try { localStorage.removeItem(SESSION_KEY); } catch { /* وضع خاص */ }
};

/* ------------------------- تعديل معلّق بانتظار الشبكة ------------------------- */
/**
 * لو انقطع النت والمستخدم أقفل الصفحة، التعديل لازم يبقى — يُحفظ هنا مع النسخة
 * اللي انطلق منها، فنقدر ندمجه صح لما يفتح التطبيق من جديد.
 */
const PENDING_KEY = 'faid-pending-v1';

export const readPending = () => {
  try { return JSON.parse(localStorage.getItem(PENDING_KEY) || 'null'); } catch { return null; }
};
export const writePending = (username, base, local) => {
  try { localStorage.setItem(PENDING_KEY, JSON.stringify({ username, base, local })); } catch { /* ممتلئ */ }
};
export const clearPending = () => {
  try { localStorage.removeItem(PENDING_KEY); } catch { /* وضع خاص */ }
};
