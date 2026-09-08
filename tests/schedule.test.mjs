/**
 * موعد النسخة الاحتياطية: المهمة تصحى كل ساعة، فالقرار كله هنا.
 * غلطة هنا تعني نسخة ما تصير أبدًا، أو تصير كل ساعة — والاثنان سيئان.
 */
import assert from 'node:assert/strict';
import { scheduleOf, dueNow, hourLabel, DEFAULT_SCHEDULE, MIN_GAP, scheduleText } from '../src/schedule.js';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('  ✓ ' + name); };

/** لحظة بتوقيت السعودية → ميلي ثانية UTC. */
const ksa = (iso) => Date.parse(iso + 'Z') - 3 * 60 * 60 * 1000;

test('بلا إعداد: جمعة الفجر', () => {
  assert.deepEqual(scheduleOf(undefined), DEFAULT_SCHEDULE);
  assert.deepEqual(scheduleOf({}), DEFAULT_SCHEDULE);
});

test('القيم الغلط ترجع للافتراضي بدل ما تعطّل النسخ', () => {
  assert.deepEqual(scheduleOf({ backupSchedule: { day: 9, hour: 44 } }), DEFAULT_SCHEDULE);
  assert.deepEqual(scheduleOf({ backupSchedule: { day: 'الجمعة', hour: null } }), DEFAULT_SCHEDULE);
});

test('اليوم صفر (الأحد) يُقبل ولا ينقلب للافتراضي', () => {
  assert.deepEqual(scheduleOf({ backupSchedule: { day: 0, hour: 0 } }), { day: 0, hour: 0, every: 0 });
});

test('تنفّذ في ساعتها بالضبط', () => {
  const s = { day: 5, hour: 4 };            // الجمعة ٤ ص
  assert.equal(dueNow(s, ksa('2026-08-28T04:00:00')), true, 'جمعة ٤ ص');
  assert.equal(dueNow(s, ksa('2026-08-28T04:59:00')), true, 'وفي أي دقيقة داخل الساعة');
  assert.equal(dueNow(s, ksa('2026-08-28T05:00:00')), false, 'ساعة بعدها لا');
  assert.equal(dueNow(s, ksa('2026-08-27T04:00:00')), false, 'خميس لا');
});

test('الوقت بتوقيتنا لا بتوقيت غرينتش', () => {
  const s = { day: 5, hour: 1 };            // الجمعة ١ ص عندنا = الخميس ١٠ م غرينتش
  assert.equal(dueNow(s, ksa('2026-08-28T01:00:00')), true);
  // نفس اللحظة بحساب غرينتش تطلع خميس، فلو حسبناها بغرينتش ما نفّذت
  assert.equal(new Date(ksa('2026-08-28T01:00:00')).getUTCDay(), 4);
});

test('ما تتكرر لو صحت المهمة مرتين', () => {
  const s = { day: 5, hour: 4 };
  const at = ksa('2026-08-28T04:00:00');
  assert.equal(dueNow(s, at, at - 60_000), false, 'صارت نسخة قبل دقيقة');
  assert.equal(dueNow(s, at, at - MIN_GAP - 1), true, 'وبعد الفاصل تصير عادي');
});

test('الأسبوع الجاي تصير من جديد', () => {
  const s = { day: 5, hour: 4 };
  const last = ksa('2026-08-28T04:00:00');
  assert.equal(dueNow(s, ksa('2026-09-04T04:00:00'), last), true);
});

test('الساعة تُقرأ كما ينطقها صاحبها', () => {
  assert.equal(hourLabel(0), '12 ص');
  assert.equal(hourLabel(4), '4 ص');
  assert.equal(hourLabel(12), '12 م');
  assert.equal(hourLabel(13), '1 م');
  assert.equal(hourLabel(23), '11 م');
});


/* ---------------- «كل كذا ساعة»: فجوةٌ أضيق من يوم ---------------- */

test('«كل أربع ساعات» تُقبل، وما عداها من الأعداد يُردّ إلى «يوم»', () => {
  assert.equal(scheduleOf({ backupSchedule: { every: 4 } }).every, 4);
  assert.equal(scheduleOf({ backupSchedule: { every: 6 } }).every, 6);
  assert.equal(scheduleOf({ backupSchedule: { every: 12 } }).every, 12);
  assert.equal(scheduleOf({ backupSchedule: { every: 3 } }).every, 0, 'عددٌ ما نعرفه');
  assert.equal(scheduleOf({ backupSchedule: { every: 'أربع' } }).every, 0);
});

test('وتُقاس من آخر نسخةٍ وقعت، لا من ساعةٍ في اليوم', () => {
  const s = scheduleOf({ backupSchedule: { every: 4 } });
  const H = 60 * 60 * 1000;
  const now = Date.UTC(2026, 8, 8, 17, 0);   // ساعةٌ ما اختارها أحد
  assert.equal(dueNow(s, now, now - 5 * H), true, 'مضت خمس');
  assert.equal(dueNow(s, now, now - 1 * H), false, 'ما مضت إلا واحدة');
  assert.equal(dueNow(s, now, 0), true, 'ما فيه نسخةٌ قبل');
});

test('و«كل أربع» لا يمنعها الحدُّ الأدنى القديم — كان يأكل ثلث نسخها', () => {
  const s = scheduleOf({ backupSchedule: { every: 4 } });
  const H = 60 * 60 * 1000;
  const now = Date.UTC(2026, 8, 8, 12, 0);
  // الحدُّ القديم ست ساعات؛ فلولا أنه صار يتبع الاختيار لَرُدّت هذي
  assert.equal(dueNow(s, now, now - 4 * H), true);
});

test('ودقيقةُ تأخّرٍ في صحوة المهمة ما تُفوّت نسخة', () => {
  const s = scheduleOf({ backupSchedule: { every: 4 } });
  const H = 60 * 60 * 1000;
  const now = Date.UTC(2026, 8, 8, 12, 0);
  assert.equal(dueNow(s, now, now - (4 * H - 5 * 60 * 1000)), true, 'ناقصةٌ خمس دقائق');
});

test('و«يوم» تبقى على حالها: يومٌ وساعةٌ كما كانت', () => {
  const s = scheduleOf({ backupSchedule: { day: -1, hour: 4, every: 0 } });
  const at4 = Date.UTC(2026, 8, 8, 1, 0);    // ٤ ص بتوقيت السعودية
  const at5 = Date.UTC(2026, 8, 8, 2, 0);
  assert.equal(dueNow(s, at4, 0), true);
  assert.equal(dueNow(s, at5, 0), false, 'مو ساعتها');
});

test('والموعد يُقرأ في سطر', () => {
  assert.equal(scheduleText({ day: -1, hour: 4, every: 0 }), 'كل يوم 4 ص');
  assert.equal(scheduleText({ day: 0, hour: 12, every: 0 }), 'كل الأحد 12 م');
  assert.equal(scheduleText({ day: -1, hour: 4, every: 4 }), 'كل أربع ساعات');
});

console.log(`\n✅ ${passed} اختبارًا لموعد النسخ\n`);
