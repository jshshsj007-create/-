/**
 * توليد الباركود في المتصفح.
 *
 * الباركود يُطبع على لوحة وتُعلَّق سنين، فلا يُطلب من خدمة خارجية: خدمةٌ تقفل
 * أو تتغيّر تترك اللوحة بلا صورة، والصورة ما فيها إلا رابطنا أصلًا. فنولّده
 * هنا، ويُحمَّل ملفًّا في جهازك، ويمشي للمطبعة بلا وسيط.
 */
import qrcode from 'qrcode-generator';

/**
 * `L` أقل تصحيح للخطأ، وهو يكفي لرابط قصير ويعطي مربّعات أكبر — والأكبر
 * أسهل على كاميرا الجوال من بعيد، وهذا حال من يمرّ باللوحة.
 *
 * والهامش الأبيض أربع وحدات كما يوصي المعيار: بلا هامش يصعب على القارئ
 * يمسك حدود الرمز.
 */
export const QUIET = 4;

/** شبكة الرمز: مصفوفة صفوفٍ من `true`/`false`، ومنها تُبنى كل صورة. */
export const qrMatrix = (text) => {
  const qr = qrcode(0, 'L');
  qr.addData(String(text || ''));
  qr.make();
  const n = qr.getModuleCount();
  return Array.from({ length: n }, (_, r) =>
    Array.from({ length: n }, (_, c) => qr.isDark(r, c)));
};

/** صورة SVG — للعرض داخل الشاشة. */
export const qrSvg = (text, { size = 1024, quiet = QUIET } = {}) => {
  const m = qrMatrix(text);
  const total = m.length + quiet * 2;
  let path = '';
  m.forEach((row, r) => row.forEach((on, c) => {
    if (on) path += `M${c + quiet} ${r + quiet}h1v1h-1z`;
  }));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges"><rect width="${total}" height="${total}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
};

/** نفس الصورة كـ data URI، لعرضها في الشاشة. */
export const qrDataUrl = (text, opts) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrSvg(text, opts))}`;

/**
 * صورة PNG للتحميل.
 *
 * كانت SVG أول الأمر — أحدّ في الطباعة نظريًّا، لكنها على الجوال ملف ميّت:
 * ما يفتح في الاستوديو، ولا ينرسل صورةً في واتساب، وبعض المطابع تردّه. و
 * الرمز مربّعات سود وبيض، فألفا بكسل منه تكفي لأي لوحة يُقرأ من مترين.
 *
 * ونرسم كل وحدة بعدد صحيح من البكسلات، وإلا وقعت حوافّها بين بكسلين فتشوّشت
 * وصعبت على الكاميرا.
 */
export const qrPngUrl = (text, { target = 2048, quiet = QUIET } = {}) => {
  const m = qrMatrix(text);
  const total = m.length + quiet * 2;
  const scale = Math.max(1, Math.floor(target / total));
  const size = total * scale;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#000';
  m.forEach((row, r) => row.forEach((on, c) => {
    if (on) ctx.fillRect((c + quiet) * scale, (r + quiet) * scale, scale, scale);
  }));
  return canvas.toDataURL('image/png');
};
