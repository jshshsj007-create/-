/**
 * الصفحة اللي يفتحها ولي الأمر: خارج التطبيق تمامًا، بلا تسجيل دخول،
 * وما تعرف شيئًا عن بقية البيانات — تستقبل فقط.
 */
import React, { useState, useEffect } from 'react';
import { Check, AlertTriangle, Plus, X, Copy, Upload } from 'lucide-react';
import { api } from './cloud.js';
import { FaydhLogo } from './logo.jsx';
import { isValidPhone } from './people.js';
import { validateSubmission, dueFor, totalDue, isGuardianField, packageOf, daysAllowed, daysAreFixed, coversAll, RECEIPT_TYPES, RECEIPT_MAX } from './signup.js';

const input = 'w-full border border-slate-200 rounded-xl px-3.5 py-3 text-[15px] text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent';
const inputBad = input.replace('border-slate-200', 'border-red-300');
const fmt = (n) => Number(n || 0).toLocaleString('en-US');

function Shell({ children }) {
  return (
    <div dir="rtl" className="min-h-screen bg-slate-50" style={{ fontFamily: "'Tajawal', sans-serif" }}>
      <div className="bg-brand-900 px-5 pt-6 pb-14">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <FaydhLogo size={44} variant="mark" />
          <div className="text-white font-extrabold text-xl">فريق فيض</div>
        </div>
      </div>
      <div className="px-4 -mt-8 pb-16 max-w-lg mx-auto">{children}</div>
    </div>
  );
}

function Note({ tone = 'brand', children }) {
  const tones = {
    brand: 'bg-brand-50 text-brand-900 border-brand-100',
    amber: 'bg-amber-50 text-amber-900 border-amber-200',
  };
  return <div className={`rounded-xl border px-3.5 py-2.5 text-sm ${tones[tone]}`}>{children}</div>;
}

function Row({ label, required, error, children }) {
  return (
    <div className="mb-4">
      <label className="block text-sm font-semibold text-slate-700 mb-1.5">
        {label}{required && <span className="text-red-500 mr-1">*</span>}
      </label>
      {children}
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

  useEffect(() => {
    (async () => {
      const r = await api('signup_info', { token });
      if (r.status === 200 && r.body?.view) {
        setView(r.body.view);
        // ما فيه أيام مفتوحة (أو باقات): التسجيل ما ينفع يستقر في مكان
        if (r.body.view.blocked) { setState('blocked'); return; }
        // اليوم الوحيد يُختار تلقائيًا — ما فيه داعي نخليه يضغط
        const d = r.body.view.days;
        if (d.length === 1 && !r.body.view.usePackages) setKids([{ name: '', days: [d[0].id] }]);
        if (r.body.view.accounts.length === 1) setAccountId(r.body.view.accounts[0].id);
        setState('form');
      } else if (r.status === 404) setState('closed');
      else setState('error');
    })();
  }, [token]);

  if (state === 'loading') {
    return <Shell><div className="bg-white rounded-2xl p-10 text-center text-slate-400">جاري التحميل...</div></Shell>;
  }

  if (state === 'blocked') {
    return (
      <Shell>
        <div className="bg-white rounded-2xl p-8 text-center">
          <div className="text-4xl mb-3">⏳</div>
          <div className="font-bold text-lg text-slate-800 mb-1">التسجيل مو متاح حاليًا</div>
          <div className="text-sm text-slate-500">
            {view?.programName ? `«${view.programName}» ` : ''}ما فتح للتسجيل بعد. تواصل مع الفريق.
          </div>
        </div>
      </Shell>
    );
  }

  if (state === 'closed') {
    return (
      <Shell>
        <div className="bg-white rounded-2xl p-8 text-center">
          <div className="text-4xl mb-3">🔒</div>
          <div className="font-bold text-lg text-slate-800 mb-1">التسجيل مقفل</div>
          <div className="text-sm text-slate-500">هذا الرابط ما عاد شغّالًا. تواصل مع الفريق للحصول على رابط جديد.</div>
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

  if (state === 'done') {
    const acc = view.accounts.find((a) => a.id === accountId);
    return (
      <Shell>
        <div className="bg-white rounded-2xl p-8 text-center">
          <div className="w-14 h-14 rounded-full bg-green-100 text-green-700 flex items-center justify-center mx-auto mb-4">
            <Check size={28} />
          </div>
          <div className="font-bold text-xl text-slate-800 mb-1">تم تسجيلك</div>
          <div className="text-sm text-slate-500 mb-5">
            سجّلنا {result?.count > 1 ? `${result.count} أبناء` : 'ابنك'} في <b>{view.programName}</b>.
          </div>
          <div className="bg-slate-50 rounded-xl px-4 py-3 text-sm text-slate-600 mb-5">
            الرقم المرجعي: <b dir="ltr">{result?.ref}</b>
          </div>
          {acc && acc.transferInfo ? (
            <Note tone="amber">
              حوّل <b>{fmt(totalDue(view, kids))} ر.س</b> على <b>{acc.name}</b>:
              <div className="font-mono text-[13px] mt-1.5 select-all" dir="ltr">{acc.transferInfo}</div>
              {!receipt && <div className="mt-2 text-xs">وبعد التحويل أرسل صورة الإيصال للفريق.</div>}
            </Note>
          ) : (
            <Note>المبلغ <b>{fmt(totalDue(view, kids))} ر.س</b> يُدفع عند الحضور.</Note>
          )}
        </div>
      </Shell>
    );
  }

  /* --------------------------------- النموذج --------------------------------- */

  const fields = view.fields;
  const guardianFields = fields.filter(isGuardianField);
  const kidFields = fields.filter((f) => f.id !== 'name' && !isGuardianField(f));
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
    const body = { token, answers, kids, accountId, receipt };
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
    if (r.status === 200) { setResult(r.body); setState('done'); return; }
    if (r.status === 400 && r.body?.errors) { setErrors(r.body.errors); setState('form'); return; }
    if (r.status === 429) { setErrors({ _: 'أرسلت محاولات كثيرة. انتظر شوي وجرّب مرة ثانية.' }); setState('form'); return; }
    if (r.status === 404) { setState('closed'); return; }
    setErrors({ _: 'ما وصل التسجيل. تأكد من الإنترنت وجرّب مرة ثانية.' });
    setState('form');
  };

  const total = totalDue(view, kids);

  return (
    <Shell>
      <div className="bg-white rounded-2xl p-5 mb-4">
        <div className="text-xs text-slate-400 mb-1">التسجيل في</div>
        <div className="font-extrabold text-xl text-slate-800">{view.programName}</div>
        {view.price > 0 && (
          <div className="text-sm text-slate-500 mt-1">
            {fmt(view.price)} ر.س {view.days.length ? 'لكل يوم' : 'للاشتراك'}
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl p-5 mb-4">
        <div className="font-bold text-slate-800 mb-1">بيانات ولي الأمر</div>
        <div className="text-xs text-slate-400 mb-4">جوالك هو اللي نعرفك فيه لو سجّلت مرة ثانية.</div>
        {guardianFields.map((f) => (
          <div key={f.id} data-bad={errors[f.id] ? '1' : undefined}>
            <Row label={f.label} required={f.required} error={errors[f.id]}>
              <FieldInput field={f} value={answers[f.id]} bad={!!errors[f.id]}
                onChange={(v) => { setAnswers({ ...answers, [f.id]: v }); setErrors({ ...errors, [f.id]: null }); }} />
            </Row>
          </div>
        ))}
        {answers.gPhone && !isValidPhone(answers.gPhone) && !errors.gPhone && (
          <div className="text-xs text-slate-400 -mt-2">مثال: 0551234567</div>
        )}
      </div>

      {kids.map((kid, i) => (
        <div key={i} className="bg-white rounded-2xl p-5 mb-4">
          <div className="flex items-center justify-between mb-4">
            <div className="font-bold text-slate-800">{many ? `الطالب ${i + 1}` : 'بيانات الطالب'}</div>
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

          {kidFields.map((f) => (
            <div key={f.id} data-bad={errors[`kid${i}.${f.id}`] ? '1' : undefined}>
              <Row label={f.label} required={f.required} error={errors[`kid${i}.${f.id}`]}>
                <FieldInput field={f} value={kid[f.id]} bad={!!errors[`kid${i}.${f.id}`]}
                  onChange={(v) => { setKid(i, { [f.id]: v }); setErrors({ ...errors, [`kid${i}.${f.id}`]: null }); }} />
              </Row>
            </div>
          ))}

          {view.usePackages && (
            <div data-bad={errors[`kid${i}.package`] ? '1' : undefined}>
              <Row label="طريقة التسجيل" required error={errors[`kid${i}.package`]}>
                <div className="space-y-2">
                  {view.packages.map((pk) => {
                    const on = kid.packageId === pk.id;
                    return (
                      <button key={pk.id} type="button"
                        onClick={() => {
                          // المدة الكاملة تُملأ تلقائيًا، وغيرها يبدأ فاضيًا ليختار
                          const all = coversAll(view, pk);
                          setKid(i, { packageId: pk.id, days: all ? view.days.map((d) => d.id) : [] });
                          setErrors({ ...errors, [`kid${i}.package`]: null, [`kid${i}.days`]: null });
                        }}
                        className={`w-full text-right px-4 py-3 rounded-xl border flex items-center justify-between ${on ? 'border-brand-600 bg-brand-50' : 'border-slate-200'}`}>
                        <span className="min-w-0">
                          <span className="block font-semibold text-slate-800">{pk.name}</span>
                          <span className="block text-[11px] text-slate-400">
                            {pk.perDay ? 'تختار أي أيام تبيها'
                              : pk.dayCount ? `${pk.dayCount} أيام`
                              : `كل الأيام (${view.days.length})`}
                          </span>
                        </span>
                        <span className="shrink-0 font-bold text-brand-700 text-left">
                          {fmt(pk.price)} ر.س
                          {pk.perDay && <span className="block text-[11px] font-normal text-slate-400">لكل يوم</span>}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </Row>
            </div>
          )}

          {/* باقة المدة الكاملة أيامها معروفة سلفًا، فما نسأله عنها */}
          {view.usePackages && coversAll(view, packageOf(view, kid)) && (
            <div className="mb-4 bg-brand-50 rounded-xl px-3.5 py-3 text-sm text-brand-900">
              <div className="font-semibold mb-1">
                {packageOf(view, kid).name} · {fmt(dueFor(view, kid))} ر.س
              </div>
              <div className="text-xs text-brand-700">
                تشمل كل الأيام ({view.days.length}): {view.days.map((d) => d.name).join(' · ')}
              </div>
            </div>
          )}

          {view.days.length > 0 && (!view.usePackages || kid.packageId)
            && !(view.usePackages && coversAll(view, packageOf(view, kid))) && (() => {
            const pkg = packageOf(view, kid);
            const allowed = view.usePackages ? daysAllowed(view, pkg) : view.days.length;
            const picked = (kid.days || []).length;
            // الباقة بعدد ثابت تُقفل لما تمتلئ؛ واليومي مفتوح
            const full = daysAreFixed(pkg) && picked >= allowed;
            return (
              <div data-bad={errors[`kid${i}.days`] ? '1' : undefined}>
                <Row label="الأيام" required error={errors[`kid${i}.days`]}>
                  {view.usePackages && (
                    <div className="text-xs text-slate-500 mb-2">
                      {daysAreFixed(pkg)
                        ? <>اختر <b>{allowed}</b> {allowed === 1 ? 'يوم' : 'أيام'} — اخترت {picked}</>
                        : <>اختر الأيام اللي تبيها — اخترت {picked} من {view.days.length}</>}
                    </div>
                  )}
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
                  {dueFor(view, kid) > 0 && (
                    <div className="text-sm text-brand-800 bg-brand-50 rounded-xl px-3 py-2 mt-3 font-semibold">
                      {view.usePackages && !pkg?.perDay ? pkg.name : `${picked} يوم`} · {fmt(dueFor(view, kid))} ر.س
                    </div>
                  )}
                </Row>
              </div>
            );
          })()}
        </div>
      ))}

      <button type="button" className="w-full bg-white border border-dashed border-slate-300 text-brand-700 font-semibold rounded-2xl py-3.5 mb-4 flex items-center justify-center gap-2"
        onClick={() => setKids([...kids, { name: '', days: (!view.usePackages && view.days.length === 1) ? [view.days[0].id] : [] }])}>
        <Plus size={18} /> أضف ابناً آخر
      </button>

      {view.accounts.length > 0 && (
        <div className="bg-white rounded-2xl p-5 mb-4" data-bad={errors.accountId ? '1' : undefined}>
          <div className="font-bold text-slate-800 mb-1">طريقة الدفع</div>
          {total > 0 && <div className="text-sm text-slate-500 mb-4">المبلغ المستحق: <b className="text-brand-700">{fmt(total)} ر.س</b></div>}
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
        {state === 'sending' ? 'جاري الإرسال...' : 'إرسال التسجيل'}
      </button>
      <div className="text-center text-[11px] text-slate-400 mt-3">بياناتك تُستخدم لتنظيم البرنامج فقط.</div>
    </Shell>
  );
}
