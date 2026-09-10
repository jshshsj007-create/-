/**
 * صفحة الـPDF الأولى تُرسم صورةً في الجهاز.
 *
 * ليه ما نتركها للمتصفّح؟ لأن عارض المتصفّح المدمج لا يُعوَّل عليه حيث يقف
 * الناس فعلًا: كروم على أندرويد ما يعرض PDF داخل الصفحة أصلًا، وسفاري يعرض
 * أوّلها ثم يقف، وفي الحاسوب يجي بشريطٍ أسود يبلع الصندوق. ووليّ الأمر يبي
 * يتأكّد أنه أرفق الورقة الصحيحة، لا أن يتعلّم عادات المتصفّحات.
 *
 * فنرسمها بأنفسنا على كانفاس: صورةٌ واحدة، تظهر في كل جهاز سواء.
 *
 * والمكتبة تُجلب عند الحاجة فقط — من أرفق صورةً ما ينزّل شيئًا، ومن ما أرفق
 * أصلًا كذلك. ولو تعثّر الجلبُ أو الرسم رجعنا إلى بطاقة الملف بلا ضجّة: هذي
 * صفحة تسجيلٍ لوليّ أمر، ما تنكسر لأجل معاينة.
 */
import React, { useEffect, useRef, useState } from 'react';

/**
 * عاملُ المكتبة يُخدَم من عنوانٍ ثابت لا من داخل الحزمة: تنسخه `scripts/pdfworker.mjs`
 * إلى `public/` قبل كل بناء. وهكذا ما نحتاج سحرًا من المُجمِّع، فيمشي الملفُ
 * نفسُه في البناء وفي الاختبار سواء.
 */
const workerSrc = '/pdf.worker.min.mjs';

/**
 * جوّالاتٌ قبل ٢٠٢٤ ما فيها `Promise.withResolvers`، والمكتبة تناديها فتنكسر
 * عندهم وحدهم. سطرٌ يسدّها — وما نفرضه على من عنده.
 */
const patch = () => {
  if (typeof Promise.withResolvers === 'function') return;
  Promise.withResolvers = function withResolvers() {
    let resolve;
    let reject;
    const promise = new Promise((a, b) => { resolve = a; reject = b; });
    return { promise, resolve, reject };
  };
};

let libPromise = null;
/** تُجلب مرة واحدة ولو رُسمت عشر ورقات. */
const getLib = () => {
  if (!libPromise) {
    libPromise = (async () => {
      patch();
      const lib = await import('pdfjs-dist/legacy/build/pdf.mjs');
      lib.GlobalWorkerOptions.workerSrc = workerSrc;
      return lib;
    })().catch((e) => { libPromise = null; throw e; });
  }
  return libPromise;
};

/** بايتات الملف: من `data:` أو من عنوانٍ على الخادم. */
const bytesOf = async (src) => {
  const s = String(src || '');
  if (s.startsWith('data:')) {
    const i = s.indexOf(',');
    const bin = atob(s.slice(i + 1));
    const u8 = new Uint8Array(bin.length);
    for (let n = 0; n < bin.length; n++) u8[n] = bin.charCodeAt(n);
    return u8;
  }
  const r = await fetch(s);
  if (!r.ok) throw new Error('ما وصل الملف');
  return new Uint8Array(await r.arrayBuffer());
};

/**
 * يرسم أول صفحة من الملف داخل عرض الصندوق.
 *
 * `onFail` عشان من ناداه يعرض بطاقةً بديلة — فالمكوّن لا يقرّر وحده ما يظهر
 * مكانه.
 */
export default function PdfFirstPage({ src, maxHeight = 320, onFail }) {
  const wrap = useRef(null);
  const canvas = useRef(null);
  const [state, setState] = useState('loading'); // loading | ok | fail

  useEffect(() => {
    let alive = true;
    setState('loading');
    (async () => {
      try {
        const lib = await getLib();
        const bytes = await bytesOf(src);
        if (!alive) return;
        const doc = await lib.getDocument({ data: bytes }).promise;
        const page = await doc.getPage(1);
        if (!alive || !canvas.current) return;

        const width = wrap.current?.clientWidth || 320;
        const one = page.getViewport({ scale: 1 });
        // نملأ العرض، وما نتجاوز السقف طولًا — الورقة تُقرأ لا تبلع الصفحة
        const scale = Math.min(width / one.width, maxHeight / one.height);
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const view = page.getViewport({ scale: scale * dpr });
        const c = canvas.current;
        c.width = Math.round(view.width);
        c.height = Math.round(view.height);
        c.style.width = `${Math.round(view.width / dpr)}px`;
        c.style.height = `${Math.round(view.height / dpr)}px`;
        await page.render({ canvasContext: c.getContext('2d'), viewport: view }).promise;
        if (!alive) return;
        setState('ok');
        doc.cleanup?.();
      } catch {
        if (!alive) return;
        setState('fail');
        onFail?.();
      }
    })();
    return () => { alive = false; };
  }, [src, maxHeight]);

  return (
    <div ref={wrap} className="w-full flex items-center justify-center" style={{ minHeight: state === 'ok' ? 0 : 96 }}>
      <canvas ref={canvas} className={state === 'ok' ? 'block max-w-full' : 'hidden'} aria-label="أول صفحة من الملف" />
      {state === 'loading' && <div className="text-xs text-slate-400 py-6">نجهّز المعاينة…</div>}
    </div>
  );
}
