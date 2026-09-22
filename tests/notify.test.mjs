/**
 * إشعار الجوّال.
 *
 * وأثقلُ ما يُحرس هنا قيدُ آبل: من فتح التطبيق في سفاري على آيفون لا يُعرض
 * عليه زرُّ تفعيلٍ لا ينفع — بل تُقال له الخطوات. فوعدٌ لا نملكه أسوأ من
 * صمت.
 */
import assert from 'node:assert/strict';
import { pushStatus, PUSH_TEXTS, HOME_STEPS, b64ToBytes, healPush } from '../src/notify.js';
import { noticeTargets } from '../netlify/lib/push.mjs';
import { mustReport } from '../src/taqreer.js';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('  ✓ ' + name); };

test('الآيفون في سفاري: خطواتٌ لا زرّ', () => {
  assert.equal(pushStatus({ supported: true, ios: true, standalone: false, permission: 'default' }), 'needs-home');
  // وحتى لو ما عرف المتصفحُ الإشعارات أصلًا — فآبل تفتحها بعد الإضافة
  assert.equal(pushStatus({ supported: false, ios: true }), 'needs-home');
  assert.equal(PUSH_TEXTS['needs-home'].action, '', 'ما فيه زرٌّ يُضغط');
  assert.ok(HOME_STEPS.length >= 4);
});

test('وبعد ما يضيفه للشاشة يصير الزرّ نافعًا', () => {
  assert.equal(pushStatus({ supported: true, ios: true, standalone: true, permission: 'default' }), 'off');
  assert.equal(PUSH_TEXTS.off.action, 'فعّلها');
});

test('والأندرويد يفعّلها من المتصفح بلا شرط', () => {
  assert.equal(pushStatus({ supported: true, ios: false, standalone: false, permission: 'default' }), 'off');
});

test('ومن فعّلها يُقال له إنها مفعّلة، ومعه إيقافها', () => {
  assert.equal(pushStatus({ supported: true, ios: false, permission: 'granted', subscribed: true }), 'on');
  assert.equal(PUSH_TEXTS.on.action, 'أوقفها');
});

test('ومن منعها لا يُطلب منه ثانيةً — المتصفح لا يسأل مرتين', () => {
  assert.equal(pushStatus({ supported: true, ios: false, permission: 'denied' }), 'blocked');
  assert.equal(PUSH_TEXTS.blocked.action, '');
});

test('ومتصفّحٌ لا يعرفها أصلًا: لا وعدَ ولا زرّ', () => {
  assert.equal(pushStatus({ supported: false, ios: false }), 'unsupported');
  assert.equal(PUSH_TEXTS.unsupported.title, '');
  assert.equal(pushStatus(), 'unsupported');
});

test('مفتاح base64url يُقرأ بايتاتٍ، بحشوه وبحرفيه المبدَّلين', () => {
  assert.equal(b64ToBytes('').length, 0);
  // «-» و«_» هما «+» و«/» في هذا الترميز
  assert.deepEqual([...b64ToBytes('-_8')], [251, 255]);
  assert.deepEqual([...b64ToBytes('QUJD')], [65, 66, 67]);
});

/* ------------------------------ من يصله الإشعار ------------------------------ */

const users = [
  { id: 'a', role: 'مدير', status: 'نشط' },
  { id: 'b', role: 'مشرف برنامج', status: 'نشط' },
  { id: 'c', role: 'مسؤول النادي', status: 'نشط' },
  { id: 'd', role: 'مشرف برنامج', status: 'غير نشط' },
];

test('تنبيهُ الكل يصل الموظفين، لا المديرَ ولا المعطَّل', () => {
  assert.deepEqual(noticeTargets({ id: 'n1', by: 'a', to: '' }, users), ['b', 'c']);
});

test('وتنبيهُ الواحد يصله وحده', () => {
  assert.deepEqual(noticeTargets({ id: 'n1', by: 'a', to: 'c' }, users), ['c']);
});

test('ولا يصل كاتبَه — يكتبه لا ينتظره', () => {
  assert.deepEqual(noticeTargets({ id: 'n1', by: 'b', to: '' }, users), ['c']);
});

/**
 * ومن لا يُطالَب بتقريرٍ يصله التنبيه — وهذي التي أوقعتنا.
 *
 * كانت بطاقةُ التفعيل معلّقةً بشرط **كتابة التقرير**، فمن رُفعت عنه
 * المطالبة اختفت بطاقتُه فما قدر يفعّلها، وهو يصله التنبيه على كل حال.
 * فالقاعدة: من يستقبله يقدر يفعّله. ويُحرس هنا لأنه الطرف المحسوب.
 */
test('ويصل من لا يُطالَب بتقرير — فبطاقةُ التفعيل تُعرض له', () => {
  const team = [
    { id: 'a', role: 'مدير', status: 'نشط' },
    // لا يُطالَب بتقرير، ولا صلاحيةَ أسابيعَ ولا نادٍ — ومع ذلك يصله
    { id: 'z', role: 'مسجل حضور', status: 'نشط', noReport: true, permissions: ['القيمي'] },
  ];
  assert.deepEqual(noticeTargets({ id: 'n1', by: 'a', to: '' }, team), ['z']);
  assert.equal(mustReport(team[1]), false, 'وهو غيرُ مطالَبٍ بتقريره');
});

/* ---------------- إصلاحُ اشتراكٍ ضاع وإذنُه قائم ---------------- */

/**
 * وقعت في الحقيقة: «تحديث» كان يُلغي عاملَ الخدمة، والاشتراكُ يعيش داخله
 * فيموت معه. فيبقى الإذنُ في المتصفّح والاشتراكُ ذاهبًا — وهذي الحالُ
 * التي تُصلَح هنا بلا أن يضغط صاحبُها شيئًا.
 */
const world = ({ permission = 'granted', sub = null, subscribe } = {}) => {
  const sent = [];
  const nav = {
    serviceWorker: {
      register: async () => ({ pushManager: { subscribe: subscribe || (async () => ({ toJSON: () => ({ endpoint: 'e' }) })) } }),
      ready: Promise.resolve({ pushManager: { subscribe: subscribe || (async () => ({ toJSON: () => ({ endpoint: 'e' }) })) } }),
      getRegistration: async () => ({ pushManager: { getSubscription: async () => sub } }),
    },
    maxTouchPoints: 0,
    userAgent: 'Mozilla/5.0 (Linux; Android 13)',
  };
  const had = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: nav });
  globalThis.Notification = { permission };
  globalThis.window = {
    matchMedia: () => ({ matches: false }), navigator: nav,
    PushManager: function PM() {}, Notification: globalThis.Notification,
  };
  globalThis.PushManager = globalThis.window.PushManager;
  return {
    sent,
    done: () => {
      delete globalThis.window; delete globalThis.Notification; delete globalThis.PushManager;
      if (had) Object.defineProperty(globalThis, 'navigator', had); else delete globalThis.navigator;
    },
  };
};

await (async () => {
  {
    const w = world({ permission: 'granted', sub: null });
    const sent = [];
    const got = await healPush({ key: 'BLAH', send: async (s) => sent.push(s) });
    assert.equal(got, true, 'أُعيد الاشتراك');
    assert.equal(sent.length, 1, 'ووصل الخادمَ');
    w.done(); passed++; console.log('  ✓ إذنٌ قائمٌ واشتراكٌ ضائع: يُعاد بصمت');
  }
  {
    const w = world({ permission: 'granted', sub: { endpoint: 'e' } });
    const got = await healPush({ key: 'BLAH', send: async () => {} });
    assert.equal(got, false, 'اشتراكُه قائم، فما فيه ما يُصلَح');
    w.done(); passed++; console.log('  ✓ ومن اشتراكُه قائمٌ لا يُمَسّ');
  }
  {
    const w = world({ permission: 'default', sub: null });
    const sent = [];
    const got = await healPush({ key: 'BLAH', send: async (s) => sent.push(s) });
    assert.equal(got, false);
    assert.equal(sent.length, 0, 'ولا يُسأل من لم يأذن');
    w.done(); passed++; console.log('  ✓ ومن لم يأذن لا يُزعَج');
  }
  {
    const w = world({ permission: 'denied', sub: null });
    const got = await healPush({ key: 'BLAH', send: async () => {} });
    assert.equal(got, false, 'المنعُ قرارُه، ولا يُلتفّ عليه');
    w.done(); passed++; console.log('  ✓ ومن منع يبقى ممنوعًا');
  }
  {
    const w = world({ permission: 'granted', sub: null, subscribe: async () => { throw new Error('no'); } });
    const got = await healPush({ key: 'BLAH', send: async () => {} });
    assert.equal(got, false, 'ويسقط بهدوء لا برمي');
    w.done(); passed++; console.log('  ✓ وإن تعثّر المتصفّح ما انكسرت الشاشة');
  }
})();

console.log(`\n✅ ${passed} اختبارًا لإشعار الجوّال\n`);
