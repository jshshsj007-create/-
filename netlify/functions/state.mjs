/**
 * مخزن بيانات فريق فيض المشترك.
 *
 * كل الأجهزة تقرأ وتكتب على نسخة واحدة محفوظة في Netlify Blobs، فاللي يسجّله
 * الموظف يشوفه المدير مباشرة، والعكس.
 *
 * القراءة والكتابة مقفولة خلف تسجيل الدخول: ما فيه أحد يقدر يسحب البيانات
 * بمجرد معرفة رابط الـ API. وكلمات المرور تبقى هنا في الخادم — ما تنزل للمتصفح أبدًا.
 */
import { getStore } from '@netlify/blobs';
import crypto from 'node:crypto';
import { isAdmin, allowed, canWrite } from '../../src/perms.js';
import { programFor, publicView, validateSubmission, applySubmission, normalizeSubmission, rateLimited, waIntl, isReceipt, closureOf, makeToken as makeSignupToken } from '../../src/signup.js';
import { questionView, validateAnswer, applyAnswer, answersRateLimited, makeDrawMany, applyDrawMany } from '../../src/club.js';
import { dedupeByPhone, remapParticipants } from '../../src/people.js';
import { runBackup, backupStatus, readSnapshot, writeUndo, UNDO } from '../lib/backup.mjs';
import { hash, verify, isHashed } from '../lib/password.mjs';
import { loginBlocked, noteFail, clearFails } from '../../src/login.js';
import { countVisit, dayKey } from '../../src/visits.js';
import { moneyChanged, moneyRows, moneyMissing, moneySum, blindMoney, restoreMoney } from '../../src/money.js';
import { TRASH_DAYS } from '../../src/trash.js';

/**
 * القاعدة تُفرض هنا، لا في المتصفح: ولي أمر واحد لكل جوال، وابن واحد لكل اسم
 * أول تحته. أي حفظ يمرّ من هنا يخرج موحَّدًا، مهما كان مصدره — رابطًا أو
 * تطبيقًا أو جهازًا يحمل نسخة قديمة.
 */
const enforceOnePerPhone = (data) => {
  const r = dedupeByPhone(data);
  if (!r.mergedGuardians && !r.mergedStudents) return data;
  return { ...data, guardians: r.guardians, students: r.students, programs: remapParticipants(data.programs, r.remap) };
};

/**
 * بصمة الزائر.
 *
 * لا نحفظ عنوانه ولا شيئًا يعرّفه: نخلطه بسرّ المخزن وباليوم ثم نأخذ منه
 * اثني عشر حرفًا. فما يُرجع منها إليه، وتتبدّل مع كل يومٍ من نفسها،
 * ووظيفتها الوحيدة ألّا يُعدّ الواحد مرتين في يومه.
 *
 * وبلا عنوانٍ ترجع فاضية، فتُعدّ الفتحة ولا يُميَّز صاحبها — عدٌّ أخشن، وهو
 * خيرٌ من لا شيء.
 */
const visitorPrint = (req, secret, day) => {
  const ip = req?.headers?.get?.('x-nf-client-connection-ip') || req?.headers?.get?.('x-forwarded-for') || '';
  if (!ip) return '';
  return crypto.createHmac('sha256', String(secret || ''))
    .update(String(ip).split(',')[0].trim() + '|' + day)
    .digest('base64url').slice(0, 12);
};

const KEY = 'state';
const VKEY = 'visits';
const store = () => getStore({ name: 'faid-team', consistency: 'strong' });

/* --------------------------------- الصور --------------------------------- */
/**
 * صور البرامج تعيش خارج ملف البيانات المشترك.
 *
 * لو خزّناها داخله، صار كل جهاز في الفريق ينزّل ميغابايتات مع كل مزامنة —
 * وهو ما يحتاجها أصلًا. فنحفظ كل صورة تحت مفتاحها، وما يبقى في البيانات إلا
 * معرّفها، وتُقدَّم على مسار ثابت يخزّنه المتصفح للأبد.
 */
const IMG_PREFIX = 'img:';
const IMG_CAP = 1_500_000; // حد أعلى للـ data URI بعد الضغط في المتصفح
const IMG_MIME = { jpeg: 'image/jpeg', jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

/** يفكّ `data:image/jpeg;base64,...` إلى نوع وبايتات، أو null لو مو صورة. */
const parseDataUrl = (raw) => {
  const m = /^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(raw || ''));
  if (!m) return null;
  return { type: IMG_MIME[m[1]], bytes: Buffer.from(m[2], 'base64') };
};

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

const readDoc = async () => {
  try {
    return await store().get(KEY, { type: 'json' });
  } catch {
    return null;
  }
};

const writeDoc = (doc) => store().setJSON(KEY, doc);

/* ------------------------------ الكتابة الآمنة ------------------------------ */
/**
 * المخزن ما فيه قفل.
 *
 * فمن قرأ الملف ثم كتبه، قد يكون غيرُه قرأ وكتب بينهما — فيمحو ما كتبه، ويخرج
 * الاثنان وكلٌّ يظن أنه حُفظ. ويومَ يُنشر رابط التسجيل في مجموعة، يرسل اثنان
 * في الثانية نفسها، فيضيع تسجيلُ أحدهما وبيده إيصالُه.
 *
 * فنختم كل كتابة بمعرّف، ونحفظ آخر المعرّفات في الملف نفسه، ثم نقرأ بعدها:
 * إن وجدنا ختمنا فقد ثبت — سواء بقينا آخر من كتب، أو قرأ غيرُنا كتابتنا وبنى
 * فوقها. وإن ضاع، أعدنا الحساب على الملف الجديد وكتبنا ثانية.
 *
 * والحساب يُعاد كاملًا في كل محاولة — التحقق والحدود معه — لأن الملف الذي
 * بنينا عليه لم يعد هو.
 *
 * ولا نعيد الحساب إلا على ملفٍ خالٍ من كل ختمٍ لنا — لا آخرِها وحده. فمن
 * أعاد وقد ثبتت كتابته الأولى، سجّل ولي الأمر مرتين، وضياعُ التسجيل وتكرارُه
 * سِيّان في السوء. والختم والتسجيل يُكتبان معًا، فوجود الختم وجودُ التسجيل.
 *
 * تُرجِع `mutate` واحدًا من ثلاثة: `{ reject }` ردٌّ للمرسِل بلا كتابة،
 * أو لا شيء إذا ما فيه ما يُكتب، أو `{ doc, out }`.
 */
const WLOG = 200;
const TRIES = 8;

/**
 * وبين المحاولتين وقفةٌ عشوائية: لو عاد المتزاحمون في اللحظة نفسها، تصادموا
 * ثانيةً وثالثة. فتفريقهم بالقرعة يفضّ الزحام أسرع من إعادةٍ منتظمة.
 */
const pause = (n) => new Promise((r) => setTimeout(r, Math.round((n + 1) * (20 + Math.random() * 60))));

const commit = async (mutate, seed) => {
  let doc = seed === undefined ? await readDoc() : seed;
  const mine = new Set();
  const landed = (d) => (d?.wlog || []).some((w) => mine.has(w));
  let step = null;
  for (let n = 0; n < TRIES; n++) {
    step = mutate(doc, n);
    if (!step || step.reject || !step.doc) return step || {};
    const wid = crypto.randomUUID();
    mine.add(wid);
    await writeDoc({ ...step.doc, wlog: [...(step.doc.wlog || []), wid].slice(-WLOG) });
    doc = await readDoc();
    if (landed(doc)) return { ...step, doc };
    await pause(n);
    // نقرأ بعد الوقفة ونفحص قبل أن نعيد: قد يكون غيرُنا بنى فوق كتابتنا فيها
    doc = await readDoc();
    if (landed(doc)) return { ...step, doc };
  }
  return { busy: true };
};

/* -------------------------------- الدفتر -------------------------------- */
/**
 * دفترٌ لا يُمحى.
 *
 * كل ما وصل من الناس — تسجيلُ وليّ أمرٍ وجوابُ ولد — يُكتب في مفتاحٍ خاصٍّ به،
 * خارج ملف البيانات المشترك. لا يكتب فيه إلا البابُ الذي جاء منه، **ولا يحذف
 * منه شيء**: لا حفظةُ جهاز، ولا استرجاعُ لقطةٍ كاملة، ولا عطبٌ لم يُتصوَّر.
 *
 * والفرق بينه وبين الحارس: الحارس يمنع الحذف، وقد وُجدت فيه ثغرتان في يومٍ
 * واحد. والدفتر ما فيه ما يُثغَر — لا يوجد فيه سطرٌ يحذف. فما بُني على المنع
 * يُخترق، وما بُني على انعدام الطريق لا يُخترق.
 *
 * وكل سطرٍ مفتاحٌ وحده: فما فيه قراءةٌ ثم كتابةٌ تتزاحم، ولا حدَّ لطوله.
 */
const LED = 'led:';
const ledKey = (kind, id) => `${LED}${kind}:${id}`;

/** يُكتب ولا يُقرأ في الطريق: لا يعطّل ما جاء لأجله لو تعثّر. */
const ledWrite = async (kind, id, row) => {
  try { await store().setJSON(ledKey(kind, id), row); return true; } catch { return false; }
};

/**
 * قراءة الدفتر — للمدير وحده.
 *
 * وتُقرأ على دفعات: الدفتر لا يُقلَّم أبدًا، فبعد ثلاثة مواسم يصير فيه ألوف
 * السطور. ولو قرأناها كلها في نداءٍ واحد، بلغ النداءُ حدَّ الوقت في الخادم
 * ووقف الزرُّ الذي بُني للإنقاذ — يومَ يُحتاج إليه لا قبله.
 *
 * فنقرأ ما يلزم: للعرض آخرُ مئتين، وللمطابقة أكثرُ لأنها تبحث عن غائب.
 */
const LED_STEP = 60;
const ledRead = async (kind, cap = 400) => {
  let keys = [];
  try {
    const r = await store().list({ prefix: `${LED}${kind}:` });
    keys = (r?.blobs || []).map((b) => b.key);
  } catch { return { rows: [], total: 0, more: false }; }
  const total = keys.length;
  const take = keys.slice(0, cap);
  const rows = [];
  // على دفعات: ألفُ نداءٍ متوازٍ يخنق الدالة، وستون تمرّ
  for (let i = 0; i < take.length; i += LED_STEP) {
    const part = await Promise.all(take.slice(i, i + LED_STEP).map(async (k) => {
      try { return await store().get(k, { type: 'json' }); } catch { return null; }
    }));
    rows.push(...part.filter(Boolean));
  }
  rows.sort((a, b) => Number(b?.at || 0) - Number(a?.at || 0));
  return { rows, total, more: total > take.length };
};

/**
 * عمقُ الحمولة، محسوبًا على نصّها.
 *
 * لا نمشي على الكائن لنقيس عمقه: المشيُ هو نفسُه ما نحرس منه. وإنما نعدّ
 * الأقواس في النصّ — عدٌّ مسطّح لا يستدعي نفسه، فيمرّ على أي عمقٍ بلا أن يقع.
 *
 * والسلاسل تُتخطّى بحروفها: قوسٌ داخل نصٍّ ليس عمقًا، ومن كتب `"{{{{"` في
 * اسم ابنه ما كان يهاجم أحدًا.
 */
export const MAX_DEPTH = 40;
const tooDeep = (v) => {
  let s;
  try { s = JSON.stringify(v); } catch { return true; }   // حلقةٌ في الكائن نفسه
  if (!s) return false;
  let depth = 0;
  let inStr = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (c === '\\') i++;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{' || c === '[') { if (++depth > MAX_DEPTH) return true; }
    else if (c === '}' || c === ']') depth--;
  }
  return false;
};

/* ------------------------------ دفتر المال ------------------------------ */
/**
 * كل حركةٍ مالية تُكتب سطرًا لا يُمحى.
 *
 * التسجيلُ والجواب يصلان من بابهما فيُكتبان ساعتهما، والمالُ يصل ضمن ملف
 * البيانات كله — فلا بابَ له. فنصنعه هنا: نقابل ما جاء بما كان، فما جدّ أو
 * تبدّل يُكتب.
 *
 * وله سقفٌ في النداء الواحد: الحفظةُ الواحدة لا تحمل خمسين حركة إلا أن تكون
 * استرجاعَ موسمٍ كامل، وذاك له بابُه (`money` بـ `seed`). والسقف يمنع أن تعلّق
 * حفظةٌ عاديّة على كتابة ألف مفتاح.
 */
const MONEY_MAX = 60;
/** وللتأسيس قدرٌ أوسع: يُضغط مرةً أو مرّتين، لا مع كل حفظة */
const SEED_MAX = 240;
const moneyLog = async (before, after, by) => {
  let fresh = [];
  try { fresh = moneyChanged(before, after); } catch { return 0; }
  if (!fresh.length) return 0;
  const at = Date.now();
  const take = fresh.slice(0, MONEY_MAX);
  for (let i = 0; i < take.length; i += LED_STEP) {
    // وقتُ الحركة نفسها إن كان لها وقت، وإلا وقتُ كتابتها — والدفتر يُرتَّب عليه
    await Promise.all(take.slice(i, i + LED_STEP).map((r) => ledWrite('mal', r.key, { ...r, at: Number(r.at || 0) || at, wroteAt: at, by })));
  }
  return take.length;
};

/* ------------------------------ عدّاد الفتحات ------------------------------ */
/**
 * العدّاد يعيش في ملفٍ وحده، لا في ملف البيانات.
 *
 * فتحُ الرابط أكثرُ ما يقع يوم النشر بأضعاف، ولو كتبناه في الملف المشترك لصار
 * كل فاتحٍ يعيد كتابة بيانات الفريق كلها — يزاحم التسجيلات ويثقل الحفظ. وهو
 * رقمٌ لا يُبنى عليه شيء: ضياعُ واحدةٍ منه لا يضرّ، وضياعُ تسجيلٍ يضرّ.
 */
const readVisits = async (doc) => {
  let v = null;
  try { v = await store().get(VKEY, { type: 'json' }); } catch { v = null; }
  // ما قبل الملف المستقل كان العدّ داخل البيانات، فنكمل من حيث وقف
  return v?.stats ? v : { w: '', stats: doc?.visits || {} };
};

const bumpVisit = async (doc, pid, print, at) => {
  for (let n = 0; n < 3; n++) {
    const cur = await readVisits(doc);
    const seen = countVisit(cur.stats, pid, print, at);
    if (!seen.changed) return;
    const w = crypto.randomUUID();
    await store().setJSON(VKEY, { w, stats: seen.stats });
    if ((await readVisits(doc)).w === w) return;
  }
};

/**
 * ما يُرسل من العدّاد: رقمان لكل برنامج لا غير.
 *
 * والبصمات ما تخرج من الخادم أبدًا — لا حاجة للجوال بها، وإخراجها توسيعٌ
 * لدائرة ما يُعرف عن الناس بلا فائدة.
 */
const visitsFor = async (doc, at = Date.now()) => {
  const { stats } = await readVisits(doc);
  const day = dayKey(at);
  const out = {};
  for (const [pid, v] of Object.entries(stats || {})) {
    out[pid] = { total: Number(v?.total || 0), today: Number(v?.days?.[day] || 0) };
  }
  return out;
};

/* --------------------------- الجلسات (توكن موقّع) --------------------------- */

const sign = (secret, username) =>
  crypto.createHmac('sha256', secret).update(String(username).toLowerCase()).digest('base64url');

/**
 * التوكن وعصرُه.
 *
 * كان يُوقَّع على الاسم وحده، فيبقى صالحًا إلى الأبد: جوالٌ ضاع، أو جهازٌ
 * تُرك مفتوحًا عند من ترك الفريق، أو كلمةٌ بُدّلت لأنها انكشفت — ثلاثتها
 * والباب مفتوح كما كان. وتبديلُ كلمةِ المرور لا يُخرج أحدًا، وهذا أسوأُ
 * ما فيه: تظنّ أنك أقفلتَ وما أقفلت.
 *
 * فصار للمستخدم **عصر**، رقمٌ يُوقَّع معه. وتبديلُ الكلمة يرفعه، فتموت
 * توكناتُه كلها في لحظة، وله أن يرفعه بنفسه («أخرج أجهزتي كلها»).
 *
 * ومن عصرُه صفرٌ يُقبل توكنُه القديم كما هو، فلا يُخرَج الفريق كلُّه يومَ
 * يُنشر هذا. وأولُ رفعٍ يقتل القديم، وهو المقصود.
 */
const epochOf = (u) => String(Math.max(0, Number(u?.tokenEpoch || 0)));

const makeToken = (secret, u) => {
  const name = typeof u === 'string' ? u : u?.username;
  const e = typeof u === 'string' ? '0' : epochOf(u);
  return `${Buffer.from(String(name)).toString('base64url')}.${e}.${sign(secret, `${name}|${e}`)}`;
};

/** يرجّع المستخدم لو التوكن سليم وحسابه لا يزال نشطًا وعصرُه لم يمضِ، وإلا null. */
const userFromToken = (doc, token) => {
  if (!doc?.secret || typeof token !== 'string' || !token.includes('.')) return null;
  const parts = token.split('.');
  // القديم جزآن (بلا عصر)، والجديد ثلاثة
  const [rawName, era, mac] = parts.length === 3 ? parts : [parts[0], null, parts[1]];
  let username;
  try {
    username = Buffer.from(rawName, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  const expected = era === null ? sign(doc.secret, username) : sign(doc.secret, `${username}|${era}`);
  const a = Buffer.from(String(mac || ''));
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const u = (doc.data?.users || []).find((x) => (x.username || '').toLowerCase() === username.toLowerCase());
  if (!u || u.status === 'غير نشط') return null;
  // ومن رُفع عصرُه ما عاد توكنُ ما قبله يفتح — ولا التوكنُ القديم بلا عصر
  if (epochOf(u) !== String(era === null ? 0 : era)) return null;
  return u;
};

/* ------------------------- كلمات المرور تبقى في الخادم ------------------------- */



/**
 * خيركم للطالب المربوط: سجلّه هو وحده. تسميع بقية الطلاب وملاحظات الشيخ فيهم
 * ما تنزل جهازه أصلًا — الحجب في الخادم لا في الواجهة.
 */
const khayrOfStudent = (khayr, me) => {
  const mine = (khayr?.students || []).find((s) => s.userId && s.userId === me?.id);
  if (!mine) return { students: [], sessions: [] };
  return {
    students: [mine],
    sessions: (khayr?.sessions || [])
      .filter((s) => s.entries?.[mine.id])
      .map((s) => ({ ...s, entries: { [mine.id]: s.entries[mine.id] } })),
  };
};

/**
 * نسخة صالحة للإرسال لهذا المستخدم بالذات: بدون كلمات المرور أبدًا، وبدون
 * بيانات الأهالي لمن ما أُعطي صلاحيتها — جوالات وأعمار وملاحظات صحية لأطفال،
 * ما تنزل جهازًا ما يحتاجها.
 */
const strip = (data, me) => {
  const out = { ...data, users: (data?.users || []).map(({ password, ...rest }) => rest) };
  if (!allowed(me, 'أولياء الأمور')) { out.guardians = []; out.students = []; }
  if (!allowed(me, 'خيركم')) out.khayr = khayrOfStudent(data?.khayr, me);
  /**
   * أسئلة النادي تحمل الجواب الصحيح وأسماء الأولاد الذين جاوبوا. من لا يفتح
   * شاشة النادي لا يفتحها في بياناته أيضًا.
   */
  if (!allowed(me, 'النادي')) out.questions = [];
  /**
   * صندوق المحذوفات يحمل سجلات كاملة — أهالي وطلابًا وتسميعًا. لو أرسلناه
   * للكل، صار بابًا خلفيًا يتجاوز كل ما حجبناه فوق. فهو للمدير وحده،
   * وهو صاحب الشاشة أصلًا.
   */
  if (!allowed(me, 'المستخدمون والصلاحيات')) out.trash = [];
  // والمال: من ليست عنده صلاحيتُه لا يصله منه شيء — لا يُخفى في الشاشة، بل لا يُرسل
  if (!seesMoney(me)) return blindMoney(out);
  return out;
};

/** صلاحيةُ المال: أيٌّ من البابين يفتحه، وسواهما لا يراه. */
const seesMoney = (me) => allowed(me, 'المصروفات والتقارير') || allowed(me, 'فيض - الإيرادات والمصروفات');

/* ---------------------------- حارس المحو ---------------------------- */
/**
 * السجل الذي يختفي بلا سجلِّ حذف لم يحذفه أحد.
 *
 * كل حذفٍ في التطبيق يمرّ بصندوق المحذوفات ويترك أثرًا باسم صاحبه. فاختفاءٌ
 * بلا أثر معناه حمولةٌ قديمة كُتبت فوق جديد — تسجيلُ وليّ أمرٍ بيده إيصاله،
 * أو سؤالٌ نُشر على الأولاد.
 *
 * **ونردّه ولا نردّ الحفظة.** لأن الردّ يدفع الجهاز إلى دمجٍ لا يُرجع الغائب
 * (فالدمج يقرأ غيابه عن حمولتي حذفًا مني)، فيعيد ويُردّ، ويدور. أما الإرجاع
 * فيقبل شغله ويحفظ ما لم يره — ولا يضيع طرف.
 *
 * وثمنُه أن حذفًا لم يكتب أثره يُردّ، فيحذفه صاحبه ثانية. وهو أرخص من تسجيلٍ
 * يضيع ومعه مالُه.
 */
const deepIds = (v, into = new Set()) => {
  if (Array.isArray(v)) { for (const x of v) deepIds(x, into); return into; }
  if (v && typeof v === 'object') {
    if (typeof v.id === 'string') into.add(v.id);
    for (const k of Object.keys(v)) deepIds(v[k], into);
  }
  return into;
};

/** الاسم في القائمة، أو الاسم داخل البرنامج واليوم — لنقول لصاحبه ما أُرجع. */
const listBack = (mine, theirs, keep) => {
  if (!Array.isArray(theirs) || !theirs.length) return { list: mine, back: [] };
  const here = new Set((Array.isArray(mine) ? mine : []).map((x) => x?.id));
  const back = theirs.filter((x) => x?.id && !here.has(x.id) && !keep.has(x.id));
  return back.length ? { list: [...(mine || []), ...back], back } : { list: mine, back: [] };
};

const repair = (incoming, current) => {
  if (!current?.programs && !current?.guardians) return { data: incoming, back: [] };
  /**
   * ما كتب صاحبه أثر حذفه فقد ذهب بإذنه — ومعه ما تحته: اليومُ يذهب بمشاركيه.
   *
   * ونقرأ الصندوقين: الوارد **وما عند الخادم**. فالوارد وحده لا يكفي — من
   * حفظ بنسخةٍ قديمة ما فيها حذفُ زميله، فلا هو ولا سجلُّه؛ فيقرأ الحارس
   * الغياب حادثًا ويبعث من حذفه صاحبه قصدًا. وصندوق الخادم يعرف كل حذفٍ
   * وقع، فبه يُميَّز الذاهب بإذنٍ من الذاهب بغلط.
   */
  const keep = deepIds([...(incoming?.trash || []), ...(current?.trash || [])]);
  const out = { ...incoming };
  const back = [];
  const note = (kind, rows) => rows.forEach((r) => back.push({ kind, name: r.name || '' }));

  for (const [key, kind] of [['guardians', 'ولي أمر'], ['students', 'طالب'],
    ['competitions', 'مسابقة'], ['trips', 'سفرة'], ['tournaments', 'دوري'],
    /**
     * وهذي الخمس كانت بلا حارس، وفيها المال.
     *
     * حركاتُ فيض والتسليمات هي رصيدُك نفسه، فضياعُ صفٍّ منها يغيّر ما في يدك.
     * والحسابات جذورُها — يذهب الحساب فتصير الحركاتُ كلها بلا اسم. وخاناتُ
     * التسجيل هي شكل الرابط، وسجلُّ النادي هو ذاكرةُ ما نُفِّذ.
     */
    ['faidAdjustments', 'حركة مالية'], ['handovers', 'تسليم'],
    ['faidAccounts', 'حساب'], ['signupFields', 'خانة تسجيل'], ['clubRuns', 'مسابقة منفَّذة']]) {
    const r = listBack(out[key], current[key], keep);
    out[key] = r.list; note(kind, r.back);
  }

  /**
   * ولا يُبعث ما ذهب أصلُه.
   *
   * حذفُ مسابقةٍ يُمضي معها سجلَّ تنفيذها، وحذفُ حسابٍ يُمضي ما عليه — ولا
   * سجلَّ حذفٍ لكل صفٍّ منها، فيقرأ الحارسُ غيابَها حادثًا فيعيدها معلَّقةً على
   * ما لم يعد موجودًا. فما ذهب أصلُه لا يُعاد.
   */
  const compIds = new Set((out.competitions || []).map((c) => c?.id));
  out.clubRuns = (out.clubRuns || []).filter((r) => !r?.compId || compIds.has(r.compId));

  /**
   * والسؤال يُحرس بأجوبته: الولد يجاوب فينزل جوابُه داخل السؤال، فلو نظرنا
   * إلى السؤال وحده رأيناه قائمًا وقد ذهب من جاوبوا فيه.
   */
  const qs = listBack(out.questions, current.questions, keep);
  const wasQ = new Map((current.questions || []).map((q) => [q.id, q]));
  out.questions = (qs.list || []).map((q) => {
    const was = wasQ.get(q.id);
    if (!was) return q;
    const a = listBack(q.answers, was.answers, keep);
    const dr = listBack(q.draws, was.draws, keep);
    note('جواب', a.back); note('قرعة', dr.back);
    return a.back.length || dr.back.length ? { ...q, answers: a.list, draws: dr.list } : q;
  });
  note('سؤال', qs.back);

  // وجلسات خيركم: تسميعُ شهرٍ يذهب بصمتٍ مثل غيره
  const ses = listBack(out.khayr?.sessions, current.khayr?.sessions, keep);
  const kst = listBack(out.khayr?.students, current.khayr?.students, keep);
  if (ses.back.length || kst.back.length) {
    out.khayr = { ...(out.khayr || {}), sessions: ses.list, students: kst.list };
    note('جلسة تسميع', ses.back); note('طالب في خيركم', kst.back);
  }

  const progs = listBack(out.programs, current.programs, keep);
  const byId = new Map((current.programs || []).map((p) => [p.id, p]));
  out.programs = (progs.list || []).map((p) => {
    const was = byId.get(p.id);
    if (!was) return p;
    const parts = listBack(p.participants, was.participants, keep);
    const weeks = listBack(p.weeks, was.weeks, keep);
    const wasWeeks = new Map((was.weeks || []).map((w) => [w.id, w]));
    note('مشترك', parts.back); note('يوم', weeks.back);
    return {
      ...p,
      participants: parts.list,
      weeks: (weeks.list || []).map((w) => {
        const ww = wasWeeks.get(w.id);
        if (!ww) return w;
        const r = listBack(w.participants, ww.participants, keep);
        note('مشترك', r.back);
        return r.back.length ? { ...w, participants: r.list } : w;
      }),
    };
  });
  note('برنامج', progs.back);
  return { data: out, back: [...back, ...bury(out, incoming, current)] };
};

/**
 * والنصف الثاني: لا يُبعث من دُفن.
 *
 * الحارس فوق يمنع الضياع، وهذا يمنع ضدَّه. فمن حفظ بنسخةٍ قديمة، نسختُه ما
 * زالت تحمل من حذفه زميلُه قبل قليل — فيعود من نفسه، ويظنّ صاحبه أن حذفه
 * ما نفذ. والأول أضرّ، لكن الثاني يُربك: تحذف اسمًا فيرجع، فتحذفه فيرجع.
 *
 * والعلامة: سجلٌّ في صندوق الخادم **وفي الوارد كذلك** — فهو محذوفٌ عند
 * الطرفين. أما من أخرجه صاحبُه من الصندوق فذاك استرجاعٌ بإذنه، فيُترك.
 */
const bury = (out, incoming, current) => {
  const still = new Set((current?.trash || [])
    .filter((t) => t?.id && (incoming?.trash || []).some((x) => x?.id === t.id))
    .flatMap((t) => [...deepIds(t.item)]));
  if (!still.size) return [];
  const gone = [];
  const sift = (list, kind) => {
    if (!Array.isArray(list)) return list;
    const keep = list.filter((x) => !still.has(x?.id));
    if (keep.length !== list.length) {
      list.filter((x) => still.has(x?.id)).forEach((x) => gone.push({ kind, name: x?.name || '', buried: true }));
    }
    return keep;
  };
  for (const [key, kind] of [['guardians', 'ولي أمر'], ['students', 'طالب'], ['questions', 'سؤال'],
    ['competitions', 'مسابقة'], ['trips', 'سفرة'], ['tournaments', 'دوري']]) out[key] = sift(out[key], kind);
  out.programs = sift(out.programs, 'برنامج').map((p) => ({
    ...p,
    participants: sift(p.participants, 'مشترك'),
    weeks: sift(p.weeks, 'يوم').map((w) => ({ ...w, participants: sift(w.participants, 'مشترك') })),
  }));
  return gone;
};

/**
 * الحفظ القادم من المتصفح ما يقدر يمس ما لا يملكه صاحبه:
 * كلمات المرور المخزّنة، وقاعدة الأهالي، وقائمة المستخدمين نفسها —
 * وإلا صار بإمكان أي موظف يرفّع نفسه مديرًا من جهازه.
 */
const guard = (incoming, current, me) => {
  const out = { ...incoming };

  if (allowed(me, 'المستخدمون والصلاحيات')) {
    // المتصفح ما عنده كلمات المرور، فأي مستخدم رجع بدونها يحتفظ بالقديمة
    out.users = (incoming?.users || []).map((u) => {
      const old = (current?.users || []).find((x) => x.id === u.id);
      // كلمةٌ جديدة كتبها المدير: تُعمّى هنا، فما تُكتب صريحةً في المخزن أبدًا
      if (u.password && !isHashed(u.password)) {
        /**
         * وتبديلُ الكلمة يُخرج أجهزتَه.
         *
         * وإلا صار البابُ مفتوحًا بعد أن أقفلتَه: تُبدّل الكلمة لأنها انكشفت،
         * ومن عنده جلسةٌ قائمة يدخل بها كما كان. تظنّ أنك أقفلتَ وما أقفلت.
         *
         * ومن لم تكن له كلمةٌ قبلُ فليست هذي تبديلًا: مستخدمٌ جديد، أو أولُ
         * حفظةٍ بعد إنشاء المخزن. وما له جلساتٌ تُقتل أصلًا.
         */
        const fresh = Boolean(old?.password);
        return { ...u, password: hash(u.password), ...(fresh ? { tokenEpoch: Number(old.tokenEpoch || 0) + 1 } : {}) };
      }
      if (u.password) return u;
      // والمتصفح ما عنده الكلمات، فمن رجع بلا كلمةٍ يحتفظ بالقديمة
      return old?.password ? { ...u, password: old.password } : u;
    });
    // والعصر لا يُخفَّض بحفظة: من رُفع عصرُه لا يُعاد أحدٌ إلى جلسته بنسخةٍ قديمة
    const wasU = new Map((current?.users || []).map((x) => [x.id, x]));
    out.users = out.users.map((u) => {
      const was = Number(wasU.get(u.id)?.tokenEpoch || 0);
      return Number(u.tokenEpoch || 0) < was ? { ...u, tokenEpoch: was } : u;
    });
  } else {
    out.users = current?.users || [];
  }

  if (!allowed(me, 'أولياء الأمور')) {
    out.guardians = current?.guardians || [];
    out.students = current?.students || [];
  }

  // الطالب يقرأ سجلّه ولا يكتبه، ومثله من أُعطي «خيركم» للقراءة فقط
  if (!canWrite(me, 'خيركم')) out.khayr = current?.khayr || { students: [], sessions: [] };

  // وما حُجب في `strip` يُردّ هنا، وإلا محته حفظةٌ عادية من جهازٍ ما شافه
  if (!allowed(me, 'النادي')) out.questions = current?.questions || [];

  /**
   * مفتاح الرابط ورمزُه ملكُ صاحبه وحده.
   *
   * كانا يعيشان في البيانات كأي رقم، فحفظةٌ من جهازٍ متأخّر تُرجعهما إلى حالٍ
   * قديمة — فيُقفل رابطٌ نشرتَه في مجموعة، أو يتبدّل رمزُه فتموت الرسالة التي
   * أرسلتها لألف واحد. ومثله السؤال: يُقفل وأنت تظنّه مفتوحًا، فيقف الأولاد
   * أمام باب.
   *
   * فصارت هذي الأربعة لا تتغيّر بحفظٍ أبدًا — لا من جهازك ولا من غيره — وإنما
   * بفعلٍ مقصودٍ وحده (`link_set`). وما جاء في الحفظة منها يُردّ إلى ما عند
   * الخادم، مهما كان مصدره.
   */
  const wasProg = new Map((current?.programs || []).map((p) => [p.id, p]));
  out.programs = (out.programs || []).map((p) => {
    const was = wasProg.get(p.id);
    if (!was?.signup || !p.signup) return p;
    return { ...p, signup: { ...p.signup, enabled: was.signup.enabled, token: was.signup.token } };
  });
  const wasQ = new Map((current?.questions || []).map((q) => [q.id, q]));
  out.questions = (out.questions || []).map((q) => {
    const was = wasQ.get(q.id);
    // والمؤقّت معهما: هو إقفالٌ مؤجَّل، فحفظةٌ قديمة تُقدّمه فتقفل قبل وقته
    return was ? { ...q, open: was.open, token: was.token, closesAt: was.closesAt } : q;
  });
  /**
   * ووجهتا الرابطين الثابتين: عنوانان منشوران، لا يُبدَّلان بحفظة.
   *
   * والغيابُ يُعامَل كالفراغ لا كالإذن: كان الشرط «إن كان عند الخادم وجهة»،
   * فمن لم تكن عنده وجهةٌ بعدُ صار بابُه مفتوحًا لأي حفظةٍ تكتب فيه — لا
   * تُقفل رابطًا، لكنها تُوجّهه إلى برنامجٍ لم تختره. والباب الذي يُبدّلهما
   * واحدٌ مقصود، فما يُترك ثانٍ إلى جنبه.
   */
  out.publicLink = current?.publicLink || { programId: '' };
  out.questionLink = current?.questionLink || { questionId: '' };

  /**
   * الصندوق: الموظف ما يشوفه (حجبناه في `strip`)، فلو قبلنا قائمته كما هي
   * محا محذوفات المدير كلها بحفظة عادية. لكن حذفه هو يستحق الرجعة مثل غيره،
   * فنقبل منه الإضافة وحدها: ما جاء جديدًا يُضاف، وما كان قائمًا يبقى.
   * والإعدادات تُكتب من شاشة المدير، فتبقى له.
   */
  if (!allowed(me, 'المستخدمون والصلاحيات')) out.settings = current?.settings || {};

  // والصندوق لا يُمحى بحفظة — لا من موظفٍ ولا من مدير
  out.trash = trashKeep(incoming, current);
  // وما حُجب عنه من المال يُردّ، وإلا محته حفظةُ حضورٍ من جهازٍ ما رآه
  return seesMoney(me) ? out : restoreMoney(out, current);
};

/**
 * الصندوق أساسُ الحارس، فلا يُمحى بحفظة.
 *
 * كل ما بُني فوقه يقوم عليه: الحارسُ يميّز الذاهبَ بإذنٍ من الذاهب بغلط
 * بسجلِّ حذفه، والدفنُ لا يقع إلا بسجلٍّ عند الطرفين، والمطابقةُ لا تعدّ
 * المحذوفَ باليد ضائعًا. فلو محت حفظةٌ من جهازٍ متأخّر الصندوقَ، سقط الثلاثة
 * معًا في لحظة — وهذي أخطر من ضياع سجلٍّ واحد، لأنها تُعطّل ما يحرس الباقي.
 *
 * وكان الاتحادُ للموظف وحده، والمديرُ تُقبل قائمتُه كما هي. وجهازُ المدير
 * ليس أقلَّ تأخّرًا من غيره.
 *
 * فالسجلّ لا يخرج إلا بأحد بابين: أن يُسترجع صاحبُه — فيعود السجل إلى مكانه
 * في البيانات، وهذي علامةٌ لا تُصطنع — أو أن يمضي شهرُه.
 */
const trashKeep = (incoming, current) => {
  const mine = Array.isArray(incoming?.trash) ? incoming.trash : [];
  const kept = Array.isArray(current?.trash) ? current.trash : [];
  if (!kept.length) return mine;
  const here = new Set(mine.map((t) => t?.id).filter(Boolean));
  // ما رجع إلى البيانات فقد استُرجع بإذن صاحبه — ولا شيء غيرُه يُخرجه
  const live = deepIds(incoming?.programs || []);
  deepIds(incoming?.guardians || [], live);
  deepIds(incoming?.students || [], live);
  deepIds(incoming?.questions || [], live);
  deepIds(incoming?.competitions || [], live);
  deepIds(incoming?.trips || [], live);
  deepIds(incoming?.tournaments || [], live);
  deepIds(incoming?.faidAdjustments || [], live);
  deepIds(incoming?.khayr || {}, live);
  // وشهرُه يمضي هنا كذلك: لولا ذلك ما مضى أبدًا، فالتطبيق يُسقطه ونحن نُعيده
  const old = Date.now() - TRASH_DAYS * 24 * 60 * 60 * 1000;
  const gone = kept.filter((t) => t?.id && !here.has(t.id) && !live.has(t.item?.id) && Number(t.at || 0) > old);
  return gone.length ? [...mine, ...gone] : mine;
};

/* ---------------------------------- المعالج ---------------------------------- */

export default async (req) => {
  /**
   * الصور تُطلب بالمسار مباشرة عشان يقدر المتصفح يخزّنها: المعرّف مشتق من
   * محتواها، فما تتغيّر أبدًا تحت نفس العنوان — ومعناها تُنزَّل مرة وحدة في العمر.
   */
  if (req.method === 'GET') {
    const id = /\/img\/([A-Za-z0-9_-]{6,64})$/.exec(new URL(req.url).pathname)?.[1];
    if (!id) return json({ error: 'not_found' }, 404);
    let raw;
    try { raw = await store().get(IMG_PREFIX + id); } catch { raw = null; }
    const img = raw && parseDataUrl(raw);
    if (!img) return json({ error: 'not_found' }, 404);
    return new Response(img.bytes, {
      headers: { 'content-type': img.type, 'cache-control': 'public, max-age=31536000, immutable' },
    });
  }

  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad_json' }, 400);
  }

  /**
   * حمولةٌ عميقة تُردّ قبل أن تُمسّ.
   *
   * الرابط عامٌّ يفتحه من شاء، ولا يحتاج مرسِلُه أن يعرف كلمةً ولا أن يدخل.
   * فمن أرسل كائنًا متداخلًا ألفَ مرة، انفجرت كلُّ دالةٍ تمشي عليه —
   * `deepIds` والحارس والدمج — بلا خطأٍ يُفهم، وإنما بدالةٍ تقف. وهو أرخصُ
   * هجومٍ يُتصوَّر: رسالةٌ واحدة صغيرة.
   *
   * والعمق يُقاس على النصّ لا على الكائن: القياسُ نفسه لو مشى على الكائن
   * وقع فيما نحرس منه. وأربعون طبقةً أوسع بكثيرٍ من أعمق ما في بياناتنا
   * (البرنامج ← أيامه ← مشاركوه ← إيصاله) — فما تضيق على أحد.
   */
  if (tooDeep(body)) return json({ error: 'too_deep' }, 400);

  const op = body?.op;
  const doc = await readDoc();
  const initialized = Boolean(doc?.data?.users?.length);

  // هل المخزن جاهز أصلًا؟ يستخدمه التطبيق قبل شاشة الدخول.
  if (op === 'status') return json({ ok: true, initialized });

  /* ------------------------- الرابط العام (بلا دخول) ------------------------- */
  // ملاحظة: هذولا مفتوحان لأي أحد، فما يخرج منهما إلا ما يحتاجه ولي الأمر —
  // ولا حرف عن المسجّلين ولا الحسابات ولا بقية البرامج.

  if (op === 'signup_info') {
    const program = doc && programFor(doc.data, body.token);
    // الرابط المقفل يرجّع رقم الفريق وحده: «تواصل معنا» بلا طريق كلام فاضي،
    // والرقم عام أصلًا يشوفه كل من فتح أي رابط تسجيل
    if (!program) {
      // ولماذا هو مقفول: أُقفل قصدًا، أو تجدّد رمزه، أو ما عاد للرابط العام وجهة
      const { why } = closureOf(doc?.data, body.token);
      return json({
        error: 'closed',
        why,
        wa: waIntl(doc?.data?.waNumber),
        closedTitle: doc?.data?.closedTitle || '',
        closedText: doc?.data?.closedText || '',
      }, 404);
    }
    /**
     * نعدّه هنا: هذي أول لحظةٍ يطلب فيها الفاتحُ شيئًا، وقبل أن يرى حرفًا.
     *
     * وفي ملفه وحده: لا يرفع رقم النسخة فيوقظ أجهزة الفريق كلما فُتح الرابط،
     * ولا يمسّ البيانات فيزاحم تسجيلًا جاريًا.
     */
    const at = Date.now();
    await bumpVisit(doc, program.id, visitorPrint(req, doc.secret, dayKey(at)), at);
    return json({ ok: true, view: publicView(doc.data, program) });
  }

  /**
   * سؤال اليوم. ما يخرج منه الجواب الصحيح ولا أجوبة غيره — وإلا صار الرابط
   * يسلّم الحلّ لمن يفتحه.
   */
  if (op === 'question_info') {
    const view = doc && questionView(doc.data, body.token);
    /**
     * `gone` لا `closed`: السؤال المقفول يرجع بـ 200 وفيه `open: false`، فما
     * يصل هنا إلا رمزٌ ما عاد يدلّ على سؤال — حُذف أو تجدّد. وهذي هي التي
     * ظهرت لنا يومًا بثوب «انتهى وقت الجواب»، فما عرفنا أن السؤال راح.
     */
    if (!view) return json({ error: 'closed', why: 'gone' }, 404);
    return json({ ok: true, view });
  }

  if (op === 'question_answer') {
    const now = Date.now();
    const r = await commit((d) => {
      const view = d && questionView(d.data, body.token);
      if (!view) return { reject: json({ error: 'closed' }, 404) };
      if (!view.open) return { reject: json({ error: 'closed' }, 409) };

      // نفحص هنا من جديد: ما يجي من الشبكة لا يُوثق به مهما فحصه المتصفح
      const { ok, errors } = validateAnswer(view, body);
      if (!ok) return { reject: json({ error: 'invalid', errors }, 400) };

      const { blocked, recent } = answersRateLimited(d.answerLog, now);
      if (blocked) return { reject: json({ error: 'too_many' }, 429) };

      const q = d.data.questions.find((x) => x.id === view.id);
      const aid = crypto.randomUUID();
      const next = applyAnswer(d.data, q, body, { id: aid, now });
      return {
        doc: { ...d, rev: d.rev + 1, updatedAt: new Date(now).toISOString(), data: next.data,
          answerLog: [...recent, { at: now }] },
        out: {
          student: next.student,
          row: { at: now, id: aid, questionId: q.id, question: String(q.text || ''),
            student: next.student, text: String(body.text || '').trim(),
            optionId: String(body.optionId || '') },
        },
      };
    }, doc);
    if (r.reject) return r.reject;
    if (r.busy) return json({ error: 'busy' }, 503);
    // وفي الدفتر كذلك: جوابُ الولد ما يعيش في السؤال وحده
    if (r.out?.row) await ledWrite('ans', r.out.row.id, r.out.row);
    return json({ ok: true, student: r.out.student });
  }

  if (op === 'signup_submit') {
    const now = Date.now();
    /**
     * الإيصال يُخزَّن خارج البيانات، مثل صور البرامج تمامًا.
     *
     * كان ينزل داخل الملف المشترك، فأربعون إيصالًا تجعله اثني عشر ميغا —
     * ويُرفع مع كل حفظةٍ ويُنزَّل مع كل مزامنة، حتى يقف الحفظ عند حدّ الخادم.
     * والمعرّف من محتواه، فالصورة الواحدة ما تُخزَّن مرتين.
     */
    let slip = null;
    if (isReceipt(body.receipt)) {
      const raw = String(body.receipt.data || '');
      const id = crypto.createHash('sha256').update(raw).digest('base64url').slice(0, 32);
      try {
        await store().set(IMG_PREFIX + id, raw);
        slip = { id, name: String(body.receipt.name || '').slice(0, 120), type: String(body.receipt.type || '') };
      } catch { slip = null; }
    }
    const lean = slip ? { ...body, receipt: { ref: slip.id, name: slip.name, type: slip.type } } : body;

    const r = await commit((d) => {
      const program = d && programFor(d.data, lean.token);
      if (!program) return { reject: json({ error: 'closed' }, 404) };

      const view = publicView(d.data, program);
      if (view.blocked) return { reject: json({ error: 'blocked' }, 409) };
      // أيامٌ لم تُعرض على ولي الأمر لا تُؤخذ منه: نكتبها نحن ونطرح ما أُرسل
      const sub = normalizeSubmission(view, lean);
      // نتحقق هنا من جديد: ما يجي من الشبكة لا يُوثق به مهما فحصه المتصفح
      const { ok, errors } = validateSubmission(view, sub);
      if (!ok) return { reject: json({ error: 'invalid', errors }, 400) };

      const { blocked, recent } = rateLimited(d.signupLog, lean.answers?.gPhone, now);
      if (blocked) return { reject: json({ error: 'too_many' }, 429) };

      const next = applySubmission(d.data, program, view, sub, { newId: () => crypto.randomUUID(), now });
      return {
        doc: { ...d, rev: d.rev + 1, updatedAt: new Date(now).toISOString(),
          data: enforceOnePerPhone(next.data),
          signupLog: [...recent, { at: now, phone: String(lean.answers?.gPhone || '') }] },
        // الرقم صار مختومًا على التسجيل نفسه، فما يعود يُشتقّ من رقم النسخة:
        // ذاك كان يقفز مع كل تعديل ولا يبقى عند أحد، فما ينفع مرجعًا لإيصال
        out: { ok: true, count: next.count, ref: next.refs.join(' · '), rows: next.rows || [] },
      };
    }, doc);
    if (r.reject) return r.reject;
    // ما نقول «تم» إلا وقد ثبت: الإيصال بيد ولي الأمر، فلا يخرج على فراغ
    if (r.busy) return json({ error: 'busy' }, 503);
    /**
     * وفي الدفتر يُكتب بعد ثبوته — كاملًا كما وصل.
     * بعده لا قبله: لا نكتب في الدفتر ما لم يثبت في البيانات.
     */
    const program = programFor(r.doc.data, lean.token);
    for (const row of r.out.rows || []) {
      await ledWrite('sub', row.id, {
        at: now, id: row.id, ref: row.ref, name: row.name, studentId: row.studentId,
        guardian: String(lean.answers?.gName || ''), phone: String(lean.answers?.gPhone || ''),
        amount: Number(row.amount || 0), accountId: row.accountId || '',
        packageName: row.packageName || '', weekId: row.weekId || '',
        programId: program?.id || '', programName: program?.name || '',
        receipt: slip ? { ref: slip.id, name: slip.name, type: slip.type } : null,
        answers: row.answers || null,
      });
    }
    return json({ ok: true, count: r.out.count, ref: r.out.ref });
  }

  // أول مدير: يُسمح فيه مرة وحدة بس، وبعدها يُقفل الباب.
  if (op === 'init') {
    if (initialized) return json({ error: 'already_initialized' }, 409);
    const u = body.user || {};
    if (!u.username || !u.password) return json({ error: 'missing_credentials' }, 400);
    const secret = crypto.randomBytes(32).toString('base64');
    const data = { ...(body.data || {}), users: [{ ...u, password: hash(u.password) }] };
    // حتى هنا نتحقق: مديران يُنشآن معًا، والثاني يمحو الأول ويأخذ المخزن
    const r = await commit((d) => (d?.data?.users?.length
      ? { reject: json({ error: 'already_initialized' }, 409) }
      : { doc: { rev: 1, updatedAt: new Date().toISOString(), secret, data } }), doc);
    if (r.reject) return r.reject;
    if (r.busy) return json({ error: 'busy' }, 503);
    return json({ ok: true, rev: 1, token: makeToken(secret, u), data: strip(data, u) });
  }

  if (op === 'login') {
    if (!initialized) return json({ error: 'not_initialized' }, 409);
    const entered = String(body.username || '').trim().toLowerCase();
    const now = Date.now();

    /**
     * العدّ قبل الفحص: من صُدّ ما نقول له «الاسم غلط» أو «الكلمة غلط» — كلاهما
     * خبرٌ يفيد المخمِّن. ونعدّ الفاشلة وحدها، والناجحة تمحو أثر صاحبها.
     */
    /**
     * ومن أين جاء.
     *
     * بصمةٌ مخلوطةٌ بسرّ المخزن كبصمة الزائر — لا نحفظ عنوانًا ولا شيئًا
     * يعرّف أحدًا. ووظيفتُها واحدة: أن يُقفل الرشُّ على راشِّه وحده، لا على
     * الفريق كله.
     */
    const from = visitorPrint(req, doc.secret, dayKey(now));
    const gate = loginBlocked(doc.loginLog, entered, now, from);
    if (gate.blocked) return json({ error: 'too_many', retryIn: gate.retryIn }, 429);

    const u = (doc.data.users || []).find((x) => (x.username || '').toLowerCase() === entered);
    const pass = u ? verify(u.password, String(body.password ?? '')) : { ok: false, upgraded: null };
    if (!u || !pass.ok) {
      // سجلُّ المحاولات ما هو من البيانات، فما يرفع رقم النسخة ولا يزاحم حفظًا
      await commit((d) => ({ doc: { ...d, loginLog: noteFail(loginBlocked(d.loginLog, entered, now, from).recent, entered, now, from) } }), doc);
      return json({ error: 'bad_credentials' }, 401);
    }
    if (u.status === 'غير نشط') return json({ error: 'inactive' }, 403);

    // كلمةٌ قديمة صريحة: تُعمّى في أول دخولٍ بها، بلا أن يشعر صاحبها
    const r = await commit((d) => {
      const cleared = clearFails(loginBlocked(d.loginLog, entered, now, from).recent, entered);
      if (!pass.upgraded && cleared.length === (d.loginLog || []).length) return null;
      const data = pass.upgraded
        ? { ...d.data, users: d.data.users.map((x) => (x.id === u.id ? { ...x, password: pass.upgraded } : x)) }
        : d.data;
      return { doc: { ...d, data, loginLog: cleared } };
    }, doc);
    const fresh = r.doc || doc;
    return json({ ok: true, rev: fresh.rev, token: makeToken(fresh.secret, (fresh.data.users || []).find((x) => x.id === u.id) || u),
      data: strip(fresh.data, u), visits: await visitsFor(fresh) });
  }

  // ما بعدها يحتاج توكن سليم.
  const me = userFromToken(doc, body.token);
  if (!me) return json({ error: 'unauthorized' }, 401);

  /* ----------------------------- النسخ الاحتياطي ----------------------------- */
  // المدير وحده: النسخة فيها كل شي، وإرجاعها يستبدل كل شي
  if (op === 'backup_now' || op === 'backup_info' || op === 'snapshot_restore') {
    if (!isAdmin(me)) return json({ error: 'forbidden' }, 403);

    if (op === 'backup_info') return json({ ok: true, status: await backupStatus(store()) });

    if (op === 'backup_now') {
      const r = await runBackup(store());
      return r.ok ? json({ ok: true, status: r }) : json({ error: r.error || 'failed' }, 500);
    }

    // الاسترجاع يكتب اللقطة كنسخة جديدة، فيبقى تاريخ المراجعات متصلًا
    const data = await readSnapshot(store(), body.stamp);
    if (!data) return json({ error: 'not_found' }, 404);
    /**
     * استرجاع المفقودين وحدهم.
     *
     * الاسترجاع الكامل يمحو شغل اليوم كلَّه ليُرجع سجلًّا ضاع — ثمنٌ لا يُدفع.
     * فنقارن اللقطة بالحاضر ونُرجع ما اختفى بلا أثر حذف، ولا نمسّ سواه.
     * `check` يُري صاحبه ما سيرجع قبل أن يقرّر.
     */
    if (body.only === 'missing') {
      const found = repair(doc.data, data);
      if (body.check) return json({ ok: true, back: found.back });
      if (!found.back.length) return json({ ok: true, back: [], rev: doc.rev });
      const rr = await commit((d) => ({
        doc: { ...d, rev: d.rev + 1, updatedAt: new Date().toISOString(), data: repair(d.data, data).data },
        out: { back: found.back },
      }), doc);
      if (rr.busy) return json({ error: 'busy' }, 503);
      return json({ ok: true, back: found.back, rev: rr.doc.rev, data: strip(rr.doc.data, me) });
    }
    /**
     * والاسترجاع الكامل: يُرى قبل أن يقع، وله رجعة بعد أن وقع.
     *
     * `check` يعدّ ما سيمضي — لا يقول «كل ما بعدها ينمسح» وحدها، بل يقول كم
     * ومن أيّ نوع. فالرقم يوقف اليدَ حيث لا توقفها العبارة.
     */
    const lost = repair(data, doc.data).back;
    if (body.check) return json({ ok: true, lost, stamp: body.stamp });

    // وحالُك تُكتب قبله، فيصير للفعل الذي لا رجعة له رجعة
    await writeUndo(store(), doc.data);
    const r = await commit((d) => ({
      doc: {
        rev: d.rev + 1, updatedAt: new Date().toISOString(), secret: d.secret, data,
        // سجلّاتُ الخادم ليست من البيانات، فلا يمحوها استرجاعُ بيانات
        signupLog: d.signupLog || [], loginLog: d.loginLog || [], answerLog: d.answerLog || [],
        wlog: d.wlog || [],
      },
    }), doc);
    if (r.busy) return json({ error: 'busy' }, 503);
    return json({ ok: true, rev: r.doc.rev, data: strip(data, me), undo: true, lost });
  }

  /**
   * سجلّ من سجّل — للمدير وحده.
   *
   * وُضع لمنع الإغراق: جوالٌ وساعة، لا اسم ولا مبلغ. لكنه يعيش خارج البيانات
   * المشتركة، فلا تطاله حفظةٌ عمياء تمحو ما في `data`. فهو آخر ما يبقى حين
   * يضيع التسجيل نفسه — أرقامٌ تتصل بها فتعرف من سجّل.
   *
   * وهو ساعةٌ واحدة لا أكثر: يُقلَّم عند كل تسجيلٍ جديد إلى ما مضى في ساعة.
   */
  if (op === 'signup_log') {
    if (!isAdmin(me)) return json({ error: 'forbidden' }, 403);
    const rows = (doc.signupLog || [])
      .filter((e) => e?.phone)
      .map((e) => ({ at: e.at || 0, phone: String(e.phone) }))
      .sort((a, b) => b.at - a.at);
    return json({ ok: true, rows });
  }

  /**
   * فتحُ الرابط وإقفاله وتجديد رمزه — الباب الوحيد.
   *
   * حُصّنت في `guard` من كل حفظ، فلا تتغيّر إلا من هنا: ضغطةٌ مقصودة من صاحبها.
   * ومعها يُكتب من فعلها ومتى، فيُعرف لماذا أُقفل الرابط — بدل أن يُحار فيه
   * ساعتان كما حِرنا.
   */
  if (op === 'link_set') {
    const may = isAdmin(me) || (allowed(me, 'المصروفات والتقارير') && allowed(me, 'أولياء الأمور'));
    if (!may) return json({ error: 'forbidden' }, 403);
    const now = Date.now();
    const by = me.name || me.username || '';
    const r = await commit((d) => {
      let data = d.data;
      if (body.programId) {
        const p = (data.programs || []).find((x) => x.id === body.programId);
        if (!p?.signup) return { reject: json({ error: 'not_found' }, 404) };
        const s = { ...p.signup };
        if (body.newToken) s.token = makeSignupToken();
        if (body.enabled !== undefined) {
          s.enabled = Boolean(body.enabled);
          s.switched = { at: now, by, on: s.enabled };
        }
        data = { ...data, programs: data.programs.map((x) => (x.id !== p.id ? x : { ...x, signup: s })) };
      }
      if (body.questionId) {
        const q = (data.questions || []).find((x) => x.id === body.questionId);
        if (!q) return { reject: json({ error: 'not_found' }, 404) };
        const nq = { ...q };
        if (body.newToken) nq.token = makeSignupToken();
        if (body.open !== undefined) {
          nq.open = Boolean(body.open);
          nq.switched = { at: now, by, on: nq.open };
        }
        /**
         * والمؤقّت من هنا كذلك: هو إقفالٌ مؤجَّل، فيمرّ بباب الإقفال.
         * و`0` يشيله فيبقى مفتوحًا حتى تقفله بيدك.
         */
        if (body.closesAt !== undefined) {
          nq.closesAt = Math.max(0, Number(body.closesAt) || 0);
          nq.switched = { at: now, by, on: nq.open !== false };
        }
        data = { ...data, questions: data.questions.map((x) => (x.id !== q.id ? x : nq)) };
      }
      if (body.publicProgramId !== undefined) {
        data = { ...data, publicLink: { programId: String(body.publicProgramId || '') } };
      }
      // ووجهةُ رابط السؤال الثابت: عنوانٌ واحد منشور، والسؤال تحته يتبدّل
      if (body.publicQuestionId !== undefined) {
        data = { ...data, questionLink: { questionId: String(body.publicQuestionId || '') } };
      }
      if (data === d.data) return { reject: json({ error: 'nothing' }, 400) };
      return { doc: { ...d, rev: d.rev + 1, updatedAt: new Date(now).toISOString(), data } };
    }, doc);
    if (r.reject) return r.reject;
    if (r.busy) return json({ error: 'busy' }, 503);
    return json({ ok: true, rev: r.doc.rev, data: strip(r.doc.data, me) });
  }

  /**
   * إخراج الأجهزة.
   *
   * جوالٌ ضاع، أو جهازٌ تُرك مفتوحًا عند من ترك الفريق: يُرفع عصرُه فتموت
   * توكناتُه كلها في لحظة، ويُطلب منه الدخول من جديد.
   *
   * وكلٌّ يُخرج أجهزتَه، والمديرُ يُخرج أجهزة غيره — فمن نسي جهازَه في مكانٍ
   * ما يُعقل أن ينتظر المدير ليُخرجه.
   */
  if (op === 'sessions_revoke') {
    const who = String(body.userId || me.id);
    if (who !== me.id && !allowed(me, 'المستخدمون والصلاحيات')) return json({ error: 'forbidden' }, 403);
    const r = await commit((d) => {
      const u = (d.data?.users || []).find((x) => x.id === who);
      if (!u) return { reject: json({ error: 'not_found' }, 404) };
      const data = { ...d.data, users: d.data.users.map((x) => (x.id !== who ? x : { ...x, tokenEpoch: Number(x.tokenEpoch || 0) + 1 })) };
      return { doc: { ...d, rev: d.rev + 1, updatedAt: new Date().toISOString(), data } };
    }, doc);
    if (r.reject) return r.reject;
    if (r.busy) return json({ error: 'busy' }, 503);
    // ومن أخرج أجهزتَه أخرج هذا معها، فيُعطى توكنًا جديدًا بدل أن يُطرد وهو الفاعل
    const u = (r.doc.data.users || []).find((x) => x.id === who);
    const mine = who === me.id ? { token: makeToken(r.doc.secret, u) } : {};
    return json({ ok: true, rev: r.doc.rev, data: strip(r.doc.data, me), ...mine });
  }

  /**
   * إفراغ الصندوق — بابٌ مقصود.
   *
   * الصندوق صار لا يُمحى بحفظة، ولو تركناه هكذا وحده لصار «أفرغ الصندوق»
   * زرًّا لا يفعل شيئًا: الحفظةُ تُرسل قائمةً فاضية، والخادم يُعيدها ملأى.
   *
   * فأُفرد له بابٌ كما أُفرد للروابط: ما يخرج من الصندوق لا يخرج إلا بفعلٍ
   * يقول «قصدتُ هذا»، ولا يخرج بحفظةٍ عابرة من جهازٍ متأخّر.
   */
  if (op === 'trash_drop') {
    if (!allowed(me, 'المستخدمون والصلاحيات')) return json({ error: 'forbidden' }, 403);
    const ids = new Set((Array.isArray(body.ids) ? body.ids : []).map(String));
    if (!ids.size && body.all !== true) return json({ error: 'nothing' }, 400);
    const r = await commit((d) => {
      const kept = body.all === true ? [] : (d.data?.trash || []).filter((t) => !ids.has(String(t?.id)));
      if (kept.length === (d.data?.trash || []).length) return { reject: json({ error: 'nothing' }, 400) };
      return { doc: { ...d, rev: d.rev + 1, updatedAt: new Date().toISOString(), data: { ...d.data, trash: kept } } };
    }, doc);
    if (r.reject) return r.reject;
    if (r.busy) return json({ error: 'busy' }, 503);
    return json({ ok: true, rev: r.doc.rev, data: strip(r.doc.data, me) });
  }

  /**
   * دفتر المال: قراءةٌ ومطابقةٌ وتأسيس.
   *
   * `read` يعرض آخر ما كُتب فيه. و`match` يقابله بالبيانات فيقول ما ضاع —
   * حركةٌ مكتوبةٌ في الدفتر ولا أثر لها في التطبيق ولا في صندوق المحذوفات.
   * و`seed` يكتب فيه كلَّ ما في البيانات اليوم: يُستعمل مرةً واحدة أولَ ما
   * يُشغَّل الدفتر، فما قبله من حركاتٍ ما كان لها بابٌ يومَ وقعت.
   *
   * والمال لا يُقرأ إلا للمدير: الأرقام والحسابات سرٌّ لا يُفتح لمن أُعطي
   * «أولياء الأمور» وحدها.
   */
  if (op === 'money') {
    if (!isAdmin(me)) return json({ error: 'forbidden' }, 403);

    /**
     * التأسيس على دفعات.
     *
     * موسمٌ كامل فيه مئاتُ الحركات، وكتابتُها كلها في نداءٍ واحد تبلغ حدَّ
     * الوقت فيقف الزرّ. فيأخذ كلُّ نداءٍ قدرًا ويردّ موضعَ ما بعده، والتطبيق
     * يواصل حتى ينتهي.
     */
    const rows = moneyRows(doc?.data || {});
    if (body.mode === 'seed') {
      const from = Math.max(0, Number(body.from || 0));
      const take = rows.slice(from, from + SEED_MAX);
      const at = Date.now();
      for (let i = 0; i < take.length; i += LED_STEP) {
        await Promise.all(take.slice(i, i + LED_STEP)
          .map((r) => ledWrite('mal', r.key, { ...r, at: Number(r.at || 0) || at, wroteAt: at, by: me?.name || '' })));
      }
      const next = from + take.length;
      return json({ ok: true, wrote: take.length, done: next, rows: rows.length, more: next < rows.length, next });
    }

    // المطابقة تبحث عن غائب فتحتاج مدًى أوسع؛ والعرض يكفيه آخرُ ما وصل
    const match = body.mode === 'match';
    const led = await ledRead('mal', match ? 3000 : 200);
    if (!match) return json({ ok: true, rows: led.rows, total: led.total, more: led.more });

    // ومن حذفتَه بيدك لا يُعدّ ضائعًا: سجلُّ حذفه هو الفرق بين القرار والعطب
    const dropped = deepIds(doc?.data?.trash || []);
    const missing = moneyMissing(led.rows, doc?.data || {}, dropped);
    return json({ ok: true, missing, sum: moneySum(missing), total: led.total, more: led.more });
  }

  /**
   * الدفتر: قراءةٌ ومطابقة.
   *
   * `read` يعرض ما فيه. و`match` يقارنه بالبيانات ويُرجع من نقص — بتفاصيله
   * كما وصلت: مبلغه وباقته وحسابه وإيصاله. وهو الفرق بين هذا وبين «أرجع
   * المسجّلين»: ذاك يبني من قاعدة الطلاب فيفقد المال، وهذا يبني من الدفتر
   * فيرجع كما كان.
   */
  if (op === 'ledger') {
    if (!isAdmin(me)) return json({ error: 'forbidden' }, 403);
    const kind = body.kind === 'ans' ? 'ans' : 'sub';
    const match = body.mode === 'match' && kind === 'sub';
    // المطابقة تبحث عن غائب فتحتاج مدًى أوسع؛ والعرض يكفيه آخرُ ما وصل
    const led = await ledRead(kind, match ? 3000 : 200);
    const rows = led.rows;
    if (!match) return json({ ok: true, rows, total: led.total, more: led.more });

    const here = new Set();
    for (const p of doc.data?.programs || []) {
      for (const x of p.participants || []) if (x?.id) here.add(x.id);
      for (const w of p.weeks || []) for (const x of w.participants || []) if (x?.id) here.add(x.id);
    }
    /**
     * ومن حذفتَه بيدك لا يعود.
     *
     * الدفتر يحفظ ما وصل، لا ما قبِلتَه. فمن ضغطتَ عليه «ما وصل» — عابثٌ أو
     * تسجيلٌ مكذوب — يبقى في الدفتر ولا يجوز أن تُرجعه المطابقة عليك. وسجلُّ
     * حذفه في الصندوق هو الفرق بين ما ضاع وما رفضتَه.
     */
    const dropped = deepIds(doc.data?.trash || []);
    const missing = rows.filter((r) => r?.id && !here.has(r.id) && !dropped.has(r.id));
    if (body.check || !missing.length) return json({ ok: true, missing, total: led.total });

    const put = await commit((d) => {
      const byProg = new Map();
      for (const m of missing) {
        const k = m.programId || '';
        byProg.set(k, [...(byProg.get(k) || []), m]);
      }
      const row = (m) => ({ id: m.id, ref: m.ref, name: m.name, studentId: m.studentId,
        amount: Number(m.amount || 0), accountId: m.accountId || '', attendance: 'معلق',
        source: 'link', submittedAt: m.at,
        ...(m.packageName ? { packageName: m.packageName } : {}),
        ...(m.receipt ? { receipt: m.receipt } : {}),
        ...(m.answers ? { answers: m.answers } : {}) });
      return {
        doc: { ...d, rev: d.rev + 1, updatedAt: new Date().toISOString(),
          data: { ...d.data, programs: (d.data.programs || []).map((p) => {
            const mine = byProg.get(p.id) || [];
            if (!mine.length) return p;
            const inProg = mine.filter((m) => !m.weekId);
            return {
              ...p,
              participants: [...(p.participants || []), ...inProg.map(row)],
              weeks: (p.weeks || []).map((w) => {
                const forWeek = mine.filter((m) => m.weekId === w.id);
                return forWeek.length ? { ...w, mode: 'named',
                  participants: [...(w.participants || []), ...forWeek.map(row)] } : w;
              }),
            };
          }) } },
      };
    }, doc);
    if (put.busy) return json({ error: 'busy' }, 503);
    return json({ ok: true, missing, rev: put.doc.rev, data: strip(put.doc.data, me) });
  }

  // رفع صورة برنامج: ترجع معرّفًا، وهو وحده اللي ينحفظ في البيانات
  if (op === 'img_put') {
    if (!allowed(me, 'البرامج') && !allowed(me, 'الإعداد (المسابقات)')) return json({ error: 'forbidden' }, 403);
    const raw = String(body.data || '');
    if (raw.length > IMG_CAP || !parseDataUrl(raw)) return json({ error: 'bad_image' }, 400);
    // المعرّف من المحتوى: نفس الصورة ما تتخزّن مرتين، والعنوان يبقى صالحًا للتخزين
    const id = crypto.createHash('sha256').update(raw).digest('base64url').slice(0, 32);
    await store().set(IMG_PREFIX + id, raw);
    return json({ ok: true, id });
  }

  /**
   * قرعة سؤال اليوم.
   *
   * تُسحب هنا لا في الجوال: لو سُحبت هناك، قدر صاحبها يعيدها ما شاء ولا يحفظ
   * إلا التي أعجبته — وهذي قرعةٌ أمام الأولاد، فلا تحتمل ذلك. وهنا تُحسب
   * وتُكتب في نداءٍ واحد، فأول ضغطةٍ هي القرعة.
   */
  /**
   * القرعة — على سؤالٍ أو على ما اخترتَ.
   *
   * `questionIds` قائمةٌ يجمع كيسُها: واحدةً كانت أو الأسئلةَ كلَّها أو ما
   * انتقيتَ منها. و`questionId` وحده يبقى مقبولًا فما ينكسر ما كان.
   */
  if (op === 'question_draw') {
    if (!allowed(me, 'النادي')) return json({ error: 'forbidden' }, 403);
    const wanted = Array.isArray(body.questionIds) && body.questionIds.length
      ? body.questionIds.map(String)
      : [String(body.questionId || '')];
    const r = await commit((d) => {
      const all = d.data?.questions || [];
      const qs = wanted.map((id) => all.find((x) => x.id === id)).filter(Boolean);
      if (!qs.length) return { reject: json({ error: 'not_found' }, 404) };
      const draw = makeDrawMany(qs, body.opts || {}, {
        id: crypto.randomUUID(),
        by: me.name || me.username || '',
        // عشوائية الخادم لا `Math.random`: القرعة يُحتجّ بها على الناس
        rand: () => crypto.randomInt(0, 2 ** 30) / 2 ** 30,
      });
      if (!draw) return { reject: json({ error: 'empty' }, 409) };
      const data = applyDrawMany(d.data, qs.map((q) => q.id), draw);
      return { doc: { ...d, rev: d.rev + 1, updatedAt: new Date().toISOString(), data }, out: { draw, data } };
    }, doc);
    if (r.reject) return r.reject;
    if (r.busy) return json({ error: 'busy' }, 503);
    return json({ ok: true, draw: r.out.draw, rev: r.doc.rev, data: strip(r.out.data, me) });
  }

  // سحب التحديثات: لو ما تغيّر شي نرجّع ردًّا خفيفًا بدل البيانات كاملة.
  if (op === 'pull') {
    // العدّاد يمشي بلا رفع رقم النسخة، فيُرسل حتى مع «ما تغيّر شيء»
    const visits = await visitsFor(doc);
    if (Number(body.sinceRev) === doc.rev) return json({ ok: true, rev: doc.rev, unchanged: true, visits });
    return json({ ok: true, rev: doc.rev, data: strip(doc.data, me), visits });
  }

  /**
   * نقل الإيصالات القديمة إلى مخزن الصور — مرةً واحدة، بلا أن يعمل صاحبه شيئًا.
   *
   * ما نزل قبل اليوم نزل صورةً كاملة داخل البيانات، والصفُّ الواحد يتكرّر في
   * كل جمعةٍ من جمع الاشتراك — فثلاثة إيصالاتٍ صارت تسعَ نسخٍ من ربع ميغا.
   * فنُخرجها عند أول حفظةٍ تمرّ، ولا يبقى منها إلا معرّفها.
   */
  const liftSlips = async (data) => {
    let moved = 0;
    const lift = async (x) => {
      const r = x?.receipt;
      if (!r || typeof r.data !== 'string' || !r.data.startsWith('data:')) return x;
      const id = crypto.createHash('sha256').update(r.data).digest('base64url').slice(0, 32);
      try { await store().set(IMG_PREFIX + id, r.data); } catch { return x; }
      moved += 1;
      return { ...x, receipt: { ref: id, name: String(r.name || ''), type: String(r.type || '') } };
    };
    const rows = async (list) => (Array.isArray(list) ? Promise.all(list.map(lift)) : list);
    const programs = await Promise.all((data?.programs || []).map(async (p) => ({
      ...p,
      participants: await rows(p.participants),
      weeks: await Promise.all((p.weeks || []).map(async (w) => ({ ...w, participants: await rows(w.participants) }))),
    })));
    return moved ? { ...data, programs } : data;
  };

  // حفظ: لازم يكون البانٍ على آخر نسخة، وإلا نرجّع 409 ومعه الحالي عشان الدمج.
  if (op === 'push') {
    // النقل قبل الحارس: يُقرأ الوارد مرةً واحدة ويُخفَّف قبل أن يُحفظ
    const lifted = await liftSlips(body.data);
    if (lifted !== body.data) body = { ...body, data: lifted };
    const r = await commit((d) => {
      // يُعاد الفحص في كل محاولة: لو سبقنا غيرُنا صار البانٍ قديمًا، وردُّ
      // ٤٠٩ أصدق من كتابةٍ تمحوه — الجهاز يدمج ثم يعيد
      if (Number(body.baseRev) !== d.rev) {
        return { reject: json({ error: 'conflict', rev: d.rev, data: strip(d.data, me) }, 409) };
      }
      const safe = guard(body.data, d.data, me);
      // استرجاعُ نسخةٍ كاملة يستبدل كل شيء بأمر صاحبه، فما يمرّ على الحارس
      const fixed = body.replace === true && isAdmin(me) ? { data: safe, back: [] } : repair(safe, d.data);
      const data = enforceOnePerPhone(fixed.data);
      // ننشر الوثيقة كما هي ثم نستبدل ما تغيّر: أي سجلٍّ نضيفه لاحقًا يبقى
      return { doc: { ...d, rev: d.rev + 1, updatedAt: new Date().toISOString(), data }, out: { back: fixed.back, was: d.data } };
    }, doc);
    if (r.reject) return r.reject;
    if (r.busy) return json({ error: 'busy' }, 503);
    // المال يُكتب بعد أن يستقرّ الحفظ: ما جدّ أو تبدّل يصير سطرًا لا يُمحى
    await moneyLog(r.out?.was, r.doc.data, me?.name || '');
    /**
     * ومن بدّل كلمته بيده يُعطى توكنًا جديدًا.
     *
     * تبديلُ الكلمة يُخرج الأجهزة كلها، وجهازُه منها — فلولا هذا لطُرد وهو
     * الفاعل، ونصفُ حفظته على الشاشة. الأجهزة الأخرى تموت، وهو يكمل.
     */
    const now = (r.doc.data.users || []).find((x) => x.id === me.id);
    const moved = now && epochOf(now) !== epochOf((r.out?.was?.users || []).find((x) => x.id === me.id));
    return json({
      ok: true, rev: r.doc.rev, visits: await visitsFor(r.doc), back: r.out?.back || [],
      ...(moved ? { token: makeToken(r.doc.secret, now) } : {}),
    });
  }

  return json({ error: 'unknown_op' }, 400);
};

// المسار /api/state يجي من التحويل في netlify.toml — ما نحدّد مسارًا مخصصًا هنا،
// لأنه يلغي المسار الافتراضي اللي يشير له التحويل.
