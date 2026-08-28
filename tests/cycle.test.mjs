/**
 * دورة المراجعة وموضع الطالب.
 *
 * الدورة رقم يُبنى على أرقام الشيخ لا على تقويم: لو غلط الحساب، إما قلنا
 * للطالب «أتممت» وهو ما أتمّ، أو خبّأنا عنه انزلاقًا يبتلع محفوظه في صمت.
 * والموضع يُعبّئ خانة «من» في كل جلسة — فغلطه غلط في كل تسميع بعده.
 */
import assert from 'node:assert/strict';
import {
  PAGES_PER_PART, toPages, partsText, memorizedPages, memRangeText,
  reviewCycles, cycleTarget, cycleDrift, lastStop, stopText, stopsOf,
  SURAHS, SURAH_PAGE, pageOfSurah, pagesBetween,
} from '../src/khayr.js';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('  ✓ ' + name); };

/** طالب محفوظه عشرة أجزاء، ورده ثلاثة، وهدف دورته ثلاث جلسات. */
const saad = {
  id: 's1', name: 'سعد المطيري',
  wird: { review: 60, reviewUnit: 'parts', tathbit: 10, hifz: 4 },
  mem: { from: 'الناس', to: 'الروم', amount: 10, unit: 'parts', target: 3 },
};

const session = (date, entries) => ({ id: 'x' + date, date, entries });
const said = (pages, from, to) => ({
  present: true,
  review: { pages, from: from || '', to: to || '' },
  tathbit: { pages: 0 }, hifz: { pages: 0 },
});

/* ---------------------------- الأجزاء والأوجه ---------------------------- */

test('الجزء عشرون وجهًا', () => {
  assert.equal(PAGES_PER_PART, 20);
  assert.equal(toPages(3, 'parts'), 60);
  assert.equal(toPages(47, 'pages'), 47);
  assert.equal(toPages(2.5, 'parts'), 50, 'نصف جزء يُقبل');
});

test('الوحدة الغائبة تُقرأ أوجهًا — ما نضاعف رقمًا بالغلط', () => {
  assert.equal(toPages(47), 47);
  assert.equal(toPages('', 'parts'), 0);
  assert.equal(toPages(-5, 'parts'), 0, 'السالب صفر');
});

test('الرقم يرجع بلسان الشيخ: جزءان و7 أوجه', () => {
  assert.equal(partsText(47), 'جزءان و7 أوجه');
  assert.equal(partsText(60), '3 أجزاء');
  assert.equal(partsText(20), 'جزء');
  assert.equal(partsText(40), 'جزءان');
  assert.equal(partsText(7), '7 أوجه');
  assert.equal(partsText(21), 'جزء ووجه');
  assert.equal(partsText(0), '0');
});

test('47 وجهًا نصف عشرة أجزاء تقريبًا — الرقم ما ينقلب لجزء كامل', () => {
  // «سمّع 47» ما تصير «جزءان» ولا «3 أجزاء»؛ الوقفة في نص الجزء تبقى ظاهرة
  assert.equal(partsText(47), 'جزءان و7 أوجه');
  assert.equal(partsText(56), 'جزءان و16 وجهًا');
});

test('محفوظه بالأوجه، ومداه كما كتبه', () => {
  assert.equal(memorizedPages(saad), 200);
  assert.equal(memRangeText(saad), 'من الناس إلى الروم');
  assert.equal(memorizedPages({}), 0, 'اللي ما كُتب محفوظه ما نخمّنه');
  assert.equal(memRangeText({ mem: { from: 'الناس' } }), 'من الناس');
});

/* ------------------------------ الدورة ------------------------------ */

test('الدورة تتجمّع من الجلسات، والباقي يُحسب', () => {
  const ss = [session('01', { s1: said(56) }), session('02', { s1: said(39) }), session('03', { s1: said(47) })];
  const c = reviewCycles(saad, ss);
  assert.equal(c.total, 200);
  assert.equal(c.current.pages, 142, '56 + 39 + 47');
  assert.equal(c.current.marks.length, 3);
  assert.equal(c.done.length, 0, 'ما بلغت المئتين بعد');
});

test('إذا بلغ المجموع محفوظه أُقفلت الدورة وبدأت التالية — بلا زر', () => {
  const ss = [
    session('01', { s1: said(70) }), session('02', { s1: said(70) }), session('03', { s1: said(70) }),
    session('04', { s1: said(19) }),
  ];
  const c = reviewCycles(saad, ss);
  assert.equal(c.done.length, 1);
  assert.equal(c.done[0].pages, 210, 'تجاوز المئتين في الجلسة الثالثة');
  assert.equal(c.done[0].marks.length, 3);
  assert.equal(c.current.pages, 19, 'الجديدة بدأت من الجلسة الرابعة');
});

test('الجلسات تُرتّب بالتاريخ لا بترتيب إدخالها', () => {
  const ss = [session('03', { s1: said(47) }), session('01', { s1: said(56) }), session('02', { s1: said(39) })];
  assert.deepEqual(reviewCycles(saad, ss).current.marks.map((m) => m.pages), [56, 39, 47]);
});

test('الغائب ما يدخل الدورة — ما راجع شيئًا', () => {
  const ss = [session('01', { s1: said(60) }), session('02', { s1: { present: false, due: 4 } })];
  assert.equal(reviewCycles(saad, ss).current.marks.length, 1);
});

test('الجلسة اللي ما فيها مراجعة ما تُعدّ جلسة دورة', () => {
  // وإلا صارت الدورة تطول بجلسات ما راجع فيها، فيبان منزلقًا وهو ما انزلق
  const ss = [session('01', { s1: said(60) }), session('02', { s1: said(0) })];
  assert.equal(reviewCycles(saad, ss).current.marks.length, 1);
});

test('طالب ما كُتب محفوظه: نجمع له بلا ما نقفل دورة', () => {
  const anon = { id: 's1', wird: { review: 60 } };
  const ss = [session('01', { s1: said(500) })];
  const c = reviewCycles(anon, ss);
  assert.equal(c.total, 0);
  assert.equal(c.done.length, 0, 'ما نقفل دورة على فراغ');
  assert.equal(c.current.pages, 500);
});

test('تسميع طالب آخر ما يدخل دورة هذا', () => {
  const ss = [session('01', { s2: said(200), s1: said(20) })];
  assert.equal(reviewCycles(saad, ss).current.pages, 20);
});

/* ------------------------------ الانزلاق ------------------------------ */

test('هدف الدورة ثلاث جلسات ما لم يُكتب غيره', () => {
  assert.equal(cycleTarget(saad), 3);
  assert.equal(cycleTarget({}), 3);
  assert.equal(cycleTarget({ mem: { target: 5 } }), 5);
  assert.equal(cycleTarget({ mem: { target: 0 } }), 3, 'الصفر ما يصلح هدفًا');
});

test('عشرة أجزاء بورد ثلاثة = ثلاث جلسات، وهذا الهدف بالضبط', () => {
  // 200 / 60 = 3.33 — والشيخ يقولها «ثلاث»، فما نصيح عليه بأنها أربع
  const d = cycleDrift(saad);
  assert.equal(d.ok, true);
  assert.equal(d.need, 3);
});

test('المنبّه ما يصيح على طالب ماشٍ على الخطة', () => {
  // منبّهٌ يصيح على السليم لا يُسمَع له يوم يصيح على المنزلق
  for (const parts of [3, 6, 9]) {
    const st = { wird: { review: 60, reviewUnit: 'parts' }, mem: { amount: parts, unit: 'parts', target: 3 } };
    assert.equal(cycleDrift(st).ok, true, `${parts} أجزاء بورد ثلاثة`);
  }
});

test('المحفوظ يكبر والورد ثابت، فالدورة تطول من نفسها', () => {
  // بعد سنة: عشرون جزءًا بنفس الورد
  const later = { ...saad, mem: { ...saad.mem, amount: 20 } };
  const d = cycleDrift(later);
  assert.equal(d.ok, false);
  assert.equal(d.need, 7, '400 / 60 = 6.67 — وهذي هي السبعة اللي ما أحد انتبه لها');
  assert.equal(d.target, 3);
  assert.equal(d.suggest, 140, 'يرفع ورده لسبعة أجزاء ليرجع لثلاث جلسات');
  assert.equal(partsText(d.suggest), '7 أجزاء', 'بأجزاء كاملة — الشيخ يفكّر بها');
});

test('اقتراح من يكتب ورده بالأوجه يبقى بالأوجه', () => {
  const st = { wird: { review: 60, reviewUnit: 'pages' }, mem: { amount: 20, unit: 'parts', target: 3 } };
  assert.equal(cycleDrift(st).suggest, 134, 'ceil(400 / 3) بلا تدوير لجزء');
});

test('بلا محفوظ أو بلا ورد ما فيه انزلاق نحكم به', () => {
  assert.equal(cycleDrift({ wird: { review: 60 } }), null);
  assert.equal(cycleDrift({ mem: { amount: 10, unit: 'parts' } }), null);
});

/* ------------------------------ الموضع ------------------------------ */

test('موضعه من آخر جلسة سمّع فيها', () => {
  const ss = [
    session('01', { s1: { present: true, hifz: { pages: 4, from: 'الناس', to: 'الفلق' } } }),
    session('02', { s1: { present: true, hifz: { pages: 4, from: 'الفلق', to: 'الحديد', toAya: 12 } } }),
  ];
  assert.deepEqual(lastStop(saad, ss, 'hifz'), { from: 'الحديد', fromAya: 12 });
  assert.equal(stopText(lastStop(saad, ss, 'hifz')), 'الحديد 12');
});

test('نبحث للخلف: آخر جلسة فيها «إلى» هي الموضع', () => {
  // آخر جلسة قد تكون غيابًا أو تسميعًا بلا مدى — فما نقف عندها ونقول «ما فيه موضع»
  const ss = [
    session('01', { s1: { present: true, hifz: { pages: 4, to: 'الحديد' } } }),
    session('02', { s1: { present: false, due: 4 } }),
    session('03', { s1: { present: true, hifz: { pages: 0 } } }),
  ];
  assert.equal(stopText(lastStop(saad, ss, 'hifz')), 'الحديد');
});

test('كل قسم موضعه — المراجعة ما تُفتح على موضع الحفظ', () => {
  const ss = [session('01', {
    s1: {
      present: true,
      review: { pages: 60, to: 'المرسلات' },
      tathbit: { pages: 10, to: 'الواقعة' },
      hifz: { pages: 4, to: 'العنكبوت' },
    },
  })];
  const stops = stopsOf(saad, ss);
  assert.equal(stops.review.from, 'المرسلات');
  assert.equal(stops.tathbit.from, 'الواقعة');
  assert.equal(stops.hifz.from, 'العنكبوت');
});

test('أول جلسة للطالب: ما فيه موضع، والخانة تُفتح فاضية', () => {
  assert.equal(lastStop(saad, [], 'hifz'), null);
  assert.equal(stopText(null), '');
  assert.deepEqual(stopsOf(saad, []).hifz, null);
});

test('الآية صفرًا ما تُلحق بالسورة', () => {
  assert.equal(stopText({ from: 'الحديد', fromAya: 0 }), 'الحديد');
  assert.equal(stopText({ from: 'الحديد', fromAya: '' }), 'الحديد');
});

/* ---------------------- أوجه المدى تلقائيًا ---------------------- */

test('لكل سورة صفحتها، والمصحف 604', () => {
  assert.equal(SURAHS.length, SURAH_PAGE.length, 'ما فيه سورة بلا صفحة');
  assert.equal(SURAH_PAGE[0], 1, 'الفاتحة أولها');
  assert.equal(SURAH_PAGE[SURAH_PAGE.length - 1], 604, 'والناس آخرها');
  // مرتّبة تصاعديًا، وإلا انقلب حساب المدى كله
  for (let i = 1; i < SURAH_PAGE.length; i++) {
    assert.ok(SURAH_PAGE[i] >= SURAH_PAGE[i - 1], `صفحة ${SURAHS[i]} قبل اللي قبلها`);
  }
});

test('«من الناس إلى المسد» = وجهان — بلا ما يعدّها بيده', () => {
  assert.equal(pagesBetween('الناس', 'المسد'), 2);
  assert.equal(partsText(pagesBetween('الناس', 'المسد')), 'وجهان');
});

test('المدى مقلوبًا هو نفسه — الطالب يحفظ من آخر المصحف لأوله', () => {
  assert.equal(pagesBetween('المسد', 'الناس'), pagesBetween('الناس', 'المسد'));
});

test('الحدّان داخلان: سورة مع نفسها وجه لا صفر', () => {
  assert.equal(pagesBetween('البقرة', 'البقرة'), 1);
});

test('مدى المصحف كله، ومدى محفوظ سعد', () => {
  assert.equal(pagesBetween('الفاتحة', 'الناس'), 604);
  assert.equal(pagesBetween('الناس', 'الروم'), 201, 'عشرة أجزاء تقريبًا — كما كتبها الشيخ');
  assert.equal(partsText(pagesBetween('المرسلات', 'الواقعة')), 'جزءان و7 أوجه');
});

test('سورة ما نعرفها ما نخمّن لها رقمًا', () => {
  assert.equal(pagesBetween('الناس', ''), null);
  assert.equal(pagesBetween('سورة ما وجدت', 'الناس'), null);
  assert.equal(pageOfSurah('  الناس  '), 604, 'والمسافات ما تعمينا عنها');
});

console.log(`\n✅ ${passed} اختبارًا لدورة المراجعة وموضع الطالب\n`);
