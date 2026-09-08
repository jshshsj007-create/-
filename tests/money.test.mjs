/**
 * دفتر المال.
 *
 * سُئلت: «الحسابات المالية ماتروح؟ هذي مهمه، التطبيق عندي ابحط فيه كل شيء».
 * والجواب هنا: كل حركةٍ مالية تُفرد صفًّا بمفتاحٍ ثابت، فيكتبها الخادمُ في
 * دفترٍ لا يُمحى. وهذي الاختبارات تحرس ذلك الفرد: ما يفوته شيء، ولا يتكرّر
 * مفتاح، ولا يُعدّ المحذوفُ باليد ضائعًا.
 */
import assert from 'node:assert/strict';
import { moneyRows, moneyChanged, moneyMissing, moneySum, moneyKey, moneyPrint, MONEY_KINDS } from '../src/money.js';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('  ✓ ' + name); };

const keys = (d) => new Set(moneyRows(d).map((r) => r.key));
const kinds = (d) => moneyRows(d).map((r) => r.kind).sort();

/* ------------------------------ ما يُفرد ------------------------------ */

test('حركة حسابٍ في فيض تُفرد صفًّا', () => {
  const d = { faidAdjustments: [{ id: 'a1', accountId: 'acc', amount: 300, type: 'إيراد', note: 'تبرع' }] };
  const [r] = moneyRows(d);
  assert.equal(r.key, 'adj:a1');
  assert.equal(r.amount, 300);
  assert.equal(r.label, MONEY_KINDS.adj);
});

test('والتسليم من حسابٍ إلى حساب — بالحسابين معًا', () => {
  const d = { handovers: [{ id: 'h1', fromId: 'a', toId: 'b', amount: 500, at: 99 }] };
  const [r] = moneyRows(d);
  assert.equal(r.accountId, 'a');
  assert.equal(r.toId, 'b');
  assert.equal(r.at, 99);
});

test('وبنود دفتر اليوم الأربعة، كلٌّ باسمه', () => {
  const d = { programs: [{ id: 'p1', name: 'الرواد', weeks: [{
    id: 'w1', name: 'الجمعة الأولى',
    collections: [{ id: 'c1', amount: 100 }],
    expenseItems: [{ id: 'e1', amount: 40 }],
    schoolPayouts: [{ id: 's1', amount: 30 }],
    faidPayouts: [{ id: 'f1', amount: 30 }],
  }] }] };
  assert.deepEqual(kinds(d), ['collection', 'expense', 'faid', 'school']);
});

test('وأين وقعت الحركة جزءٌ منها — وإلا ما نفعت يوم تُقرأ', () => {
  const d = { programs: [{ id: 'p1', name: 'الرواد', weeks: [{ id: 'w1', name: 'الجمعة الأولى', expenseItems: [{ id: 'e1', amount: 40 }] }] }] };
  const [r] = moneyRows(d);
  assert.equal(r.where.programName, 'الرواد');
  assert.equal(r.where.weekName, 'الجمعة الأولى');
});

test('ودفتر البرنامج المجمّع يُقرأ كما يُقرأ دفتر اليوم', () => {
  const d = { programs: [{ id: 'p1', name: 'مخيم', type: 'مجمع', expenseItems: [{ id: 'e1', amount: 90 }], weeks: [] }] };
  const [r] = moneyRows(d);
  assert.equal(r.key, 'expense:e1');
  assert.equal(r.where.weekId, '');
});

test('والترحيل مفتاحُه دفعتُه، فما يتكرّر لو أُعيد حسابه', () => {
  const d = { programs: [{ id: 'p1', name: 'ر', weeks: [{ id: 'w1', faidTransfer: { batchId: 'b7', amount: 250, date: '2026-01-01' } }] }] };
  const [r] = moneyRows(d);
  assert.equal(r.key, 'transfer:b7');
  assert.equal(r.amount, 250);
});

test('والاشتراك مالٌ كذلك — سواء جاء من الرابط أو أُدخل باليد', () => {
  const d = { programs: [{ id: 'p1', name: 'ر', weeks: [{ id: 'w1', participants: [
    { id: 'x1', name: 'سعد', amount: 30, accountId: 'acc' },
    { id: 'x2', name: 'من ما دفع', amount: 0 },
  ] }] }] };
  const rows = moneyRows(d);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].note, 'سعد');
});

test('والرحلة إيرادها ومصروفها', () => {
  const d = { trips: [{ id: 't1', name: 'العلا', incomeItems: [{ id: 'i1', name: 'اشتراكات', amount: 900 }], expenseItems: [{ id: 'o1', name: 'باص', amount: 400 }] }] };
  assert.deepEqual(kinds(d), ['tripIn', 'tripOut']);
  assert.equal(moneySum(moneyRows(d)), 1300);
});

test('والدفتر السريع رقمٌ واحد، فمفتاحُه دفترُه', () => {
  const d = { programs: [{ id: 'p1', name: 'ر', weeks: [{ id: 'w1', quickRevenue: 600 }] }] };
  assert.equal(moneyRows(d)[0].key, 'quick:p1:w1');
});

test('وبيانات فاضية لا تكسر شيئًا', () => {
  assert.deepEqual(moneyRows(null), []);
  assert.deepEqual(moneyRows({}), []);
  assert.deepEqual(moneyRows({ programs: [{ id: 'p', weeks: [null] }] }), []);
});

test('وما بلا معرّفٍ لا يُكتب: مفتاحٌ بلا هويّةٍ يدهس غيره', () => {
  const d = { faidAdjustments: [{ amount: 100 }, { id: '', amount: 50 }] };
  assert.deepEqual(moneyRows(d), []);
});

test('والمفاتيح لا تتصادم: النوع في أولها', () => {
  // معرّفٌ واحد في نوعين — يقع لو تولّدت المعرّفات في موضعين
  const d = {
    faidAdjustments: [{ id: 'same', amount: 10 }],
    handovers: [{ id: 'same', fromId: 'a', toId: 'b', amount: 20 }],
  };
  assert.equal(keys(d).size, 2);
  assert.equal(moneyKey('adj', 'same'), 'adj:same');
});

/* --------------------------- ما جدّ أو تبدّل --------------------------- */

const one = (amount, note = '') => ({ faidAdjustments: [{ id: 'a1', accountId: 'acc', amount, note }] });

test('حفظةٌ ما غيّرت مالًا لا تكتب في الدفتر شيئًا', () => {
  assert.deepEqual(moneyChanged(one(300), one(300)), []);
});

test('والجديد يُكتب', () => {
  const after = { faidAdjustments: [{ id: 'a1', accountId: 'acc', amount: 300, note: '' }, { id: 'a2', amount: 50 }] };
  const fresh = moneyChanged(one(300), after);
  assert.equal(fresh.length, 1);
  assert.equal(fresh[0].id, 'a2');
});

test('وتبدّلُ المبلغ يُكتب — فالتحرير حركةٌ تُسجَّل', () => {
  assert.equal(moneyChanged(one(300), one(320)).length, 1);
});

test('وتبدّلُ الملاحظة كذلك، فهي التي تُقرأ يوم يُراجَع', () => {
  assert.equal(moneyChanged(one(300), one(300, 'من أبو فارس')).length, 1);
});

test('والحذف لا يُكتب: الدفتر يحفظ ما وقع، والحذفُ لا يمحو ما وقع', () => {
  assert.deepEqual(moneyChanged(one(300), { faidAdjustments: [] }), []);
});

test('وأول تشغيلٍ يرى كلَّ شيءٍ جديدًا', () => {
  assert.equal(moneyChanged(null, one(300)).length, 1);
});

test('والبصمة لا تلتفت لما لا يُغيّر مالًا', () => {
  const a = { kind: 'expense', amount: 40, accountId: 'x', note: 'باص' };
  assert.equal(moneyPrint({ ...a, where: { programName: 'ر' } }), moneyPrint({ ...a, where: { programName: 'غيره' } }));
});

/* ------------------------------ ما ضاع ------------------------------ */

test('حركةٌ في الدفتر ولا أثر لها = ضاعت', () => {
  const led = moneyRows(one(300));
  assert.equal(moneyMissing(led, { faidAdjustments: [] }).length, 1);
  assert.equal(moneySum(moneyMissing(led, { faidAdjustments: [] })), 300);
});

test('وما زال موجودًا لا يُعدّ ضائعًا', () => {
  assert.deepEqual(moneyMissing(moneyRows(one(300)), one(300)), []);
});

test('وما حذفتَه بيدك ليس ضائعًا — الصندوق هو الفرق بين القرار والعطب', () => {
  const led = moneyRows(one(300));
  assert.deepEqual(moneyMissing(led, { faidAdjustments: [] }, new Set(['a1'])), []);
});

test('والمجموع يُقال بالريال، فالسؤال الأول «كم؟» لا «كم سطرًا؟»', () => {
  const led = moneyRows({ faidAdjustments: [{ id: 'a1', amount: 300 }, { id: 'a2', amount: 200 }] });
  assert.equal(moneySum(moneyMissing(led, {})), 500);
});

console.log(`\n✅ ${passed} اختبارًا لدفتر المال\n`);
