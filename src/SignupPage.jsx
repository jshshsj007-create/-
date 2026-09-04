/**
 * الصفحة اللي يفتحها ولي الأمر: خارج التطبيق تمامًا، بلا تسجيل دخول،
 * وما تعرف شيئًا عن بقية البيانات — تستقبل فقط.
 */
import React, { useState, useEffect } from 'react';
import { Check, AlertTriangle, Plus, X, Copy, Upload, MessageCircle, Share2, MapPin, ChevronLeft, CalendarDays, Clock, Users } from 'lucide-react';
import { api } from './cloud.js';
import { FaydhLogo, TEAM_NAME } from './logo.jsx';
import { isValidPhone } from './people.js';
import { validateSubmission, dueFor, totalDue, isGuardianField, packageOf, coversAll, daysOf, RECEIPT_TYPES, RECEIPT_MAX, txt, TEXTS, CLOSED, waLink, fillTemplate, signupVars } from './signup.js';

const input = 'w-full border border-slate-200 rounded-xl px-3.5 py-3 text-[15px] text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent';
const inputBad = input.replace('border-slate-200', 'border-red-300');
const fmt = (n) => Number(n || 0).toLocaleString('en-US');
/**
 * رمز الريال السعودي (U+20C1) — يحلّ محلّ «ر.س» في كل ما يراه وليّ الأمر.
 *
 * ورمزٌ حديثٌ ما تحمله كل الخطوط: جرّبتُ خطوط جوجل فما فيها واحدٌ يرسمه، فمن
 * فتح الصفحة بجهازٍ خطُّه أقدم يرى مربّعًا فارغًا مكان المبلغ. فنسأل المتصفّح:
 * هل ترسمه؟ — نقيس عرضه ونقارنه بحرفٍ لا رسم له في خط. فإن رسمه فهو، وإلا
 * رجعنا إلى «ر.س». ولا يرى أحدٌ مربّعًا.
 */
const RIYAL = '\u20C1';
/**
 * حرفان غير مُسنَدين في يونيكود: لا خطَّ يرسمهما، فالمتصفّح يرسم لهما «المربّع
 * الفارغ» — وعرضه ثابت. فمن ساوى عرضُه عرضَهما فهو مربّعٌ مثلهما لا رمز.
 */
const NO_GLYPH = ['\u0378', '\u05FF'];
const drawsRiyal = () => {
  try {
    const c = document.createElement('canvas').getContext('2d');
    if (!c) return false;
    c.font = '64px Tajawal, system-ui, sans-serif';
    const w = (ch) => c.measureText(ch).width;
    const [a, b] = NO_GLYPH.map(w);
    // ما اتفق الشاهدان؟ إذًا القياس ما يُعتمد عليه — فنبقى على «ر.س»
    if (!a || Math.abs(a - b) > 0.5) return false;
    return w(RIYAL) > 0 && Math.abs(w(RIYAL) - a) > 0.5;
  } catch {
    return false;
  }
};

/**
 * هل يرسم جهازُ وليّ الأمر الرمز؟ يبدأ بـ«لا» فما يومض مربّعٌ لحظة.
 *
 * ولكلٍّ بديلُه: المبالغُ في السطور ترجع إلى «ر.س»، والشارةُ في الرأس ترجع
 * إلى الرقم مجرّدًا — فهي ضيّقة، ولو حشرنا فيها «ر.س» ضاع الرقم.
 */
const useRiyal = () => {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    let live = true;
    const check = () => { if (live && drawsRiyal()) setOk(true); };
    if (typeof document !== 'undefined' && document.fonts?.ready) document.fonts.ready.then(check).catch(check);
    else check();
    return () => { live = false; };
  }, []);
  return ok;
};

function Shell({ children }) {
  return (
    <div dir="rtl" className="min-h-screen bg-slate-50" style={{ fontFamily: "'Tajawal', sans-serif" }}>
      {/*
        الرأس ينتهي والبطاقة تبدأ — بلا تداخل.

        كان الرأس يمدّ ذيلًا والمحتوى يُسحب فيه، فتحسن بطاقةٌ صغيرة. أما بطاقة
        الصور الطويلة فيقطعها حدُّ الكحلي في ثلثها الأعلى، فتُقرأ مائلة.
      */}
      <div className="bg-brand-900 px-5 py-6">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <FaydhLogo size={44} variant="mark" />
          <div className="text-white font-extrabold text-xl">{TEAM_NAME}</div>
        </div>
      </div>
      <div className="px-4 pt-4 pb-16 max-w-lg mx-auto">{children}</div>
    </div>
  );
}

/**
 * معرض صور البرنامج.
 *
 * البوسترات عندنا طولية، والعرض بعرض الشاشة كان يخلّي الصورة الواحدة أطول من
 * شاشتين — فولي الأمر يمرّ عليها ولا يشوف «سجّل ابنك» إلا بعد شاشتين. فالإطار
 * ثابت الارتفاع والصورة تُحتوى داخله كاملة: ما تُقصّ منها زاوية، وما تبلع الصفحة.
 * والتفاصيل الدقيقة تُقرأ بالضغط — تنفتح بملء الشاشة.
 */
function Gallery({ ids, alt }) {
  const [at, setAt] = useState(0);
  const [full, setFull] = useState(false);
  // آخر لمسةٍ من ولي الأمر: بعدها نسكت قليلًا ثم نعود نتقلّب
  const [touchedAt, setTouchedAt] = useState(0);
  const touch = React.useRef(null);
  const n = ids.length;

  /**
   * الصور تتقلّب من نفسها.
   *
   * البوستر أول ما تراه العين، ولو وقف على صورةٍ واحدة ما عرف وليّ الأمر أن
   * خلفها غيرها — والنقاط الصغيرة لا تُرى. فتمشي وحدها، ويبقى السحب والضغط
   * على النقاط يعملان.
   *
   * وتسكت في ثلاث: وهي مفتوحةٌ بملء الشاشة (يقرأ التفاصيل، فلا تُسحب من
   * تحته)، وعشر ثوانٍ بعد كل لمسةٍ منه (اختار صورةً فلا نزيحها عنه)، ولمن
   * أطفأ الحركة في جهازه.
   */
  useEffect(() => {
    if (n < 2 || full) return undefined;
    const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (still) return undefined;
    const wait = Date.now() - touchedAt < 10000 ? 10000 : 4000;
    const t = setTimeout(() => setAt((i) => (i + 1) % n), wait);
    return () => clearTimeout(t);
  }, [at, n, full, touchedAt]);

  if (!n) return null;

  const go = (d) => { setTouchedAt(Date.now()); setAt((i) => (i + d + n) % n); };
  const pick = (i) => { setTouchedAt(Date.now()); setAt(i); };
  const swipe = {
    onTouchStart: (e) => { touch.current = e.changedTouches[0].clientX; },
    // في صفحة عربية الصورة التالية على اليسار، فالسحب لليسار يقدّم
    onTouchEnd: (e) => {
      const from = touch.current;
      if (from == null) return;
      const dx = e.changedTouches[0].clientX - from;
      if (Math.abs(dx) > 40) go(dx > 0 ? -1 : 1);
      touch.current = null;
    },
  };
  const src = (id) => `/api/img/${id}`;

  return (
    <>
      {/*
        إطارٌ واحد لا ثلاثة.

        كانت بطاقةٌ بيضاء، وفيها صندوقٌ رمادي، وفيه الصورة — فتُقرأ صورةً داخل
        صورة. وخلفها الآن هي نفسها مموّهةً معتمة، فما بقي حدٌّ ثانٍ تراه العين،
        ولا يُقصّ من الملصق شيء.
      */}
      <div className="relative rounded-2xl overflow-hidden h-[38vh] min-h-[190px] max-h-[330px] mb-2">
        {/*
          الصور كلها موضوعةٌ فوق بعض وتُذاب واحدةً في الأخرى، لا تُقطع قطعًا:
          الذوبان يُقرأ حركةً، والقطع يُقرأ خللًا. وهي محمّلةٌ سلفًا فما
          تُنتظر عند التقلّب.
        */}
        {ids.map((id, i) => (
          <div key={id} aria-hidden={i !== at}
            className={`absolute inset-0 transition-opacity duration-700 ${i === at ? 'opacity-100' : 'opacity-0'}`}>
            <div aria-hidden className="absolute inset-0 bg-center bg-cover scale-125 blur-2xl brightness-[.68]"
              style={{ backgroundImage: `url(${src(id)})` }} />
            <div className="relative w-full h-full flex items-center justify-center">
              <img src={src(id)} alt={i === at ? (alt || '') : ''} className="max-w-full max-h-full object-contain block" />
            </div>
          </div>
        ))}
        <button type="button" onClick={() => setFull(true)} {...swipe} aria-label="تكبير الصورة"
          className="absolute inset-0 w-full h-full" />
      </div>

      {/*
        كان تحتها شريط مصغّرات يأكل ستين بكسل من الشاشة الأولى. والنقاط
        والعدّاد يقولان نفس الشيء — «فيه غيرها، اسحب» — في عُشر المساحة.
        وموضعها خارج الإطار: لونها ثابتٌ يُقرأ، ولو نزلت على الصورة تبدّلت
        أرضيتها بتبدّل الصور فغابت في الفاتحة منها.
      */}
      {ids.length > 1 && (
        <div className="flex items-center justify-center gap-2 pb-1 mb-2">
          {ids.map((id, i) => (
            <button key={id} type="button" onClick={() => pick(i)} aria-label={`صورة ${i + 1}`}
              className={`h-1.5 rounded-full transition-all ${i === at ? 'w-5 bg-brand-700' : 'w-1.5 bg-slate-300'}`} />
          ))}
          <span className="text-[11px] text-slate-400 mr-1.5">{at + 1} من {ids.length}</span>
        </div>
      )}

      {full && (
        <div className="fixed inset-0 z-50 bg-slate-900/95 flex flex-col items-center justify-center gap-4 p-4"
          onClick={() => setFull(false)}>
          <button type="button" aria-label="إغلاق"
            className="absolute top-4 left-4 w-9 h-9 rounded-full bg-white/15 text-white flex items-center justify-center">
            <X size={20} />
          </button>
          <img src={src(ids[at])} alt={alt || ''} onClick={(e) => e.stopPropagation()} {...swipe}
            className="max-w-full max-h-[78vh] object-contain rounded" />
          {ids.length > 1 && (
            <>
              <div className="text-slate-300 text-sm">{at + 1} من {ids.length}</div>
              <div className="flex gap-1.5">
                {ids.map((id, i) => (
                  <span key={id} className={`w-1.5 h-1.5 rounded-full ${i === at ? 'bg-white' : 'bg-white/30'}`} />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}

/** زر واتساب — نفس شكله في كل مكان، وما يظهر إلا لو فيه رقم صالح. */
function WaButton({ href, children }) {
  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noreferrer"
      className="w-full bg-[#25D366] text-white font-bold rounded-xl py-3.5 flex items-center justify-center gap-2 text-[15px]">
      <MessageCircle size={19} /> {children}
    </a>
  );
}

/**
 * مكان اللقاء.
 *
 * «وين؟» أول ما يسأل عنه ولي الأمر، فيُجاب قبل النموذج لا بعده. ويُضغط السطر
 * فتنفتح الخريطة — نصٌّ يُنسخ ويُدوَّر عليه في الخريطة لا أحد يسويه.
 *
 * وبلا رابط يبقى السطر معلومةً تُقرأ، فما نعده بضغطةٍ ما تعطي شيئًا.
 */
function Place({ place }) {
  if (!place?.name) return null;
  // سطرٌ داخل البطاقة لا صندوقٌ فوقها: صار محتوى المكان أهمّ من إطاره
  const box = 'mt-3 pt-3 border-t border-slate-100 flex items-center gap-2.5';
  const body = (
    <>
      <MapPin size={15} className="text-brand-700 shrink-0" />
      <span className="font-semibold text-[12.5px] text-slate-700 leading-5 min-w-0">{place.name}</span>
      {place.map && (
        <span className="text-[11.5px] text-brand-600 font-bold mr-auto shrink-0 flex items-center">
          حنا هنا <ChevronLeft size={13} />
        </span>
      )}
    </>
  );
  return place.map
    ? <a href={place.map} target="_blank" rel="noreferrer" className={box}>{body}</a>
    : <div className={box}>{body}</div>;
}

/**
 * الحقائق الثلاث: شريط واحد مقسوم — لا ثلاث بطاقات ولا ثلاثة أسطر.
 *
 * وتحت كل قيمةٍ أيقونتها لا اسمها: «الجمعة» و«4-8» و«7-14» تُقرأ بذاتها،
 * فكلمةُ «اليوم» تحتها إخبارٌ بما عُلم. والأيقونة تُميّز الخانات بلمحةٍ
 * وتترك الفراغ للقيمة.
 */
const FACT_ICON = { day: CalendarDays, time: Clock, age: Users };

function Facts({ facts }) {
  if (!facts?.length) return null;
  return (
    <div className="mt-3 flex rounded-xl border border-slate-100 bg-slate-50 overflow-hidden">
      {facts.map((f, i) => {
        const Icon = FACT_ICON[f.id];
        return (
          <div key={f.id} className={`flex-1 py-2.5 px-1 flex flex-col items-center gap-1 ${i ? 'border-r border-slate-100' : ''}`}>
            {Icon && <Icon size={15} className="text-brand-600 shrink-0" aria-label={f.label} />}
            <div className="text-[13px] font-extrabold text-slate-800 whitespace-nowrap">{f.value}</div>
          </div>
        );
      })}
    </div>
  );
}

/** «و٥ فعاليات ثانية» — والعدد يغيّر صيغة الكلمة، فما نكتب «و1 فعاليات». */
const restText = (n) => {
  if (n === 1) return 'وفعالية ثانية';
  if (n === 2) return 'وفعاليتان ثانيتان';
  return n <= 10 ? `و${n} فعاليات ثانية` : `و${n} فعالية ثانية`;
};

/**
 * الأنشطة: سطرٌ واحد يتبدّل.
 *
 * كانت شاراتٍ مرصوصة تُقرأ كما يُقرأ جدول مواعيد، فتُمسح بالعين ولا تُرى.
 * وهذا سطرٌ واحد لا غير، ينقلب لنشاطٍ جديد كل ثانيتين — أصغر ارتفاعًا وأقوى
 * حركة، والعين تتبع المتحرّك ولا تتبع الساكن.
 */
function Chips({ chips }) {
  const n = chips?.length || 0;
  const [i, setI] = useState(0);
  useEffect(() => {
    if (n < 2) return undefined;
    const t = setInterval(() => setI((x) => (x + 1) % n), 2000);
    return () => clearInterval(t);
  }, [n]);
  if (!n) return null;
  const c = chips[i % n];
  return (
    <div>
      <div className="bg-white border border-slate-100 rounded-2xl px-3.5 py-4 flex items-center gap-3">
        {c.icon && <span className="text-[34px] leading-none shrink-0">{c.icon}</span>}
        <span className="min-w-0">
          <b className="block text-[15.5px] font-extrabold text-slate-800 truncate">{c.text}</b>
          {n > 1 && <span className="block text-[11px] text-slate-400 mt-0.5">{restText(n - 1)}</span>}
        </span>
      </div>
      {n > 1 && (
        <div className="flex gap-1 justify-center mt-2.5">
          {chips.map((x, k) => (
            <i key={k} className={`h-[5px] rounded-full transition-all ${k === i ? 'w-3.5 bg-slate-400' : 'w-[5px] bg-slate-200'}`} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * مشاركة الرابط: ولي الأمر يرسله لأي أحد بضغطة. قائمة المشاركة في الجوال
 * أسرع طريق لواتساب، وعلى ما ينقصه ذلك ننسخ الرابط وننبّهه إنه اننسخ.
 * وموضعه صفحة النجاح وحدها: أقوى لحظةٍ يوصّي فيها غيرَه أن يفرغ من تسجيله،
 * لا وهو يقرأ الصور بعدُ.
 */
function ShareButton({ title, label }) {
  const [said, setSaid] = useState('');
  const go = async () => {
    const url = typeof location === 'undefined' ? '' : location.href;
    const text = `${title}\n${url}`;
    try {
      if (navigator.share) { await navigator.share({ title, text: title, url }); return; }
      await navigator.clipboard.writeText(text);
      setSaid('اننسخ الرابط — الصقه وين ما تبي');
    } catch {
      setSaid('');
    }
    setTimeout(() => setSaid(''), 3000);
  };
  if (!label) return null;
  return (
    <>
      <button type="button" onClick={go}
        className="w-full bg-white border border-slate-200 text-slate-700 font-bold rounded-xl py-3.5 flex items-center justify-center gap-2 text-[15px]">
        <Share2 size={18} /> {label}
      </button>
      {said && <div className="text-xs text-center text-slate-500 mt-2">{said}</div>}
    </>
  );
}

function Note({ tone = 'brand', children }) {
  const tones = {
    brand: 'bg-brand-50 text-brand-900 border-brand-100',
    amber: 'bg-amber-50 text-amber-900 border-amber-200',
  };
  return <div className={`rounded-xl border px-3.5 py-2.5 text-sm ${tones[tone]}`}>{children}</div>;
}

function Row({ label, required, error, hint, children }) {
  return (
    <div className="mb-4">
      {/* الفاضي معناه «شِله» — فلا تبقى نجمةٌ معلّقة بلا كلمة تحتها */}
      {label && (
        <label className="block text-sm font-semibold text-slate-700 mb-1.5">
          {label}{required && <span className="text-red-500 mr-1">*</span>}
        </label>
      )}
      {children}
      {hint && !error && <div className="text-[11px] text-slate-400 mt-1">{hint}</div>}
      {error && <div className="text-red-500 text-xs mt-1">{error}</div>}
    </div>
  );
}

/** خانة واحدة حسب نوعها. */
function FieldInput({ field, value, onChange, bad }) {
  const cls = bad ? inputBad : input;
  if (field.type === 'choice') {
    return (
      <div className="flex flex-wrap gap-2">
        {(field.options || []).map((o) => (
          <button key={o} type="button" onClick={() => onChange(o)}
            className={`px-4 py-2.5 rounded-xl border text-sm ${value === o ? 'bg-brand-600 text-white border-brand-600' : 'border-slate-200 text-slate-600 bg-white'}`}>
            {o}
          </button>
        ))}
      </div>
    );
  }
  return (
    <input
      className={cls}
      dir={field.type === 'phone' ? 'ltr' : undefined}
      inputMode={field.type === 'phone' ? 'tel' : field.type === 'number' ? 'numeric' : undefined}
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={field.type === 'phone' ? '05xxxxxxxx' : ''}
    />
  );
}

/**
 * صور الجوال تجي بأحجام ضخمة، فنصغّرها في المتصفح قبل الإرسال.
 * الـ PDF يُرسل كما هو ما دام ضمن الحد.
 */
const readReceipt = (file) => new Promise((resolve, reject) => {
  if (!RECEIPT_TYPES.includes(file.type)) { reject(new Error('نوع الملف مو مدعوم. أرسل صورة أو PDF.')); return; }
  const asIs = () => {
    const fr = new FileReader();
    fr.onload = () => {
      const data = String(fr.result || '');
      if (data.length > RECEIPT_MAX * 1.4) reject(new Error('الملف كبير. جرّب صورة بدل الـPDF.'));
      else resolve({ name: file.name, type: file.type, data });
    };
    fr.onerror = () => reject(new Error('ما قدرنا نقرأ الملف.'));
    fr.readAsDataURL(file);
  };
  if (file.type === 'application/pdf') { asIs(); return; }

  const fr = new FileReader();
  fr.onerror = () => reject(new Error('ما قدرنا نقرأ الصورة.'));
  fr.onload = () => {
    const img = new Image();
    img.onerror = () => reject(new Error('الصورة مو سليمة.'));
    img.onload = () => {
      const max = 1400;
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      let q = 0.75;
      let data = c.toDataURL('image/jpeg', q);
      while (data.length > RECEIPT_MAX && q > 0.35) { q -= 0.12; data = c.toDataURL('image/jpeg', q); }
      if (data.length > RECEIPT_MAX * 1.4) { reject(new Error('الصورة كبيرة جدًا. جرّب صورة أوضح وأصغر.')); return; }
      resolve({ name: file.name, type: 'image/jpeg', data });
    };
    img.src = String(fr.result || '');
  };
  fr.readAsDataURL(file);
});

export default function SignupPage({ token }) {
  const [view, setView] = useState(null);
  const [state, setState] = useState('loading'); // loading | closed | form | sending | done | error
  const [answers, setAnswers] = useState({});
  const [kids, setKids] = useState([{ name: '', days: [] }]);
  const [accountId, setAccountId] = useState('');
  const [errors, setErrors] = useState({});
  const [result, setResult] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const [busy, setBusy] = useState(false);
  const [openMore, setOpenMore] = useState([]);   // أبناءٌ فُتحت تفاصيلهم الاختيارية
  const [atForm, setAtForm] = useState(false);    // وصل النموذج، فالزر الثابت ما عاد له معنى
  const formTop = React.useRef(null);
  // الرمز أو «ر.س» — حسب ما يرسمه جهاز وليّ الأمر
  const hasRiyal = useRiyal();
  const SAR = hasRiyal ? RIYAL : 'ر.س';

  /**
   * الزر الثابت يختفي عند النموذج: ما فيه معنى لزرٍّ يوعد بنقلك إلى مكانٍ
   * أنت واقفٌ فيه. وبلا `IntersectionObserver` يبقى ظاهرًا — ظهورٌ زائد
   * أهون من زرٍّ لا يظهر أصلًا.
   */
  useEffect(() => {
    const el = formTop.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver(([e]) => setAtForm(e.isIntersecting), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, [state]);

  const [goWa, setGoWa] = useState('');
  const [closedWa, setClosedWa] = useState('');
  const [closedTexts, setClosedTexts] = useState({ title: '', text: '' });

  /**
   * بعد التسجيل يشوف رقمه المرجعي أول، ثم يتحوّل للمحادثة. المهلة مقصودة:
   * لو حوّلناه فورًا ما لحق يقرأ شيئًا. والزر تحت يبقى شبكة أمان لو منع
   * المتصفح التحويل التلقائي.
   */
  useEffect(() => {
    if (!goWa) return undefined;
    const t = setTimeout(() => { location.href = goWa; }, 2200);
    return () => clearTimeout(t);
  }, [goWa]);

  useEffect(() => {
    (async () => {
      const r = await api('signup_info', { token });
      if (r.status === 200 && r.body?.view) {
        setView(r.body.view);
        // ما فيه أيام مفتوحة (أو باقات): التسجيل ما ينفع يستقر في مكان
        if (r.body.view.blocked) { setState('blocked'); return; }
        // الموعد يبدأ فاضيًا ولو كان واحدًا: ضغطته إقرار منه إنه شافه
        if (r.body.view.accounts.length === 1) setAccountId(r.body.view.accounts[0].id);
        setState('form');
      } else if (r.status === 404) {
        // الرابط مقفل، لكن الخادم يرجّع رقم الفريق عشان يبقى له طريق يوصلنا منه
        setClosedWa(r.body?.wa || '');
        setClosedTexts({ title: r.body?.closedTitle || '', text: r.body?.closedText || '' });
        setState('closed');
      } else setState('error');
    })();
  }, [token]);

  if (state === 'loading') {
    return <Shell><div className="bg-white rounded-2xl p-10 text-center text-slate-400">جاري التحميل...</div></Shell>;
  }

  if (state === 'blocked') {
    // «تواصل مع الفريق» بلا طريق للفريق كلام فاضي، فالزر جزء من الرسالة لا زينة
    const href = waLink(view?.wa?.number, '');
    return (
      <Shell>
        <div className="bg-white rounded-2xl p-8 text-center">
          <div className="text-4xl mb-3">⏳</div>
          <div className="font-bold text-lg text-slate-800 mb-1">التسجيل مو متاح حاليًا</div>
          <div className="text-sm text-slate-500 mb-5">
            {view?.programName ? `«${view.programName}» ` : ''}ما فتح للتسجيل بعد. تواصل مع الفريق.
          </div>
          <WaButton href={href}>{txt(view, 'contact') || TEXTS.contact}</WaButton>
        </div>
      </Shell>
    );
  }

  if (state === 'closed') {
    const href = waLink(closedWa, '');
    return (
      <Shell>
        <div className="bg-white rounded-2xl p-8 text-center">
          <div className="text-4xl mb-3">🔒</div>
          <div className="font-bold text-lg text-slate-800 mb-1">{closedTexts.title || CLOSED.title}</div>
          {(closedTexts.text ?? CLOSED.text) !== '' && (
            <div className="text-sm text-slate-500 mb-5 whitespace-pre-wrap">{closedTexts.text || CLOSED.text}</div>
          )}
          <WaButton href={href}>{TEXTS.contact}</WaButton>
        </div>
      </Shell>
    );
  }

  if (state === 'error') {
    return (
      <Shell>
        <div className="bg-white rounded-2xl p-8 text-center">
          <AlertTriangle size={28} className="mx-auto text-amber-500 mb-3" />
          <div className="font-bold text-slate-800 mb-1">ما قدرنا نفتح الصفحة</div>
          <div className="text-sm text-slate-500 mb-4">تأكد من اتصالك بالإنترنت وجرّب مرة ثانية.</div>
          <button className="bg-brand-600 text-white font-semibold px-5 py-2.5 rounded-xl text-sm" onClick={() => location.reload()}>إعادة المحاولة</button>
        </div>
      </Shell>
    );
  }

  /** عنوان المشاركة: اللي يوصله الرابط يعرف وش هو قبل ما يفتح. */
  const shareTitle = `${view?.programName || TEAM_NAME} — التسجيل مفتوح`;

  if (state === 'done') {
    const vars = signupVars(view, { answers, kids, accountId }, { ref: result?.ref });
    // المجموعة تُدخله فيها بلا رسالة — رابطُها ما يحمل نصًّا. والرقم برسالته
    const href = !view.wa.redirect ? ''
      : (view.wa.redirectUrl || waLink(view.wa.number, fillTemplate(view.wa.template, vars)));
    const note = txt(view, 'redirectNote', vars);
    return (
      <Shell>
        <div className="bg-white rounded-2xl p-8 text-center">
          <div className="w-14 h-14 rounded-full bg-green-100 text-green-700 flex items-center justify-center mx-auto mb-4">
            <Check size={28} />
          </div>
          {txt(view, 'successTitle', vars) && (
            <div className="font-bold text-xl text-slate-800 mb-1">{txt(view, 'successTitle', vars)}</div>
          )}
          {txt(view, 'successSub', vars) && (
            <div className="text-sm text-slate-500 mb-5">{txt(view, 'successSub', vars)}</div>
          )}
          {txt(view, 'refLabel', vars) && (
            <div className="bg-slate-50 rounded-xl px-4 py-3 text-sm text-slate-600 mb-5">
              {txt(view, 'refLabel', vars)}: <b dir="ltr">{result?.ref}</b>
            </div>
          )}
          {href && (
            <>
              {note && <Note tone="amber">{note}</Note>}
              <div className="mt-3"><WaButton href={href}>{txt(view, 'openWa', vars)}</WaButton></div>
            </>
          )}
          {/* أقوى لحظة يوصّي فيها غيره: خلّص وارتاح */}
          <div className="mt-3"><ShareButton title={shareTitle} label={txt(view, 'share')} /></div>
        </div>
      </Shell>
    );
  }

  /* --------------------------------- النموذج --------------------------------- */

  const fields = view.fields;
  const guardianFields = fields.filter(isGuardianField);
  const kidFields = fields.filter((f) => f.id !== 'name' && !isGuardianField(f));
  /**
   * المطلوب ظاهر، والاختياري مطويّ خلف سطر.
   *
   * ستّ خانات مفتوحة تُقرأ عبئًا وإن كان نصفها ما يلزم. ومن أراد أن يكتب الصف
   * والمدرسة فتحها، ومن لم يُرد مرّ. والقرار في أيّها مطلوب يبقى لصاحب
   * التطبيق في شاشة الخانات — ما غيّرناه، إنما أخفينا ما قال هو إنه اختياري.
   */
  const mustFields = kidFields.filter((f) => f.required);
  const moreFields = kidFields.filter((f) => !f.required);
  // شبكة أمان: أي خطأ ما لقى خانة يعرضها ما ينفع يختفي بصمت
  const shownKeys = new Set([
    ...guardianFields.map((f) => f.id), 'accountId', 'kids', '_', 'receipt',
    ...kids.flatMap((_, i) => [`kid${i}.name`, `kid${i}.days`, `kid${i}.package`, ...kidFields.map((f) => `kid${i}.${f.id}`)]),
  ]);
  const orphanErrors = Object.entries(errors).filter(([k, v]) => v && !shownKeys.has(k));
  const many = kids.length > 1;

  const setKid = (i, patch) => setKids(kids.map((k, j) => (j === i ? { ...k, ...patch } : k)));
  const toggleDay = (i, dayId) => {
    const cur = kids[i].days || [];
    setKid(i, { days: cur.includes(dayId) ? cur.filter((d) => d !== dayId) : [...cur, dayId] });
  };

  const submit = async () => {
    const body = { token, answers, kids: kids.map(fixDays), accountId, receipt };
    const check = validateSubmission(view, body);
    if (!check.ok) {
      setErrors(check.errors);
      const first = document.querySelector('[data-bad="1"]');
      if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setErrors({});
    setState('sending');
    const r = await api('signup_submit', body);
    if (r.status === 200) {
      setResult(r.body);
      if (view.wa.redirect) {
        const vars = signupVars(view, body, { ref: r.body?.ref });
        setGoWa(view.wa.redirectUrl || waLink(view.wa.number, fillTemplate(view.wa.template, vars)));
      }
      setState('done');
      return;
    }
    if (r.status === 400 && r.body?.errors) { setErrors(r.body.errors); setState('form'); return; }
    if (r.status === 429) { setErrors({ _: 'أرسلت محاولات كثيرة. انتظر شوي وجرّب مرة ثانية.' }); setState('form'); return; }
    if (r.status === 404) { setState('closed'); return; }
    setErrors({ _: 'ما وصل التسجيل. تأكد من الإنترنت وجرّب مرة ثانية.' });
    setState('form');
  };

  /**
   * الأيام التي لا تُعرض تُكتب للابن بأنفسنا: الباقة أيامها ما بقي من الموسم،
   * ومن أطفأ الاختيار كتبها بنفسه. والمبلغ لا بدّ أن يُحسب على أيامٍ حقيقية
   * لا على فراغ. وهو نفس ما يسويه الخادم في `normalizeSubmission`.
   */
  const fixDays = (k) => {
    const pkg = view.usePackages ? packageOf(view, k) : null;
    if (pkg && !pkg.perDay) return { ...k, days: daysOf(view, pkg).map((d) => d.id) };
    return view.pickDays ? k : { ...k, days: view.days.map((d) => d.id) };
  };
  const total = totalDue(view, kids.map(fixDays));
  const contactHref = view.wa.contactUrl || waLink(view.wa.number, '');

  /**
   * السعر في الرأس: سعر اليوم الواحد.
   *
   * كان أرخص الخيارات مسبوقًا بـ«من» — فلمّا قلّ الباقي من الموسم صار الاشتراك
   * أرخص من اليوم، فطلع في الإعلان رقمٌ يظنّه ولي الأمر سعر البرنامج. وسعر
   * اليوم ثابتٌ معروف، والاشتراك يشوفه في الخيارات تحت.
   */
  const daily = (view.packages || []).find((p) => p.perDay);
  const packMin = (view.packages || []).map((p) => Number(p.price || 0)).filter((n) => n > 0);
  const headline = daily ? Number(daily.price || 0)
    : view.usePackages ? (packMin.length ? Math.min(...packMin) : 0)
      : Number(view.price || 0);

  /**
   * خانات ولي الأمر تنزل داخل بطاقة الابن الأول، تحت اسمه مباشرة — لأنها
   * تُسأل مرة وحدة للعائلة كلها. وبطاقة الابن الثاني وما بعده بلا جوال:
   * ما نسأل أبًا عن جواله ثلاث مرات لأن عنده ثلاثة أبناء.
   */
  const guardianBlock = (
    <>
      {guardianFields.map((f) => (
        <div key={f.id} data-bad={errors[f.id] ? '1' : undefined}>
          <Row label={f.label} required={f.required} error={errors[f.id]}
            hint={f.id === 'gPhone' ? txt(view, 'guardianHint') : ''}>
            <FieldInput field={f} value={answers[f.id]} bad={!!errors[f.id]}
              onChange={(v) => { setAnswers({ ...answers, [f.id]: v }); setErrors({ ...errors, [f.id]: null }); }} />
          </Row>
        </div>
      ))}
      {answers.gPhone && !isValidPhone(answers.gPhone) && !errors.gPhone && (
        <div className="text-xs text-slate-400 -mt-2 mb-4">مثال: 0551234567</div>
      )}
    </>
  );

  return (
    <Shell>
      {/* الصور أولًا: يشوف قبل ما يقرأ */}
      <Gallery ids={[view.poster, ...(view.gallery || [])].filter(Boolean)} alt={view.programName} />

      <div className="bg-white rounded-2xl p-4 mb-3">
        {txt(view, 'intro') && <div className="text-[11.5px] text-slate-400 mb-0.5">{txt(view, 'intro')}</div>}
        <div className="flex items-start gap-2.5">
          <div className="font-extrabold text-[19px] text-slate-800 leading-[1.4] flex-1 min-w-0">{view.programName}</div>
          {/* السعر يُعرف قبل ما يعبّي، فما يقف في نص النموذج */}
          {headline > 0 && (
            <span className="shrink-0 bg-green-50 border border-green-200 text-green-900 rounded-lg px-2.5 py-1 text-[14px] font-extrabold" dir="ltr">
              {fmt(headline)}{hasRiyal ? ` ${RIYAL}` : ''}
            </span>
          )}
        </div>
        <Facts facts={view.facts} />
        <Place place={view.place} />
      </div>

      {view.chips?.length > 0 && (
        <div className="mb-3">
          {txt(view, 'activities') && (
            <div className="text-[12px] font-extrabold text-slate-400 px-1 mb-1.5">{txt(view, 'activities')}</div>
          )}
          <Chips chips={view.chips} />
        </div>
      )}

      {/* الطمأنة تهمس ولا تصيح: هي جواب أبٍ متردّد، لا إعلانٌ يُزاحم الأنشطة */}
      {view.trust && (
        <div className="text-[11.5px] text-slate-500 leading-6 px-1 mb-3 flex gap-1.5">
          <Check size={14} className="text-brand-600 shrink-0 mt-1" />
          <span>{view.trust}</span>
        </div>
      )}

      {view.notice && <div className="mb-3"><Note tone="amber">{view.notice}</Note></div>}

      {/* أنحف مما كان: هو ثانويٌّ للتسجيل، وكان أعرض منه وأبرز */}
      {view.wa.contact && contactHref && (
        <a href={contactHref} target="_blank" rel="noreferrer"
          className="w-full bg-[#25D366] text-white font-bold rounded-xl py-2.5 mb-3 flex items-center justify-center gap-2 text-[13.5px]">
          <MessageCircle size={17} /> {txt(view, 'contact')}
        </a>
      )}

      <div ref={formTop} />

      {kids.map((kid, i) => (
        <div key={i} className="bg-white rounded-2xl p-5 mb-4">
          <div className="flex items-center justify-between mb-4">
            <div className="font-bold text-slate-800">{many ? `${txt(view, 'student')} ${i + 1}` : txt(view, 'student')}</div>
            {many && (
              <button type="button" className="text-red-400 p-1" onClick={() => setKids(kids.filter((_, j) => j !== i))}>
                <X size={18} />
              </button>
            )}
          </div>

          <div data-bad={errors[`kid${i}.name`] ? '1' : undefined}>
            <Row label="اسم الطالب الثلاثي" required error={errors[`kid${i}.name`]}>
              <input className={errors[`kid${i}.name`] ? inputBad : input} value={kid.name || ''}
                placeholder="محمد سعد القاسم"
                onChange={(e) => { setKid(i, { name: e.target.value }); setErrors({ ...errors, [`kid${i}.name`]: null }); }} />
            </Row>
          </div>

          {/* الجوال تحت اسم الابن الأول، ويُسأل مرة وحدة للعائلة كلها */}
          {i === 0 && guardianBlock}

          {mustFields.map((f) => (
            <div key={f.id} data-bad={errors[`kid${i}.${f.id}`] ? '1' : undefined}>
              <Row label={f.label} required={f.required} error={errors[`kid${i}.${f.id}`]}>
                <FieldInput field={f} value={kid[f.id]} bad={!!errors[`kid${i}.${f.id}`]}
                  onChange={(v) => { setKid(i, { [f.id]: v }); setErrors({ ...errors, [`kid${i}.${f.id}`]: null }); }} />
              </Row>
            </div>
          ))}

          {moreFields.length > 0 && (
            (openMore.includes(i) || moreFields.some((f) => errors[`kid${i}.${f.id}`])) ? (
              moreFields.map((f) => (
                <div key={f.id} data-bad={errors[`kid${i}.${f.id}`] ? '1' : undefined}>
                  <Row label={f.label} required={f.required} error={errors[`kid${i}.${f.id}`]}>
                    <FieldInput field={f} value={kid[f.id]} bad={!!errors[`kid${i}.${f.id}`]}
                      onChange={(v) => { setKid(i, { [f.id]: v }); setErrors({ ...errors, [`kid${i}.${f.id}`]: null }); }} />
                  </Row>
                </div>
              ))
            ) : (
              <button type="button" onClick={() => setOpenMore([...openMore, i])}
                className="w-full mb-4 border border-slate-200 rounded-xl px-3.5 py-3 flex items-center justify-between text-[13px] font-semibold text-slate-600">
                <span>{txt(view, 'moreFields')}</span>
                <span className="text-slate-300 text-lg leading-none">+</span>
              </button>
            )
          )}

          {view.usePackages && (
            <div data-bad={errors[`kid${i}.package`] ? '1' : undefined}>
              <Row label={txt(view, 'packageLabel')} required error={errors[`kid${i}.package`]}>
                <div className="space-y-2">
                  {view.packages.map((pk) => {
                    const on = kid.packageId === pk.id;
                    return (
                      <button key={pk.id} type="button"
                        onClick={() => {
                          // الباقة تُملأ بما بقي من الموسم، واليومي يبدأ فاضيًا ليختار
                          const all = coversAll(view, pk);
                          setKid(i, { packageId: pk.id, days: all ? daysOf(view, pk).map((d) => d.id) : [] });
                          setErrors({ ...errors, [`kid${i}.package`]: null, [`kid${i}.days`]: null });
                        }}
                        className={`w-full text-right px-4 py-3 rounded-xl border flex items-center justify-between ${on ? 'border-brand-600 bg-brand-50' : 'border-slate-200'}`}>
                        <span className="min-w-0">
                          <span className="block font-semibold text-slate-800">{pk.name}</span>
                          {/*
                            الاسم فوق بلونه، وتحته سطرٌ أخفّ: مدّةُ الباقة، أو
                            ما كتبتَه تحت اليومي — تاريخُه غالبًا. فالعين تقرأ
                            الاسم أولًا ثم تنزل للتفصيل، ولا يزاحمه في سطره.
                          */}
                          {(pk.perDay ? pk.note : pk.days > 0 && `${pk.days} ${pk.days === 1 ? 'يوم' : 'أيام'}`) && (
                            <span className="block text-[11px] text-slate-400">
                              {pk.perDay ? pk.note : `${pk.days} ${pk.days === 1 ? 'يوم' : 'أيام'}`}
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 font-bold text-brand-700 text-left">
                          {fmt(pk.price)} {SAR}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </Row>
            </div>
          )}

          {view.pickDays && view.days.length > 0 && (!view.usePackages || kid.packageId)
            && !(view.usePackages && coversAll(view, packageOf(view, kid))) && (() => {
            const picked = (kid.days || []).length;
            const full = false; // اليومي مفتوح على ما فُتح، بلا حدٍّ لعدده
            return (
              <div data-bad={errors[`kid${i}.days`] ? '1' : undefined}>
                <Row label={txt(view, 'days')} required error={errors[`kid${i}.days`]}>
                  {view.usePackages && (
                    <div className="text-xs text-slate-500 mb-2">
                      اختر الأيام اللي تبيها — اخترت {picked} من {view.days.length}
                    </div>
                  )}
                  {/*
                    الأزرار المربّعة تريح لما الأيام قليلة، وتتعب لما تكثر —
                    فصاحب البرنامج يختار «قائمة» فتنزل سطرًا سطرًا بمساحة أقل.
                  */}
                  {view.dayStyle === 'list' ? (
                    <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden">
                      {view.days.map((d) => {
                        const on = (kid.days || []).includes(d.id);
                        const blocked = !on && full;
                        return (
                          <label key={d.id}
                            className={`flex items-center gap-3 px-3.5 py-3 text-sm ${blocked ? 'opacity-40' : 'cursor-pointer'} ${on ? 'bg-brand-50' : ''}`}>
                            <input type="checkbox" checked={on} disabled={blocked}
                              onChange={() => { toggleDay(i, d.id); setErrors({ ...errors, [`kid${i}.days`]: null }); }} />
                            <span className="min-w-0">
                              <span className="block text-slate-800">{d.name}</span>
                              {d.date && <span className="block text-[11px] text-slate-400">{d.date}</span>}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {view.days.map((d) => {
                      const on = (kid.days || []).includes(d.id);
                      // الباقة الممتلئة تقفل بقية الأيام بدل ما يزيد ثم يُرفض
                      const blocked = !on && full;
                      return (
                        <button key={d.id} type="button" disabled={blocked}
                          onClick={() => { toggleDay(i, d.id); setErrors({ ...errors, [`kid${i}.days`]: null }); }}
                          className={`px-3 py-2.5 rounded-xl border text-sm text-right disabled:opacity-40 ${on ? 'bg-brand-600 text-white border-brand-600' : 'border-slate-200 text-slate-600'}`}>
                          {d.name}
                          {d.date && <span className={`block text-[11px] ${on ? 'text-brand-200' : 'text-slate-400'}`}>{d.date}</span>}
                        </button>
                      );
                    })}
                  </div>
                  )}
                  {dueFor(view, kid) > 0 && (
                    <div className="text-sm text-brand-800 bg-brand-50 rounded-xl px-3 py-2 mt-3 font-semibold">
                      {view.usePackages && !pkg?.perDay ? pkg.name : `${picked} يوم`} · {fmt(dueFor(view, kid))} {SAR}
                    </div>
                  )}
                </Row>
              </div>
            );
          })()}
        </div>
      ))}

      {/* ومن مسح تسميته أخفى الزر — فبرنامجٌ لابنٍ واحدٍ ما يُعرض فيه */}
      {txt(view, 'addKid') && (
        <button type="button" className="w-full bg-white border border-dashed border-slate-300 text-brand-700 font-semibold rounded-2xl py-3.5 mb-4 flex items-center justify-center gap-2"
          onClick={() => setKids([...kids, { name: '', days: [] }])}>
          <Plus size={18} /> {txt(view, 'addKid')}
        </button>
      )}

      {view.accounts.length > 0 && (
        <div className="bg-white rounded-2xl p-5 mb-4" data-bad={errors.accountId ? '1' : undefined}>
          <div className="font-bold text-slate-800 mb-1">{txt(view, 'payLabel')}</div>
          {total > 0 && <div className="text-sm text-slate-500 mb-4">{txt(view, 'dueLabel')}: <b className="text-brand-700">{fmt(total)} {SAR}</b></div>}
          <div className="space-y-2">
            {view.accounts.map((a) => {
              const on = accountId === a.id;
              return (
                <button key={a.id} type="button" onClick={() => { setAccountId(a.id); setErrors({ ...errors, accountId: null }); }}
                  className={`w-full text-right px-4 py-3 rounded-xl border ${on ? 'border-brand-600 bg-brand-50' : 'border-slate-200'}`}>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-800">{a.name}</span>
                    {on && <Check size={18} className="text-brand-600" />}
                  </div>
                  {on && a.transferInfo && (
                    <div className="mt-2 pt-2 border-t border-brand-100">
                      <div className="text-xs text-slate-500 mb-1">حوّل على:</div>
                      <div className="font-mono text-[13px] text-slate-800 select-all break-all" dir="ltr">{a.transferInfo}</div>
                    </div>
                  )}
                  {on && !a.transferInfo && <div className="text-xs text-slate-500 mt-1.5">يُدفع عند الحضور.</div>}
                </button>
              );
            })}
          </div>
          {errors.accountId && <div className="text-red-500 text-xs mt-2">{errors.accountId}</div>}

          {(() => {
            const acc = view.accounts.find((a) => a.id === accountId);
            if (!acc?.needsReceipt) return null;
            return (
              <div className="mt-4 pt-4 border-t border-slate-100" data-bad={errors.receipt ? '1' : undefined}>
                <div className="font-semibold text-slate-700 text-sm mb-1">صورة الإيصال <span className="text-red-500">*</span></div>
                <div className="text-xs text-slate-500 mb-3">
                  بعد ما تحوّل، أرفق صورة الإيصال أو لقطة من التحويل. بدونها ما يكتمل التسجيل.
                </div>
                {receipt ? (
                  <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl p-3">
                    {receipt.type === 'application/pdf'
                      ? <div className="w-14 h-14 rounded-lg bg-white border border-green-200 flex items-center justify-center text-xs text-slate-500 shrink-0">PDF</div>
                      : <img src={receipt.data} alt="الإيصال" className="w-14 h-14 rounded-lg object-cover shrink-0" />}
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-green-800">تم إرفاق الإيصال</div>
                      <div className="text-[11px] text-slate-500 truncate">{receipt.name}</div>
                    </div>
                    <button type="button" className="text-slate-400 p-1 shrink-0" onClick={() => setReceipt(null)}><X size={18} /></button>
                  </div>
                ) : (
                  <label className={`block text-center border border-dashed rounded-xl py-6 cursor-pointer ${errors.receipt ? 'border-red-300 bg-red-50' : 'border-slate-300'}`}>
                    <Upload size={22} className="mx-auto text-slate-400 mb-2" />
                    <span className="text-sm font-semibold text-brand-700">{busy ? 'جاري التجهيز...' : 'اختر صورة أو ملف'}</span>
                    <span className="block text-[11px] text-slate-400 mt-1">صورة أو PDF</span>
                    <input type="file" className="hidden" accept="image/*,application/pdf"
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        e.target.value = '';
                        if (!f) return;
                        setBusy(true);
                        setErrors({ ...errors, receipt: null });
                        try { setReceipt(await readReceipt(f)); }
                        catch (err) { setErrors({ ...errors, receipt: err.message }); }
                        finally { setBusy(false); }
                      }} />
                  </label>
                )}
                {errors.receipt && <div className="text-red-500 text-xs mt-2">{errors.receipt}</div>}
              </div>
            );
          })()}
        </div>
      )}

      {errors._ && <div className="mb-4"><Note tone="amber">{errors._}</Note></div>}
      {orphanErrors.length > 0 && (
        <div className="mb-4"><Note tone="amber">
          راجع الخانات: {orphanErrors.map(([k, v]) => `${k}: ${v}`).join(' · ')}
        </Note></div>
      )}
      {errors.kids && <div className="mb-4"><Note tone="amber">{errors.kids}</Note></div>}

      <button type="button" disabled={state === 'sending'} onClick={submit}
        className="w-full bg-brand-600 text-white font-bold rounded-2xl py-4 text-[15px] disabled:opacity-50">
        {state === 'sending' ? 'جاري الإرسال...' : txt(view, 'submit')}
      </button>

      {/*
        من اقتنع من أول شاشة يسجّل من موضعه، فما ينزل الصفحة كلها يدوّر أين
        يبدأ. و«تواصل معنا» أيقونة: هو ثانويٌّ، وكان أعرض من التسجيل نفسه.
      */}
      {!atForm && (txt(view, 'goForm') || contactHref) && (
        <div className="fixed bottom-0 inset-x-0 z-40 bg-white/96 backdrop-blur border-t border-slate-200 px-4 py-2.5">
          <div className="max-w-lg mx-auto flex items-center gap-2.5">
            {view.wa.contact && contactHref && (
              <a href={contactHref} target="_blank" rel="noreferrer" aria-label={txt(view, 'contact')}
                className="w-12 h-12 rounded-2xl bg-[#25D366] text-white flex items-center justify-center shrink-0">
                <MessageCircle size={21} />
              </a>
            )}
            {txt(view, 'goForm') && (
              <button type="button" className="flex-1 bg-brand-900 text-white font-extrabold rounded-2xl py-3.5 text-[15px]"
                onClick={() => formTop.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
                {txt(view, 'goForm')}
              </button>
            )}
          </div>
        </div>
      )}
      {!atForm && <div className="h-16" />}
    </Shell>
  );
}
