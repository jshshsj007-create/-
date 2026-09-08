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

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {q ? <QuestionPage token={q[1]} />
      : isPublicQ ? <QuestionPage token="" />
        : m ? <SignupPage token={m[1]} />
          : isPublic ? <SignupPage token="" /> : <App />}
  </React.StrictMode>
);
