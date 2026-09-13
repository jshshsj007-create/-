/**
 * ورقة التقرير — ملفُّ PDF يُرسَل لرئيس المجلس.
 *
 * الرسالة في القروب تكفي من يتابع يومًا بيوم، ولا تكفي من يُرفع إليه. فهذي
 * ورقةٌ واحدة: شعارٌ وترويسة، وأقسامٌ مفصولة، وتاريخٌ وتوقيع.
 *
 * **وتُرسم كانفاسًا ثم تُغلَّف PDF** — لا تُكتب حروفًا في ملف PDF. والسبب أن
 * الكتابة العربية في PDF تحتاج خطًّا مضمَّنًا يعرف الوصل والتشكيل، ومن لم
 * يضمّنه خرجت حروفه منفصلةً مقلوبة. والكانفاس يرسم العربي كما يرسمه المتصفّح
 * لصاحبه — موصولًا مشكولًا — فنأخذ رسمَه صورةً ونضعها في الورقة.
 *
 * فالملفُّ صورةٌ في غلاف: يُفتح في كل جهاز، ويُطبع كما يُرى، ولا يحتاج شبكةً
 * ولا مكتبةً تُجلب.
 */

const clean = (v) => String(v ?? '').trim();
const fmt = (n) => Number(n || 0).toLocaleString('en-US');

/* ------------------------------ غلاف الـPDF ------------------------------ */

/**
 * أصغرُ ملفِّ PDF يحمل صورة: خمسةُ كائنات وجدولُ مواضعها.
 *
 * والصورة JPEG لأن PDF يعرف ترميزه كما هو (`DCTDecode`) فتدخل بايتاتُها بلا
 * فكٍّ ولا ضغطٍ من عندنا — ولو كانت PNG لاحتجنا أن نفكّها ونعيد ضغطها.
 *
 * ويُبنى الملفُّ بايتاتٍ لا نصًّا: الصورة ثنائية، ولو مرّت بنصٍّ فسدت.
 */
export const pdfFromJpeg = (jpeg, { width, height, title = '' } = {}) => {
  const W = Math.max(1, Math.round(Number(width) || 0));
  const H = Math.max(1, Math.round(Number(height) || 0));
  const img = jpeg instanceof Uint8Array ? jpeg : new Uint8Array(jpeg || []);

  // ورقة A4 بالنقاط، والصورة تملؤها بنسبتها محفوظة
  const A4 = { w: 595.28, h: 841.89 };
  const scale = Math.min(A4.w / W, A4.h / H);
  const dw = +(W * scale).toFixed(2);
  const dh = +(H * scale).toFixed(2);
  const dx = +((A4.w - dw) / 2).toFixed(2);
  const dy = +((A4.h - dh) / 2).toFixed(2);

  const content = `q ${dw} 0 0 ${dh} ${dx} ${dy} cm /Im0 Do Q`;
  /** النصُّ في PDF بايتاتٌ لاتينية، والعنوانُ العربي يُرمَّز UTF-16 بعلامته. */
  const pdfText = (s) => {
    const t = clean(s);
    if (!t) return '()';
    // eslint-disable-next-line no-control-regex
    if (/^[\x20-\x7E]*$/.test(t)) return `(${t.replace(/([\\()])/g, '\\$1')})`;
    let out = 'FEFF';
    for (const ch of t) {
      for (let i = 0; i < ch.length; i++) out += ch.charCodeAt(i).toString(16).padStart(4, '0').toUpperCase();
    }
    return `<${out}>`;
  };

  const parts = [];
  const push = (x) => parts.push(typeof x === 'string' ? latin(x) : x);
  const latin = (s) => {
    const u = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 0xff;
    return u;
  };
  let len = 0;
  const at = [];
  const add = (body) => {
    at.push(len);
    const head = `${at.length} 0 obj\n`;
    push(head); len += head.length;
    if (typeof body === 'string') { push(body); len += body.length; } else {
      for (const b of body) { push(b); len += (typeof b === 'string' ? b.length : b.length); }
    }
    push('\nendobj\n'); len += 8;   // \n + endobj + \n
  };

  const head = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  push(head); len += head.length;

  add('<< /Type /Catalog /Pages 2 0 R >>');
  add('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4.w} ${A4.h}] `
    + '/Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>');
  add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  add([
    `<< /Type /XObject /Subtype /Image /Width ${W} /Height ${H} /ColorSpace /DeviceRGB `
    + `/BitsPerComponent 8 /Filter /DCTDecode /Length ${img.length} >>\nstream\n`,
    img,
    '\nendstream',
  ]);
  add(`<< /Title ${pdfText(title)} /Creator ${pdfText('فريق فيض السعودي')} >>`);

  const xref = len;
  let tail = `xref\n0 ${at.length + 1}\n0000000000 65535 f \n`;
  for (const o of at) tail += `${String(o).padStart(10, '0')} 00000 n \n`;
  tail += `trailer\n<< /Size ${at.length + 1} /Root 1 0 R /Info ${at.length} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  push(tail);

  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let i = 0;
  for (const p of parts) { out.set(p, i); i += p.length; }
  return out;
};

/* ------------------------------- رسمُ الورقة ------------------------------- */

const NAVY = '#022D71';
const FONT = "'Tajawal', system-ui, -apple-system, 'Segoe UI', sans-serif";
/** A4 بدقّةٍ تكفي الطباعة: ١٥٠ نقطة في البوصة. */
const PAGE = { w: 1240, h: 1754 };
const PAD = 90;

const loadImage = (src) => new Promise((resolve) => {
  if (!src) { resolve(null); return; }
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => resolve(null);
  img.src = src;
});

/**
 * صفوفُ الورقة من معلومات التقرير — تُبنى هنا لتُختبر بلا كانفاس.
 *
 * ويُطوى ما غاب: من لا صلاحية له في المال لا يرى قسمًا فارغًا، ومن لم يُقم
 * شيئًا من النادي لا يرى عنوانه.
 */
export const sheetSections = ({ students, present, enrolled, money, club } = {}) => {
  const out = [];
  const who = [];
  if (students != null) who.push(['الطلاب المسجلون', fmt(students)]);
  if (present != null && enrolled != null) {
    const p = enrolled > 0 ? Math.round((present / enrolled) * 100) : null;
    who.push(['الحاضرون', `${fmt(present)} من ${fmt(enrolled)}${p == null ? '' : ` · ${p}٪`}`]);
  }
  if (who.length) out.push({ title: 'الحضور', rows: who });

  if (money) {
    out.push({ title: 'المالية', rows: [
      ['الإيراد', `${fmt(money.revenue)} ر.س`],
      ['المصروفات', `${fmt(money.expenses)} ر.س`],
      ['الصافي', `${fmt(money.net)} ر.س`, true],
    ] });
    out.push({ title: 'التوزيع', rows: [
      ['نصيب مدارس الرواد', `${fmt(money.school)} ر.س`],
      ['نصيب فريق فيض', `${fmt(money.faid)} ر.س`],
    ] });
  }

  const list = (club || []).map((c) => clean(c)).filter(Boolean);
  if (list.length) out.push({ title: 'النادي', lines: list });
  return out;
};

/**
 * يرسم الورقة ويرجّعها ملفَّ PDF.
 *
 * الارتفاع ثابتٌ (A4) لا يطول بما فيه: ورقةٌ تُرسَل وتُطبع، وطولُها المتغيّر
 * يُفسد الطباعة. وما زاد عن الورقة يُقصّ — ولا يزيد في الواقع: أقسامُ التقرير
 * أربعةٌ وسطورُها معدودة.
 */
export const reportSheet = async (info, { logo = '', team = 'فريق فيض السعودي', stamp = '' } = {}) => {
  const canvas = document.createElement('canvas');
  canvas.width = PAGE.w;
  canvas.height = PAGE.h;
  const c = canvas.getContext('2d');
  c.textBaseline = 'middle';
  c.direction = 'rtl';

  const text = (s, x, y, { size = 26, weight = 400, color = '#0f172a', align = 'right', dir } = {}) => {
    c.font = `${weight} ${size}px ${FONT}`;
    c.fillStyle = color;
    c.textAlign = align;
    c.direction = dir || 'rtl';
    c.fillText(clean(s), x, y);
    c.direction = 'rtl';
  };
  const box = (x, y, w, h, r, fill, stroke) => {
    c.beginPath();
    c.roundRect(x, y, w, h, r);
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = 2; c.stroke(); }
  };

  c.fillStyle = '#fff';
  c.fillRect(0, 0, PAGE.w, PAGE.h);

  /* الترويسة */
  const HEAD = 190;
  c.fillStyle = NAVY;
  c.fillRect(0, 0, PAGE.w, HEAD);
  const mark = await loadImage(logo);
  if (mark) c.drawImage(mark, PAGE.w - PAD - 96, HEAD / 2 - 48, 96, 96);
  const tx = PAGE.w - PAD - (mark ? 124 : 0);
  text(team, tx, HEAD / 2 - 22, { size: 40, weight: 800, color: '#fff' });
  text(clean(info.program) + (info.term ? ` · ${info.term}` : ''), tx, HEAD / 2 + 28, { size: 24, color: '#a9c2ea' });

  /* العنوان */
  let y = HEAD + 90;
  text(`تقرير ${clean(info.week) || 'اليوم'}`, PAGE.w - PAD, y, { size: 46, weight: 800 });
  if (clean(info.date)) {
    text(`التاريخ: ${clean(info.date)}`, PAD, y, { size: 24, color: '#64748b', align: 'left' });
  }
  y += 40;
  c.strokeStyle = '#e2e8f0';
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(PAD, y);
  c.lineTo(PAGE.w - PAD, y);
  c.stroke();
  y += 50;

  /* الأقسام */
  for (const sec of sheetSections(info)) {
    const rows = sec.rows || [];
    const lines = sec.lines || [];
    const h = 70 + rows.length * 56 + lines.length * 50 + 24;
    box(PAD, y, PAGE.w - PAD * 2, h, 22, '#f8fafc', '#e8eef6');
    text(sec.title, PAGE.w - PAD - 32, y + 42, { size: 27, weight: 800, color: NAVY });
    let ry = y + 70;
    for (const [label, value, strong] of rows) {
      const mid = ry + 28;
      text(label, PAGE.w - PAD - 32, mid, { size: 25, color: strong ? '#0f172a' : '#64748b', weight: strong ? 700 : 400 });
      text(value, PAD + 32, mid, { size: strong ? 30 : 26, weight: strong ? 800 : 600, align: 'left', dir: 'rtl' });
      ry += 56;
    }
    for (const line of lines) {
      text(`• ${line}`, PAGE.w - PAD - 32, ry + 25, { size: 24, color: '#334155' });
      ry += 50;
    }
    y += h + 28;
  }

  /* الذيل */
  const foot = PAGE.h - 70;
  c.setLineDash([6, 6]);
  c.strokeStyle = '#e2e8f0';
  c.beginPath();
  c.moveTo(PAD, foot - 40);
  c.lineTo(PAGE.w - PAD, foot - 40);
  c.stroke();
  c.setLineDash([]);
  text(`أُصدر من تطبيق ${team}${stamp ? ` · ${stamp}` : ''}`, PAGE.w / 2, foot, { size: 20, color: '#94a3b8', align: 'center' });

  const jpeg = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('ما تولّدت الورقة'))), 'image/jpeg', 0.92);
  });
  const bytes = new Uint8Array(await jpeg.arrayBuffer());
  const pdf = pdfFromJpeg(bytes, { width: PAGE.w, height: PAGE.h, title: `تقرير ${clean(info.week)}` });
  return new Blob([pdf], { type: 'application/pdf' });
};

/**
 * اسم الملف بحروفٍ لاتينية.
 *
 * جرّبناه عربيًّا في الإيصال فنزل باسم «download» — المتصفّح يتجاهل الاسم غير
 * اللاتيني في طلب التحميل.
 */
export const sheetFileName = (date) => `faydh-report-${clean(date).replace(/[^0-9]/g, '-') || 'week'}.pdf`;
