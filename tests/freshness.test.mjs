/** كشف النسخة القديمة: يشتغل لما يلزم، وما يزعج بلا سبب. */
import assert from 'node:assert/strict';
import { runningBuild, publishedBuild, isStale } from '../src/freshness.js';

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

console.log(`\n${passed} اختبار نجح.`);
