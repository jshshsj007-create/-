import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import SignupPage from './SignupPage.jsx';
import QuestionPage from './QuestionPage.jsx';
import './index.css';
import { readTheme, applyTheme } from './theme.js';

/**
 * صفحة ولي الأمر: تُعرض وحدها بلا تسجيل دخول وبلا تحميل التطبيق، فما توصلها
 * بيانات الفريق أصلًا. وأي مسار غيرها يفتح التطبيق.
 *
 *  /r/<رمز>  رابط برنامج بعينه — للدعوة الخاصة.
 *  /r        الرابط العام — عنوان واحد للفريق، وجهته تُختار من التطبيق.
 *            وهو اللي يُطبع باركودًا، فما يتغيّر أبدًا.
 *  /q/<رمز>  سؤال اليوم — يُرسل في قروب الأهالي ويُجاب بلا تسجيل دخول.
 *  /q        رابط السؤال الثابت — عنوان واحد للفريق، والسؤال تحته يتبدّل.
 *            فيُنشر مرةً في القروب، ثم تُبدّل السؤال كل أسبوعٍ بلا رابطٍ جديد،
 *            وبلا أن تموت الرسالة التي أرسلتَها أول مرة.
 */
const path = window.location.pathname;
const m = path.match(/^\/r\/([A-Za-z0-9]{4,32})\/?$/);
const isPublic = /^\/r\/?$/.test(path);
/** `/q/<رمز>` سؤال بعينه، و`/q` الثابت. */
const q = path.match(/^\/q\/([A-Za-z0-9]{4,32})\/?$/);
const isPublicQ = /^\/q\/?$/.test(path);

// نلوّن قبل أول رسمة، وإلا ومض الأبيض في وجه من اختار الداكن.
// وصفحة ولي الأمر خارج هذا: تبقى فاتحة دائمًا.
if (!m && !isPublic && !q && !isPublicQ) applyTheme(readTheme());

/**
 * شبكةُ الأمان: لا شاشةٍ بيضاء بعد اليوم.
 *
 * خطأٌ واحدٌ في الرسم يُسقط شجرة React كلها، فتبقى الصفحة بيضاء لا تقول
 * شيئًا. وقد وقع لنا: سطران بموضعٍ خاطئ، فما فتح التطبيق — ولا عرف صاحبُه
 * أوَقَف الخادم أم ضاعت بياناته أم انقطع النت.
 *
 * والفرق بين الشاشة البيضاء وهذي ليس جمالًا: البيضاء تقول «كل شيء ضاع»،
 * وهذي تقول «الرسم تعثّر، وبياناتك في الخادم كما هي» — وتعطيه زرًّا يُخرجه
 * منها، ونصًّا يرسله لي فأعرف أين وقع بلا أن يصف لي ما رأى.
 *
 * وهي صنفٌ لا دالة: هذا هو الوحيد الذي يمسك أخطاء الرسم في React.
 */
class Safety extends React.Component {
  constructor(props) { super(props); this.state = { err: null }; }

  static getDerivedStateFromError(err) { return { err }; }

  render() {
    const { err } = this.state;
    if (!err) return this.props.children;
    const line = String(err?.message || err || '').slice(0, 300);
    const box = { fontFamily: "'Tajawal', sans-serif", direction: 'rtl', minHeight: '100vh',
      background: '#f8fafc', color: '#0f172a', display: 'flex', alignItems: 'center',
      justifyContent: 'center', padding: '24px' };
    const btn = { display: 'block', width: '100%', marginTop: '18px', padding: '14px',
      borderRadius: '14px', border: 0, background: '#022D71', color: '#fff',
      fontSize: '15px', fontWeight: 700, fontFamily: 'inherit' };
    return (
      <div style={box}>
        <div style={{ maxWidth: '26rem', width: '100%', background: '#fff', borderRadius: '20px',
          padding: '28px 22px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
          <div style={{ fontSize: '34px' }}>⚠️</div>
          <div style={{ fontWeight: 800, fontSize: '18px', marginTop: '10px' }}>التطبيق تعثّر في الرسم</div>
          <p style={{ fontSize: '14px', color: '#475569', lineHeight: 2, margin: '10px 0 0' }}>
            <b>بياناتك سليمة في الخادم — ما ضاع منها شيء.</b> العطب في عرض الصفحة وحده.
            جرّب «افتحه من جديد»، وإن تكرّر أرسل لي السطر اللي تحت.
          </p>
          <button style={btn} onClick={() => { try { location.reload(); } catch { /* لا شيء */ } }}>
            افتحه من جديد
          </button>
          <button
            style={{ ...btn, background: '#fff', color: '#b91c1c', border: '1px solid #fecaca' }}
            onClick={() => {
              // آخرُ ما يُجرَّب: جلسةٌ عالقة قد تكون هي السبب. والبيانات في الخادم لا هنا.
              try { localStorage.removeItem('faid-session-v1'); } catch { /* لا شيء */ }
              try { location.reload(); } catch { /* لا شيء */ }
            }}>
            اخرج وافتحه من جديد
          </button>
          <pre style={{ marginTop: '18px', fontSize: '11px', color: '#94a3b8', direction: 'ltr',
            textAlign: 'left', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{line}</pre>
        </div>
      </div>
    );
  }
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Safety>
      {q ? <QuestionPage token={q[1]} />
        : isPublicQ ? <QuestionPage token="" />
          : m ? <SignupPage token={m[1]} />
            : isPublic ? <SignupPage token="" /> : <App />}
    </Safety>
  </React.StrictMode>
);
