/**
 * حارس الساعة.
 *
 * الضياعُ يصرخ، والخللُ يسكت. فهذي الاختبارات تحرس الناظر: أن يرى ما يسكت،
 * وألّا يصرخ بلا شيء — فحارسٌ ينبح كل يومٍ بلا سببٍ يُطفأ بعد أسبوع، ثم
 * ينبح يوم الحاجة فلا يسمعه أحد.
 */
import assert from 'node:assert/strict';
import { checkAll, worst, dataSize, sizeText, SIZE_WALL, SIZE_WARN } from '../src/watch.js';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('  ✓ ' + name); };

const fresh = Date.now() - 3600000;
const ids = (d, extra) => checkAll(d, { backupAt: fresh, ...extra }).map((r) => r.id);
const row = (d, id, extra) => checkAll(d, { backupAt: fresh, ...extra }).find((r) => r.id === id);

/* ---------------------- لا ينبح بلا سبب ---------------------- */

test('بياناتٌ سليمة: ما يقول شيئًا', () => {
  assert.deepEqual(ids({ programs: [], students: [] }), []);
});

test('وبياناتٌ فاضية لا تكسره', () => {
  assert.deepEqual(ids(null), []);
  assert.deepEqual(ids({}), []);
});

/* ---------------------- ما يراه ---------------------- */

test('إيصالٌ برقمٍ مكرّر — مالٌ يُحسب مرتين', () => {
  const d = { programs: [{ id: 'p', name: 'ر', weeks: [{ id: 'w', participants: [
    { id: 'x1', name: 'سعد', ref: 'R-14' }, { id: 'x2', name: 'خالد', ref: 'R-14' },
    { id: 'x3', name: 'ماجد', ref: 'R-15' }] }] }] };
  const r = row(d, 'refs');
  assert.equal(r.count, 1);
  assert.ok(r.hints[0].includes('سعد'));
  assert.ok(r.hints[0].includes('خالد'));
});

test('وتوزيعٌ زاد عن الصافي — الدفتر يقول ما ليس فيه', () => {
  const d = { programs: [{ id: 'p', name: 'الرواد', weeks: [{ id: 'w', name: 'الأولى',
    participants: [{ id: 'x', amount: 100 }], collections: [], expenseItems: [],
    schoolPayouts: [{ id: 's', amount: 80 }], faidPayouts: [{ id: 'f', amount: 80 }] }] }] };
  const r = row(d, 'over');
  assert.equal(r.tone, 'bad');
  assert.ok(r.hints[0].includes('الرواد'));
});

test('ولا يشتكي من فرق ريالٍ واحد — ذاك تقريبٌ لا خلل', () => {
  const d = { programs: [{ id: 'p', name: 'ر', weeks: [{ id: 'w',
    participants: [{ id: 'x', amount: 100 }], collections: [], expenseItems: [],
    schoolPayouts: [{ id: 's', amount: 50 }], faidPayouts: [{ id: 'f', amount: 51 }] }] }] };
  assert.equal(ids(d).includes('over'), false);
});

test('ومبلغٌ سالب — خطأُ كتابةٍ غالبًا', () => {
  const d = { faidAdjustments: [{ id: 'a', amount: -300 }] };
  assert.equal(row(d, 'neg').count, 1);
});

test('ومشتركٌ ما له يومٌ قائم — يختفي من كل حضورٍ وهو دافع', () => {
  const d = { programs: [{ id: 'p', name: 'مخيم', type: 'مجمع',
    weeks: [{ id: 'w1' }],
    participants: [{ id: 'x', name: 'سعد', days: ['wGone'] }, { id: 'y', name: 'فهد', days: ['w1'] }] }] };
  const r = row(d, 'lost');
  assert.equal(r.count, 1);
  assert.ok(r.hints[0].includes('سعد'));
});

test('ومن بلا أيامٍ أصلًا ليس ضائعًا: غيابُها معناه «كل الأيام»', () => {
  const d = { programs: [{ id: 'p', name: 'مخيم', type: 'مجمع', weeks: [{ id: 'w1' }],
    participants: [{ id: 'x', name: 'سعد' }] }] };
  assert.equal(ids(d).includes('lost'), false);
});

test('ومشتركٌ مربوطٌ بطالبٍ ما عاد موجودًا', () => {
  const d = { students: [{ id: 's1' }], programs: [{ id: 'p', name: 'ر', weeks: [{ id: 'w',
    participants: [{ id: 'x', name: 'سعد', studentId: 'sGone' }, { id: 'y', studentId: 's1' }] }] }] };
  assert.equal(row(d, 'orphans').count, 1);
});

test('ورابطٌ مفتوحٌ لا يقبل أحدًا — منشورٌ ويُقرأ «ما فتح بعد»', () => {
  const d = { programs: [{ id: 'p', name: 'خريف', weeks: [{ id: 'w', status: 'مفتوح' }],
    signup: { enabled: true, price: 50, allowPerDay: true, openWeeks: [], packages: [] } }] };
  assert.deepEqual(row(d, 'dead').hints, ['خريف']);
});

test('ولو بقيت باقةٌ لها أيام ما اشتكى', () => {
  const d = { programs: [{ id: 'p', name: 'خريف', weeks: [{ id: 'w', status: 'مفتوح' }],
    signup: { enabled: true, price: 0, openWeeks: [], packages: [{ id: 'k', name: 'الموسم' }] } }] };
  assert.equal(ids(d).includes('dead'), false);
});

test('ورابطٌ مقفولٌ ما يُشتكى منه: إقفالُه قرارُك', () => {
  const d = { programs: [{ id: 'p', name: 'خريف', weeks: [],
    signup: { enabled: false, price: 0, openWeeks: [], packages: [] } }] };
  assert.equal(ids(d).includes('dead'), false);
});

/* ---------------------- الحجم والنسخة ---------------------- */

test('الحجم يُقاس، ويُقال قبل السقف لا عنده', () => {
  assert.ok(SIZE_WARN < SIZE_WALL);
  assert.ok(dataSize({ a: 1 }) > 0);
  assert.equal(dataSize(null), 4);   // "null"
  assert.ok(sizeText(2 * 1024 * 1024).includes('م.ب'));
  assert.ok(sizeText(3000).includes('ك.ب'));
});

test('وما صارت نسخةٌ بعد: يُقال', () => {
  assert.equal(checkAll({}, {}).some((r) => r.id === 'backup'), true);
});

test('ونسخةُ اليوم لا يُشتكى منها', () => {
  assert.equal(ids({}).includes('backup'), false);
});

test('ونسخةٌ قديمة يُشتكى منها', () => {
  const old = Date.now() - 5 * 86400000;
  assert.equal(checkAll({}, { backupAt: old }).some((r) => r.id === 'backup'), true);
});

/* ---------------------- ومطابقة الدفترين ---------------------- */

test('ما يقوله الدفتران يدخل الفحص', () => {
  const r = checkAll({}, { backupAt: fresh, missingMoney: 3, missingMoneySum: 450 });
  const m = r.find((x) => x.id === 'mal');
  assert.equal(m.tone, 'bad');
  assert.ok(m.hints[0].includes('450'));
});

/* ---------------------- أشدُّ ما وُجد ---------------------- */

test('أشدُّ ما وُجد يُقال أولًا، ولو جاء آخرًا في القائمة', () => {
  const rows = [{ id: 'a', tone: 'warn' }, { id: 'b', tone: 'bad' }, { id: 'c', tone: 'info' }];
  assert.equal(worst(rows).id, 'b');
  assert.equal(worst([{ id: 'a', tone: 'warn' }]).id, 'a');
  assert.equal(worst([]), null);
});

console.log(`\n✅ ${passed} اختبارًا لحارس الساعة\n`);
