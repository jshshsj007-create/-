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
import { programFor, publicView, validateSubmission, applySubmission, normalizeSubmission, rateLimited, waIntl, isReceipt } from '../../src/signup.js';
import { questionView, validateAnswer, applyAnswer, answersRateLimited, makeDraw, applyDraw } from '../../src/club.js';
import { dedupeByPhone, remapParticipants } from '../../src/people.js';
import { runBackup, backupStatus, readSnapshot } from '../lib/backup.mjs';
import { hash, verify, isHashed } from '../lib/password.mjs';
import { loginBlocked, noteFail, clearFails } from '../../src/login.js';
import { countVisit, dayKey } from '../../src/visits.js';

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

const makeToken = (secret, username) => `${Buffer.from(String(username)).toString('base64url')}.${sign(secret, username)}`;

/** يرجّع المستخدم لو التوكن سليم وحسابه لا يزال نشطًا، وإلا null. */
const userFromToken = (doc, token) => {
  if (!doc?.secret || typeof token !== 'string' || !token.includes('.')) return null;
  const [rawName, mac] = token.split('.');
  let username;
  try {
    username = Buffer.from(rawName, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  const expected = sign(doc.secret, username);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const u = (doc.data?.users || []).find((x) => (x.username || '').toLowerCase() === username.toLowerCase());
  if (!u || u.status === 'غير نشط') return null;
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
  return out;
};

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
    ['competitions', 'مسابقة'], ['trips', 'سفرة'], ['tournaments', 'دوري']]) {
    const r = listBack(out[key], current[key], keep);
    out[key] = r.list; note(kind, r.back);
  }

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
      // كلمةٌ جديدة كتبها المدير: تُعمّى هنا، فما تُكتب صريحةً في المخزن أبدًا
      if (u.password) return isHashed(u.password) ? u : { ...u, password: hash(u.password) };
      // والمتصفح ما عنده الكلمات، فمن رجع بلا كلمةٍ يحتفظ بالقديمة
      const old = (current?.users || []).find((x) => x.id === u.id);
      return old?.password ? { ...u, password: old.password } : u;
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
   * الصندوق: الموظف ما يشوفه (حجبناه في `strip`)، فلو قبلنا قائمته كما هي
   * محا محذوفات المدير كلها بحفظة عادية. لكن حذفه هو يستحق الرجعة مثل غيره،
   * فنقبل منه الإضافة وحدها: ما جاء جديدًا يُضاف، وما كان قائمًا يبقى.
   * والإعدادات تُكتب من شاشة المدير، فتبقى له.
   */
  if (!allowed(me, 'المستخدمون والصلاحيات')) {
    const kept = current?.trash || [];
    const known = new Set(kept.map((t) => t.id));
    out.trash = [...kept, ...(incoming?.trash || []).filter((t) => t?.id && !known.has(t.id))];
    out.settings = current?.settings || {};
  }
  return out;
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
      return json({
        error: 'closed',
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
    if (!view) return json({ error: 'closed' }, 404);
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
    return json({ ok: true, rev: 1, token: makeToken(secret, u.username), data: strip(data, u) });
  }

  if (op === 'login') {
    if (!initialized) return json({ error: 'not_initialized' }, 409);
    const entered = String(body.username || '').trim().toLowerCase();
    const now = Date.now();

    /**
     * العدّ قبل الفحص: من صُدّ ما نقول له «الاسم غلط» أو «الكلمة غلط» — كلاهما
     * خبرٌ يفيد المخمِّن. ونعدّ الفاشلة وحدها، والناجحة تمحو أثر صاحبها.
     */
    const gate = loginBlocked(doc.loginLog, entered, now);
    if (gate.blocked) return json({ error: 'too_many', retryIn: gate.retryIn }, 429);

    const u = (doc.data.users || []).find((x) => (x.username || '').toLowerCase() === entered);
    const pass = u ? verify(u.password, String(body.password ?? '')) : { ok: false, upgraded: null };
    if (!u || !pass.ok) {
      // سجلُّ المحاولات ما هو من البيانات، فما يرفع رقم النسخة ولا يزاحم حفظًا
      await commit((d) => ({ doc: { ...d, loginLog: noteFail(loginBlocked(d.loginLog, entered, now).recent, entered, now) } }), doc);
      return json({ error: 'bad_credentials' }, 401);
    }
    if (u.status === 'غير نشط') return json({ error: 'inactive' }, 403);

    // كلمةٌ قديمة صريحة: تُعمّى في أول دخولٍ بها، بلا أن يشعر صاحبها
    const r = await commit((d) => {
      const cleared = clearFails(loginBlocked(d.loginLog, entered, now).recent, entered);
      if (!pass.upgraded && cleared.length === (d.loginLog || []).length) return null;
      const data = pass.upgraded
        ? { ...d.data, users: d.data.users.map((x) => (x.id === u.id ? { ...x, password: pass.upgraded } : x)) }
        : d.data;
      return { doc: { ...d, data, loginLog: cleared } };
    }, doc);
    const fresh = r.doc || doc;
    return json({ ok: true, rev: fresh.rev, token: makeToken(fresh.secret, u.username),
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
    const r = await commit((d) => ({
      doc: { rev: d.rev + 1, updatedAt: new Date().toISOString(), secret: d.secret, data, signupLog: d.signupLog || [] },
    }), doc);
    if (r.busy) return json({ error: 'busy' }, 503);
    return json({ ok: true, rev: r.doc.rev, data: strip(data, me) });
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
  if (op === 'question_draw') {
    if (!allowed(me, 'النادي')) return json({ error: 'forbidden' }, 403);
    const r = await commit((d) => {
      const q = (d.data?.questions || []).find((x) => x.id === body.questionId);
      if (!q) return { reject: json({ error: 'not_found' }, 404) };
      const draw = makeDraw(q, body.opts || {}, {
        id: crypto.randomUUID(),
        by: me.name || me.username || '',
        // عشوائية الخادم لا `Math.random`: القرعة يُحتجّ بها على الناس
        rand: () => crypto.randomInt(0, 2 ** 30) / 2 ** 30,
      });
      if (!draw) return { reject: json({ error: 'empty' }, 409) };
      const data = applyDraw(d.data, q, draw);
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
      return { doc: { ...d, rev: d.rev + 1, updatedAt: new Date().toISOString(), data }, out: { back: fixed.back } };
    }, doc);
    if (r.reject) return r.reject;
    if (r.busy) return json({ error: 'busy' }, 503);
    // نخبر الجهاز بما أُرجع، فيسحبه ويعرضه لصاحبه — لا يُرجَع في صمت
    return json({ ok: true, rev: r.doc.rev, visits: await visitsFor(r.doc), back: r.out?.back || [] });
  }

  return json({ error: 'unknown_op' }, 400);
};

// المسار /api/state يجي من التحويل في netlify.toml — ما نحدّد مسارًا مخصصًا هنا،
// لأنه يلغي المسار الافتراضي اللي يشير له التحويل.
