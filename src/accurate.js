/**
 * «السمع الدقيق»: نموذج قرآني يشتغل على جوال الطالب نفسه بدل تعرّف الجوال المدمج.
 *
 * لماذا؟ تعرّف الجوال المدمج مبنيٌّ على لغةٍ عامّة تكمّل الآيةَ المشهورة من عندها، فيخفي الكلمةَ الناقصة
 * أو المبدَّلة قبل أن تصل إلى التطبيق. والنموذج هنا (Tarteel whisper-base-ar-quran، رخصة Apache-2.0، بنسخةٍ مضغوطةٍ
 * للمتصفح) دُرِّب على تلاوات القرآن، فيكتب ما سمعه. وقد قِيس في بيئة الفحص: القراءة الصحيحة تُقبل، والكلمة
 * المحذوفة والمبدَّلة تُكشف في موضعها في الغالب (الأرقام في رسالة الالتزام لا في الشيفرة).
 *
 * ولا يُحمَّل من خوادمنا: ملفاته (~١٠٠ ميغا) من HuggingFace والمكتبة من jsDelivr، فلا تُحسب على حصّة Netlify.
 * ويُخزَّن في ذاكرة المتصفح (Cache API) لا في عامل خدمة، فلا يخالف قاعدة public/sw.js. ويُحمَّل مرةً واحدة.
 *
 * لا يُحفظ صوتٌ ولا نصٌّ: الصوت يُحلَّل في الجهاز ويُرمى. وهذا ملفٌّ للمتصفح فقط (لا يُستورد في اختبارات Node
 * إلا دوالُه الخالصة: resample وcreateSegmenter).
 */

export const MODEL = 'nael239/tasme3-whisper-base-ar-quran-web';
export const TJS_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.2/+esm';
export const MODEL_MB = 105;
const FLAG = 'faidTasmeeModel';

export const modelCached = () => { try { return localStorage.getItem(FLAG) === '1'; } catch { return false; } };
const markCached = () => { try { localStorage.setItem(FLAG, '1'); } catch { /* بلا تخزين: يعيد التحميل من ذاكرة المتصفح */ } };

/** يحوّل الصوت إلى ١٦ ألفًا (ما يقبله النموذج) بتوسيطٍ خطّي، مع متوسّطٍ بسيط يخفّف التشويه عند خفض التردّد. */
export const resample = (x, from, to = 16000) => {
  if (from === to) return x;
  const ratio = from / to;
  const n = Math.floor(x.length / ratio);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = i * ratio, b = (i + 1) * ratio;
    let s = 0, c = 0;
    for (let j = Math.floor(a); j < Math.min(x.length, Math.ceil(b)); j++) { s += x[j]; c++; }
    out[i] = c ? s / c : 0;
  }
  return out;
};

/**
 * يقطّع الصوت المتّصل إلى مقاطع كلامٍ بين وقفاتها: لا نرسل للنموذج صمتًا، ولا نبقى ننتظر نهايةَ التلاوة كلها.
 * عتبة الصوت تتكيّف مع ضجيج الغرفة (متوسّط ما قبل الكلام) لا رقمٌ ثابت: جوالٌ في مجلسٍ مزدحم غير جوالٍ في غرفة.
 */
export const createSegmenter = ({ rate, onSegment, onLevel, silenceMs = 600, minSpeechMs = 350, maxMs = 12000, preRollMs = 300, softAfterMs = 5000, softSilenceMs = 300 }) => {
  let floor = 0.0015, speaking = false, silence = 0, speech = 0, total = 0;
  let chunks = [], pre = [], preLen = 0;
  const ms = (n) => (n / rate) * 1000;
  const reset = () => { speaking = false; silence = 0; speech = 0; total = 0; chunks = []; };
  const concat = (parts) => { const n = parts.reduce((s, p) => s + p.length, 0); const o = new Float32Array(n); let k = 0; for (const p of parts) { o.set(p, k); k += p.length; } return o; };
  const emit = (reason) => {
    const ok = speech >= minSpeechMs;
    const audio = concat(chunks);
    reset();
    if (ok) onSegment(audio, reason);
  };
  return {
    feed(block) {
      let s = 0; for (let i = 0; i < block.length; i++) s += block[i] * block[i];
      const rms = Math.sqrt(s / block.length);
      // العتبة الدنيا منخفضة (٠٫٠٠٦): من يقرأ بصوتٍ هادئٍ على جوالٍ بميكروفونٍ ضعيف لا يضيع أول كلامه
      const loud = rms > Math.max(0.006, floor * 3.5);
      onLevel?.(rms, loud);
      const copy = new Float32Array(block);
      if (!speaking) {
        floor = floor * 0.95 + rms * 0.05;
        if (!loud) { pre.push(copy); preLen += block.length; while (ms(preLen) > preRollMs && pre.length > 1) preLen -= pre.shift().length; return; }
        speaking = true; chunks = [...pre]; total = preLen; pre = []; preLen = 0;
      }
      chunks.push(copy); total += block.length;
      if (loud) { silence = 0; speech += ms(block.length); } else silence += ms(block.length);
      // بعد أربع ثوانٍ من الكلام المتّصل نقطع عند أول وقفةٍ قصيرة (بين كلمتين) لا ننتظر وقفةَ آخر الآية: فيبدأ التحليل
      // والطالب ما زال يقرأ، وتصل النتيجة أبكر. القطع في وقفةٍ لا في وسط كلمة، فلا تتأذّى الدقة.
      // `reason`: «silence» انتهى كلامه فآخر كلمةٍ كاملة، و«soft» قطعناه نحن وقد يكون آخر كلمةٍ ناقصًا فلا يُحكم عليها وحدها
      if (silence >= silenceMs) emit('silence');
      else if (ms(total) >= maxMs || (ms(total) >= softAfterMs && silence >= softSilenceMs)) emit('soft');
    },
    /** ينهي المقطع الجاري (انتهى الطالب) أو يرمي ما سُمع (صمتَ الوكيل ينطق «أعد»). */
    flush(keep = true) { if (speaking && keep) emit('silence'); else reset(); pre = []; preLen = 0; },
  };
};

/** كود العامل: يحمّل المكتبة والنموذج ويحلّل المقاطع خارج الخيط الرئيسي حتى لا يتقطّع التسجيل أثناء التحليل. */
const WORKER_SRC = `
import { pipeline } from '${TJS_URL}';
let asr = null;
const files = {};
const run = async (audio) => {
  const { input_features } = await asr.processor.feature_extractor(audio);
  // المشفّر يقبل نافذةً أقصر من ٣٠ ثانية، لكن ما دون ١٠٠٠ إطار جرّبناه فدار النموذج على نفسه («هو الله أحد قل هو الله أحد…»)
  // في آيةٍ قصيرة. فالحدّ الأدنى ١٠٠٠ كما فُحصت عليه الدقة.
  const frames = Math.min(3000, Math.max(1000, Math.ceil(audio.length / 160) + 20));
  const feats = input_features.slice(null, null, [0, frames]);
  const out = await asr.model.generate({ inputs: feats, max_new_tokens: 200 });
  return asr.tokenizer.batch_decode(out, { skip_special_tokens: true })[0].trim();
};
self.onmessage = async (e) => {
  const m = e.data;
  try {
    if (m.type === 'load') {
      asr = await pipeline('automatic-speech-recognition', m.model, {
        dtype: 'q8', device: 'wasm',
        progress_callback: (p) => {
          if (p.status === 'progress' && /onnx/.test(p.file || '')) {
            files[p.file] = { loaded: p.loaded, total: p.total };
            const all = Object.values(files);
            const tot = all.reduce((s, f) => s + f.total, 0), got = all.reduce((s, f) => s + f.loaded, 0);
            self.postMessage({ type: 'progress', fraction: tot ? got / tot : 0 });
          }
        },
      });
      // تشغيلةٌ تجريبية: أول تحليلٍ في الجلسة أبطأ (تجهيز الذاكرة والمترجم)، فلا نتركه لأول مقطعٍ من الطالب
      try { await run(new Float32Array(16000 * 3)); } catch { /* التسخين اختياري */ }
      self.postMessage({ type: 'ready' });
    } else if (m.type === 'asr') {
      const t0 = performance.now();
      const text = await run(m.audio);
      self.postMessage({ type: 'text', id: m.id, text, ms: Math.round(performance.now() - t0) });
    }
  } catch (err) {
    self.postMessage({ type: 'error', id: m.id, message: String((err && err.message) || err) });
  }
};
`;

/** محرّك التحليل: يُنشأ عند الحاجة، ويحمّل مرةً، ويحلّل مقطعًا بعد مقطع. */
export const createEngine = () => {
  let worker = null, loading = null, nextId = 1;
  const waiting = new Map();
  const progressFns = new Set();
  const start = () => {
    const url = URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' }));
    worker = new Worker(url, { type: 'module' });
    worker.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'progress') progressFns.forEach((f) => f(m.fraction));
      else if (m.type === 'text') { waiting.get(m.id)?.resolve({ text: m.text, ms: m.ms }); waiting.delete(m.id); }
      else if (m.type === 'error') { const w = waiting.get(m.id); if (w) { w.reject(new Error(m.message)); waiting.delete(m.id); } }
    };
    worker.onerror = (e) => { waiting.forEach((w) => w.reject(new Error(e.message || 'worker'))); waiting.clear(); };
  };
  return {
    load(onProgress) {
      if (onProgress) progressFns.add(onProgress);
      if (loading) return loading;
      loading = new Promise((resolve, reject) => {
        try { start(); } catch (err) { reject(err); return; }
        const prev = worker.onmessage;
        worker.onmessage = (e) => {
          prev(e);
          if (e.data.type === 'ready') { markCached(); resolve(); }
          if (e.data.type === 'error' && !e.data.id) reject(new Error(e.data.message));
        };
        worker.postMessage({ type: 'load', model: MODEL });
      }).catch((err) => { loading = null; try { worker?.terminate(); } catch { /* */ } worker = null; throw err; });
      return loading;
    },
    transcribe(audio16k) {
      return new Promise((resolve, reject) => {
        const id = nextId++;
        waiting.set(id, { resolve, reject });
        worker.postMessage({ type: 'asr', id, audio: audio16k }, [audio16k.buffer]);
      });
    },
    ready() { return !!worker && !!loading; },
    terminate() { try { worker?.terminate(); } catch { /* */ } worker = null; loading = null; progressFns.clear(); },
  };
};

/** يفتح الميكروفون ويمرّر الكتل الصوتية. يُستدعى بعد أن هُيّئ AudioContext من نقرة الطالب. */
export const openMic = async (ctx, onBlock) => {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  const src = ctx.createMediaStreamSource(stream);
  const node = ctx.createScriptProcessor(4096, 1, 1);
  const mute = ctx.createGain(); mute.gain.value = 0;
  node.onaudioprocess = (ev) => onBlock(ev.inputBuffer.getChannelData(0));
  src.connect(node); node.connect(mute); mute.connect(ctx.destination);
  return () => {
    try { node.disconnect(); src.disconnect(); mute.disconnect(); } catch { /* */ }
    stream.getTracks().forEach((t) => t.stop());
  };
};
