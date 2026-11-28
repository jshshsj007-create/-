/**
 * «التسميع اليومي»: الطالب يختار ما يسمّع، ويقرأ بصوته، والوكيل يسمع ويقول «أعد» إذا أخطأ.
 *
 * مستقلٌّ عن جلسات خيركم وعن يوم الهمة: له سجلّه الخاص. ويُربط بحساب الطالب، فلا يرى غيرُه نتيجته.
 *
 * والتعرّف على الكلام من المتصفح، والمقارنة بنصّ المصحف بالكود (src/tasmee.js) لا بنموذج. وحدوده معلنةٌ
 * للطالب في الشاشة نفسها: يكشف الكلمة الناقصة والمبدَّلة، ولا يحكم على التجويد.
 *
 * ولا يُحفظ صوتٌ ولا نصٌّ مسموع، ولا يغادر الصوتُ المتصفحَ إلا إلى خدمة التعرّف التي يستعملها جهازه هو.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, MicOff, Check, RotateCcw, Volume2, Eye, ChevronLeft } from 'lucide-react';
import { SURAHS } from './khayr.js';
import { wordsOf, advance, locateStart } from './tasmee.js';
import { say as adad } from './adad.js';
import { createEngine, createSegmenter, resample, openMic, modelCached, MODEL_MB } from './accurate.js';

const SR = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const WORD = ['كلمة', 'كلمتين', 'كلمات', 'كلمة'];
const LEVEL_LABEL = { normal: 'عادي', strict: 'صارم' };

const dayText = (ts) => {
  try { return new Date(ts).toLocaleDateString('ar-SA-u-nu-latn', { day: 'numeric', month: 'short' }); } catch { return ''; }
};

export default function DailyTasmee({ sessions = [], onSave, onBack, quranUrl = '/quran.json', test = null }) {
  const [quran, setQuran] = useState(test?.quran || null);
  const [loadErr, setLoadErr] = useState('');
  const [surah, setSurah] = useState(112);
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(4);
  // «من أي موضع»: لا يحدّد الطالب الآية، يقرأ من حيث شاء في السورة ويعرف الوكيل مكانه من أول كلماته
  const [auto, setAuto] = useState(true);
  const [start, setStart] = useState(0);
  const [level, setLevel] = useState('normal');
  const [practice, setPractice] = useState(false);           // تجربة: النص ظاهر، وبلا حفظ
  const [speak, setSpeak] = useState(true);
  const [phase, setPhase] = useState('pick');                // pick | listen | done | stopped
  const [cursor, setCursor] = useState(0);
  const [bad, setBad] = useState(-1);
  const [heard, setHeard] = useState('');
  const [repeats, setRepeats] = useState(0);
  const [hints, setHints] = useState(0);
  const [msg, setMsg] = useState('');
  const [words, setWords] = useState([]);
  // طريقة السمع: «سريع» تعرّف الجوال المدمج، و«دقيق» نموذجٌ قرآني على الجهاز (src/accurate.js) لا يكمّل الآية من عنده
  const [engine, setEngineState] = useState(() => { try { const v = localStorage.getItem('faidTasmeeEngine'); if (v) return v; } catch { /* بلا تخزين */ } return typeof Worker !== 'undefined' && navigator.mediaDevices ? 'accurate' : 'fast'; });
  const setEngine = (v) => { setEngineState(v); try { localStorage.setItem('faidTasmeeEngine', v); } catch { /* بلا تخزين */ } };
  const [model, setModel] = useState({ state: 'idle', pct: 0 });
  const [busy, setBusy] = useState(false);
  const [lvl, setLvl] = useState(0);                    // مؤشّر الصوت: يرى الطالب أن الجوال يسمعه فلا يظنّه ساكتًا
  const [timing, setTiming] = useState(null);            // { ms, secs } آخر تحليل
  const [slow, setSlow] = useState(false);
  const [doneWords, setDoneWords] = useState(0);
  const [reveal, setReveal] = useState([]);              // فهارس الكلمات التي كشفها الطالب بنفسه
  // onSave يتغيّر مع كل رسم (يحمل بيانات التطبيق وقتها): الدوال المحفوظة بلا اعتماديات تُحفظ عبر مرجعٍ لئلا تحفظ فوق بياناتٍ أقدم
  const saveRef = useRef(onSave);
  saveRef.current = onSave;

  // أحوالٌ تتغيّر أسرع مما يُرسم: في مراجع لا في حالة
  const R = useRef({ rec: null, active: false, base: 0, cursor: 0, repeats: 0, hints: 0, words: [], startedAt: 0, level: 'normal', practice: false, speak: true, surah: 112, from: 1, to: 4, ctx: null, voice: null, log: [], seen: { idx: -1, n: 0 }, eng: null, closeMic: null, seg: null, epoch: 0, muted: false, queue: [], processing: false, lvl: 0, rt: [], engine: 'fast', auto: false, located: true, start: 0 });

  useEffect(() => {
    if (quran) return undefined;
    let dead = false;
    fetch(quranUrl, { cache: 'force-cache' })
      .then((r) => { if (!r.ok) throw new Error('x'); return r.json(); })
      .then((j) => { if (!dead) setQuran(j); })
      .catch(() => { if (!dead) setLoadErr('ما قدرنا نحمّل نصّ المصحف. تأكد من الاتصال وأعد فتح الشاشة.'); });
    return () => { dead = true; };
  }, [quran, quranUrl]);

  // لا يبقى الميكروفون مفتوحًا إن خرج الطالب من الشاشة
  useEffect(() => () => {
    const r = R.current;
    r.active = false;
    try { r.rec?.abort(); } catch { /* مغلقٌ أصلًا */ }
    try { r.closeMic?.(); } catch { /* مغلق */ }
    try { r.ctx?.close?.(); } catch { /* مغلق */ }
    r.eng?.terminate();
  }, []);

  const getEngine = () => { if (!R.current.eng) R.current.eng = createEngine(); return R.current.eng; };
  /** تنزيل النموذج (مرة واحدة) أو تحميله من ذاكرة المتصفح. يُستدعى من نقرة الطالب أو تلقائيًا إن نُزّل سابقًا. */
  const ensureModel = async () => {
    setMsg('');
    setModel((m) => (m.state === 'ready' ? m : { state: 'loading', pct: 0 }));
    try {
      await getEngine().load((f) => setModel({ state: 'loading', pct: Math.round(f * 100) }));
      setModel({ state: 'ready', pct: 100 });
    } catch {
      setModel({ state: 'error', pct: 0 });
      setMsg('تعذّر تحميل نموذج القرآن. تأكد من الإنترنت وأعد المحاولة، أو اختر «سريع».');
    }
  };
  useEffect(() => {
    if (phase !== 'listen' || R.current.engine !== 'accurate') return undefined;
    const t = setInterval(() => setLvl(R.current.lvl), 120);
    return () => clearInterval(t);
  }, [phase]);
  useEffect(() => { if (engine === 'accurate' && model.state === 'idle' && modelCached()) ensureModel(); }, [engine]); // eslint-disable-line react-hooks/exhaustive-deps

  const count = quran?.s?.[surah - 1]?.length || 0;

  /** نبرةٌ قصيرة + اهتزاز: تصل حتى لو جهازه بلا صوتٍ عربي للنطق أو كتم النطق، فلا يضيع «أعد». */
  const beep = () => {
    try {
      const ctx = R.current.ctx;
      if (ctx) {
        if (ctx.state === 'suspended') ctx.resume();
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.type = 'sine'; o.frequency.value = 660; g.gain.value = 0.2;
        o.connect(g); g.connect(ctx.destination);
        o.start(); o.stop(ctx.currentTime + 0.18);
      }
    } catch { /* بلا صوت: يكفي ما سواه */ }
    try { navigator.vibrate?.(200); } catch { /* غير مدعوم */ }
  };

  /** ينطق ثم يستأنف الاستماع. السماع أثناء النطق يخلط صوتَ الوكيل بصوت الطالب (والجوال يحجز الميكروفون عن النطق). */
  const say = (text, then) => {
    const done = (() => { let d = false; return () => { if (!d) { d = true; then?.(); } }; })();
    if (!R.current.speak) { done(); return; }
    try {
      const synth = window.speechSynthesis;
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'ar-SA'; u.rate = 0.9; u.volume = 1;
      const v = synth.getVoices().find((x) => /^ar/i.test(x.lang));
      if (v) u.voice = v;
      u.onend = done; u.onerror = done;
      synth.cancel();
      setTimeout(() => { try { synth.speak(u); } catch { done(); } }, 60);
      setTimeout(done, 2200);            // إن لم يُنطق شيء (لا صوت عربي) لا يبقى الميكروفون مغلقًا
    } catch { done(); }
  };

  const stopRec = () => {
    const r = R.current;
    r.active = false;
    try { r.rec?.abort(); } catch { /* مغلق */ }
    r.rec = null;
    try { r.closeMic?.(); } catch { /* مغلق */ }
    r.closeMic = null; r.seg = null; r.queue = []; r.muted = false;
    setBusy(false); setLvl(0);
  };

  /**
   * تلخيص ما أُنجز للحفظ والعرض. في «من أي موضع» يبدأ المدى من حيث بدأ الطالب، وينتهي عند آخر كلمةٍ أتمّها.
   * (من حدّد المدى بنفسه فمداه كما اختار.)
   */
  const summary = (end) => {
    const r = R.current;
    const a = r.words[r.start]?.ayah ?? r.from;
    const b = r.words[Math.max(r.start, end - 1)]?.ayah ?? r.to;
    return { from: a, to: b, words: end - r.start };
  };

  const finish = (ok, partial = false) => {
    const r = R.current;
    const end = ok ? r.words.length : r.cursor;
    // في «من أي موضع» لا يُعدّ «انتهيت» فشلًا: ما قرأه صحيحًا يُحفظ (ثلاث كلماتٍ فأكثر)
    const keep = ok || (partial && r.auto && r.located && end - r.start >= 3);
    stopRec();
    if (keep) {
      const sm = summary(end);
      say('أحسنت');
      if (!r.practice) {
        saveRef.current?.({
          id: uid(), at: Date.now(), surah: r.surah, from: sm.from, to: sm.to,
          words: sm.words, repeats: r.repeats, hints: r.hints, level: r.level,
          ms: Date.now() - r.startedAt,
        });
      }
      setFrom(sm.from); setTo(sm.to); setDoneWords(sm.words);
      setPhase('done');
    } else setPhase('stopped');
  };

  /** أين بدأ الطالب؟ يُعاد الحكم كلما زاد الكلام حتى يثبت الموضع. `force`: مقطعٌ منتهٍ، نأخذ أول موضعٍ ولا ننتظر. */
  const tryLocate = (text, force) => {
    const r = R.current;
    if (!r.auto || r.located) return true;
    const L = locateStart(r.words, text);
    if (!L) return false;
    if (L.ambiguous && !force && text.trim().split(/\s+/).length < 8) return false;
    r.located = true; r.start = L.start; r.base = L.start; r.cursor = L.start;
    setStart(L.start); setCursor(L.start); setMsg('');
    return true;
  };

  /** مقطعٌ حلّله النموذج القرآني: نصٌّ بما سُمع حقًّا، فيُحكم به أسرع من النص المؤقّت (solid). */
  const handleAcc = (text, ms, secs) => {
    const r = R.current;
    setTiming({ ms, secs });
    // سرعة جهازه: إن احتاج التحليل أكثر من مرةٍ وثلثٍ مدّةَ الكلام في مقطعين متتاليين فجوالُه بطيءٌ على «دقيق»
    r.rt = [...r.rt.slice(-3), ms / (secs * 1000)];
    if (r.rt.length >= 2 && r.rt.reduce((a, b) => a + b, 0) / r.rt.length > 1.3) setSlow(true);
    if (!r.active) return;
    setHeard(text.trim().split(/\s+/).slice(-14).join(' '));
    if (!tryLocate(text, true)) { setMsg('ما عرفتُ من أين بدأت. اقرأ ثلاث كلماتٍ فأكثر من السورة.'); return; }
    const a = advance(r.words, r.cursor, text, { level: r.level, final: false, solid: true });
    if (r.log.length < 80) r.log.push({ t: Date.now() - r.startedAt, mode: 'acc', secs: Math.round(secs * 10) / 10, ms, heard: text, base: r.cursor, cursor: a.cursor, bad: a.bad, rt: Math.round((ms / (secs * 1000)) * 100) / 100 });
    if (a.cursor > r.cursor) { r.cursor = a.cursor; setCursor(a.cursor); setBad(-1); }
    if (a.done) { finish(true); return; }
    if (a.bad < 0) return;
    r.repeats += 1; setRepeats(r.repeats);
    r.cursor = a.bad; setCursor(a.bad); setBad(a.bad); setReveal([]);
    // ما قاله الطالب بعد الخطأ قبل أن يسمع «أعد» لا يُحكم به: يعيد من الكلمة الخاطئة
    r.epoch += 1; r.queue = []; r.muted = true; r.seg?.flush(false);
    beep();
    say('أعد', () => setTimeout(() => { r.muted = false; r.seg?.flush(false); }, 350));
  };

  const pump = async () => {
    const r = R.current;
    if (r.processing) return;
    const item = r.queue.shift();
    if (!item) { setBusy(false); return; }
    r.processing = true; setBusy(true);
    try {
      const x = resample(item.audio, r.ctx.sampleRate);
      const secs = x.length / 16000;
      const out = await getEngine().transcribe(x);
      if (item.epoch === r.epoch) handleAcc(out.text, out.ms, secs);
    } catch { setMsg('تعذّر تحليل المقطع. أعد المحاولة.'); }
    r.processing = false;
    pump();
  };

  /**
   * نتيجة التعرّف. `cands`: النصّ الأول ثم بدائل الجهاز للجملة الأخيرة (يسمع الجهاز أحيانًا الصحيحَ بديلًا ثانيًا).
   * يُقبل أفضلُ المرشّحين تقدّمًا: ظلمُ طالبٍ قرأ صحيحًا أسوأ من إمهال خطأٍ ثانيةً.
   * و«أعد» لا تُقال من أول نبضة: النصّ المؤقّت يتبدّل مع كل كلمة، فلا بدّ أن يثبت الخطأ في نبضتين متتاليتين
   * أو أن تُختم الجملة (isFinal).
   */
  const handle = useCallback((cands, isFinal) => {
    const r = R.current;
    if (!r.active) return;
    const text = cands[0];
    setHeard(text.trim().split(/\s+/).slice(-14).join(' '));
    if (!tryLocate(text, false)) return;
    let best = null;
    for (const c of cands) {
      const a = advance(r.words, r.base, c, { level: r.level, final: false });
      const aOk = a.bad < 0, bOk = best && best.bad < 0;
      if (!best || (aOk && !bOk) || (aOk === bOk && a.cursor > best.cursor)) best = a;
    }
    const a = best;
    if (r.log.length < 80) r.log.push({ t: Date.now() - r.startedAt, fin: !!isFinal, heard: cands.length > 1 ? cands : cands[0], base: r.base, cursor: a.cursor, bad: a.bad });
    if (a.cursor > r.cursor) { r.cursor = a.cursor; setCursor(a.cursor); setBad(-1); }
    if (a.done) { finish(true); return; }
    if (a.bad < 0) { r.seen = { idx: -1, n: 0 }; return; }
    r.seen = r.seen.idx === a.bad ? { idx: a.bad, n: r.seen.n + 1 } : { idx: a.bad, n: 1 };
    if (!isFinal && r.seen.n < 2) return;
    r.seen = { idx: -1, n: 0 };
    r.repeats += 1; setRepeats(r.repeats);
    r.base = a.bad; r.cursor = a.bad; setCursor(a.bad); setBad(a.bad); setReveal([]);
    // نوقف التعرّف ليُنسى ما قيل قبل الخطأ، ولئلا يسمع صوتَ الوكيل؛ ونستأنفه بعد النطق من الكلمة الخاطئة
    const old = r.rec; r.rec = null;
    try { old?.abort(); } catch { /* مغلق */ }
    beep();
    say('أعد', () => { if (R.current.active && !R.current.rec) setTimeout(() => startRec(), 200); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startRec = useCallback(() => {
    const r = R.current;
    if (!r.active) return;
    const rec = test?.makeRec ? test.makeRec() : new SR();
    rec.lang = 'ar-SA'; rec.continuous = true; rec.interimResults = true; rec.maxAlternatives = 4;
    r.rec = rec;
    rec.onresult = (ev) => {
      if (rec !== R.current.rec) return;
      const n = ev.results.length;
      let head = '';
      for (let i = 0; i < n - 1; i++) head += ` ${ev.results[i][0].transcript}`;
      const last = ev.results[n - 1];
      const cands = [];
      for (let k = 0; k < last.length; k++) cands.push(`${head} ${last[k].transcript}`);
      handle(cands, !!last.isFinal);
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { setMsg('ما أُذن للميكروفون. اسمح به من إعدادات المتصفح ثم أعد المحاولة.'); finish(false); }
      else if (e.error === 'audio-capture') { setMsg('ما لقينا ميكروفونًا يعمل.'); finish(false); }
      else if (e.error === 'network') setMsg('انقطع الاتصال بخدمة التعرّف. تأكد من الإنترنت.');
    };
    // يتوقف التعرّف من نفسه عند الصمت أو بعد مدة: نستأنف من حيث وصل المؤشّر لا من أول الكلام
    rec.onend = () => {
      if (rec !== R.current.rec || !R.current.active) return;
      R.current.base = R.current.cursor;
      setTimeout(() => startRec(), 150);
    };
    try { rec.start(); } catch { setMsg('ما قدرنا نشغّل الميكروفون.'); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const begin = () => {
    const E = auto ? wordsOf(quran, surah, 1, count) : wordsOf(quran, surah, from, to);
    if (!E.length) { setMsg('اختر مدًى صحيحًا من السورة.'); return; }
    const acc = engine === 'accurate';
    if (!acc && !SR && !test?.makeRec) { setMsg('هذا المتصفح لا يدعم التعرّف على الكلام. جرّب Chrome على أندرويد، أو Safari على آيفون حديث، أو اختر «دقيق».'); return; }
    if (acc && model.state !== 'ready') { setMsg('نموذج القرآن لم يجهز بعد.'); return; }
    const r = R.current;
    Object.assign(r, { words: E, base: 0, cursor: 0, repeats: 0, hints: 0, startedAt: Date.now(), level, practice, speak, surah, from, to, active: true, engine, auto, located: !auto, start: 0, epoch: 0, queue: [], muted: false, log: [], seen: { idx: -1, n: 0 } });
    setWords(E); setStart(0); setDoneWords(0); setCursor(0); setBad(-1); setReveal([]); setHeard(''); setRepeats(0); setHints(0); setMsg('');
    // من نقرة الطالب: وحدها تُفتح فيها الصوتيات على الجوال، فنهيّئ النبرة والنطق هنا لا عند أول «أعد»
    try {
      if (!r.ctx) { const AC = window.AudioContext || window.webkitAudioContext; if (AC) r.ctx = new AC(); }
      r.ctx?.resume?.();
      const u = new SpeechSynthesisUtterance(' '); u.volume = 0; window.speechSynthesis.speak(u);
    } catch { /* بلا صوتيات: تبقى الإشارة المرئية */ }
    setTiming(null); setSlow(false); r.rt = [];
    if (acc) {
      if (!r.ctx) { setMsg('هذا المتصفح لا يدعم تسجيل الصوت.'); r.active = false; return; }
      setPhase('listen');
      openMic(r.ctx, (blk) => { if (!r.muted) r.seg?.feed(blk); })
        .then((close) => {
          if (!r.active) { close(); return; }
          r.closeMic = close;
          r.seg = createSegmenter({ rate: r.ctx.sampleRate, onLevel: (rms) => { r.lvl = rms; }, onSegment: (audio) => { r.queue.push({ audio, epoch: r.epoch }); pump(); } });
        })
        .catch(() => { setMsg('ما أُذن للميكروفون. اسمح به من إعدادات المتصفح ثم أعد المحاولة.'); finish(false); });
      return;
    }
    setPhase('listen');
    startRec();
  };

  /** تقرير لصاحب الاختبار: ما سمعه الجهاز فعلًا وقرارُ كل خطوة. لا يُحفظ ولا يُرسل: يُنسخ ليلصقه صاحبه حيث يشاء. */
  const [copied, setCopied] = useState('');
  const copyReport = async () => {
    const r = R.current;
    const rep = { engine: r.engine, ua: navigator.userAgent, surah: r.surah, from: r.from, to: r.to, level: r.level, words: r.words.length, cursor: r.cursor, repeats: r.repeats, events: r.log };
    const text = JSON.stringify(rep);
    try { await navigator.clipboard.writeText(text); setCopied('نُسخ. الصقه في المحادثة.'); }
    catch { setCopied(text); }
  };
  /**
   * تلقين الشيخ: كلمة، أو بداية الآية، أو الآية كلها. لا يظهر شيءٌ إلا بطلب الطالب، وكل طلبٍ يُعدّ تلميحًا في سجلّه.
   * وتبدأ الآية من أولها لا من المؤشّر: من نسي كيف تبدأ يحتاج فاتحتها لا ما بعدها.
   */
  const hint = (kind = 'word') => {
    const r = R.current;
    if (r.auto && !r.located) return;       // لم نعرف بعدُ أين بدأ: لا آية نلقّنه إياها
    const cur = Math.min(r.cursor, r.words.length - 1);
    const ay = r.words[cur]?.ayah;
    const first = r.words.findIndex((x) => x.ayah === ay);
    let last = first;
    while (last + 1 < r.words.length && r.words[last + 1].ayah === ay) last++;
    let idx;
    if (kind === 'word') idx = [cur];
    else if (kind === 'start') idx = Array.from({ length: Math.min(3, last - first + 1) }, (_, k) => first + k);
    else idx = Array.from({ length: last - first + 1 }, (_, k) => first + k);
    r.hints += 1; setHints(r.hints);
    setReveal((old) => [...new Set([...old, ...idx])]);
  };
  const reset = () => { stopRec(); setPhase('pick'); setMsg(''); };

  /** كلماتُ المدى كما تُعرض: ما قرأه صحيحًا واضح، وما بعده نقاط. لا يظهر الجواب إلا إذا ضغط الطالب «تلميح»: وإلا لم يكن تسميعًا. */
  const shown = (i) => i < cursor || reveal.includes(i);

  const span = words.length - start;
  const pct = span > 0 ? Math.round(((cursor - start) / span) * 100) : 0;
  const waiting = auto && !R.current.located && phase === 'listen';
  const mine = [...sessions].sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, 15);

  return (
    <div dir="rtl" data-testid="daily-tasmee">
      <button className="text-xs text-slate-400 flex items-center gap-1 mb-2" onClick={onBack}><ChevronLeft size={14} /> الرئيسية</button>
      <h2 className="text-xl font-extrabold text-slate-800">التسميع اليومي</h2>
      <div className="text-sm text-slate-400 mt-1 mb-4">اختر ما تسمّع، واقرأه بصوتك. وإذا أخطأتَ قال لك الوكيل «أعد».</div>

      {loadErr && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm mb-3">{loadErr}</div>}
      {!quran && !loadErr && <div className="text-sm text-slate-400 py-8 text-center">جاري تحميل المصحف…</div>}

      {quran && phase === 'pick' && (
        <div className="bg-white rounded-2xl border border-slate-100 p-4 space-y-3" data-testid="daily-pick">
          <label className="block">
            <span className="text-xs text-slate-500">السورة</span>
            <select data-testid="daily-surah" className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white" value={surah}
              onChange={(e) => { const s = Number(e.target.value); setSurah(s); setFrom(1); setTo(Math.min(5, quran.s[s - 1].length)); }}>
              {SURAHS.map((n, i) => <option key={n} value={i + 1}>{i + 1}. {n}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700 font-semibold"><input data-testid="daily-auto" type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> أقرأ من أي موضع في السورة</label>
          {auto
            ? <div className="text-[11px] text-slate-400 leading-5">اقرأ من أي آية تشاء، حتى من منتصف السورة، ويعرف الوكيل مكانك من أول كلماتك. وإذا انتهيتَ اضغط «انتهيت» فيُحفظ ما قرأتَه صحيحًا.</div>
            : (
              <div className="grid grid-cols-2 gap-2">
                <label className="block"><span className="text-xs text-slate-500">من آية</span>
                  <input data-testid="daily-from" type="number" min={1} max={count} inputMode="numeric" className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2.5 text-sm"
                    value={from} onChange={(e) => { const v = Math.max(1, Math.min(count, Number(e.target.value) || 1)); setFrom(v); if (to < v) setTo(v); }} /></label>
                <label className="block"><span className="text-xs text-slate-500">إلى آية</span>
                  <input data-testid="daily-to" type="number" min={from} max={count} inputMode="numeric" className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2.5 text-sm"
                    value={to} onChange={(e) => setTo(Math.max(from, Math.min(count, Number(e.target.value) || from)))} /></label>
              </div>
            )}
          <div className="text-[11px] text-slate-400">في السورة {count} آية.</div>

          <div>
            <span className="text-xs text-slate-500">طريقة السمع</span>
            <div className="flex gap-2 mt-1">
              {[['fast', 'سريع'], ['accurate', 'دقيق']].map(([k, l]) => (
                <button key={k} type="button" data-testid={`daily-engine-${k}`} onClick={() => setEngine(k)}
                  className={`flex-1 px-3 py-2 rounded-xl text-sm font-semibold border ${engine === k ? 'bg-brand-600 text-white border-brand-600' : 'border-slate-200 text-slate-600'}`}>{l}</button>
              ))}
            </div>
            <div className="text-[11px] text-slate-400 mt-1 leading-5">
              {engine === 'fast'
                ? '«سريع» يستعمل تعرّف الجوال المدمج: فوريّ، لكنه يكمّل الآية المشهورة من عنده فقد يفوته الخطأ.'
                : `«دقيق» نموذجٌ للقرآن يشتغل على جوالك ويكتب ما قلتَ فعلًا، فيكشف الكلمة الناقصة والمبدَّلة والآية المتروكة. يُنزَّل مرة واحدة (نحو ${MODEL_MB} ميغا، يُستحسن بالواي فاي). اقرأ ثم قف قليلًا ليُحلَّل ما قلت.`}
            </div>
          </div>

          <div>
            <span className="text-xs text-slate-500">الصرامة</span>
            <div className="flex gap-2 mt-1">
              {Object.entries(LEVEL_LABEL).map(([k, l]) => (
                <button key={k} type="button" data-testid={`daily-level-${k}`} onClick={() => setLevel(k)}
                  className={`flex-1 px-3 py-2 rounded-xl text-sm font-semibold border ${level === k ? 'bg-brand-600 text-white border-brand-600' : 'border-slate-200 text-slate-600'}`}>{l}</button>
              ))}
            </div>
            <div className="text-[11px] text-slate-400 mt-1 leading-5">«صارم» لا يقبل إلا ما طابق المصحف حرفًا بحرف، وقد يقول «أعد» لقراءةٍ صحيحة إذا أخطأ الجهاز في السمع.</div>
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={speak} onChange={(e) => setSpeak(e.target.checked)} /> ينطق الوكيل «أعد» بصوت</label>
          <label className="flex items-center gap-2 text-sm text-slate-600"><input data-testid="daily-practice" type="checkbox" checked={practice} onChange={(e) => setPractice(e.target.checked)} /> تجربة: بلا حفظ (لتعرف كيف يسمعك الجهاز)</label>

          {msg && <div className="text-red-600 text-sm">{msg}</div>}
          {engine === 'accurate' && model.state !== 'ready' ? (
            <button data-testid="daily-model" disabled={model.state === 'loading'} onClick={ensureModel}
              className="w-full bg-brand-600 disabled:opacity-60 text-white font-bold rounded-xl py-3 relative overflow-hidden">
              {model.state === 'loading' && <span className="absolute inset-y-0 right-0 bg-brand-700/60" style={{ width: `${model.pct}%` }} />}
              <span className="relative">{model.state === 'loading' ? `جاري تجهيز النموذج… ${model.pct}٪` : `نزّل نموذج القرآن (نحو ${MODEL_MB} ميغا، مرة واحدة)`}</span>
            </button>
          ) : (
            <button data-testid="daily-start" onClick={begin} className="w-full bg-brand-600 text-white font-bold rounded-xl py-3 flex items-center justify-center gap-2"><Mic size={18} /> ابدأ التسميع</button>
          )}
          <div className="text-[11px] text-slate-400 leading-5">
            يكشف الكلمة الناقصة والمبدَّلة والآية المتروكة. ولا يحكم على التجويد (المدود والغنة والمخارج)، فيبقى للشيخ. ولا يحفظ التطبيق صوتك، تُحفظ النتيجة فقط. {engine === 'accurate' ? 'وفي «دقيق» يُحلَّل الصوت داخل جوالك ولا يخرج منه (النموذج: Tarteel AI، رخصة Apache-2.0).' : 'وفي «سريع» يحوّل متصفحُك الصوتَ إلى نصٍّ عبر خدمة التعرّف التي يستعملها جهازك.'}
          </div>
        </div>
      )}

      {quran && phase === 'listen' && (
        <div className="bg-white rounded-2xl border border-slate-100 p-4" data-testid="daily-listen">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
              <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse" /> {busy ? 'أحلّل…' : 'أسمعك…'} {SURAHS[surah - 1]}{auto ? '' : ` (${from}–${to})`}
            </div>
            <div className="text-xs text-slate-400" data-testid="daily-progress">{waiting ? 'اقرأ من أي آية' : `${cursor - start} من ${adad(span, WORD)}`}</div>
          </div>
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden mb-3"><div className="h-full bg-brand-600 transition-all" style={{ width: `${pct}%` }} /></div>
          {engine === 'accurate' && (
            <div className="mb-3" data-testid="daily-meter">
              <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden"><div className="h-full bg-red-400 transition-all duration-100" style={{ width: `${Math.min(100, Math.round(lvl * 500))}%` }} /></div>
              <div className="text-[11px] text-slate-400 mt-1 flex justify-between">
                <span>{busy ? 'أحلّل ما قلت…' : 'يسمعك'}</span>
                {timing && <span data-testid="daily-timing">آخر تحليل: {(timing.ms / 1000).toFixed(1)} ث لكلامٍ {timing.secs.toFixed(1)} ث</span>}
              </div>
            </div>
          )}
          {slow && engine === 'accurate' && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-3 text-xs text-amber-800 leading-5" data-testid="daily-slow">
              التحليل يتأخّر على جوالك. اقرأ بمقاطع أقصر وقف بينها، أو ارجع واختر «سريع».
            </div>
          )}

          {bad >= 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-3 text-center" data-testid="daily-repeat">
              <div className="text-red-700 font-extrabold text-lg flex items-center justify-center gap-2"><RotateCcw size={18} /> أعد</div>
              <div className="text-sm text-red-600 mt-1">أعد من الموضع الأحمر</div>
              <button data-testid="daily-show-word" onClick={() => hint('word')} className="mt-2 text-xs border border-red-200 text-red-700 rounded-lg px-3 py-1.5">أظهر لي الكلمة</button>
            </div>
          )}

          <div className="leading-10 text-lg text-slate-800 min-h-[60px]" data-testid="daily-words">
            {waiting
              ? <span className="text-sm text-slate-400">اقرأ من أي آية في السورة، وأعرف مكانك من أول كلماتك.</span>
              : words.map((x, i) => (i < start ? null : (
                <span key={i} className={`inline-block mx-0.5 ${i < cursor ? 'text-green-700' : i === bad ? 'text-red-600 font-bold' : 'text-slate-300'}`}>
                  {shown(i) ? x.raw : '••••'}
                </span>
              )))}
          </div>

          <div className="text-[11px] text-slate-400 mt-3 min-h-[16px]" data-testid="daily-heard">{heard ? `سمعتُ: ${heard}` : 'ابدأ القراءة…'}</div>
          {msg && <div className="text-red-600 text-sm mt-2">{msg}</div>}
          <div className="flex flex-wrap gap-2 mt-3">
            <button data-testid="daily-hint-word" onClick={() => hint('word')} className="flex items-center gap-1 text-xs border border-slate-200 text-slate-600 rounded-xl px-3 py-2"><Eye size={14} /> الكلمة</button>
            <button data-testid="daily-hint-start" onClick={() => hint('start')} className="text-xs border border-slate-200 text-slate-600 rounded-xl px-3 py-2">بداية الآية</button>
            <button data-testid="daily-hint-ayah" onClick={() => hint('ayah')} className="text-xs border border-slate-200 text-slate-600 rounded-xl px-3 py-2">الآية كاملة</button>
            <button data-testid="daily-stop" onClick={() => finish(false, true)} className="basis-full text-sm border border-slate-200 text-slate-700 rounded-xl py-2.5 flex items-center justify-center gap-1"><MicOff size={14} /> {auto ? 'انتهيت (أحفظ ما قرأت)' : 'انتهيت'}</button>
          </div>
          <div className="text-[11px] text-slate-400 mt-2 flex items-center gap-1"><Volume2 size={12} /> {repeats ? `أعدتَ ${adad(repeats, 'time')}` : 'بلا إعادة'}{hints ? ` · تلميحات ${hints}` : ''}</div>
        </div>
      )}

      {phase === 'done' && (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-5 text-center" data-testid="daily-done">
          <div className="w-12 h-12 rounded-full bg-green-600 text-white flex items-center justify-center mx-auto mb-2"><Check size={26} /></div>
          <div className="text-green-800 font-extrabold text-lg">أحسنت! أتممتَ المدى</div>
          <div className="text-sm text-green-700 mt-1">{SURAHS[surah - 1]} ({from}–{to}) · {adad(doneWords || words.length, WORD)} · {repeats ? `أعدتَ ${adad(repeats, 'time')}` : 'بلا إعادة'}{hints ? ` · تلميحات ${hints}` : ''}</div>
          {practice && <div className="text-xs text-slate-500 mt-2">كانت تجربة، فلم تُحفظ.</div>}
          {practice && (
            <div className="mt-3">
              <button data-testid="daily-copy" onClick={copyReport} className="text-xs border border-slate-300 text-slate-600 rounded-lg px-3 py-1.5">نسخ تقرير التجربة</button>
              {copied && <div className="text-[11px] text-slate-500 mt-1 break-all select-all" dir="ltr">{copied}</div>}
            </div>
          )}
          <button onClick={reset} className="mt-4 bg-brand-600 text-white font-bold rounded-xl px-5 py-2.5 text-sm">تسميع جديد</button>
        </div>
      )}

      {phase === 'stopped' && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 text-center" data-testid="daily-stopped">
          <div className="text-amber-800 font-bold">توقّف التسميع قبل أن يكتمل</div>
          <div className="text-sm text-amber-700 mt-1">{auto ? 'ما قرأتَه صحيحًا أقل من ثلاث كلمات فلم يُحفظ.' : `وصلتَ إلى ${cursor} من ${adad(words.length, WORD)}، ولا تُحفظ إلا الجلسة المكتملة.`}</div>
          {msg && <div className="text-red-600 text-sm mt-2">{msg}</div>}
          {practice && (
            <div className="mt-3">
              <button data-testid="daily-copy" onClick={copyReport} className="text-xs border border-slate-300 text-slate-600 rounded-lg px-3 py-1.5">نسخ تقرير التجربة</button>
              {copied && <div className="text-[11px] text-slate-500 mt-1 break-all select-all" dir="ltr">{copied}</div>}
            </div>
          )}
          <button onClick={reset} className="mt-4 bg-brand-600 text-white font-bold rounded-xl px-5 py-2.5 text-sm">حاول من جديد</button>
        </div>
      )}

      {mine.length > 0 && (
        <div className="mt-5" data-testid="daily-history">
          <div className="text-sm font-bold text-slate-700 mb-2">سجلّي في التسميع اليومي</div>
          <div className="bg-white rounded-2xl border border-slate-100 divide-y divide-slate-50">
            {mine.map((s) => (
              <div key={s.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="text-slate-700">{SURAHS[s.surah - 1]} <span className="text-slate-400 text-xs">({s.from}–{s.to})</span></span>
                <span className="text-xs text-slate-400">{dayText(s.at)} · {s.repeats ? `${s.repeats} إعادة` : 'بلا إعادة'}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
