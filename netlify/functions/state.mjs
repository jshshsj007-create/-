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

const KEY = 'state';
const store = () => getStore({ name: 'faid-team', consistency: 'strong' });

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

/** نسخة صالحة للإرسال للمتصفح: بدون كلمات المرور. */
const strip = (data) => ({
  ...data,
  users: (data?.users || []).map(({ password, ...rest }) => rest),
});

/** المتصفح ما عنده كلمات المرور، فأي مستخدم رجع بدون كلمة مرور يحتفظ بالقديمة. */
const keepPasswords = (incoming, current) => ({
  ...incoming,
  users: (incoming?.users || []).map((u) => {
    if (u.password) return u;
    const old = (current?.users || []).find((x) => x.id === u.id);
    return old?.password ? { ...u, password: old.password } : u;
  }),
});

/* ---------------------------------- المعالج ---------------------------------- */

export default async (req) => {
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

  // أول مدير: يُسمح فيه مرة وحدة بس، وبعدها يُقفل الباب.
  if (op === 'init') {
    if (initialized) return json({ error: 'already_initialized' }, 409);
    const u = body.user || {};
    if (!u.username || !u.password) return json({ error: 'missing_credentials' }, 400);
    const secret = crypto.randomBytes(32).toString('base64');
    const data = { ...(body.data || {}), users: [u] };
    const next = { rev: 1, updatedAt: new Date().toISOString(), secret, data };
    await writeDoc(next);
    return json({ ok: true, rev: 1, token: makeToken(secret, u.username), data: strip(data) });
  }

  if (op === 'login') {
    if (!initialized) return json({ error: 'not_initialized' }, 409);
    const entered = String(body.username || '').trim().toLowerCase();
    const u = (doc.data.users || []).find((x) => (x.username || '').toLowerCase() === entered);
    if (!u || u.password !== body.password) return json({ error: 'bad_credentials' }, 401);
    if (u.status === 'غير نشط') return json({ error: 'inactive' }, 403);
    return json({ ok: true, rev: doc.rev, token: makeToken(doc.secret, u.username), data: strip(doc.data) });
  }

  // ما بعدها يحتاج توكن سليم.
  const me = userFromToken(doc, body.token);
  if (!me) return json({ error: 'unauthorized' }, 401);

  // سحب التحديثات: لو ما تغيّر شي نرجّع ردًّا خفيفًا بدل البيانات كاملة.
  if (op === 'pull') {
    if (Number(body.sinceRev) === doc.rev) return json({ ok: true, rev: doc.rev, unchanged: true });
    return json({ ok: true, rev: doc.rev, data: strip(doc.data) });
  }

  // حفظ: لازم يكون البانٍ على آخر نسخة، وإلا نرجّع 409 ومعه الحالي عشان الدمج.
  if (op === 'push') {
    if (Number(body.baseRev) !== doc.rev) {
      return json({ error: 'conflict', rev: doc.rev, data: strip(doc.data) }, 409);
    }
    const data = keepPasswords(body.data, doc.data);
    const next = { rev: doc.rev + 1, updatedAt: new Date().toISOString(), secret: doc.secret, data };
    await writeDoc(next);
    return json({ ok: true, rev: next.rev });
  }

  return json({ error: 'unknown_op' }, 400);
};

export const config = { path: '/api/state' };
