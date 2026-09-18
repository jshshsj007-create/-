/**
 * إشعار الجوّال.
 *
 * التنبيه كان لا يُرى إلا إذا فتح الموظفُ التطبيق، فيُكتب المساء ويُقرأ بعد
 * يومين. فصار يصله إشعارًا على جوّاله والتطبيق مقفول.
 *
 * **والمفاتيح لا تُكتب في المستودع ولا تُطلب من صاحب التطبيق.** المستودع عام،
 * وأيُّ مفتاحٍ يدخله يخرج معه. فالخادم يولّدهما مرةً واحدة ويحفظهما في مخزنه —
 * لا يمرّان بشيفرةٍ ولا بمحادثة.
 */

import webpush from 'web-push';

const VAPID_KEY = 'push:vapid';
const SUB_PREFIX = 'push:sub:';
/** بريدٌ يطلبه معيار VAPID ليُعرف صاحبُ الخدمة عند خدمات الدفع. */
const CONTACT = 'mailto:Faydh2030@gmail.com';

/** المفتاحان: يُقرآن من المخزن، ويُولَّدان أوّل مرة فقط. */
export const vapid = async (store) => {
  const saved = await store.get(VAPID_KEY, { type: 'json' }).catch(() => null);
  if (saved?.publicKey && saved?.privateKey) return saved;
  const made = webpush.generateVAPIDKeys();
  await store.setJSON(VAPID_KEY, made);
  return made;
};

const subKey = (userId) => SUB_PREFIX + String(userId || '').replace(/[^A-Za-z0-9_-]/g, '_');

export const subsOf = async (store, userId) =>
  (await store.get(subKey(userId), { type: 'json' }).catch(() => null)) || [];

/**
 * جهازٌ يُسجَّل.
 *
 * وللموظف الواحد أجهزة — جوّالٌ وآيباد — فتُحفظ كلها، ويُميَّز الجهاز
 * بعنوانه (`endpoint`) فلا يُسجَّل مرتين.
 */
export const saveSub = async (store, userId, sub) => {
  if (!sub?.endpoint) return false;
  const list = await subsOf(store, userId);
  const rest = list.filter((s) => s.endpoint !== sub.endpoint);
  // عشرةٌ حدٌّ: أجهزةُ الواحد لا تزيد، والقديم يسقط قبل الجديد
  await store.setJSON(subKey(userId), [...rest, sub].slice(-10));
  return true;
};

export const dropSub = async (store, userId, endpoint) => {
  const list = await subsOf(store, userId);
  await store.setJSON(subKey(userId), list.filter((s) => s.endpoint !== endpoint));
};

/** هل فعّل هذا الموظف إشعاراته؟ يُقرأ في لوحة المدير. */
export const whoHasPush = async (store, userIds) => {
  const out = [];
  for (const id of userIds || []) {
    const list = await subsOf(store, id);
    if (list.length) out.push(id);
  }
  return out;
};

/**
 * إرسالٌ إلى أجهزة واحد.
 *
 * والجهاز الذي ردّ ٤٠٤ أو ٤١٠ مات اشتراكُه — حُذف التطبيق أو أُبطل الإذن —
 * فيُشال، وإلا بقي يُرسَل إليه إلى الأبد.
 */
const toUser = async (store, userId, payload) => {
  const list = await subsOf(store, userId);
  for (const sub of list) {
    try {
      await webpush.sendNotification(sub, JSON.stringify(payload));
    } catch (e) {
      if (e?.statusCode === 404 || e?.statusCode === 410) await dropSub(store, userId, sub.endpoint);
    }
  }
};

/**
 * من يُرسَل إليهم هذا التنبيه: الموجَّه إليه وحده، أو الفريق كلُّه.
 *
 * ولا يُرسَل إلى كاتبه ولا إلى مديرٍ — هؤلاء يكتبونها لا ينتظرونها، كما لا
 * يُعدّون في «قرأه ٣ من ٥».
 */
export const noticeTargets = (notice, users) => (users || [])
  .filter((u) => u.role !== 'مدير' && u.status !== 'غير نشط'
    && u.id !== notice.by && (!notice.to || u.id === notice.to))
  .map((u) => u.id);

/**
 * ما جدّ من التنبيهات بين حفظتين يُرسَل مرةً واحدة.
 *
 * ويُقاس بالمعرّفات لا بالعدد: حفظةٌ تحذف واحدًا وتضيف آخر لا تُرسل القديم.
 * ولا يُفشل الحفظَ فشلُ الإرسال — التنبيه محفوظٌ ويُرى عند الفتح على كل حال.
 */
export const notifyNewNotices = async (store, was, now, origin) => {
  try {
    const before = new Set((was?.notices || []).map((n) => n.id));
    const fresh = (now?.notices || []).filter((n) => n.id && !before.has(n.id));
    if (!fresh.length) return 0;
    const keys = await vapid(store);
    webpush.setVapidDetails(CONTACT, keys.publicKey, keys.privateKey);
    let sent = 0;
    for (const n of fresh) {
      for (const id of noticeTargets(n, now?.users)) {
        await toUser(store, id, {
          title: 'تنبيه من الإدارة',
          body: String(n.text || '').slice(0, 300),
          url: origin || '/',
          tag: 'notice-' + n.id,
        });
        sent++;
      }
    }
    return sent;
  } catch {
    return 0;
  }
};
