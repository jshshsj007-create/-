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
import { programByToken, publicView, validateSubmission, applySubmission, rateLimited } from '../../src/signup.js';
import { dedupeByPhone, remapParticipants } from '../../src/people.js';

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

const KEY = 'state';
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

const isAdmin = (u) => u?.role === 'مدير';
const allowed = (u, perm) => isAdmin(u) || (u?.permissions || []).includes(perm);

/**
 * نسخة صالحة للإرسال لهذا المستخدم بالذات: بدون كلمات المرور أبدًا، وبدون
 * بيانات الأهالي لمن ما أُعطي صلاحيتها — جوالات وأعمار وملاحظات صحية لأطفال،
 * ما تنزل جهازًا ما يحتاجها.
 */
const strip = (data, me) => {
  const out = { ...data, users: (data?.users || []).map(({ password, ...rest }) => rest) };
  if (!allowed(me, 'أولياء الأمور')) { out.guardians = []; out.students = []; }
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
      if (u.password) return u;
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
    const program = doc && programByToken(doc.data?.programs, body.token);
    if (!program) return json({ error: 'closed' }, 404);
    return json({ ok: true, view: publicView(doc.data, program) });
  }

  if (op === 'signup_submit') {
    const program = doc && programByToken(doc.data?.programs, body.token);
    if (!program) return json({ error: 'closed' }, 404);

    const view = publicView(doc.data, program);
    if (view.blocked) return json({ error: 'blocked' }, 409);
    // نتحقق هنا من جديد: ما يجي من الشبكة لا يُوثق به مهما فحصه المتصفح
    const { ok, errors } = validateSubmission(view, body);
    if (!ok) return json({ error: 'invalid', errors }, 400);

    const now = Date.now();
    const { blocked, recent } = rateLimited(doc.signupLog, body.answers?.gPhone, now);
    if (blocked) return json({ error: 'too_many' }, 429);

    const next = applySubmission(doc.data, program, view, body, { newId: () => crypto.randomUUID(), now });
    await writeDoc({
      rev: doc.rev + 1,
      updatedAt: new Date(now).toISOString(),
      secret: doc.secret,
      data: enforceOnePerPhone(next.data),
      signupLog: [...recent, { at: now, phone: String(body.answers?.gPhone || '') }],
    });
    return json({ ok: true, count: next.count, ref: String(doc.rev + 1).padStart(4, '0') });
  }

  // أول مدير: يُسمح فيه مرة وحدة بس، وبعدها يُقفل الباب.
  if (op === 'init') {
    if (initialized) return json({ error: 'already_initialized' }, 409);
    const u = body.user || {};
    if (!u.username || !u.password) return json({ error: 'missing_credentials' }, 400);
    const secret = crypto.randomBytes(32).toString('base64');
    const data = { ...(body.data || {}), users: [u] };
    const next = { rev: 1, updatedAt: new Date().toISOString(), secret, data };
    await writeDoc(next);
    return json({ ok: true, rev: 1, token: makeToken(secret, u.username), data: strip(data, u) });
  }

  if (op === 'login') {
    if (!initialized) return json({ error: 'not_initialized' }, 409);
    const entered = String(body.username || '').trim().toLowerCase();
    const u = (doc.data.users || []).find((x) => (x.username || '').toLowerCase() === entered);
    if (!u || u.password !== body.password) return json({ error: 'bad_credentials' }, 401);
    if (u.status === 'غير نشط') return json({ error: 'inactive' }, 403);
    return json({ ok: true, rev: doc.rev, token: makeToken(doc.secret, u.username), data: strip(doc.data, u) });
  }

  // ما بعدها يحتاج توكن سليم.
  const me = userFromToken(doc, body.token);
  if (!me) return json({ error: 'unauthorized' }, 401);

  // رفع صورة برنامج: ترجع معرّفًا، وهو وحده اللي ينحفظ في البيانات
  if (op === 'img_put') {
    if (!allowed(me, 'البرامج')) return json({ error: 'forbidden' }, 403);
    const raw = String(body.data || '');
    if (raw.length > IMG_CAP || !parseDataUrl(raw)) return json({ error: 'bad_image' }, 400);
    // المعرّف من المحتوى: نفس الصورة ما تتخزّن مرتين، والعنوان يبقى صالحًا للتخزين
    const id = crypto.createHash('sha256').update(raw).digest('base64url').slice(0, 32);
    await store().set(IMG_PREFIX + id, raw);
    return json({ ok: true, id });
  }

  // سحب التحديثات: لو ما تغيّر شي نرجّع ردًّا خفيفًا بدل البيانات كاملة.
  if (op === 'pull') {
    if (Number(body.sinceRev) === doc.rev) return json({ ok: true, rev: doc.rev, unchanged: true });
    return json({ ok: true, rev: doc.rev, data: strip(doc.data, me) });
  }

  // حفظ: لازم يكون البانٍ على آخر نسخة، وإلا نرجّع 409 ومعه الحالي عشان الدمج.
  if (op === 'push') {
    if (Number(body.baseRev) !== doc.rev) {
      return json({ error: 'conflict', rev: doc.rev, data: strip(doc.data, me) }, 409);
    }
    const data = enforceOnePerPhone(guard(body.data, doc.data, me));
    const next = { rev: doc.rev + 1, updatedAt: new Date().toISOString(), secret: doc.secret, data, signupLog: doc.signupLog || [] };
    await writeDoc(next);
    return json({ ok: true, rev: next.rev });
  }

  return json({ error: 'unknown_op' }, 400);
};

// المسار /api/state يجي من التحويل في netlify.toml — ما نحدّد مسارًا مخصصًا هنا،
// لأنه يلغي المسار الافتراضي اللي يشير له التحويل.
