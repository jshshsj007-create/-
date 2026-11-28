/**
 * السمع الدقيق: الدوال الخالصة فقط (التقطيع وتغيير التردّد). النموذج نفسه يُفحص في المتصفح لا هنا.
 * التقطيع يقرّر متى نرسل للنموذج: قطعٌ مبكّر يشطر الكلمة، ومتأخّرٌ يؤخّر «أعد» ثوانيَ.
 */
import assert from 'node:assert/strict';
import { resample, createSegmenter } from '../src/accurate.js';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('  ✓ ' + name); };

const RATE = 16000, BLOCK = 4096;
const tone = (sec, amp = 0.2) => Array.from({ length: Math.ceil((sec * RATE) / BLOCK) }, (_, b) => Float32Array.from({ length: BLOCK }, (_, i) => amp * Math.sin((2 * Math.PI * 300 * (b * BLOCK + i)) / RATE)));
const quiet = (sec) => Array.from({ length: Math.ceil((sec * RATE) / BLOCK) }, () => new Float32Array(BLOCK).fill(0.001));
const run = (parts, opts = {}) => {
  const got = [];
  const seg = createSegmenter({ rate: RATE, onSegment: (a) => got.push(a.length / RATE), ...opts });
  parts.flat().forEach((b) => seg.feed(b));
  return { got, seg };
};

test('تغيير التردّد: ٤٨ ألفًا إلى ١٦ ألفًا يحفظ الطول والقيمة الثابتة', () => {
  const x = new Float32Array(48000).fill(0.5);
  const y = resample(x, 48000, 16000);
  assert.equal(y.length, 16000);
  assert.ok(Math.abs(y[100] - 0.5) < 1e-6);
  assert.equal(resample(x, 16000, 16000), x);
  assert.equal(resample(new Float32Array(44100), 44100, 16000).length, 16000);
});

test('كلامٌ بين صمتين: مقطعٌ واحد يشمل الكلام وقليلًا قبله', () => {
  const { got } = run([quiet(1), tone(2), quiet(1.5)]);
  assert.equal(got.length, 1);
  assert.ok(got[0] > 2 && got[0] < 3.6, `طول المقطع ${got[0]}`);
});

test('وقفةٌ قصيرة (أقل من ٠٫٩ث) داخل الكلام لا تقطعه', () => {
  const { got } = run([quiet(0.5), tone(1), quiet(0.5), tone(1), quiet(1.5)]);
  assert.equal(got.length, 1);
});

test('وقفةٌ طويلة تفصل مقطعين', () => {
  const { got } = run([quiet(0.5), tone(1), quiet(1.5), tone(1), quiet(1.5)]);
  assert.equal(got.length, 2);
});

test('نقرةٌ أو سعلةٌ قصيرة (أقل من ٠٫٣٥ث) لا تُرسل للنموذج', () => {
  const { got } = run([quiet(0.5), tone(0.2), quiet(1.5)]);
  assert.equal(got.length, 0);
});

test('صمتٌ تام لا يُنتج شيئًا', () => {
  assert.equal(run([quiet(5)]).got.length, 0);
});

test('كلامٌ متّصل أطول من الحدّ يُقطع قسرًا فلا يتأخّر «أعد» إلى ما لا نهاية', () => {
  const { got } = run([tone(25)], { maxMs: 10000 });
  assert.ok(got.length >= 2, `${got.length}`);
  assert.ok(got.every((s) => s <= 11), JSON.stringify(got));
});

test('رمي ما قيل أثناء نطق «أعد» (flush(false)) لا يُنتج مقطعًا', () => {
  const got = [];
  const seg = createSegmenter({ rate: RATE, onSegment: (a) => got.push(a) });
  tone(1).forEach((b) => seg.feed(b));
  seg.flush(false);
  quiet(2).forEach((b) => seg.feed(b));
  assert.equal(got.length, 0);
});

console.log(`\n✅ ${passed} اختبارًا للسمع الدقيق\n`);
