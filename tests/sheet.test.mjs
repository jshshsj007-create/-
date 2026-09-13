/**
 * ورقة التقرير: غلافُ الـPDF وأقسامُ الورقة.
 *
 * الرسمُ نفسه يحتاج كانفاسًا فيُفحَص بالمتصفّح، وما يُختبر هنا ما يُحسب بلا
 * رسم: بنيةُ الملف — أن يبدأ بعلامته، وأن تدلّ مواضعُ كائناته على مواضعها
 * حقًّا (وهذا ما يكسر الملفَّ إن غلط بايتٌ واحد)، وأن تُطوى الأقسامُ الغائبة.
 */
import assert from 'node:assert/strict';
import { pdfFromJpeg, sheetSections, sheetFileName } from '../src/sheet.js';

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

test('واسم الملف لاتينيّ فما يُتجاهَل عند التنزيل', () => {
  assert.equal(sheetFileName('1448/03/05'), 'faydh-report-1448-03-05.pdf');
  assert.equal(sheetFileName(''), 'faydh-report-week.pdf');
  assert.ok(/^[\x20-\x7E]+$/.test(sheetFileName('الجمعة')));
});

console.log(`\n✅ ${passed} اختبارًا لورقة التقرير\n`);
