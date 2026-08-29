/**
 * الرابط العام والباركود.
 *
 * الرابط يُطبع باركودًا ويُعلَّق سنين، فما له رجعة. ولذلك يُقفل باختبار: من
 * يفتح عليه، ومتى يُقفل، وهل إقفال التسجيل الذاتي يقفله معه — وإلا بقي باب
 * مفتوح على برنامج ظنّ صاحبه أنه أقفله.
 */
import assert from 'node:assert/strict';
import { publicProgram, programByToken, programFor } from '../src/signup.js';
import { qrSvg, qrDataUrl, qrMatrix, QUIET } from '../src/qr.js';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('  ✓ ' + name); };

const prog = (id, name, signup) => ({ id, name, signup });
const open = (token) => ({ enabled: true, token });
const shut = (token) => ({ enabled: false, token });

const data = (targetId, programs) => ({ publicLink: { programId: targetId }, programs });

/* ---------------------------- الوجهة ---------------------------- */

test('الرابط العام يفتح على البرنامج المحدَّد', () => {
  const d = data('p1', [prog('p1', 'جمعة الرواد', open('aaa')), prog('p2', 'ربيع الرواد', open('bbb'))]);
  assert.equal(publicProgram(d)?.name, 'جمعة الرواد');
});

test('وتبديل الوجهة يبدّل ما يفتح عليه، والرابط هو هو', () => {
  const programs = [prog('p1', 'جمعة الرواد', open('aaa')), prog('p2', 'ربيع الرواد', open('bbb'))];
  assert.equal(publicProgram(data('p1', programs))?.name, 'جمعة الرواد');
  assert.equal(publicProgram(data('p2', programs))?.name, 'ربيع الرواد');
});

test('بلا وجهة ما يفتح على شي — فيشوف الزائر «التسجيل مقفل»', () => {
  assert.equal(publicProgram(data('', [prog('p1', 'جمعة', open('aaa'))])), null);
  assert.equal(publicProgram({ programs: [] }), null);
  assert.equal(publicProgram(undefined), null);
});

test('وجهة تشير لبرنامج ما عاد موجودًا ما تفتح شيئًا', () => {
  assert.equal(publicProgram(data('محذوف', [prog('p1', 'جمعة', open('aaa'))])), null);
});

/* --------------------- الإقفال يقفل البابين --------------------- */

test('إقفال التسجيل الذاتي يقفل الرابط العام معه', () => {
  // وإلا صار البرنامج مقفولًا من بابه، مفتوحًا من الباركود المعلّق على الجدار
  const d = data('p1', [prog('p1', 'جمعة الرواد', shut('aaa'))]);
  assert.equal(publicProgram(d), null);
});

test('ونفس الشرط على رابط الرمز — ما اختلف حكمهما', () => {
  const programs = [prog('p1', 'جمعة', shut('aaa'))];
  assert.equal(programByToken(programs, 'aaa'), null);
  assert.equal(publicProgram(data('p1', programs)), null);
});

/* ------------------------- التوجيه ------------------------- */

test('الطلب برمز يذهب لصاحب الرمز، وبلا رمز للوجهة العامة', () => {
  const d = data('p2', [prog('p1', 'جمعة الرواد', open('aaa')), prog('p2', 'ربيع الرواد', open('bbb'))]);
  assert.equal(programFor(d, 'aaa')?.name, 'جمعة الرواد', 'الرمز أخصّ فيُقدَّم');
  assert.equal(programFor(d, '')?.name, 'ربيع الرواد');
  assert.equal(programFor(d, undefined)?.name, 'ربيع الرواد');
});

test('رمز غلط ما يسقط على الوجهة العامة', () => {
  // وإلا صار أي حرف عشوائي في العنوان يفتح البرنامج المفتوح — والرمز بلا معنى
  const d = data('p2', [prog('p1', 'جمعة', open('aaa')), prog('p2', 'ربيع', open('bbb'))]);
  assert.equal(programFor(d, 'رمز-ما-يشبه-شي'), null);
});

test('والرابط الخاص يبقى شغّالًا ولو الرابط العام موقوف', () => {
  const d = data('', [prog('p1', 'جمعة', open('aaa'))]);
  assert.equal(programFor(d, 'aaa')?.name, 'جمعة');
  assert.equal(programFor(d, ''), null);
});

/* -------------------------- الباركود -------------------------- */

test('الباركود صورة SVG تكبر للطباعة بلا ما تتكسّر', () => {
  const svg = qrSvg('https://faydh2030.netlify.app/r');
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(svg, /<path d="M/, 'فيه مربّعات لا صورة فاضية');
  assert.match(svg, /fill="#fff"/, 'وخلفية بيضاء — القارئ يحتاج التباين');
});

test('وله هامش أبيض، وإلا صعب على الكاميرا تمسكه', () => {
  const svg = qrSvg('https://faydh2030.netlify.app/r', { quiet: 4 });
  const box = /viewBox="0 0 (\d+) \1"/.exec(svg);
  assert.ok(box, 'مربّع الشكل');
  // مقاس الرمز + هامش أربع وحدات من كل جهة
  assert.ok(Number(box[1]) >= 21 + 8, 'الهامش داخل المربّع');
});

test('اختلاف الرابط يغيّر الباركود، وتكراره يعطي نفسه', () => {
  const a = qrSvg('https://faydh2030.netlify.app/r');
  const b = qrSvg('https://faydh2030.netlify.app/r');
  const c = qrSvg('https://faydh2030.netlify.app/r/abc123');
  assert.equal(a, b, 'نفس الرابط نفس الصورة — ما تتبدّل بين طباعتين');
  assert.notEqual(a, c);
});

test('و data URI جاهز للعرض في الشاشة', () => {
  const u = qrDataUrl('https://faydh2030.netlify.app/r');
  assert.match(u, /^data:image\/svg\+xml;charset=utf-8,/);
  assert.ok(u.length > 200);
});

test('الشبكة مربّعة، وفيها مربّعات الزوايا الثلاثة', () => {
  // الصورتان — المعروضة والمحمَّلة — تُبنيان من هذي الشبكة، فتحقّقها يكفيهما
  const m = qrMatrix('https://faydh2030.netlify.app/r');
  assert.ok(m.length >= 21, 'أصغر رمز إحدى وعشرون وحدة');
  m.forEach((row) => assert.equal(row.length, m.length, 'مربّعة الشكل'));
  // مربّع التموضع في كل زاوية: إطار ممتلئ سبع في سبع
  const finder = (r0, c0) => [0, 6].every((d) => m[r0][c0 + d] && m[r0 + 6][c0 + d]);
  assert.ok(finder(0, 0), 'الزاوية الأولى');
  assert.ok(finder(0, m.length - 7), 'الثانية');
  assert.ok(finder(m.length - 7, 0), 'الثالثة');
});

test('والهامش أربع وحدات — بلاه يصعب على الكاميرا', () => {
  assert.equal(QUIET, 4);
});

console.log(`\n✅ ${passed} اختبارًا للرابط العام والباركود\n`);
