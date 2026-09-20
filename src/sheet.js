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
export const pdfFromJpegs = (list, { width, height, title = '' } = {}) => {
  const W = Math.max(1, Math.round(Number(width) || 0));
  const H = Math.max(1, Math.round(Number(height) || 0));
  const imgs = (Array.isArray(list) ? list : [list])
    .map((x) => (x instanceof Uint8Array ? x : new Uint8Array(x || [])))
    .filter((x) => x.length);
  if (!imgs.length) imgs.push(new Uint8Array(0));

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
  const latin = (s) => {
    const u = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 0xff;
    return u;
  };
  const push = (x) => parts.push(typeof x === 'string' ? latin(x) : x);
  let len = 0;
  const at = [];
  const add = (body) => {
    at.push(len);
    const head = `${at.length} 0 obj\n`;
    push(head); len += head.length;
    if (typeof body === 'string') { push(body); len += body.length; } else {
      for (const b of body) { push(b); len += b.length; }
    }
    push('\nendobj\n'); len += 8;   // \n + endobj + \n
  };

  const head = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  push(head); len += head.length;

  /*
    الصفحات: ثلاثةُ كائناتٍ لكل صفحة — الصفحةُ ومحتواها وصورتها. فالكائن
    الأول للصفحة الأولى رقمُه ٣، والذي بعده ٤ و٥، ثم تبدأ الثانية عند ٦.
  */
  const pageObj = (k) => 3 + k * 3;
  add('<< /Type /Catalog /Pages 2 0 R >>');
  add(`<< /Type /Pages /Kids [${imgs.map((_, k) => `${pageObj(k)} 0 R`).join(' ')}] /Count ${imgs.length} >>`);
  for (let k = 0; k < imgs.length; k++) {
    const img = imgs[k];
    add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4.w} ${A4.h}] `
      + `/Resources << /XObject << /Im0 ${pageObj(k) + 2} 0 R >> >> /Contents ${pageObj(k) + 1} 0 R >>`);
    add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    add([
      `<< /Type /XObject /Subtype /Image /Width ${W} /Height ${H} /ColorSpace /DeviceRGB `
      + `/BitsPerComponent 8 /Filter /DCTDecode /Length ${img.length} >>\nstream\n`,
      img,
      '\nendstream',
    ]);
  }
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

/** صفحةٌ واحدة — وهي الحال الغالبة، فلها اسمُها القديم. */
export const pdfFromJpeg = (jpeg, opts) => pdfFromJpegs([jpeg], opts);

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
export const sheetSections = ({ students, present, enrolled, money, club, qiyami, notes, reports, reportTable } = {}) => {
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

  /**
   * القيمي: عنوانُه ومن ألقاه. ولا يصل هنا أصلًا إلا من يملك صلاحيته —
   * الخادمُ لا يرسل بياناته لغيره، فالورقة تطلع بلا صندوقه.
   */
  const qs = (qiyami || []).map((q) => [clean(q.title), clean(q.by)]).filter(([t]) => t);
  if (qs.length) out.push({ title: 'القيمي', rows: qs.map(([t, b]) => [t, b || '—']) });

  /**
   * الملاحظات السلوكية: عددُها ثم أسماؤها. وأسماءُ من كُتبت عليهم **في هذا
   * اليوم** وحده، لا ما تراكم على الأولاد من قبل — فمن أخطأ في جمعةٍ لا
   * يُعاد اسمُه في ورقة التي بعدها.
   */
  const names = (notes || []).map((n) => clean(n)).filter(Boolean);
  if (names.length) {
    // ثلاثةٌ في السطر: الأسماء الطويلة تخرج عن عرض الورقة لو رُصّت كلها سطرًا
    const lines = [];
    for (let i = 0; i < names.length; i += 3) lines.push(names.slice(i, i + 3).join(' · '));
    out.push({ title: 'ملاحظات سلوكية', rows: [['عدد الطلاب', fmt(names.length), true]], lines });
  }

  /*
    تقارير الموظفين: العدّاد ثم جدولُ «من كتب ماذا» بأعمدة التقرير نفسها.

    وكانت سطورًا يُرصّ فيها ما كتبه الواحدُ متّصلًا، فلا يُعرف أين انتهت
    خانةٌ وبدأت أخرى. والورقةُ واسعةٌ فيُكتب النصُّ كاملًا، بلا الاقتطاع
    الذي تفرضه شاشةُ الجوّال.
  */
  const fields = reportTable?.fields || [];
  const trows = reportTable?.rows || [];
  if (reports || trows.length) {
    const share = fields.length ? Math.floor(74 / fields.length) : 74;
    out.push({
      title: 'تقارير الموظفين',
      ...(reports ? { rows: [['كتبوا تقرير اليوم', clean(reports), true]] } : {}),
      ...(trows.length && fields.length ? {
        cols: [{ label: 'الموظف', w: 26 }, ...fields.map((f) => ({ label: f.label, w: share }))],
        grid: trows.map((r) => {
          const name = { t: r.user?.name || '', strong: true };
          if (!r.wrote) return [name, { t: 'ما كتب تقريره', span: fields.length, dim: true }];
          return [name, ...fields.map((f, i) => {
            const v = clean(r.cells?.[i]?.full);
            return { t: v || '—', dim: !v || /^لا\s*يوجد$/.test(v) };
          })];
        }),
      } : {}),
    });
  }
  return out;
};

/* -------------------------- الورقة: رسمٌ وتقسيمُ صفحات -------------------------- */

const HEAD_H = 70, ROW_H = 56, LINE_H = 50, TAIL = 24, GAP = 28;

/**
 * شقُّ السطر الطويل ليسع عرض الصندوق.
 *
 * كان السطر يُرسم كما هو، فسطرُ الطالب في ورقة خيركم — «مراجعة من كذا إلى
 * كذا · تثبيت … · حفظ …» — يخرج عن حافّة الورقة ويُقصّ نصفُه. والقياس
 * بالحرف يكذب في العربية (حروفُها تختلف عرضًا وتتّصل)، فالكانفاسُ هو الذي
 * يقيس، والتتمّةُ بلا نقطةٍ لتُقرأ تتمّةً لا سطرًا جديدًا.
 */
export const wrapLine = (measure, s, max) => {
  const words = clean(s).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const out = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (cur && measure(next) > max) { out.push(cur); cur = w; } else cur = next;
  }
  if (cur) out.push(cur);
  return out.map((t, i) => ({ t, cont: i > 0 }));
};
/**
 * جدولٌ في الورقة: أعمدةٌ فوق مرةً واحدة، وصفوفٌ تحتها.
 *
 * والورقةُ أولى به من الشاشة: عرضُها A4 يسع خمسةَ أعمدةٍ مرتاحةً، فيُقرأ
 * العمودُ نازلًا ويبين من قصّر في نظرة. وكانت الأسماءُ سطورًا بنقاطٍ
 * يلتفّ الواحد منها على سطرين، فلا يُقارَن رقمٌ برقم.
 *
 * `cols` أعمدةٌ بنسبها: `{ label, w, align }`. و`grid` صفوفُها، والخليّة
 * نصٌّ أو `{ t, span, align, dim }`.
 */
const GRID_H = 46;
/**
 * ارتفاعُ صفّ الجدول.
 *
 * والصفُّ يعلو بما فيه: تقريرُ الموظف سطرانِ أو ثلاثة، فلو قُصّ ليسع سطرًا
 * واحدًا ضاع نصفُ خبره — والورقةُ تُرسل لمجلس الإدارة لتُقرأ لا لتُعدّ.
 * و`_h` يُحسب في `paperSheet` بعد قياس الكانفاس، ويُقرأ هنا وفي التقسيم.
 */
const rowH = (row) => Math.max(1, Number(row?._h) || 1) * GRID_H;
const gridHeight = (grid) => (grid || []).reduce((a, r) => a + rowH(r), GRID_H);
const secHeight = (sec) => HEAD_H + (sec.rows?.length || 0) * ROW_H
  + (sec.lines?.length || 0) * LINE_H
  + (sec.grid ? gridHeight(sec.grid) : 0) + TAIL + GAP;

/**
 * تقسيمُ الأقسام على صفحات.
 *
 * والقسمُ الطويل يُشقّ: يأخذ ما يسع الصفحةَ ويكمل في التي بعدها بعنوانه
 * و«تتمة» — فقائمةُ ثلاثين طالبًا لا تُقصّ عند الطالب الحادي عشر.
 */
export const paginate = (sections, room) => {
  const pages = [];
  let page = [], left = room;
  const flush = () => { if (page.length) pages.push(page); page = []; left = room; };
  for (const sec of sections || []) {
    let rows = sec.rows || [], lines = sec.lines || [], grid = sec.grid || null, first = true;
    for (;;) {
      const gridH = grid ? gridHeight(grid) : 0;
      const need = HEAD_H + rows.length * ROW_H + lines.length * LINE_H + gridH + TAIL + GAP;
      if (need <= left) {
        page.push({ ...sec, rows, lines, ...(grid ? { grid } : {}), title: first ? sec.title : `${sec.title} — تتمة` });
        left -= need;
        break;
      }
      // كم صفًّا يسع بعد العنوان والذيل؟
      const body = left - HEAD_H - TAIL - GAP;
      const fitRows = Math.max(0, Math.min(rows.length, Math.floor(body / ROW_H)));
      let after = body - fitRows * ROW_H;
      const fitLines = Math.max(0, Math.min(lines.length, Math.floor(after / LINE_H)));
      after -= fitLines * LINE_H;
      /*
        وصفُّ الترويسة يُحسب مع الجدول في كل صفحة: تُعاد فوق التتمّة، وإلا
        قرأ من قلب الورقةَ أرقامًا بلا عناوين.
      */
      let fitGrid = 0;
      if (grid) {
        let room2 = after - GRID_H;   // صفُّ الترويسة أولًا
        for (const r of grid) { if (room2 < rowH(r)) break; room2 -= rowH(r); fitGrid++; }
      }
      // ما يسع سطرين على الأقل لا يستحقّ صفحةً مشقوقة — نبدأ صفحةً جديدة
      if (fitRows + fitLines + fitGrid < 2) { flush(); continue; }
      page.push({
        ...sec, rows: rows.slice(0, fitRows), lines: lines.slice(0, fitLines),
        ...(grid ? { grid: grid.slice(0, fitGrid) } : {}),
        title: first ? sec.title : `${sec.title} — تتمة`,
      });
      rows = rows.slice(fitRows); lines = lines.slice(fitLines);
      if (grid) grid = grid.slice(fitGrid);
      first = false;
      flush();
      if (!rows.length && !lines.length && !(grid && grid.length)) break;
    }
  }
  flush();
  return pages.length ? pages : [[]];
};

/**
 * يرسم الورقة ويرجّعها ملفَّ PDF.
 *
 * والارتفاع ثابتٌ (A4): ورقةٌ تُرسَل وتُطبع، وطولُها المتغيّر يُفسد الطباعة.
 * فإن زاد ما فيها على صفحة، فأحدُ أمرين حسب `fit`:
 * - `true` — تُضغط المسافاتُ حتى تسع صفحةً واحدة (تقريرُ اليوم: أقسامُه معدودة).
 * - `false` — تُقسَّم على صفحات (تقريرُ خيركم الكامل: ثلاثون طالبًا لا يسعون).
 */
export const paperSheet = async ({ team: teamName, sub = '', title = '', date = '', sections = [], fileTitle = '' },
  { logo = '', team = 'فريق فيض السعودي', stamp = '', fit = true } = {}) => {
  const mark = await loadImage(logo);

  const drawPage = async (secs, k, total) => {
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
    if (mark) c.drawImage(mark, PAGE.w - PAD - 96, HEAD / 2 - 48, 96, 96);
    const tx = PAGE.w - PAD - (mark ? 124 : 0);
    text(teamName || team, tx, HEAD / 2 - 22, { size: 40, weight: 800, color: '#fff' });
    text(sub, tx, HEAD / 2 + 28, { size: 24, color: '#a9c2ea' });

    /* العنوان */
    let y = HEAD + 90;
    text(title, PAGE.w - PAD, y, { size: 46, weight: 800 });
    if (clean(date)) text(`التاريخ: ${clean(date)}`, PAD, y, { size: 24, color: '#64748b', align: 'left' });
    y += 40;
    c.strokeStyle = '#e2e8f0';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(PAD, y);
    c.lineTo(PAGE.w - PAD, y);
    c.stroke();
    y += 50;

    /*
      الضغطُ للصفحة الواحدة: كانت الأقسام أربعةً فتسع بلا حساب، ثم صارت
      سبعةً فخرج آخرها عن الورقة ودخل في الذيل — رأيتُها في الفحص. فبدل أن
      تُقصّ تُقاس، ولا تضيق أكثر من الثلثين فتصير سطورًا لا تُقرأ.
    */
    const natural = secs.reduce((a, sec) => a + secHeight(sec), 0);
    const avail = (PAGE.h - 130) - y;
    const shrink = fit && natural > avail ? Math.max(0.66, avail / natural) : 1;
    const S = (v) => Math.round(v * shrink);
    // والخطُّ يضيق أبطأ من المسافة: الفراغ يُختصر قبل الحرف
    const F = (v) => Math.round(v * Math.max(0.84, shrink));

    /**
     * قصُّ النصّ ليسع خليّته — للعناوين وحدها.
     *
     * والوزنُ يدخل القياس: الغليظُ أعرضُ من الرفيع، فلو قِسنا بالرفيع ورسمنا
     * بالغليظ خرج العنوانُ عن عموده ودخل في جاره. وقعت في «الطلاب —
     * ملاحظات سلوكية» على الورقة.
     */
    const clip = (s, max, size, weight = 400) => {
      c.font = `${weight} ${size}px ${FONT}`;
      let t = clean(s);
      if (!t || c.measureText(t).width <= max) return t;
      while (t.length > 1 && c.measureText(`${t}…`).width > max) t = t.slice(0, -1);
      return `${t}…`;
    };

    for (const sec of secs) {
      const rows = sec.rows || [];
      const lines = sec.lines || [];
      const grid = sec.grid || null;
      const cols = sec.cols || [];
      const h = S(HEAD_H) + rows.length * S(ROW_H) + lines.length * S(LINE_H)
        + (grid ? gridHeight(grid) / GRID_H * S(GRID_H) : 0) + S(TAIL);
      box(PAD, y, PAGE.w - PAD * 2, h, 22, '#f8fafc', '#e8eef6');
      text(sec.title, PAGE.w - PAD - 32, y + S(42), { size: F(27), weight: 800, color: NAVY });
      let ry = y + S(HEAD_H);
      for (const [label, value, strong] of rows) {
        const mid = ry + S(ROW_H) / 2;
        text(label, PAGE.w - PAD - 32, mid, { size: F(25), color: strong ? '#0f172a' : '#64748b', weight: strong ? 700 : 400 });
        text(value, PAD + 32, mid, { size: F(strong ? 30 : 26), weight: strong ? 800 : 600, align: 'left', dir: 'rtl' });
        ry += S(ROW_H);
      }
      for (const line of lines) {
        const { t, cont } = typeof line === 'string' ? { t: line, cont: false } : line;
        text(cont ? t : `• ${t}`, PAGE.w - PAD - 32 - (cont ? 26 : 0), ry + S(LINE_H) / 2,
          { size: F(24), color: cont ? '#475569' : '#334155' });
        ry += S(LINE_H);
      }
      /* الجدول: ترويسةٌ ثم صفوف */
      if (grid) {
        const left = PAD + 28;
        const right = PAGE.w - PAD - 28;
        const wide = right - left;
        const total = cols.reduce((a, col) => a + (Number(col.w) || 0), 0) || 1;
        // مواضعُ الأعمدة من اليمين: الأولُ أيمنُها، كما تُقرأ
        const edges = [];
        let at = right;
        for (const col of cols) { const w = (Number(col.w) || 0) / total * wide; edges.push({ col, r: at, w }); at -= w; }
        /** خليّةٌ بسطرٍ أو أكثر، تُرسم من وسط صفّها فتستوي الأسطرُ حوله. */
        const cell = (it, e, size, top, tall) => {
          const span = Math.max(1, Number(it.span) || 1);
          // الخليّةُ الممتدّة تأخذ عرضَ ما تحتها من أعمدة («غائب» يمتدّ على الثلاثة)
          const i = edges.indexOf(e);
          const w = edges.slice(i, i + span).reduce((a, x) => a + x.w, 0);
          const align = it.align || e.col.align || 'right';
          const pad = 10;
          const rows2 = it.lines || [clip(it.t, w - pad * 2, size, it.strong ? 800 : 400)];
          const x = align === 'center' ? e.r - w / 2 : align === 'left' ? e.r - w + pad : e.r - pad;
          const lead = S(GRID_H);
          // الأسطرُ في وسط ارتفاع الصفّ، فالرقمُ يحاذي أولَ سطرٍ من جاره الطويل
          const start = top + (tall * lead - rows2.length * lead) / 2 + lead / 2;
          rows2.forEach((t, k) => {
            if (!t) return;
            text(t, x, start + k * lead, {
              size, align: align === 'center' ? 'center' : align === 'left' ? 'left' : 'right',
              color: it.dim ? '#94a3b8' : (it.strong ? '#0f172a' : '#334155'),
              weight: it.strong ? 800 : 400,
            });
          });
        };
        // ترويسةٌ رماديّة، وتحتها خطّ
        const hy = ry;
        box(left, hy, wide, S(GRID_H), 0, '#eef2f7', '');
        edges.forEach((e) => cell({ t: e.col.label, align: e.col.align, dim: true, strong: true },
          e, F(20), hy, 1));
        ry += S(GRID_H);
        for (const line of grid) {
          const tall = Math.max(1, Number(line._h) || 1);
          let skip = 0;
          edges.forEach((e, i) => {
            if (skip > 0) { skip--; return; }
            const v = line[i];
            if (v === undefined || v === null) return;
            const it = typeof v === 'string' || typeof v === 'number' ? { t: String(v) } : v;
            skip = Math.max(1, Number(it.span) || 1) - 1;
            cell(it, e, F(23), ry, tall);
          });
          ry += tall * S(GRID_H);
          // فاصلٌ رفيع بين الصفوف — يُقرأ العمودُ نازلًا بلا أن تتوه العين
          c.strokeStyle = '#e8eef6';
          c.lineWidth = 1;
          c.beginPath();
          c.moveTo(left, ry);
          c.lineTo(right, ry);
          c.stroke();
        }
      }
      y += h + S(GAP);
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
    if (total > 1) text(`${k + 1} / ${total}`, PAD, foot, { size: 20, color: '#94a3b8', align: 'left', dir: 'ltr' });

    const jpeg = await new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('ما تولّدت الورقة'))), 'image/jpeg', 0.92);
    });
    return new Uint8Array(await jpeg.arrayBuffer());
  };

  const room = (PAGE.h - 130) - (190 + 90 + 40 + 50);
  /*
    الشقُّ قبل القياس: لو قِسنا ثم شققنا لزاد عددُ الأسطر بعد ما حُسبت
    الصفحات، فخرج آخرُها عن الورقة — وهو عينُ العطب الذي نُصلحه.
  */
  const meas = document.createElement('canvas').getContext('2d');
  meas.font = `400 24px ${FONT}`;
  meas.direction = 'rtl';
  const maxLine = PAGE.w - PAD * 2 - 64 - 26;
  const width = (s) => meas.measureText(s).width;
  /**
   * وخلايا الجدول تُلفّ كذلك، فيعلو الصفُّ بما فيه.
   *
   * ثلاثةُ أسطرٍ حدٌّ: ما زاد عليها تقريرٌ لا خليّة، وصفٌّ بعشرة أسطرٍ يبتلع
   * الصفحة ويُفقد الجدولَ شكلَه — فيُقصّ عندها وحدها.
   */
  const CELL_MAX = 3;
  const inner = PAGE.w - PAD * 2 - 56;
  const fitGridCells = (sec) => {
    const cols = sec.cols || [];
    const total = cols.reduce((a, col) => a + (Number(col.w) || 0), 0) || 1;
    const widths = cols.map((col) => (Number(col.w) || 0) / total * inner);
    meas.font = `400 23px ${FONT}`;
    const grid = sec.grid.map((row) => {
      let tall = 1;
      const out = row.map((v, i) => {
        if (v === undefined || v === null) return v;
        const it = typeof v === 'string' || typeof v === 'number' ? { t: String(v) } : v;
        const span = Math.max(1, Number(it.span) || 1);
        const w = widths.slice(i, i + span).reduce((a, x) => a + x, 0) - 20;
        const parts = wrapLine(width, it.t, w).map((x) => x.t).slice(0, CELL_MAX);
        tall = Math.max(tall, parts.length || 1);
        return { ...it, lines: parts.length ? parts : [''] };
      });
      out._h = tall;
      return out;
    });
    return { ...sec, grid };
  };
  const wrapped = (sections || []).map((sec) => {
    let s = sec;
    if (s.lines?.length) s = { ...s, lines: s.lines.flatMap((l) => wrapLine(width, l, maxLine)) };
    if (s.grid?.length && s.cols?.length) s = fitGridCells(s);
    return s;
  });
  const pages = fit ? [wrapped] : paginate(wrapped, room);
  const shots = [];
  for (let k = 0; k < pages.length; k++) shots.push(await drawPage(pages[k], k, pages.length));
  const pdf = pdfFromJpegs(shots, { width: PAGE.w, height: PAGE.h, title: fileTitle || title });
  return new Blob([pdf], { type: 'application/pdf' });
};

/** ورقةُ تقرير اليوم — صفحةٌ واحدة تُضغط لتسع. */
export const reportSheet = async (info, opts = {}) => paperSheet({
  sub: clean(info.program) + (info.term ? ` · ${info.term}` : ''),
  title: `تقرير ${clean(info.week) || 'اليوم'}`,
  date: info.date,
  sections: sheetSections(info),
  fileTitle: `تقرير ${clean(info.week)}`,
}, { ...opts, fit: true });

export const sheetFileName = (date) => `faydh-report-${clean(date).replace(/[^0-9]/g, '-') || 'week'}.pdf`;
