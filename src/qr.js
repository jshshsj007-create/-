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
 */
const build = (text) => {
  const qr = qrcode(0, 'L');
  qr.addData(String(text || ''));
  qr.make();
  return qr;
};

/**
 * صورة SVG — تكبر للطباعة بلا ما تتكسّر، بخلاف الصور النقطية.
 * ونترك هامشًا أبيض بأربع وحدات كما يوصي المعيار، وإلا صعب على القارئ يمسكه.
 */
export const qrSvg = (text, { size = 1024, quiet = 4 } = {}) => {
  const qr = build(text);
  const n = qr.getModuleCount();
  const total = n + quiet * 2;
  let path = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) path += `M${c + quiet} ${r + quiet}h1v1h-1z`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges"><rect width="${total}" height="${total}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
};

/** نفس الصورة كـ data URI، لعرضها في الشاشة أو تحميلها. */
export const qrDataUrl = (text, opts) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrSvg(text, opts))}`;
