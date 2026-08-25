/**
 * النسخ الاحتياطي: لقطة أسبوعية داخل الخادم، ونسخة ترحل لدرايف صاحب التطبيق.
 *
 * الطبقتان مقصودتان: اللقطة ترجّعك لأسبوع مضى بضغطة لو حذف أحد شيئًا بالغلط،
 * والدرايف نسخة يملكها هو خارج الاستضافة كلها — لو ضاع الحساب نفسه.
 */

export const SNAP = 'snap:';
export const SNAP_INDEX = 'snapshots';
export const STATUS = 'backup:last';
export const KEEP = 12;

/** ملف النسخة بنفس صيغة زر «نسخ البيانات» في التطبيق، فيُسترجع من أي مكان. */
export const backupFile = (data, now) => JSON.stringify(
  { app: 'Faydh', version: 1, savedAt: new Date(now).toISOString(), data },
  null,
  2,
);

const stampOf = (now) => new Date(now).toISOString().slice(0, 10);

/**
 * اسم الملف في درايف: يبدأ بالاسم عشان يبان قبل ما يُقطع العرض، وبعده التاريخ
 * والساعة — فالنسخ تترتب من نفسها، ونسختان في يوم واحد ما تلتبسان.
 * الوقت بتوقيت السعودية، لأن اللي يقرأ الاسم هنا لا في غرينتش.
 */
const KSA = 3 * 60 * 60 * 1000;
const fileNameOf = (now) => {
  const t = new Date(now + KSA).toISOString();
  return `فيض ${t.slice(0, 10)} ${t.slice(11, 16).replace(':', '-')}.json`;
};

/**
 * يرفع النسخة لدرايف عبر السكربت اللي نشره صاحب التطبيق في حسابه.
 * الرابط والكلمة السرية يعيشان في إعدادات Netlify — لا في الكود ولا في المستودع.
 */
const toDrive = async (name, body, env) => {
  const url = env.DRIVE_HOOK_URL;
  if (!url) return 'مو مفعّل';
  const secret = env.DRIVE_HOOK_SECRET || '';
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ secret, name, data: body }),
    });
    const said = (await r.text()).trim();
    if (!r.ok) return `رفض الخادم (${r.status})`;
    if (said.includes('تم')) return 'تم';
    /**
     * الرفض له سببان لا ثالث لهما: كلمة ما وصلت الخادم أصلًا، أو وصلت ولا
     * تطابق اللي في السكربت. نقول أيهما بعدد الحروف — بلا كشف الكلمة نفسها.
     */
    if (!secret) return 'رفض: الكلمة ما وصلت الخادم (راجع DRIVE_HOOK_SECRET)';
    return `رفض: الكلمة عندنا ${secret.length} حرفًا وما طابقت السكربت`;
  } catch {
    return 'ما وصل — تأكد من الرابط';
  }
};

/** ينفّذ النسخ كاملًا ويرجّع حالته. ما يرمي استثناء: الفشل يُسجَّل ويُعرض. */
export const runBackup = async (store, { now = Date.now(), env = process.env } = {}) => {
  const doc = await store.get('state', { type: 'json' });
  if (!doc?.data) return { ok: false, error: 'ما فيه بيانات بعد' };

  const stamp = stampOf(now);
  const name = fileNameOf(now);
  const body = backupFile(doc.data, now);

  // لقطة داخل الخادم، مع فهرس يحدد أيها نبقي وأيها ننظّف
  await store.set(SNAP + stamp, body);
  const index = (await store.get(SNAP_INDEX, { type: 'json' })) || [];
  const kept = [stamp, ...index.filter((x) => x !== stamp)].slice(0, KEEP);
  await store.setJSON(SNAP_INDEX, kept);
  for (const old of index.filter((x) => !kept.includes(x))) {
    try { await store.delete(SNAP + old); } catch { /* راحت وهي ما تهم */ }
  }

  const drive = await toDrive(name, body, env);
  const status = { at: now, name, size: body.length, drive, snapshots: kept };
  await store.setJSON(STATUS, status);
  return { ok: true, ...status };
};

/** آخر حالة نسخ، لعرضها في الإعدادات. */
export const backupStatus = async (store) =>
  (await store.get(STATUS, { type: 'json' })) || null;

/** محتوى لقطة محفوظة، أو null لو ما عادت موجودة. */
export const readSnapshot = async (store, stamp) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(stamp || ''))) return null;
  const raw = await store.get(SNAP + stamp);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed?.data || null;
  } catch {
    return null;
  }
};
