/**
 * الأثر والصندوق. الأثر يُقرأ ليُسأل عنه صاحبه، فاسمٌ خاطئ فيه أسوأ من لا اسم.
 * والصندوق فيه سجلات محذوفة — لو غلط في المدة أو الترتيب ضاعت على صاحبها.
 */
import assert from 'node:assert/strict';
import { stampNew, stampEdit, stamped, traceText, agoText } from '../src/trace.js';
import { trashed, pruned, sortedTrash, daysLeft, leftText, kindLabel, TRASH_DAYS } from '../src/trash.js';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('  ✓ ' + name); };

const DAY = 24 * 3600 * 1000;
const fahd = { id: 'u1', name: 'فهد' };
const abdullah = { id: 'u2', name: 'عبدالله' };

/* ------------------------------- الأثر ------------------------------- */

test('ختم الإضافة يحمل الاسم والمعرّف والوقت', () => {
  const s = stampNew(fahd);
  assert.equal(s.addedBy, 'فهد');
  assert.equal(s.addedById, 'u1');
  assert.ok(s.addedAt > 0);
});

test('بلا مستخدم ما نخترع اسمًا', () => {
  assert.equal(stampNew(null).addedBy, '');
  assert.equal(stampEdit(undefined).editedBy, '');
});

test('الإضافة تختم addedBy، والتعديل يختم editedBy ولا يمس الأول', () => {
  const rec = stamped({ id: 'x', name: 'برنامج' }, fahd, true);
  assert.equal(rec.addedBy, 'فهد');
  assert.equal(rec.editedBy, undefined);
  const after = stamped(rec, abdullah, false);
  assert.equal(after.addedBy, 'فهد', 'من أضافه ما يتبدّل أبدًا');
  assert.equal(after.editedBy, 'عبدالله');
});

test('التعديل المتكرر يبقي آخر من مسّ السجل', () => {
  let rec = stamped({ id: 'x' }, fahd, true);
  rec = stamped(rec, abdullah, false);
  rec = stamped(rec, fahd, false);
  assert.equal(rec.editedBy, 'فهد');
});

test('نص الأثر: أضافه وحده، ثم أضافه وعدّله', () => {
  assert.equal(traceText({ addedBy: 'فهد', addedAt: 100 }), 'أضافه فهد');
  assert.equal(
    traceText({ addedBy: 'فهد', addedAt: 100, editedBy: 'عبدالله', editedAt: 200 }),
    'أضافه فهد · عدّله عبدالله',
  );
});

test('التعديل ما يُذكر إلا لو صار بعد الإضافة فعلًا', () => {
  // وإلا صار كل سجل «معدَّلًا» وضاعت قيمة الكلمة
  assert.equal(traceText({ addedBy: 'فهد', addedAt: 200, editedBy: 'فهد', editedAt: 200 }), 'أضافه فهد');
});

test('السجل القديم بلا ختم ما له أثر — والصمت أصدق من اسم مكذوب', () => {
  assert.equal(traceText({ id: 'old', name: 'برنامج قديم' }), '');
  assert.equal(traceText(null), '');
});

test('التعديل على سجل قديم ما يخترع له مُضيفًا، ويذكر المعدِّل وحده', () => {
  // «عدّله فهد» صدق ونافع، وسكوتنا عن المُضيف لأننا لا نعرفه — لا لأننا نخفيه
  const rec = stamped({ id: 'old' }, fahd, false);
  assert.equal(rec.addedBy, undefined);
  assert.equal(traceText(rec), 'عدّله فهد');
});

/* ------------------------------- العمر ------------------------------- */

test('العمر بالعربية على مدرجه', () => {
  const now = 1_000_000_000_000;
  const at = (ms) => agoText(now - ms, now);
  assert.equal(at(10 * 1000), 'الآن');
  assert.equal(at(30 * 60 * 1000), 'قبل 30 دقيقة');
  assert.equal(at(2 * 3600 * 1000), 'قبل ساعتين');
  assert.equal(at(1 * DAY), 'أمس');
  assert.equal(at(3 * DAY), 'قبل 3 أيام');
  assert.equal(at(21 * DAY), 'قبل 3 أسابيع');
  assert.equal(at(60 * DAY), 'قبل شهرين');
});

test('بلا وقت ما فيه عمر', () => {
  assert.equal(agoText(0), '');
  assert.equal(agoText(undefined), '');
});

/* ------------------------------ الصندوق ------------------------------ */

test('المحذوف يحمل نوعه واسمه ومن حذفه', () => {
  const t = trashed('program', { id: 'p1', name: 'جمعة الرواد' }, { by: 'فهد' });
  assert.equal(t.kind, 'program');
  assert.equal(t.label, 'جمعة الرواد');
  assert.equal(t.by, 'فهد');
  assert.equal(t.item.id, 'p1');
  assert.ok(t.at > 0);
});

test('بلا اسم يأخذ اسم نوعه، ولا يبقى بلا عنوان', () => {
  assert.equal(trashed('trip', { id: 't1' }).label, 'سفرة');
  assert.equal(kindLabel('khayrSession'), 'جلسة تسميع');
  assert.equal(kindLabel('نوع-ما-نعرفه'), 'سجل');
});

test('المشارك يحمل مكانه، وإلا ما عرفنا وين نرجّعه', () => {
  const t = trashed('participant', { id: 'x' }, { where: { programId: 'p1', weekId: 'w2' } });
  assert.deepEqual(t.where, { programId: 'p1', weekId: 'w2' });
});

test('لكل محذوف معرّف يخصّه', () => {
  const ids = new Set(Array.from({ length: 50 }, () => trashed('trip', {}).id));
  assert.equal(ids.size, 50);
});

test('ما مضى عليه الشهر يسقط، وما دونه يبقى', () => {
  const now = 1_000_000_000_000;
  const box = [
    { id: 'a', at: now - 1 * DAY },
    { id: 'b', at: now - (TRASH_DAYS - 1) * DAY },
    { id: 'c', at: now - (TRASH_DAYS + 1) * DAY },
  ];
  assert.deepEqual(pruned(box, now).map((t) => t.id), ['a', 'b']);
});

test('الصندوق الفاضي ما ينكسر', () => {
  assert.deepEqual(pruned(undefined), []);
  assert.deepEqual(sortedTrash(null), []);
});

test('الأحدث أولًا — اللي حذفته قبل شوي هو اللي تدوّره', () => {
  const box = [{ id: 'قديم', at: 100 }, { id: 'جديد', at: 300 }, { id: 'وسط', at: 200 }];
  assert.deepEqual(sortedTrash(box).map((t) => t.id), ['جديد', 'وسط', 'قديم']);
});

test('الترتيب ما يمس القائمة الأصلية', () => {
  const box = [{ id: 'a', at: 100 }, { id: 'b', at: 300 }];
  sortedTrash(box);
  assert.equal(box[0].id, 'a');
});

test('كم بقي له قبل ما يمضي', () => {
  const now = 1_000_000_000_000;
  assert.equal(daysLeft({ at: now }, now), TRASH_DAYS);
  assert.equal(daysLeft({ at: now - (TRASH_DAYS - 1) * DAY }, now), 1);
  assert.equal(daysLeft({ at: now - 99 * DAY }, now), 0, 'ما ينزل تحت الصفر');
  assert.equal(leftText({ at: now - (TRASH_DAYS - 1) * DAY }, now), 'يمضي غدًا');
});

console.log(`\n✅ ${passed} اختبارًا للأثر وصندوق المحذوفات\n`);
