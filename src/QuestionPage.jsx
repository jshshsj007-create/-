import React, { useState, useEffect } from 'react';
import { api } from './cloud.js';
import { qText, qError, Q_TEXTS } from './club.js';
import { FaydhLogo, TEAM_NAME } from './logo.jsx';

/**
 * الرأس: شعار فيض على الأزرق الغامق، مثل صفحة التسجيل تمامًا.
 *
 * الشعار أبيضُ على شفاف فلا يُرى إلا على داكن، ولهذا هو في الشريط لا على
 * البطاقة. ووليّ الأمر يفتح الرابطين من نفس القروب، فيعرف من أين جاءه قبل
 * أن يقرأ حرفًا.
 *
 * وهو خارج `QuestionPage` عن قصد: لو عُرِّف داخلها لصار لكل رسمةٍ مكوّنٌ
 * جديدٌ في نظر React، فتُهدم الشجرة وتُبنى مع كل حرف يُكتب — ويقفز المؤشّر
 * من الخانة عند أول حرف.
 */
function Shell({ brand, children }) {
  return (
    <div dir="rtl" className="min-h-screen bg-slate-50" style={{ fontFamily: "'Tajawal', sans-serif" }}>
      <div className="bg-brand-900 px-5 pt-6 pb-14">
        <div className="max-w-md mx-auto flex items-center gap-3">
          <FaydhLogo size={44} variant="mark" />
          <div className="text-white font-extrabold text-xl">{TEAM_NAME}</div>
        </div>
      </div>
      <div className="px-4 -mt-8 pb-16 max-w-md mx-auto">
        {brand !== '' && (
          <div className="text-center mb-3 text-xs text-slate-400 font-medium">{brand || Q_TEXTS.brand}</div>
        )}
        {children}
      </div>
    </div>
  );
}

/**
 * سؤال اليوم — صفحة ولي الأمر.
 *
 * تُفتح بلا تسجيل دخول وبلا جوال: سؤالٌ وجوابٌ واسم الابن، وخلاص. ولا يصلها
 * من بيانات الفريق إلا نصّ السؤال واختياراته — لا الجواب الصحيح ولا ما جاوب
 * به غيره، وإلا صار الرابط يسلّم الحلّ لمن يفتحه.
 */
export default function QuestionPage({ token }) {
  const [state, setState] = useState('loading');  // loading · ready · sending · done · closed
  const [view, setView] = useState(null);
  const [student, setStudent] = useState('');
  const [text, setText] = useState('');
  const [optionId, setOptionId] = useState('');
  const [errors, setErrors] = useState({});
  const [saidName, setSaidName] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      const r = await api('question_info', { token });
      if (!alive) return;
      if (r.status === 200 && r.body?.view) {
        setView(r.body.view);
        setState(r.body.view.open ? 'ready' : 'closed');
      } else {
        setState('closed');
      }
    })();
    return () => { alive = false; };
  }, [token]);

  const submit = async () => {
    const errs = {};
    if (String(student).trim().length < 2) errs.student = qError(view, 'needStudent');
    if (view.mode === 'choice') {
      if (!optionId) errs.answer = qError(view, 'needChoice');
    } else if (!String(text).trim()) {
      errs.answer = qError(view, 'needAnswer');
    }
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setState('sending');
    const r = await api('question_answer', {
      token, student, ...(view.mode === 'choice' ? { optionId } : { text }),
    });
    if (r.status === 200) { setSaidName(r.body?.student || student.trim()); setState('done'); return; }
    if (r.status === 400 && r.body?.errors) { setErrors(r.body.errors); setState('ready'); return; }
    if (r.status === 409 || r.status === 404) { setState('closed'); return; }
    setErrors({ answer: r.status === 429 ? 'وصلتنا أجوبة كثيرة الحين. جرّب بعد شوي.' : 'ما وصل الجواب. جرّب مرة ثانية.' });
    setState('ready');
  };

  const card = 'bg-white rounded-3xl shadow-sm border border-slate-100 p-6 sm:p-8';
  const brand = view ? qText(view, 'brand') : '';

  if (state === 'loading') {
    return <Shell brand={brand}><div className={card + ' text-center text-slate-400 text-sm'}>لحظة…</div></Shell>;
  }

  if (state === 'closed') {
    return (
      <Shell brand={brand}>
        <div className={card + ' text-center'}>
          <h1 className="text-xl font-extrabold text-slate-800">{qText(view, 'closedTitle') || Q_TEXTS.closedTitle}</h1>
          <p className="text-sm text-slate-500 mt-2 leading-relaxed">{qText(view, 'closedText')}</p>
        </div>
      </Shell>
    );
  }

  if (state === 'done') {
    return (
      <Shell brand={brand}>
        <div className={card + ' text-center'}>
          <div className="w-14 h-14 rounded-full bg-green-100 text-green-700 flex items-center justify-center mx-auto mb-4 text-2xl font-bold">✓</div>
          <h1 className="text-xl font-extrabold text-slate-800">{qText(view, 'doneTitle')}</h1>
          <p className="text-sm text-slate-500 mt-2 leading-relaxed">{qText(view, 'doneText', { الطالب: saidName })}</p>
        </div>
      </Shell>
    );
  }

  const label = 'block text-sm font-semibold text-slate-600 mb-2';
  const input = 'w-full border border-slate-200 rounded-xl px-4 py-3 text-base text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent';

  return (
    <Shell brand={brand}>
      <div className={card}>
        <h1 className="text-2xl font-extrabold text-slate-800 leading-relaxed mb-6">{view.text}</h1>

        {view.mode === 'choice' ? (
          <div className="space-y-2 mb-2">
            {view.options.map((o) => (
              <button key={o.id} type="button"
                onClick={() => { setOptionId(o.id); setErrors({ ...errors, answer: '' }); }}
                aria-pressed={optionId === o.id}
                className={`w-full text-right rounded-2xl px-4 py-3.5 text-base font-semibold border transition-colors ${
                  optionId === o.id ? 'border-brand-700 bg-brand-50 text-brand-800' : 'border-slate-200 text-slate-700'}`}>
                {o.text}
              </button>
            ))}
          </div>
        ) : (
          <div className="mb-2">
            {qText(view, 'answerLabel') !== '' && <label className={label} htmlFor="q-answer">{qText(view, 'answerLabel')}</label>}
            <input id="q-answer" className={input} value={text}
              onChange={(e) => { setText(e.target.value); setErrors({ ...errors, answer: '' }); }}
              placeholder="اكتب جوابك" />
          </div>
        )}
        {errors.answer && <div className="text-red-500 text-xs mb-2">{errors.answer}</div>}

        <div className="mt-5">
          {qText(view, 'studentLabel') !== '' && <label className={label} htmlFor="q-student">{qText(view, 'studentLabel')}</label>}
          <input id="q-student" className={input} value={student}
            onChange={(e) => { setStudent(e.target.value); setErrors({ ...errors, student: '' }); }}
            placeholder="اسم الابن" />
          {qText(view, 'studentHint') !== '' && <div className="text-xs text-slate-400 mt-1.5">{qText(view, 'studentHint')}</div>}
          {errors.student && <div className="text-red-500 text-xs mt-1.5">{errors.student}</div>}
        </div>

        <button onClick={submit} disabled={state === 'sending'}
          className="w-full bg-brand-700 text-white rounded-2xl py-4 text-base font-bold mt-6 disabled:opacity-60">
          {state === 'sending' ? 'نرسل…' : qText(view, 'submit')}
        </button>
      </div>
    </Shell>
  );
}
