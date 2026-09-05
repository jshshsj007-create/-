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
import { programFor, publicView, validateSubmission, applySubmission, normalizeSubmission, rateLimited, waIntl } from '../../src/signup.js';
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
      const next = applyAnswer(d.data, q, body, { id: crypto.randomUUID(), now });
      return {
        doc: { ...d, rev: d.rev + 1, updatedAt: new Date(now).toISOString(), data: next.data,
          answerLog: [...recent, { at: now }] },
        out: { ok: true, student: next.student },
      };
    }, doc);
    if (r.reject) return r.reject;
    if (r.busy) return json({ error: 'busy' }, 503);
    return json(r.out);
  }

  if (op === 'signup_submit') {
    const now = Date.now();
    const r = await commit((d) => {
      const program = d && programFor(d.data, body.token);
      if (!program) return { reject: json({ error: 'closed' }, 404) };

      const view = publicView(d.data, program);
      if (view.blocked) return { reject: json({ error: 'blocked' }, 409) };
      // أيامٌ لم تُعرض على ولي الأمر لا تُؤخذ منه: نكتبها نحن ونطرح ما أُرسل
      const sub = normalizeSubmission(view, body);
      // نتحقق هنا من جديد: ما يجي من الشبكة لا يُوثق به مهما فحصه المتصفح
      const { ok, errors } = validateSubmission(view, sub);
      if (!ok) return { reject: json({ error: 'invalid', errors }, 400) };

      const { blocked, recent } = rateLimited(d.signupLog, body.answers?.gPhone, now);
      if (blocked) return { reject: json({ error: 'too_many' }, 429) };

      const next = applySubmission(d.data, program, view, sub, { newId: () => crypto.randomUUID(), now });
      return {
        doc: { ...d, rev: d.rev + 1, updatedAt: new Date(now).toISOString(),
          data: enforceOnePerPhone(next.data),
          signupLog: [...recent, { at: now, phone: String(body.answers?.gPhone || '') }] },
        // الرقم صار مختومًا على التسجيل نفسه، فما يعود يُشتقّ من رقم النسخة:
        // ذاك كان يقفز مع كل تعديل ولا يبقى عند أحد، فما ينفع مرجعًا لإيصال
        out: { ok: true, count: next.count, ref: next.refs.join(' · ') },
      };
    }, doc);
    if (r.reject) return r.reject;
    // ما نقول «تم» إلا وقد ثبت: الإيصال بيد ولي الأمر، فلا يخرج على فراغ
    if (r.busy) return json({ error: 'busy' }, 503);
    return json(r.out);
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
    const r = await commit((d) => ({
      doc: { rev: d.rev + 1, updatedAt: new Date().toISOString(), secret: d.secret, data, signupLog: d.signupLog || [] },
    }), doc);
    if (r.busy) return json({ error: 'busy' }, 503);
    return json({ ok: true, rev: r.doc.rev, data: strip(data, me) });
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

  // حفظ: لازم يكون البانٍ على آخر نسخة، وإلا نرجّع 409 ومعه الحالي عشان الدمج.
  if (op === 'push') {
    const r = await commit((d) => {
      // يُعاد الفحص في كل محاولة: لو سبقنا غيرُنا صار البانٍ قديمًا، وردُّ
      // ٤٠٩ أصدق من كتابةٍ تمحوه — الجهاز يدمج ثم يعيد
      if (Number(body.baseRev) !== d.rev) {
        return { reject: json({ error: 'conflict', rev: d.rev, data: strip(d.data, me) }, 409) };
      }
      const data = enforceOnePerPhone(guard(body.data, d.data, me));
      // ننشر الوثيقة كما هي ثم نستبدل ما تغيّر: أي سجلٍّ نضيفه لاحقًا يبقى
      return { doc: { ...d, rev: d.rev + 1, updatedAt: new Date().toISOString(), data } };
    }, doc);
    if (r.reject) return r.reject;
    if (r.busy) return json({ error: 'busy' }, 503);
    return json({ ok: true, rev: r.doc.rev, visits: await visitsFor(r.doc) });
  }

  return json({ error: 'unknown_op' }, 400);
};

// المسار /api/state يجي من التحويل في netlify.toml — ما نحدّد مسارًا مخصصًا هنا،
// لأنه يلغي المسار الافتراضي اللي يشير له التحويل.
