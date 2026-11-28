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
import { wordsOf, advance } from './tasmee.js';

const SR = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
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
  const [reveal, setReveal] = useState(-1);
  // onSave يتغيّر مع كل رسم (يحمل بيانات التطبيق وقتها): الدوال المحفوظة بلا اعتماديات تُحفظ عبر مرجعٍ لئلا تحفظ فوق بياناتٍ أقدم
  const saveRef = useRef(onSave);
  saveRef.current = onSave;

  // أحوالٌ تتغيّر أسرع مما يُرسم: في مراجع لا في حالة
  const R = useRef({ rec: null, active: false, base: 0, cursor: 0, repeats: 0, hints: 0, words: [], startedAt: 0, level: 'normal', practice: false, speak: true, surah: 112, from: 1, to: 4 });

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
  useEffect(() => () => { R.current.active = false; try { R.current.rec?.abort(); } catch { /* مغلقٌ أصلًا */ } }, []);

  const count = quran?.s?.[surah - 1]?.length || 0;

  const say = (text) => {
    if (!R.current.speak) return;
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'ar-SA'; u.rate = 0.9;
      window.speechSynthesis.cancel(); window.speechSynthesis.speak(u);
    } catch { /* الجهاز بلا نطق: تكفي الإشارة المرئية */ }
  };

  const stopRec = () => { R.current.active = false; try { R.current.rec?.abort(); } catch { /* مغلق */ } R.current.rec = null; };

  const finish = (ok) => {
    stopRec();
    const r = R.current;
    if (ok) {
      say('أحسنت');
      if (!r.practice) {
        saveRef.current?.({
          id: uid(), at: Date.now(), surah: r.surah, from: r.from, to: r.to,
          words: r.words.length, repeats: r.repeats, hints: r.hints, level: r.level,
          ms: Date.now() - r.startedAt,
        });
      }
      setPhase('done');
    } else setPhase('stopped');
  };

  /** نتيجة التعرّف: يتقدّم المؤشّر بما ثبت، ويُقال «أعد» إذا تجاوز الكلامُ خطأً. */
  const handle = useCallback((text) => {
    const r = R.current;
    if (!r.active) return;
    setHeard(text.trim().split(/\s+/).slice(-14).join(' '));
    const a = advance(r.words, r.base, text, { level: r.level, final: false });
    if (a.cursor > r.cursor) { r.cursor = a.cursor; setCursor(a.cursor); setBad(-1); }
    if (a.done) { finish(true); return; }
    if (a.bad >= 0) {
      r.repeats += 1; setRepeats(r.repeats);
      r.base = a.bad; r.cursor = a.bad; setCursor(a.bad); setBad(a.bad);
      say('أعد');
      // نبدأ تعرّفًا جديدًا ليُنسى ما قيل قبل الخطأ، ويعيد من الكلمة الخاطئة
      try { r.rec?.abort(); } catch { /* مغلق */ }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startRec = useCallback(() => {
    const r = R.current;
    if (!r.active) return;
    const rec = test?.makeRec ? test.makeRec() : new SR();
    rec.lang = 'ar-SA'; rec.continuous = true; rec.interimResults = true; rec.maxAlternatives = 1;
    r.rec = rec;
    rec.onresult = (ev) => {
      if (rec !== R.current.rec) return;
      let t = '';
      for (let i = 0; i < ev.results.length; i++) t += ` ${ev.results[i][0].transcript}`;
      handle(t);
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
    const E = wordsOf(quran, surah, from, to);
    if (!E.length) { setMsg('اختر مدًى صحيحًا من السورة.'); return; }
    if (!SR && !test?.makeRec) { setMsg('هذا المتصفح لا يدعم التعرّف على الكلام. جرّب Chrome على أندرويد، أو Safari على آيفون حديث.'); return; }
    const r = R.current;
    Object.assign(r, { words: E, base: 0, cursor: 0, repeats: 0, hints: 0, startedAt: Date.now(), level, practice, speak, surah, from, to, active: true });
    setWords(E); setCursor(0); setBad(-1); setReveal(-1); setHeard(''); setRepeats(0); setHints(0); setMsg('');
    setPhase('listen');
    startRec();
  };

  const hint = () => { R.current.hints += 1; setHints(R.current.hints); setReveal(R.current.cursor); };
  const reset = () => { stopRec(); setPhase('pick'); setMsg(''); };

  /** كلماتُ المدى كما تُعرض: ما ثبت واضح، وما بعده نقاط إلا ما كُشف بتلميحٍ أو بـ«أعد». */
  const shown = (i) => practice || i < cursor || i === reveal || i === bad;

  const pct = words.length ? Math.round((cursor / words.length) * 100) : 0;
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
          <div className="grid grid-cols-2 gap-2">
            <label className="block"><span className="text-xs text-slate-500">من آية</span>
              <input data-testid="daily-from" type="number" min={1} max={count} inputMode="numeric" className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2.5 text-sm"
                value={from} onChange={(e) => { const v = Math.max(1, Math.min(count, Number(e.target.value) || 1)); setFrom(v); if (to < v) setTo(v); }} /></label>
            <label className="block"><span className="text-xs text-slate-500">إلى آية</span>
              <input data-testid="daily-to" type="number" min={from} max={count} inputMode="numeric" className="w-full mt-1 border border-slate-200 rounded-xl px-3 py-2.5 text-sm"
                value={to} onChange={(e) => setTo(Math.max(from, Math.min(count, Number(e.target.value) || from)))} /></label>
          </div>
          <div className="text-[11px] text-slate-400">في السورة {count} آية.</div>

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
          <label className="flex items-center gap-2 text-sm text-slate-600"><input data-testid="daily-practice" type="checkbox" checked={practice} onChange={(e) => setPractice(e.target.checked)} /> تجربة: النص ظاهر وبلا حفظ (لتعرف كيف يسمعك الجهاز)</label>

          {msg && <div className="text-red-600 text-sm">{msg}</div>}
          <button data-testid="daily-start" onClick={begin} className="w-full bg-brand-600 text-white font-bold rounded-xl py-3 flex items-center justify-center gap-2"><Mic size={18} /> ابدأ التسميع</button>
          <div className="text-[11px] text-slate-400 leading-5">
            يكشف الكلمة الناقصة والمبدَّلة والآية المتروكة. ولا يحكم على التجويد (المدود والغنة والمخارج)، فيبقى للشيخ. ولا يحفظ التطبيق صوتك، تُحفظ النتيجة فقط. ويحوّل متصفحُك الصوتَ إلى نصٍّ عبر خدمة التعرّف التي يستعملها جهازك.
          </div>
        </div>
      )}

      {quran && phase === 'listen' && (
        <div className="bg-white rounded-2xl border border-slate-100 p-4" data-testid="daily-listen">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
              <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse" /> أسمعك… {SURAHS[surah - 1]} ({from}–{to})
            </div>
            <div className="text-xs text-slate-400" data-testid="daily-progress">{cursor} من {words.length} كلمة</div>
          </div>
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden mb-3"><div className="h-full bg-brand-600 transition-all" style={{ width: `${pct}%` }} /></div>

          {bad >= 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-3 text-center" data-testid="daily-repeat">
              <div className="text-red-700 font-extrabold text-lg flex items-center justify-center gap-2"><RotateCcw size={18} /> أعد</div>
              <div className="text-sm text-red-600 mt-1">ابدأ من: <b>{words[bad]?.raw}</b> (آية {words[bad]?.ayah})</div>
            </div>
          )}

          <div className="leading-10 text-lg text-slate-800 min-h-[60px]" data-testid="daily-words">
            {words.map((x, i) => (
              <span key={i} className={`inline-block mx-0.5 ${i < cursor ? 'text-green-700' : i === bad ? 'text-red-600 font-bold' : 'text-slate-300'}`}>
                {shown(i) ? x.raw : '••••'}
              </span>
            ))}
          </div>

          <div className="text-[11px] text-slate-400 mt-3 min-h-[16px]" data-testid="daily-heard">{heard ? `سمعتُ: ${heard}` : 'ابدأ القراءة…'}</div>
          {msg && <div className="text-red-600 text-sm mt-2">{msg}</div>}
          <div className="flex gap-2 mt-3">
            <button onClick={hint} className="flex items-center gap-1 text-xs border border-slate-200 text-slate-600 rounded-xl px-3 py-2"><Eye size={14} /> تلميح</button>
            <button data-testid="daily-stop" onClick={() => finish(false)} className="flex-1 text-sm border border-slate-200 text-slate-700 rounded-xl py-2.5 flex items-center justify-center gap-1"><MicOff size={14} /> انتهيت</button>
          </div>
          <div className="text-[11px] text-slate-400 mt-2 flex items-center gap-1"><Volume2 size={12} /> أعدتَ {repeats} {repeats === 1 ? 'مرة' : 'مرات'}{hints ? ` · تلميحات ${hints}` : ''}</div>
        </div>
      )}

      {phase === 'done' && (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-5 text-center" data-testid="daily-done">
          <div className="w-12 h-12 rounded-full bg-green-600 text-white flex items-center justify-center mx-auto mb-2"><Check size={26} /></div>
          <div className="text-green-800 font-extrabold text-lg">أحسنت! أتممتَ المدى</div>
          <div className="text-sm text-green-700 mt-1">{SURAHS[surah - 1]} ({from}–{to}) · {words.length} كلمة · أعدتَ {repeats} {repeats === 1 ? 'مرة' : 'مرات'}{hints ? ` · تلميحات ${hints}` : ''}</div>
          {practice && <div className="text-xs text-slate-500 mt-2">كانت تجربة، فلم تُحفظ.</div>}
          <button onClick={reset} className="mt-4 bg-brand-600 text-white font-bold rounded-xl px-5 py-2.5 text-sm">تسميع جديد</button>
        </div>
      )}

      {phase === 'stopped' && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 text-center" data-testid="daily-stopped">
          <div className="text-amber-800 font-bold">توقّف التسميع قبل أن يكتمل</div>
          <div className="text-sm text-amber-700 mt-1">وصلتَ إلى {cursor} من {words.length} كلمة، ولا تُحفظ إلا الجلسة المكتملة.</div>
          {msg && <div className="text-red-600 text-sm mt-2">{msg}</div>}
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
