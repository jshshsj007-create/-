/** كشف النسخة القديمة: يشتغل لما يلزم، وما يزعج بلا سبب. */
import assert from 'node:assert/strict';
import { runningBuild, publishedBuild, isStale, hardReload } from '../src/freshness.js';

let passed = 0;
const test = async (name, fn) => { await fn(); passed++; console.log('  ✓ ' + name); };

const fakeDoc = (src) => ({ querySelector: () => (src ? { getAttribute: () => src } : null) });

await test('يعرف ملف النسخة الشغّالة من وسم السكربت', () => {
  assert.equal(runningBuild(fakeDoc('/assets/index-DdQaTd_m.js')), 'index-DdQaTd_m.js');
  assert.equal(runningBuild(fakeDoc('./assets/index-abc123.js')), 'index-abc123.js');
  assert.equal(runningBuild(fakeDoc('')), '', 'ما فيه وسم');
  assert.equal(runningBuild(fakeDoc('/assets/main.js')), '', 'اسم ما نعرفه');
});

await test('يقرأ الملف المنشور من صفحة الخادم', async () => {
  const fetchFn = async () => ({ ok: true, text: async () => '<script type="module" src="/assets/index-NEW999.js"></script>' });
  assert.equal(await publishedBuild(fetchFn), 'index-NEW999.js');
});

await test('انقطاع الشبكة ما يوهم بتحديث', async () => {
  assert.equal(await publishedBuild(async () => { throw new Error('offline'); }), '');
  assert.equal(await publishedBuild(async () => ({ ok: false })), '');
  assert.equal(isStale('index-A.js', ''), false, 'الفراغ ما يعني نسخة جديدة');
  assert.equal(isStale('', 'index-B.js'), false);
});

await test('يميّز القديم من الحالي', () => {
  assert.equal(isStale('index-OLD.js', 'index-NEW.js'), true);
  assert.equal(isStale('index-SAME.js', 'index-SAME.js'), false, 'ما يزعج بلا سبب');
});

/* ------------------ التحديث لا يقتل اشتراك الإشعارات ------------------ */

/**
 * هذي أهمُّ اختبارات الملف.
 *
 * كان «تحديث» يُلغي تسجيلَ عامل الخدمة، واشتراكُ الإشعارات يعيش داخله —
 * فيموت معه. فكان القائد يفعّل إشعاراته، ثم تصدر نشرةٌ فيضغط «تحديث»،
 * فتعود البطاقةُ تقول «فعّلها» ولا يصله شيء. بعد كلّ نشرة.
 */
await test('«تحديث» يفرّغ المخزن ولا يُلغي عامل الخدمة', async () => {
  const killed = [];
  const cleared = [];
  globalThis.caches = {
    keys: async () => ['v1', 'v2'],
    delete: async (k) => { cleared.push(k); return true; },
  };
  // `navigator` في Node قراءةٌ فقط، فنضعها بوصفٍ صريح
  const hadNav = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { serviceWorker: { getRegistrations: async () => [{ unregister: async () => { killed.push(1); return true; } }] } },
  });
  let reloaded = 0;
  globalThis.location = { reload: () => { reloaded++; } };

  await hardReload();

  assert.deepEqual(cleared, ['v1', 'v2'], 'المخزن يُفرَّغ — هو الذي يُبقي النسخة القديمة');
  assert.deepEqual(killed, [], 'وعاملُ الخدمة يبقى — وإلا ضاع اشتراك الإشعارات معه');
  assert.equal(reloaded, 1, 'ثم تُعاد الصفحة');
  delete globalThis.caches; delete globalThis.location;
  if (hadNav) Object.defineProperty(globalThis, 'navigator', hadNav);
  else delete globalThis.navigator;
});

await test('وبلا مخزنٍ يُعاد التحميل بلا شكوى', async () => {
  let reloaded = 0;
  globalThis.location = { reload: () => { reloaded++; } };
  await hardReload();
  assert.equal(reloaded, 1);
  delete globalThis.location;
});

console.log(`\n${passed} اختبار نجح.`);
