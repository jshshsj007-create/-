import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import SignupPage from './SignupPage.jsx';
import './index.css';

/**
 * /r/<رمز> هي صفحة ولي الأمر: تُعرض وحدها بلا تسجيل دخول وبلا تحميل التطبيق،
 * فما توصلها بيانات الفريق أصلًا. وأي مسار غيرها يفتح التطبيق.
 */
const m = window.location.pathname.match(/^\/r\/([A-Za-z0-9]{4,32})\/?$/);

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {m ? <SignupPage token={m[1]} /> : <App />}
  </React.StrictMode>
);
