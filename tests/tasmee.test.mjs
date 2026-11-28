/**
 * التسميع اليومي: المقارنة بنصّ المصحف الحقيقي (public/quran.json).
 * المقارنة هي التي تقول «أعد»، فخطؤها يظلم طالبًا أو يُمرّر خطأً — يُقفل بأخطاءٍ حقيقية لا مفتعلة.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { norm, sim, wordsOf, judge, advance, locateStart, LEVELS } from '../src/tasmee.js';

const quran = JSON.parse(fs.readFileSync(new URL('../public/quran.json', import.meta.url), 'utf8'));
let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('  ✓ ' + name); };

const words = (s, a, b) => wordsOf(quran, s, a, b);
const said = (s, a, b) => words(s, a, b).map((x) => x.w).join(' ');   // ما يسمعه التعرّف لو قرأ صحيحًا
const stat = (r) => r.status.join(',');

test('النصّ سليم: ١١٤ سورة و٦٢٣٦ آية، وأعداد آياتٍ معروفة', () => {
  assert.equal(quran.s.length, 114);
  assert.equal(quran.s.reduce((a, x) => a + x.length, 0), 6236);
  assert.deepEqual([1, 2, 112, 114].map((n) => quran.s[n - 1].length), [7, 286, 4, 6]);
  assert.ok(!quran.s[1][0].startsWith(quran.bsm), 'البسملة ليست من أول آية البقرة');
  assert.ok(quran.s[0][0].startsWith('بِسْمِ'), 'وهي آية الفاتحة الأولى');
});

test('توحيد الإملاء: بلا تشكيل ولا علامات، وصورٌ واحدة للهمزة والتاء المربوطة والياء', () => {
  assert.equal(norm('ٱلرَّحْمَٰنِ'), 'الرحمن');
  assert.equal(norm('أَحَدٌ ۚ'), 'احد');
  assert.equal(norm('رَحْمَةً'), 'رحمه');
  assert.equal(norm('عَلَىٰ'), 'علي');
  assert.equal(norm('مُؤْمِنِين'), 'مومنين');
});

test('الإخلاص مقروءةً صحيحة: كل كلمةٍ ok والمدى مكتمل', () => {
  const E = words(112, 1, 4);
  const r = judge(E, said(112, 1, 4), { final: true });
  assert.equal(r.done, true);
  assert.equal(r.firstBad, -1);
  assert.equal(r.ok, E.length);
});

test('الفاتحة كاملةً، والبقرة آيتان: صحيحة', () => {
  for (const [s, a, b] of [[1, 1, 7], [2, 255, 255], [36, 1, 12]]) {
    const E = words(s, a, b);
    assert.equal(judge(E, said(s, a, b), { final: true }).done, true, `${s}:${a}-${b}`);
  }
});

test('إملاءُ التعرّف يختلف عن المصحف: همزةٌ وتاءٌ مربوطة وألفٌ مقصورة — تُقبل', () => {
  const E = words(112, 1, 4);
  const heard = 'قل هو الله أحد الله الصمد لم يلد ولم يولد ولم يكن له كفوا أحد';
  assert.equal(judge(E, heard, { final: true }).done, true);
  const E2 = words(1, 1, 7);
  assert.equal(judge(E2, 'بسم الله الرحمان الرحيم الحمد لله رب العالمين الرحمن الرحيم مالك يوم الدين اياك نعبد واياك نستعين اهدنا الصراط المستقيم صراط الذين انعمت عليهم غير المغضوب عليهم ولا الضالين', { final: true }).done, true);
});

test('كلمتان مُلصقتان أو كلمةٌ مفصولة في نصّ التعرّف: تُقبل', () => {
  const E = words(112, 1, 4);
  assert.equal(judge(E, 'قل هوالله احد الله الصمد لم يلد ولم يولد ولم يكن له كفوا احد', { final: true }).done, true, 'لصق');
  assert.equal(judge(E, 'قل هو الله احد الله ال صمد لم يلد ولم يولد ولم يكن له كفوا احد', { final: true }).done, true, 'فصل');
});

test('كلمةٌ ناقصة: تُعلَّم missing بعينها ولا يُحكم على غيرها', () => {
  const E = words(112, 1, 4);
  const heard = said(112, 1, 4).replace(' الصمد', '');
  const r = judge(E, heard, { final: true });
  assert.equal(r.done, false);
  assert.equal(E[r.firstBad].w, 'الصمد');
  assert.equal(r.status[r.firstBad], 'missing');
  assert.equal(r.ok, E.length - 1);
});

test('كلمةٌ مبدَّلة: «يلد» مكان «يولد» تُعلَّم wrong', () => {
  const E = words(112, 3, 3);
  const r = judge(E, 'لم يلد ولم يلد', { final: true });
  assert.equal(E[r.firstBad].w, 'يولد');
  assert.equal(r.status[r.firstBad], 'wrong');
});

test('آيةٌ مقفوزٌ عنها: كلماتها كلها ناقصة، وما قبلها وبعدها صحيح', () => {
  const E = words(112, 1, 4);
  const heard = `${said(112, 1, 1)} ${said(112, 3, 4)}`;
  const r = judge(E, heard, { final: true });
  const skipped = E.map((x, i) => (x.ayah === 2 ? r.status[i] : null)).filter(Boolean);
  assert.ok(skipped.every((s) => s === 'missing'), stat(r));
  assert.ok(E.every((x, i) => x.ayah === 2 || r.status[i] === 'ok'));
});

test('لم يُكمل بعد: ما لم يصل إليه الكلام pending لا missing، فلا يُقال «أعد» لمن لم ينتهِ', () => {
  const E = words(112, 1, 4);
  const r = judge(E, said(112, 1, 2), { final: false });
  assert.equal(r.firstBad, -1);
  assert.equal(r.done, false);
  assert.ok(r.status.slice(-6).every((s) => s === 'pending'), stat(r));
  // فإن انتهى الكلام صار ما بقي ناقصًا
  assert.ok(judge(E, said(112, 1, 2), { final: true }).status.slice(-6).every((s) => s === 'missing'));
});

test('تردّدٌ وتكرار وكلماتٌ زائدة: لا تضرّ ما دام الصحيح كله حاضرًا', () => {
  const E = words(112, 1, 4);
  const heard = 'اه قل قل هو الله احد الله الله الصمد ثم لم يلد ولم يولد ولم يكن له كفوا احد';
  assert.equal(judge(E, heard, { final: true }).done, true);
});

test('حرفان متقاربان («الصمد» تُسمع «السمد»): يُقبل في العادي ويُرفض في الصارم', () => {
  const E = words(112, 2, 2);
  assert.equal(judge(E, 'الله السمد', { level: 'normal', final: true }).done, true);
  assert.equal(judge(E, 'الله السمد', { level: 'strict', final: true }).done, false);
});

test('وكلمةٌ بحرفين مختلفين (غير متقاربين) لا تُقبل في العادي', () => {
  const E = words(112, 1, 1);
  const r = judge(E, 'قل هو الله احمق', { final: true });
  assert.equal(r.status[3], 'wrong');
});

test('الكلمات القصيرة لا تُسامَح: «لم» تُسمع «لن» خطأ', () => {
  const E = words(112, 3, 3);
  const r = judge(E, 'لن يلد ولم يولد', { final: true });
  assert.equal(E[r.firstBad].w, 'لم');
});

test('سورةٌ أخرى كلها: لا تمرّ مهما قُرّبت الصرامة', () => {
  const E = words(112, 1, 4);
  for (const level of Object.keys(LEVELS)) {
    const r = judge(E, said(114, 1, 6), { level, final: true });
    assert.equal(r.done, false, level);
    assert.ok(r.ok < E.length / 3, `${level}: ${r.ok}`);
  }
});

test('فواتح السور: «الم» تُقبل مكتوبةً وتُقبل منطوقةً «الف لام ميم»', () => {
  const E = words(2, 1, 2);
  assert.equal(judge(E, `الم ${said(2, 2, 2)}`, { final: true }).done, true);
  assert.equal(judge(E, `الف لام ميم ${said(2, 2, 2)}`, { final: true }).done, true);
});

test('مدًى طويل (آية الكرسي وسورة يس كلها): صحيحة بلا خطأ كاذب، وكلمةٌ واحدة ناقصة تُكتشف', () => {
  const E = words(36, 1, 83);
  const full = said(36, 1, 83);
  assert.equal(judge(E, full, { final: true }).done, true);
  const parts = full.split(' ');
  const cut = [...parts.slice(0, 40), ...parts.slice(41)].join(' ');
  const r = judge(E, cut, { final: true });
  assert.equal(r.status.filter((s) => s !== 'ok').length, 1);
  assert.equal(r.firstBad, 40);
});

test('التشابه: كلماتٌ متطابقة 1، ومختلفة قريبةٌ من 0', () => {
  assert.equal(sim('الله', 'الله'), 1);
  assert.ok(sim('الله', 'قمر') < 0.3);
  assert.ok(sim('الصمد', 'السمد') > 0.85);
});

/* ---- الجلسة: «أعد» لا تُقال قبل أوانها، والمؤشّر لا يرجع ---- */

test('الجلسة: الصحيح يتقدّم بالمؤشّر، وخطأٌ لم يتجاوزه الكلام لا يُعلَن بعد', () => {
  const E = words(112, 1, 4);
  const a = advance(E, 0, 'قل هو الله احد', { final: false });
  assert.equal(a.bad, -1);
  assert.equal(a.cursor, 4);
  // أخطأ في الكلمة التالية ولم يُكمل: لا نحكم بعد
  const b = advance(E, 4, 'الله الصمت', { final: false });
  assert.equal(b.bad, -1, 'كلمةٌ واحدة بعد الخطأ غير كافية');
});

test('الجلسة: يُعلَن «أعد» إذا تجاوز الكلامُ الخطأ بكلمتين، أو انتهى', () => {
  const E = words(112, 1, 4);
  // «الصمد» مبدّلة بكلمةٍ بعيدة ثم تلتها «لم يلد»
  const c = advance(E, 4, 'الله قمر لم يلد ولم يولد', { final: false });
  assert.equal(c.cursor, 5);
  assert.equal(c.bad, 5);
  assert.equal(E[c.bad].w, 'الصمد');
  // وانتهى الكلام عند الخطأ
  const d = advance(E, 4, 'الله قمر', { final: true });
  assert.equal(d.bad, 5);
});

test('الجلسة: بعد «أعد» يعيد من الكلمة الخاطئة فقط، ويكتمل المدى', () => {
  const E = words(112, 1, 4);
  let cur = 0;
  let r = advance(E, cur, 'قل هو الله احد الله قمر لم يلد ولم يولد', { final: false });
  assert.equal(r.bad, 5);
  cur = r.cursor;                                   // 5: عند «الصمد»
  r = advance(E, cur, 'الصمد لم يلد ولم يولد ولم يكن له كفوا احد', { final: true });
  assert.equal(r.done, true);
  assert.equal(r.cursor, E.length);
});

test('الجلسة: مدًى مكتمل لا يُفتح من جديد', () => {
  const E = words(112, 1, 1);
  assert.equal(advance(E, E.length, 'اي شيء', { final: true }).done, true);
});

test('مدًى أطول من النافذة (سورة الشعراء كلها): يُنجَز على دفعات بالمؤشّر بلا خطأ كاذب', () => {
  const E = words(26, 1, 227);
  assert.ok(E.length > 500);
  const all = E.map((x) => x.w);
  let cursor = 0, guard = 0;
  while (cursor < E.length && guard++ < 50) {
    const heard = all.slice(cursor, cursor + 30).join(' ');
    const r = advance(E, cursor, heard, { final: false });
    assert.equal(r.bad, -1);
    assert.ok(r.cursor >= cursor + 25, `تقدّم المؤشّر: ${cursor} → ${r.cursor}`);
    cursor = r.cursor;
  }
  assert.equal(cursor, E.length);
});

test('قال «صمد» بدل «الله الصمد»: يُقال «أعد» من «الله» دون انتظار كلماتٍ بعدها', () => {
  const E = words(112, 1, 4);
  const r = advance(E, 0, 'قل هو الله احد صمد', { level: 'normal', final: false });
  assert.equal(r.cursor, 4);
  assert.equal(r.bad, 4, 'عند «الله» الثانية');
});

test('انتقل إلى آيةٍ أخرى: «أعد» من حيث توقّف لا انتظارٌ صامت', () => {
  const E = words(112, 1, 4);
  const r = advance(E, 0, 'قل هو الله احد لم يلد ولم يولد', { level: 'normal', final: false });
  assert.equal(r.bad, 4);
  // وقفزٌ بعيدٌ في سورةٍ طويلة: بعد الآية الأولى إلى آيةٍ بعيدة
  const B = words(2, 1, 40);
  const far = said(2, 30, 30);
  const r2 = advance(B, 0, far, { level: 'normal', final: false });
  assert.equal(r2.bad, 0);
});

test('القراءة السليمة لا تُعدّ قفزًا: مقاطع متعدّدة بلا «أعد» كاذب', () => {
  for (const [s, a, b] of [[112, 1, 4], [1, 1, 7], [55, 13, 13], [2, 255, 255], [78, 1, 20]]) {
    const E = words(s, a, b);
    const w = E.map((x) => x.w);
    for (let n = 1; n < w.length; n++) {
      const r = advance(E, 0, w.slice(0, n).join(' '), { level: 'normal', final: false });
      assert.equal(r.bad, -1, `${s}:${a}-${b} عند ${n} كلمة`);
    }
  }
});

test('مقطعٌ منتهٍ (solid): كلمةٌ خاطئة في آخره تُعلَن فورًا، وما سُمع صحيحًا لا يُعلَن', () => {
  const E = words(112, 1, 4);
  // آخر ما سُمع كلمةٌ خاطئة: بلا solid يُنتظر، ومعه يُحكم
  assert.equal(advance(E, 0, 'قل هو الله احد الله القمر', { level: 'normal', final: false }).bad, -1);
  assert.equal(advance(E, 0, 'قل هو الله احد الله القمر', { level: 'normal', final: false, solid: true }).bad, 5);
  // وقراءةٌ سليمةٌ ناقصةٌ من آخرها: لا خطأ
  assert.equal(advance(E, 0, 'قل هو الله احد الله', { level: 'normal', final: false, solid: true }).bad, -1);
});

test('همزة الاستفهام اللاصقة («أالله») تُقبل وقد يكتبها النموذج القرآني', () => {
  const E = words(112, 2, 2);
  assert.equal(advance(E, 0, 'أالله الصمد', { level: 'normal', final: true }).done, true);
});

test('«عمّ يتساءلون» بإملاءات التعرّف المختلفة تُقبل (همزةٌ على ياء أو على السطر، وألف المدّ)', () => {
  const E = words(78, 1, 1);
  for (const h of ['عم يتساءلون', 'عم يتسائلون', 'عم يتسألون', 'عما يتساءلون', 'عمّ يتسالون']) {
    for (const level of ['normal', 'strict']) assert.equal(advance(E, 0, h, { level, final: true }).done, true, `${h} (${level})`);
  }
  // والنموذج القرآني يكتب برسم المصحف: «عما» عنده قراءةٌ أخرى
  assert.equal(advance(E, 0, 'عما يتساءلون', { level: 'normal', final: false, solid: true }).bad, 0);
});

test('البداية من منتصف السورة: يُعرف الموضع من أول كلماتٍ ثلاث', () => {
  const E = words(78, 1, 40);
  const at = (a) => E.findIndex((x) => x.ayah === a);
  for (const a of [1, 6, 17, 31, 40]) {
    const r = locateStart(E, said(78, a, Math.min(40, a + 1)));
    assert.equal(r.start, at(a), `آية ${a}`);
  }
  // يبدأ من منتصف آية، وبتردّدٍ في أولها
  const w = said(78, 17, 17).split(' ');
  assert.equal(locateStart(E, w.slice(2).join(' ')).start, at(17) + 2);
  assert.equal(locateStart(E, 'اه ' + w.join(' ')).start, at(17));
  // أقل من ثلاث كلمات: لا يُحسم
  assert.equal(locateStart(E, w.slice(0, 2).join(' ')), null);
  // وتعوّذه قبل القراءة لا يضلّله
  assert.equal(locateStart(E, 'اعوذ بالله من الشيطان الرجيم ' + said(78, 6, 7)).start, at(6));
});

test('لازمةٌ مكرّرة (الرحمن) لا يُحسم بها الموضع من ثلاث كلمات', () => {
  const E = words(55, 1, 78);
  assert.equal(locateStart(E, 'فباي الاء ربكما').ambiguous, true);
});

test('الأداء: مقارنة نافذة كاملة بسرعة (أقل من ٣٠٠ م.ث)', () => {
  const E = words(2, 255, 286);
  const t = Date.now();
  advance(E, 0, E.slice(0, 70).map((x) => x.w).join(' '), { final: false });
  assert.ok(Date.now() - t < 300, `${Date.now() - t}ms`);
});

console.log(`\n✅ ${passed} اختبارًا للتسميع اليومي\n`);
