/**
 * ورقة التقرير: غلافُ الـPDF وأقسامُ الورقة.
 *
 * الرسمُ نفسه يحتاج كانفاسًا فيُفحَص بالمتصفّح، وما يُختبر هنا ما يُحسب بلا
 * رسم: بنيةُ الملف — أن يبدأ بعلامته، وأن تدلّ مواضعُ كائناته على مواضعها
 * حقًّا (وهذا ما يكسر الملفَّ إن غلط بايتٌ واحد)، وأن تُطوى الأقسامُ الغائبة.
 */
import assert from 'node:assert/strict';
import { pdfFromJpeg, pdfFromJpegs, sheetSections, sheetFileName, paginate, wrapLine } from '../src/sheet.js';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('  ✓ ' + name); };

const fakeJpeg = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 1, 2, 3, 4, 0xFF, 0xD9]);
const txt = (u8) => Buffer.from(u8).toString('latin1');

test('الملف يبدأ بعلامة PDF وينتهي بخاتمتها', () => {
  const s = txt(pdfFromJpeg(fakeJpeg, { width: 100, height: 200 }));
  assert.ok(s.startsWith('%PDF-1.4'));
  assert.ok(s.trimEnd().endsWith('%%EOF'));
});

test('وفيه صفحةٌ واحدة وصورةٌ بترميزها كما هي', () => {
  const s = txt(pdfFromJpeg(fakeJpeg, { width: 100, height: 200 }));
  assert.ok(s.includes('/Type /Pages'));
  assert.ok(s.includes('/Count 1'));
  assert.ok(s.includes('/Subtype /Image'));
  assert.ok(s.includes('/Filter /DCTDecode'), 'الصورة تدخل JPEG بلا فكّ');
  assert.ok(s.includes('/Width 100'));
  assert.ok(s.includes('/Height 200'));
});

test('وبايتات الصورة تدخل كما هي بلا نقص', () => {
  const out = pdfFromJpeg(fakeJpeg, { width: 10, height: 10 });
  const s = txt(out);
  assert.ok(s.includes(`/Length ${fakeJpeg.length}`));
  const i = s.indexOf('DCTDecode');
  const start = s.indexOf('stream\n', i) + 'stream\n'.length;
  assert.deepEqual([...out.slice(start, start + fakeJpeg.length)], [...fakeJpeg]);
});

/**
 * جدولُ المواضع هو ما يفتح الملف: كلُّ سطرٍ فيه يقول أين يبدأ كائنُه، فإن
 * أزاحه بايتٌ واحد قال القارئ «ملفٌّ تالف».
 */
test('وجدول المواضع يدلّ على مواضع الكائنات حقًّا', () => {
  const out = pdfFromJpeg(fakeJpeg, { width: 10, height: 10 });
  const s = txt(out);
  const x = Number(/startxref\s+(\d+)/.exec(s)[1]);
  assert.equal(s.slice(x, x + 4), 'xref', 'startxref يدلّ على الجدول');
  const rows = s.slice(x).split('\n').slice(2).filter((l) => / 00000 n/.test(l));
  assert.equal(rows.length, 6, 'ستّة كائنات');
  rows.forEach((line, i) => {
    const off = Number(line.slice(0, 10));
    assert.equal(s.slice(off, off + `${i + 1} 0 obj`.length), `${i + 1} 0 obj`, `الكائن ${i + 1}`);
  });
});

test('والعنوان العربي يُرمَّز فما يخرج حروفًا مكسورة', () => {
  const s = txt(pdfFromJpeg(fakeJpeg, { width: 10, height: 10, title: 'تقرير الأسبوع' }));
  assert.ok(/\/Title <FEFF[0-9A-F]+>/.test(s), 'يُكتب UTF-16 بعلامته');
  assert.ok(!s.includes('/Title (تقرير'), 'ما يُكتب نصًّا خامًا');
});

test('والصورة تُوضع في وسط A4 بنسبتها محفوظة', () => {
  const s = txt(pdfFromJpeg(fakeJpeg, { width: 1240, height: 1754 }));
  const m = /q ([\d.]+) 0 0 ([\d.]+) ([\d.]+) ([\d.]+) cm/.exec(s);
  assert.ok(m, 'فيه أمرُ رسم');
  const [w, h, x] = [Number(m[1]), Number(m[2]), Number(m[3])];
  assert.ok(Math.abs(w / h - 1240 / 1754) < 0.01, 'النسبة محفوظة');
  assert.ok(w <= 595.3 && h <= 841.9, 'داخل الورقة');
  assert.ok(x >= 0, 'ما يخرج عن يسارها');
});

/* ------------------------------ أقسام الورقة ------------------------------ */

test('الأقسام بترتيبها: حضورٌ ثم ماليةٌ ثم توزيعٌ ثم نادٍ', () => {
  const s = sheetSections({
    students: 58, present: 56, enrolled: 58,
    money: { revenue: 2365, expenses: 250, net: 2115, school: 1058, faid: 1057 },
    club: ['الكنز المفقود — مسابقة'],
  });
  assert.deepEqual(s.map((x) => x.title), ['الحضور', 'المالية', 'التوزيع', 'النادي']);
});

test('والمبالغ بفاصلة الآلاف، والصافي يُبرز', () => {
  const s = sheetSections({ money: { revenue: 2365, expenses: 250, net: 2115, school: 1058, faid: 1057 } });
  const mal = s.find((x) => x.title === 'المالية');
  assert.deepEqual(mal.rows[0], ['الإيراد', '2,365 ر.س']);
  assert.equal(mal.rows[2][2], true, 'الصافي مميَّز');
});

test('والحاضرون معهم نسبتهم', () => {
  const s = sheetSections({ present: 56, enrolled: 58 });
  assert.equal(s[0].rows[0][1], '56 من 58 · 97٪');
});

test('وما غاب يُطوى: بلا مالٍ ولا نادٍ لا تظهر أقسامُهما', () => {
  const s = sheetSections({ students: 10 });
  assert.deepEqual(s.map((x) => x.title), ['الحضور']);
  assert.deepEqual(sheetSections({}), []);
});

test('ولا يقسم على صفرٍ مسجَّل', () => {
  const s = sheetSections({ present: 0, enrolled: 0 });
  assert.equal(s[0].rows[0][1], '0 من 0');
});

test('صناديق الورقة الثلاثة الجديدة، بترتيبها بعد النادي', () => {
  const s = sheetSections({
    students: 10, club: ['الكنز المفقود — مسابقة'],
    qiyami: [{ title: 'برّ الوالدين', by: 'ماجد الدوسري' }],
    notes: ['سعد العتيبي', 'فهد الزهراني'],
    reports: '5 من 5',
  });
  assert.deepEqual(s.map((x) => x.title), ['الحضور', 'النادي', 'القيمي', 'ملاحظات سلوكية', 'تقارير القادة']);
  assert.deepEqual(s[2].rows[0], ['برّ الوالدين', 'ماجد الدوسري']);
  assert.equal(s[3].rows[0][1], '2');
  assert.ok(s[3].lines[0].includes('سعد العتيبي · فهد الزهراني'));
  assert.equal(s[4].rows[0][1], '5 من 5');
});

test('وقيميٌّ بلا ملقٍ يُكتب عنوانه ولا يُترك فارغًا', () => {
  const s = sheetSections({ qiyami: [{ title: 'برّ الوالدين', by: '' }] });
  assert.equal(s[0].rows[0][1], '—');
});

test('وما حُجب لا يُطبع له صندوق', () => {
  const s = sheetSections({ students: 3, qiyami: [], notes: [], reports: '' });
  assert.deepEqual(s.map((x) => x.title), ['الحضور']);
});

test('وصفحتان في ملفٍ واحد: العدّ صحيح وجدول المواضع يدلّ عليها', () => {
  const jpeg = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 1, 2, 3, 0xFF, 0xD9]);
  const pdf = pdfFromJpegs([jpeg, jpeg], { width: 100, height: 140, title: 'ورقتان' });
  const txt = Buffer.from(pdf).toString('latin1');
  assert.ok(txt.includes('/Count 2'), 'صفحتان');
  assert.ok(txt.includes('/Kids [3 0 R 6 0 R]'), 'وكلٌّ تشير إلى كائنها');
  // جدول المواضع يدلّ على مواضع الكائنات حقًّا — وإلا فُتح الملفُّ «تالفًا»
  const start = Number(/startxref\n(\d+)/.exec(txt)[1]);
  assert.equal(txt.slice(start, start + 4), 'xref');
  const offsets = [...txt.slice(start).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
  offsets.forEach((off, i) => {
    assert.equal(txt.slice(off, off + `${i + 1} 0 obj`.length), `${i + 1} 0 obj`);
  });
  assert.equal(offsets.length, 3 + 2 * 3 - 1 + 1, 'كائنٌ للفهرس وآخر للصفحات وثلاثةٌ لكل صفحة ومعلوماتٌ');
});

test('وصفحةٌ واحدة تبقى كما كانت', () => {
  const jpeg = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 1, 0xFF, 0xD9]);
  const txt = Buffer.from(pdfFromJpeg(jpeg, { width: 10, height: 14 })).toString('latin1');
  assert.ok(txt.includes('/Count 1'));
  assert.ok(txt.includes('/Kids [3 0 R]'));
});

/* ------------------------------ تقسيم الصفحات ------------------------------ */

test('ما يسع صفحةً يبقى فيها', () => {
  const secs = [{ title: 'أ', rows: [[1, 2]] }, { title: 'ب', lines: ['x'] }];
  const pages = paginate(secs, 2000);
  assert.equal(pages.length, 1);
  assert.deepEqual(pages[0].map((x) => x.title), ['أ', 'ب']);
});

test('والقسم الطويل يُشقّ ويكمل بعنوانه و«تتمة» — فما يُقصّ عند العاشر', () => {
  const lines = Array.from({ length: 40 }, (_, i) => 'طالب ' + (i + 1));
  const pages = paginate([{ title: 'الطلاب', lines }], 600);
  assert.ok(pages.length > 1, 'انقسم');
  assert.equal(pages[0][0].title, 'الطلاب');
  assert.equal(pages[1][0].title, 'الطلاب — تتمة');
  const all = pages.flatMap((pg) => pg.flatMap((sec) => sec.lines || []));
  assert.deepEqual(all, lines, 'ولا يسقط سطرٌ واحد');
});

test('وصفوفُ القسم تُشقّ كذلك', () => {
  const rows = Array.from({ length: 30 }, (_, i) => ['س' + i, String(i)]);
  const pages = paginate([{ title: 'جدول', rows }], 500);
  const all = pages.flatMap((pg) => pg.flatMap((sec) => sec.rows || []));
  assert.equal(all.length, 30);
});

test('ولا يُرجَع فارغًا بلا أقسام', () => {
  assert.deepEqual(paginate([], 800), [[]]);
  assert.deepEqual(paginate(null, 800), [[]]);
});

/* ------------------------------ جدول التقارير ------------------------------ */

const tbl = {
  fields: [{ id: 'comp', label: 'المسابقة' }, { id: 'league', label: 'الدوري' }],
  rows: [
    { user: { id: 'b', name: 'عبدالله' }, wrote: true,
      cells: [{ text: 'أقمنا الكنز…', full: 'أقمنا الكنز المفقود بعد الفسحة' }, { text: 'لا يوجد', full: 'لا يوجد' }] },
    { user: { id: 'c', name: 'سعود' }, wrote: false, cells: [] },
  ],
};

test('صندوق التقارير يصير جدولًا بأعمدة التقرير نفسها', () => {
  const s = sheetSections({ reports: '1 من 2', reportTable: tbl });
  const box = s.find((x) => x.title === 'تقارير القادة');
  assert.deepEqual(box.cols.map((c) => c.label), ['القائد', 'المسابقة', 'الدوري']);
  assert.equal(box.rows[0][1], '1 من 2', 'والعدّاد فوقه كما كان');
  assert.equal(box.grid.length, 2);
});

test('وتأخذ الخليّة نصَّ صاحبها كاملًا لا مقتطعًا — الورقة أوسع من الجوّال', () => {
  const box = sheetSections({ reportTable: tbl }).find((x) => x.title === 'تقارير القادة');
  assert.equal(box.grid[0][1].t, 'أقمنا الكنز المفقود بعد الفسحة');
  assert.ok(!box.grid[0][1].t.includes('…'));
});

test('ومن لم يكتب يمتدّ سطرُه على الأعمدة', () => {
  const box = sheetSections({ reportTable: tbl }).find((x) => x.title === 'تقارير القادة');
  assert.equal(box.grid[1][0].t, 'سعود');
  assert.equal(box.grid[1][1].t, 'ما كتب تقريره');
  assert.equal(box.grid[1][1].span, 2, 'يمتدّ على الخانتين');
});

test('و«لا يوجد» تُرمَّد ولا تُمحى — قالها فيُكتب أنه قالها', () => {
  const box = sheetSections({ reportTable: tbl }).find((x) => x.title === 'تقارير القادة');
  assert.equal(box.grid[0][2].t, 'لا يوجد');
  assert.equal(box.grid[0][2].dim, true);
});

test('وبلا جدولٍ يبقى العدّاد وحده، وبلا الاثنين لا صندوق', () => {
  const only = sheetSections({ reports: '3 من 5' }).find((x) => x.title === 'تقارير القادة');
  assert.equal(only.rows[0][1], '3 من 5');
  assert.equal(only.grid, undefined);
  assert.equal(sheetSections({ students: 3 }).length, 1);
});

/** والجدولُ يُقاس مع ترويسته: صفٌّ زائدٌ في كل صفحة. */
test('والجدول الطويل يُشقّ، وترويستُه تُعاد فوق تتمّته', () => {
  const grid = Array.from({ length: 40 }, (_, i) => [{ t: 'طالب ' + (i + 1) }, { t: String(i) }]);
  const cols = [{ label: 'الطالب', w: 60 }, { label: 'حفظ', w: 40 }];
  const pages = paginate([{ title: 'الطلاب', cols, grid }], 700);
  assert.ok(pages.length > 1, 'انقسم');
  assert.equal(pages[1][0].title, 'الطلاب — تتمة');
  assert.deepEqual(pages[1][0].cols, cols, 'والأعمدة معه، فما تُقرأ أرقامٌ بلا عناوين');
  const all = pages.flatMap((pg) => pg.flatMap((sec) => sec.grid || []));
  assert.equal(all.length, 40, 'ولا يسقط صفّ');
});

/* ------------------------------ شقّ السطر ------------------------------ */

/** قياسٌ مصطنع: كل حرفٍ عشرة — يكفي لاختبار المنطق بلا كانفاس. */
const w10 = (s) => s.length * 10;

test('السطر الطويل يُشقّ على كلماته، والتتمّة معلَّمة', () => {
  const out = wrapLine(w10, 'مراجعة من الناس إلى النبأ وتثبيت من الملك', 150);
  assert.ok(out.length > 1, 'انشقّ');
  assert.equal(out[0].cont, false);
  assert.ok(out.slice(1).every((x) => x.cont), 'ما بعد الأول تتمّة');
  assert.equal(out.map((x) => x.t).join(' '), 'مراجعة من الناس إلى النبأ وتثبيت من الملك', 'ولا تسقط كلمة');
  assert.ok(out.every((x) => w10(x.t) <= 150 || !x.t.includes(' ')), 'وكلٌّ يسع العرض');
});

test('وما يسع يبقى سطرًا واحدًا', () => {
  assert.deepEqual(wrapLine(w10, 'قصير', 500), [{ t: 'قصير', cont: false }]);
});

test('والكلمة الأطول من السطر لا تُكسر ولا تُسقط', () => {
  const out = wrapLine(w10, 'كلمةٌطويلةٌجدًّاماتنكسر بعدها', 50);
  assert.equal(out[0].t, 'كلمةٌطويلةٌجدًّاماتنكسر');
  assert.equal(out[1].t, 'بعدها');
});

test('والفارغ لا يصير سطرًا', () => {
  assert.deepEqual(wrapLine(w10, '   ', 100), []);
  assert.deepEqual(wrapLine(w10, null, 100), []);
});

test('واسم الملف لاتينيّ فما يُتجاهَل عند التنزيل', () => {
  assert.equal(sheetFileName('1448/03/05'), 'faydh-report-1448-03-05.pdf');
  assert.equal(sheetFileName(''), 'faydh-report-week.pdf');
  assert.ok(/^[\x20-\x7E]+$/.test(sheetFileName('الجمعة')));
});

console.log(`\n✅ ${passed} اختبارًا لورقة التقرير\n`);
