/**
 * الإيصال: رقمه، وحقوله، وصورته.
 *
 * يشتغل في الطرفين: الخادم يرقّم التسجيل القادم من الرابط العام، والمتصفح
 * يرقّم ما يضيفه صاحب التطبيق بيده — فالترقيم واحد مهما كان الباب.
 *
 * والصورة تُرسم هنا في الجهاز لا على الخادم: ورقةٌ تُطلب مرة لكل مشترك، فلا
 * تستحق طلبًا للشبكة، ولا مكتبة PDF تحتاج خطًّا عربيًّا مضمَّنًا حتى لا
 * تنفصل حروفه. والكانفاس يرسم العربي كما يرسمه المتصفح، بلا وسيط.
 */

const num = (v) => Number(v || 0);
const clean = (v) => String(v ?? '').trim();

/* -------------------------------- الترقيم -------------------------------- */

/** كل مشترك في البيانات: المجمّع على البرنامج، والمنفصل داخل أسابيعه. */
export const eachParticipant = (data, fn) => {
  for (const p of data?.programs || []) {
    for (const x of p.participants || []) fn(x, p, null);
    for (const w of p.weeks || []) for (const x of w.participants || []) fn(x, p, w);
  }
};

export const refPrefix = (year) => `FA-${clean(year) || '0000'}-`;

/**
 * الرقم التالي: أكبر رقم مستعمل في هذي السنة زائد واحد.
 *
 * ولا نحفظ عدّادًا: العدّاد يخزَّن في مكان واحد، ولو دمج التطبيقُ حفظتين
 * تعارضتا رجّح إحداهما فأعاد الرقم مرتين. أما الاشتقاق من أكبر موجود فيصلح
 * نفسه: لو تكرّر رقمٌ يومًا، تجاوزه الذي بعده ولم يبنِ عليه.
 */
export const nextRef = (data, year) => {
  const pre = refPrefix(year);
  let max = 0;
  eachParticipant(data, (x) => {
    const r = clean(x.ref);
    if (!r.startsWith(pre)) return;
    const n = parseInt(r.slice(pre.length), 10);
    if (Number.isFinite(n) && n > max) max = n;
  });
  return pre + String(max + 1).padStart(4, '0');
};

/** السنة من مفتاح الموسم: «1448-الترم الأول» ← «1448». */
export const yearOf = (termKey) => {
  const s = String(termKey || '');
  const i = s.indexOf('-');
  return i < 0 ? s : s.slice(0, i);
};

/* -------------------------------- الحقول -------------------------------- */

/**
 * حقول الإيصال. الثلاثة المقفولة ما تنشال: ورقةٌ بلا رقمٍ ولا تاريخٍ ولا
 * مبلغ ما هي إيصالًا أصلًا، فما نعرضها خيارًا يُطفأ.
 */
export const REC_LOCKED = ['ref', 'date', 'amount'];
export const REC_FIELDS = [
  ['student', 'اسم الطالب'],
  ['guardian', 'ولي الأمر'],
  ['gPhone', 'جوال ولي الأمر'],
  ['program', 'البرنامج'],
  ['days', 'الأيام'],
  ['place', 'المكان'],
  ['pay', 'طريقة الدفع'],
];

export const defaultReceipt = () => ({
  note: 'شكرًا لثقتكم بفريق فيض السعودي.',
  fields: { student: true, guardian: true, gPhone: false, program: true, days: true, place: false, pay: true },
});

/** مُفعَّل؟ الغياب يعني نعم، فالحقل الجديد يظهر بلا ما يعدّل أحدٌ إعداداته. */
export const recOn = (rec, id) => (rec?.fields || {})[id] !== false;

/* ------------------------------- محتوى الورقة ------------------------------- */

/**
 * صفوف الإيصال جاهزة للرسم. تُبنى هنا لا في الرسم عشان تُختبر بلا كانفاس:
 * ما يُعرض وما يُطوى وترتيبهما منطقٌ يُراجَع، والرسم بعده تنفيذ.
 */
export const receiptRows = (rec, info) => {
  const rows = [];
  const put = (id, label, value, locked) => {
    const v = clean(value);
    if (v && (locked || recOn(rec, id))) rows.push({ id, label, value: v, locked: !!locked });
  };
  put('ref', 'رقم الإيصال', info.ref, true);
  put('date', 'التاريخ', info.date, true);
  put('student', 'الطالب', info.student);
  put('guardian', 'ولي الأمر', info.guardian);
  put('gPhone', 'الجوال', info.phone);
  put('program', 'البرنامج', info.program);
  put('days', 'الأيام', info.days);
  put('place', 'المكان', info.place);
  return rows;
};

/**
 * التاريخ الهجري كما يُكتب على الورقة.
 *
 * ولا نلحق «هـ» بأيدينا: الصيغة تلحقها، فكانت تُطبع مرتين.
 */
export const hijri = (ms) => {
  try {
    return new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-arab',
      { day: 'numeric', month: 'numeric', year: 'numeric' }).format(new Date(ms || Date.now()));
  } catch {
    return new Date(ms || Date.now()).toISOString().slice(0, 10);
  }
};

/* -------------------------------- الرسم -------------------------------- */

const W = 720;          // عرض الورقة بالبكسل
const PAD = 44;
const NAVY = '#022D71';
const FONT = "'Tajawal', system-ui, -apple-system, 'Segoe UI', sans-serif";

/** صورة من data URI. ترجّع null لو ما حمّلت — فالورقة تطلع بلا شعار لا فاشلة. */
const loadImage = (src) => new Promise((resolve) => {
  if (!src) { resolve(null); return; }
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => resolve(null);
  img.src = src;
});

/**
 * يرسم الإيصال ويرجّعه Blob من نوع PNG.
 *
 * الارتفاع يُحسب من الصفوف قبل الرسم: الورقة تطول وتقصر بما فيها، فما يبقى
 * تحتها فراغ لو أطفأ صاحبها نصف الحقول.
 */
export const receiptPngBlob = async (rec, info, { logo = '', scale = 2 } = {}) => {
  const rows = receiptRows(rec, info);
  const note = clean(rec?.note);
  const amount = clean(info.amount);
  const pay = recOn(rec, 'pay') ? clean(info.pay) : '';

  const HEAD = 132;
  const ROW = 52;
  const AMT = amount ? 132 : 0;
  const NOTE = note ? 44 + note.split('\n').length * 30 : 0;
  const FOOT = 60;
  const H = HEAD + 22 + rows.length * ROW + AMT + NOTE + FOOT;

  const canvas = document.createElement('canvas');
  canvas.width = W * scale;
  canvas.height = H * scale;
  const c = canvas.getContext('2d');
  c.scale(scale, scale);
  c.textBaseline = 'middle';
  c.direction = 'rtl';

  const text = (s, x, y, { size = 15, weight = 400, color = '#0f172a', align = 'right', dir } = {}) => {
    c.font = `${weight} ${size}px ${FONT}`;
    c.fillStyle = color;
    c.textAlign = align;
    c.direction = dir || 'rtl';
    c.fillText(s, x, y);
    c.direction = 'rtl';
  };
  const box = (x, y, w, h, r, fill, stroke) => {
    c.beginPath();
    c.roundRect(x, y, w, h, r);
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = 1; c.stroke(); }
  };

  c.fillStyle = '#fff';
  c.fillRect(0, 0, W, H);

  /* الرأس */
  c.fillStyle = NAVY;
  c.fillRect(0, 0, W, HEAD);
  const mark = await loadImage(logo);
  const tx = W - PAD - (mark ? 74 : 0);
  if (mark) c.drawImage(mark, W - PAD - 58, HEAD / 2 - 29, 58, 58);
  text(clean(info.team) || 'الإيصال', tx, HEAD / 2 - 13, { size: 23, weight: 800, color: '#fff' });
  text('إيصال استلام مبلغ', tx, HEAD / 2 + 18, { size: 14, color: '#a9c2ea' });

  /* الصفوف */
  let y = HEAD + 22;
  for (const r of rows) {
    const mid = y + ROW / 2;
    text(r.label, W - PAD, mid, { size: 13.5, color: '#94a3b8' });
    // الرقم والجوال أرقامٌ لاتينية، فتُكتب يسارًا لتُقرأ كما كُتبت
    const ltr = r.id === 'ref' || r.id === 'gPhone';
    text(r.value, PAD, mid, { size: 15.5, weight: 700, align: 'left', dir: ltr ? 'ltr' : 'rtl' });
    c.strokeStyle = '#f1f5f9';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(PAD, y + ROW);
    c.lineTo(W - PAD, y + ROW);
    c.stroke();
    y += ROW;
  }

  /* المبلغ — هو موضوع الورقة، فله صندوقه */
  if (amount) {
    y += 20;
    box(PAD, y, W - PAD * 2, 96, 18, '#f0fdf4', '#bbf7d0');
    text('المبلغ المستلَم', W / 2, y + 26, { size: 13.5, weight: 700, color: '#15803d', align: 'center' });
    text(`${amount} ر.س`, W / 2, y + 58, { size: 32, weight: 800, color: '#14532d', align: 'center' });
    if (pay) text(pay, W / 2, y + 82, { size: 12.5, color: '#166534', align: 'center' });
    y += 96 + 16;
  }

  /* عبارة صاحب البرنامج */
  if (note) {
    const lines = note.split('\n');
    box(PAD, y, W - PAD * 2, 24 + lines.length * 30, 16, '#f8fafc', null);
    lines.forEach((l, i) => text(l, W / 2, y + 27 + i * 30, { size: 14, color: '#475569', align: 'center' }));
    y += 24 + lines.length * 30 + 4;
  }

  /* الذيل */
  c.setLineDash([4, 4]);
  c.strokeStyle = '#e2e8f0';
  c.beginPath();
  c.moveTo(PAD, y + 14);
  c.lineTo(W - PAD, y + 14);
  c.stroke();
  c.setLineDash([]);
  text('أُصدر إلكترونيًّا · ما يحتاج ختمًا', W / 2, y + 36, { size: 11.5, color: '#cbd5e1', align: 'center' });

  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('ما تولّدت الصورة'))), 'image/png');
  });
};

/**
 * اسم الملف: يحمل الرقم فيُعرف بلا ما يُفتح.
 *
 * وبحروف لاتينية: جرّبناه عربيًّا فنزل باسم «download» — المتصفّح يتجاهل
 * الاسم غير اللاتيني في طلب التحميل. ورقمُ الإيصال يدلّ عليه على كل حال.
 */
export const receiptFileName = (ref) => `faydh-${clean(ref) || 'receipt'}.png`;

/**
 * يعطي الملفَّ لصاحب الجهاز.
 *
 * على الجوال لوحة المشاركة: منها يحفظه في الصور أو يرسله في واتساب مباشرة،
 * وهذا المقصود من الورقة أصلًا. وعلى ما سواها ينزل ملفًّا.
 *
 * والوصلة تدخل الصفحة قبل ضغطها: بعض المتصفّحات تتجاهل وصلةً ما هي فيها.
 * ولا نستعمل `data:` عنوانًا — سفاري لا يحترم طلب التحميل معه فما ينزل شيء.
 */
export const shareFile = async (blob, name, title) => {
  const file = new File([blob], name, { type: blob.type || 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return 'shared';
    } catch (e) {
      if (e?.name === 'AbortError') return 'cancelled'; // ألغاها بنفسه
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return 'downloaded';
};

export { num };
