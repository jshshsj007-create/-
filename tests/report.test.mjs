/**
 * نصّ تقرير اليوم.
 *
 * يُلصق في قروبٍ ويقرؤه شريكٌ على جوّاله، فالمقصود منه أن يُقرأ لا أن يُفكّ.
 * والاختبار يحرس شيئين: أن يُطوى ما غاب (فلا عنوانَ فوق فراغ)، وأن يبقى
 * الترتيب — عنوانٌ، ثم حضور، ثم مال، ثم توزيع، ثم نادٍ.
 */
import assert from 'node:assert/strict';
import { weekReport } from '../src/report.js';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('  ✓ ' + name); };

const full = () => weekReport({
  week: 'الأسبوع الأول', program: 'خريف الرواد', term: 'الترم الأول 1448 هـ',
  date: '1448/03/05',
  students: 58, present: 56, enrolled: 58,
  money: { revenue: 2365, expenses: 250, net: 2115, school: 1058, faid: 1057 },
  club: ['الكنز المفقود — مسابقة', 'دوري الجمعة — دوري · فريق النسور'],
});

test('الرأس: اسم اليوم ثم البرنامج والترم ثم التاريخ', () => {
  const lines = full().split('\n');
  assert.equal(lines[0], 'تقرير الأسبوع الأول');
  assert.equal(lines[1], 'خريف الرواد · الترم الأول 1448 هـ');
  assert.equal(lines[2], 'التاريخ: 1448/03/05');
});

test('الأقسام بترتيبها، ولكلٍّ عنوانه', () => {
  const t = full();
  const at = (s) => t.indexOf(s);
  assert.ok(at('— الحضور —') > 0);
  assert.ok(at('— الحضور —') < at('— المالية —'));
  assert.ok(at('— المالية —') < at('— التوزيع —'));
  assert.ok(at('— التوزيع —') < at('— النادي —'));
});

test('الحاضرون ومعهم نسبتهم', () => {
  assert.ok(full().includes('الحاضرون: 56 من 58 · 97٪'));
});

test('المبالغ بفاصلة الآلاف وبالريال', () => {
  const t = full();
  assert.ok(t.includes('الإيراد: 2,365 ر.س'));
  assert.ok(t.includes('الصافي: 2,115 ر.س'));
  assert.ok(t.includes('نصيب فريق فيض: 1,057 ر.س'));
});

test('والتوزيع قسمٌ مستقل لا ذيلٌ للمالية', () => {
  const t = full();
  const mal = t.slice(t.indexOf('— المالية —'), t.indexOf('— التوزيع —'));
  assert.ok(!mal.includes('نصيب'), 'ما تسرّب النصيب إلى قسم المالية');
});

test('ما سُوّي من النادي يدخل النصّ — فما يُكتب بيد', () => {
  const t = full();
  assert.ok(t.includes('الكنز المفقود — مسابقة'));
  assert.ok(t.includes('دوري الجمعة — دوري · فريق النسور'));
});

/* ----------------------------- وما غاب يُطوى ----------------------------- */

test('بلا صلاحية مالية: لا مالية ولا توزيع، ولا عنوانٌ فارغ', () => {
  const t = weekReport({ week: 'الأول', program: 'خريف', students: 10, present: 9, enrolled: 10, money: null });
  assert.ok(!t.includes('المالية'));
  assert.ok(!t.includes('التوزيع'));
  assert.ok(t.includes('— الحضور —'));
});

test('وبلا نادٍ لا يظهر عنوانه', () => {
  assert.ok(!weekReport({ week: 'الأول', students: 3, club: [] }).includes('النادي'));
  assert.ok(!weekReport({ week: 'الأول', students: 3 }).includes('النادي'));
});

test('واليوم السريع بلا حضور: عددٌ وحده', () => {
  const t = weekReport({ week: 'الأول', students: 40 });
  assert.ok(t.includes('الطلاب المسجلون: 40'));
  assert.ok(!t.includes('الحاضرون'));
});

test('وبلا تاريخٍ لا يُكتب سطرٌ فارغ', () => {
  assert.ok(!weekReport({ week: 'الأول', students: 1 }).includes('التاريخ'));
});

test('وبرنامجٌ بلا ترم: نقطةُ الفصل لا تبقى وحدها', () => {
  const t = weekReport({ week: 'الأول', program: 'خريف', students: 1 });
  assert.equal(t.split('\n')[1], 'خريف');
});

test('ولا ينكسر على فراغٍ كامل', () => {
  const t = weekReport();
  assert.equal(t, 'تقرير اليوم');
  assert.equal(weekReport({}).split('\n').length, 1);
});

test('والصفر مبلغٌ يُقال، لا يُطوى', () => {
  const t = weekReport({ week: 'الأول', money: { revenue: 0, expenses: 0, net: 0, school: 0, faid: 0 } });
  assert.ok(t.includes('الإيراد: 0 ر.س'));
});

test('وحضورٌ من صفرٍ مسجَّل ما يقسم على صفر', () => {
  const t = weekReport({ week: 'الأول', students: 0, present: 0, enrolled: 0 });
  assert.ok(t.includes('الحاضرون: 0 من 0'));
  assert.ok(!t.includes('٪'));
});

console.log(`\n✅ ${passed} اختبارًا لنصّ التقرير\n`);
