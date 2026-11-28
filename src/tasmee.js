/**
 * التسميع اليومي: مقارنة ما قاله الطالب بنصّ المصحف.
 *
 * المقارنة هنا بالكود لا بنموذج ذكاء: نصّ المصحف معروف بحروفه، وما نحتاجه أن نعرف أيّ كلمةٍ مما سمعناه
 * تطابق الكلمةَ المتوقَّعة. ولو تُرك هذا لنموذجٍ لأكمل الآية من ذاكرته فقال «صحيح» لما لم يُقَل.
 *
 * وما يصل من التعرّف على الكلام نصٌّ بإملاءٍ عاديّ لا برسم المصحف، وقد يلصق كلمتين أو يفصل كلمة، ويخلط
 * بين حروفٍ متقاربة المخرج (س/ص، ت/ط…). فتُوحَّد الصور أولًا، ثم يُحاذى الكلام كلمةً كلمة بمسافة تحرير
 * تُخفّف على المتقارب من الحروف، ويُقبل من الكلمة بقدر ما يضمن مستوى الصرامة المختار.
 *
 * وحدودُه صريحة: يكشف الكلمة الناقصة والمبدَّلة والآية المقفوزَ عنها، ولا يكشف التجويد (المدود والغنة والمخارج)
 * لأن النص الواصل منه لا يحمله. فنتيجتُه «ما سُمع يطابق ما كُتب»، لا حكمٌ على الأداء.
 */

const MARKS = /[ؐ-ًؚ-ٰٟـۖ-ۭ]/g;

/** يوحّد الإملاء للمقارنة: بلا تشكيل ولا علامات وقف، وصورٌ واحدة للألف والياء والتاء المربوطة والهمزة. */
export const norm = (s) => String(s ?? '')
  .replace(/[﻿​-‏]/g, '')
  .replace(MARKS, '')
  .replace(/[أإآٱ]/g, 'ا')
  .replace(/[ىیۍ]/g, 'ي')
  .replace(/ک/g, 'ك')
  .replace(/ة/g, 'ه')
  .replace(/ؤ/g, 'و')
  .replace(/ئ/g, 'ي')
  .replace(/ء/g, '')
  // ما بقي من غير الحروف (علامات الترقيم، الأرقام، الرموز) يصير فاصلًا
  .replace(/[^ء-ؿف-ي\s]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

/**
 * حروفٌ يخلط بينها التعرّف على الكلام أكثر من غيرها: تُحسب الاستبدالات بينها نصفَ خطأ.
 * (ثقيلةٌ على الأذن لا على المصحف: «الصمد» تُسمع «السمد» ولم يُخطئ الطالب في الأغلب.)
 */
const CONFUSABLE = (() => {
  const groups = ['سصث', 'تط', 'دض', 'ذزظ', 'قك', 'حهخ', 'عا', 'غخ'];
  const m = new Set();
  for (const g of groups) for (const a of g) for (const b of g) if (a !== b) m.add(a + b);
  return m;
})();

/** مسافة التحرير بين كلمتين، ونصف الخطأ للمتقارب. */
const editDist = (a, b) => {
  const n = a.length, m = b.length;
  if (!n) return m;
  if (!m) return n;
  let prev = Array.from({ length: m + 1 }, (_, j) => j);
  for (let i = 1; i <= n; i++) {
    const cur = [i];
    for (let j = 1; j <= m; j++) {
      const sub = a[i - 1] === b[j - 1] ? 0 : (CONFUSABLE.has(a[i - 1] + b[j - 1]) ? 0.5 : 1);
      cur[j] = Math.min(prev[j - 1] + sub, prev[j] + 1, cur[j - 1] + 1);
    }
    prev = cur;
  }
  return prev[m];
};

/** تشابه كلمتين من صفرٍ إلى واحد. */
export const sim = (a, b) => {
  if (a === b) return 1;
  const L = Math.max(a.length, b.length);
  return L ? Math.max(0, 1 - editDist(a, b) / L) : 1;
};

/**
 * فواتح السور: تُكتب «الم» وتُنطق «ألف لام ميم»، والتعرّف يعطي الاثنين. فنقبل أيَّهما.
 */
const LETTER_NAME = { ا: 'الف', ل: 'لام', م: 'ميم', ص: 'صاد', ر: 'را', ك: 'كاف', ه: 'ها', ي: 'يا', ع: 'عين', ط: 'طا', س: 'سين', ح: 'حا', ق: 'قاف', ن: 'نون' };
const MUQATTAAT = new Set(['الم', 'المص', 'الر', 'المر', 'كهيعص', 'طه', 'طسم', 'طس', 'يس', 'ص', 'حم', 'عسق', 'ق', 'ن']);
const spelled = (w) => [...w].map((c) => LETTER_NAME[c] || c).join('');

const NAMES = new Set(Object.values(LETTER_NAME));
const glueLetterNames = (H) => {
  const out = [];
  for (const w of H) {
    if (NAMES.has(w) && out.length && out[out.length - 1].names) out[out.length - 1].w += w;
    else out.push({ w, names: NAMES.has(w) });
  }
  // الوحيد يبقى كلمةً بذاتها («عين»، «ها»)؛ والمتتالي من أسماء الحروف يصير كلمةً واحدة
  return out.map((x) => x.w);
};

const simTo = (e, h) => {
  const s = sim(e, h);
  return MUQATTAAT.has(e) ? Math.max(s, sim(spelled(e), h)) : s;
};

/** مستويات الصرامة: أدنى تشابهٍ تُقبل به الكلمة. «عادي» يسامح حرفًا متقاربًا (س/ص…) ولا يسامح حرفًا مختلفًا في كلمةٍ دون سبعة أحرف. */
export const LEVELS = { strict: 1, normal: 0.85, lenient: 0.65 };

/**
 * كلمات مدًى من المصحف: سورة ومن آية إلى آية (من ١).
 * `quran` هو محتوى quran.json: `{ s: [[آية، آية…]، …] }`.
 */
export const wordsOf = (quran, surah, from, to) => {
  const ayat = quran?.s?.[surah - 1];
  if (!ayat) return [];
  const a = Math.max(1, Math.floor(Number(from) || 1));
  const b = Math.min(ayat.length, Math.floor(Number(to) || a));
  const out = [];
  for (let n = a; n <= b; n++) {
    String(ayat[n - 1]).split(/\s+/).forEach((raw) => {
      const w = norm(raw);
      if (w) out.push({ w, raw, ayah: n });
    });
  }
  return out;
};

/** كم كلمةً أمام المؤشّر تُقارَن: يكفي ما يقوله بين نبضتي تعرّفٍ بأمانٍ كبير. */
const WINDOW = 80;

const SUB_MAX = 1.2;   // استبدالٌ بكلمةٍ بعيدة: أغلى من الحذف، وأرخص من حذفٍ مع زيادة
const DEL = 1;         // كلمةٌ متوقَّعة لم تُسمع
const INS = 0.6;       // كلمةٌ زائدة سُمعت (تردّد، تكرار، ضجيج) — أخفّ من الحذف لأنها كثيرًا ما تكون ضجيجًا
const MERGE = 0.1;     // ثمن لصق كلمتين أو فصل كلمة

const subCost = (s) => (s < 0.5 ? SUB_MAX : (1 - s) * 2);

/**
 * يحاذي المتوقَّع بما سُمع كلمةً كلمة، ويقول لكل متوقَّعة: ok (طابقت) أو wrong (استُبدلت بغيرها)
 * أو missing (لم تُسمع وقد جاءت بعدها كلمات) أو pending (لم يصل إليها الكلام بعد).
 *
 * `final`: انتهى الكلام، فما بقي بلا سماعٍ يُعدّ ناقصًا لا منتظَرًا.
 */
export const judge = (expected, heardText, { level = 'normal', final = false } = {}) => {
  const theta = LEVELS[level] ?? LEVELS.normal;
  const E = expected.map((x) => (typeof x === 'string' ? x : x.w));
  let H = norm(heardText).split(' ').filter(Boolean);
  // «الف لام ميم» تُسمع ثلاث كلمات وهي كلمةٌ واحدة في المصحف: تُلصق إن كان في المدى فاتحةُ سورة
  if (E.some((w) => MUQATTAAT.has(w))) H = glueLetterNames(H);
  const n = E.length, m = H.length;
  const status = new Array(n).fill('pending');
  if (!n) return { status, ok: 0, firstBad: -1, done: true, reached: -1 };

  // dp[i][j]: أدنى كلفةٍ لمحاذاة أول i متوقَّعة بأول j مسموعة
  const dp = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
  const back = Array.from({ length: n + 1 }, () => new Uint8Array(m + 1));
  for (let i = 1; i <= n; i++) { dp[i][0] = dp[i - 1][0] + DEL; back[i][0] = 2; }
  for (let j = 1; j <= m; j++) { dp[0][j] = dp[0][j - 1] + INS; back[0][j] = 3; }
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      let best = dp[i - 1][j - 1] + subCost(simTo(E[i - 1], H[j - 1])), mv = 1;
      if (dp[i - 1][j] + DEL < best) { best = dp[i - 1][j] + DEL; mv = 2; }
      if (dp[i][j - 1] + INS < best) { best = dp[i][j - 1] + INS; mv = 3; }
      if (j >= 2) {                       // السامع لصق كلمتين
        const c = dp[i - 1][j - 2] + subCost(simTo(E[i - 1], H[j - 2] + H[j - 1])) + MERGE;
        if (c < best) { best = c; mv = 4; }
      }
      if (i >= 2) {                       // السامع فصل كلمةً إلى اثنتين (نطقَها أو كتبها هو مفصولة)
        const c = dp[i - 2][j - 1] + subCost(Math.min(simTo(E[i - 2] + E[i - 1], H[j - 1]), 1)) + MERGE;
        if (c < best) { best = c; mv = 5; }
      }
      dp[i][j] = best; back[i][j] = mv;
    }
  }

  /**
   * أين تنتهي المحاذاة؟ ما لم يصل إليه الكلام بعد لا يُحسب عليه حذف: وإلا فضّل المحاذي لصقَ كلمتين متوقَّعتين
   * بما سُمع على أن يترك الذيل، فيرى خطأً حيث لم يُخطئ أحد. أما إذا انتهى الكلام فالحذف في الذيل ثمنه كامل.
   */
  let end = n;
  if (!final) {
    let min = Infinity;
    for (let k = 0; k <= n; k++) if (dp[k][m] < min - 1e-9) { min = dp[k][m]; end = k; }
    // عند التعادل نأخذ الأطول: ما وُجد له مقابل فهو مقابله
    for (let k = end + 1; k <= n; k++) if (dp[k][m] <= min + 1e-9) end = k;
  }
  let i = end, j = m, reached = -1;
  const matched = new Array(n).fill(false);
  while (i > 0 || j > 0) {
    const mv = back[i][j];
    if (mv === 1) {
      const s = simTo(E[i - 1], H[j - 1]);
      status[i - 1] = s >= theta ? 'ok' : 'wrong';
      matched[i - 1] = true; i--; j--;
    } else if (mv === 2) { status[i - 1] = 'missing'; i--; }
    else if (mv === 3) { j--; }
    else if (mv === 4) {
      const s = simTo(E[i - 1], H[j - 2] + H[j - 1]);
      status[i - 1] = s >= theta ? 'ok' : 'wrong'; matched[i - 1] = true; i--; j -= 2;
    } else {
      const s = Math.min(simTo(E[i - 2] + E[i - 1], H[j - 1]), 1);
      status[i - 1] = status[i - 2] = s >= theta ? 'ok' : 'wrong'; matched[i - 1] = matched[i - 2] = true; i -= 2; j--;
    }
  }
  for (let k = n - 1; k >= 0; k--) if (matched[k]) { reached = k; break; }
  // ما بعد آخر كلمةٍ بلغها الكلام: منتظَر، إلا إن انتهى الكلام فهو ناقص
  for (let k = reached + 1; k < n; k++) status[k] = final ? 'missing' : 'pending';

  const ok = status.filter((s) => s === 'ok').length;
  const firstBad = status.findIndex((s) => s === 'wrong' || s === 'missing');
  return { status, ok, firstBad, done: ok === n, reached };
};

/** بلا «ال» التعريف: «صمد» تُسمع لـ«الصمد» ولا تعني الحذف عند من يقارن الجذر. */
const dal = (w) => (w.length > 3 && w.startsWith('ال') ? w.slice(2) : w);

/**
 * هل قفز الطالب؟ المحاذاة لا تراه: ما سُمع ولا مقابل له عند المؤشّر تعدّه ضجيجًا (زيادةٌ بكلفة أخفّ من حذف
 * ما قُفز عنه)، فيبقى المؤشّر «ينتظر» ولا يُقال شيء. فنبحث صراحةً عمّا سُمع في موضعٍ لاحقٍ من المتوقَّع:
 * ثلاث كلماتٍ متتاليةٌ أمامه (انتقل إلى آيةٍ أخرى)، أو كلمةٌ واحدة قريبةٌ منه (تجاوز كلمةً أو كلمتين).
 * لا يُستدعى إلا حين لم يثبت شيءٌ عند المؤشّر أصلًا، فلا يمسّ القراءةَ السليمة.
 */
const jumped = (expected, next, heardText, level, consumed, room) => {
  const t = Math.max(LEVELS[level] ?? LEVELS.normal, 0.85);
  const near = (a, b) => sim(dal(a), dal(b)) >= t;
  // ما استُهلك من المسموع في المطابقات السابقة لا يُنظر فيه: وإلا عُدّ تكرارُ لازمةٍ في السورة (كالشعراء) قفزًا
  const all = norm(heardText).split(' ').filter(Boolean);
  // سمع أكثر مما تتسع له النافذة: المحاذاة مقصوصة فلا يُحكم بها على قفز (الكلام الزائد استمرارٌ لا قفز)
  if (all.length > room - 3) return false;
  const H = all.slice(consumed);
  if (!H.length) return false;
  const E = expected.map((x) => (typeof x === 'string' ? x : x.w));
  const last = H[H.length - 1];
  // كلمةٌ واحدة: قريبةٌ من إحدى الكلمات الثلاث التالية، وليست تكرارًا لما قيل قبل المؤشّر ولا لما عنده
  if (dal(last).length >= 3 && !near(last, E[next]) && !(next > 0 && near(last, E[next - 1]))) {
    for (let p = next + 1; p <= Math.min(E.length - 1, next + 3); p++) if (near(last, E[p])) return true;
  }
  // ثلاث متتاليات في أي موضعٍ لاحق (الترشيح بالتطابق التام للكلمة الأولى يُبقي الكلفة صغيرة في المدى الطويل)
  const set = new Set(H.map(dal));
  for (let p = next + 1; p + 2 < E.length; p++) {
    if (!set.has(dal(E[p]))) continue;
    for (let j = 0; j + 2 < H.length; j++) {
      if (near(H[j], E[p]) && near(H[j + 1], E[p + 1]) && near(H[j + 2], E[p + 2])) return true;
    }
  }
  return false;
};

/**
 * خطوة جلسة: من أين نكمل، وأين الخطأ إن وُجد.
 *
 * يُمسَك المؤشّر عند أول كلمةٍ لم تُثبَّت. وما ثبت (متتاليةٌ من المطابقات من المؤشّر) يتقدّم به المؤشّر ولا يرجع،
 * فلا يعيد الطالب ما أصاب. وخطأٌ لا يُعلَن «أعد» إلا إذا كان الكلام قد تجاوزه: انتهى (`final`) أو تلته كلمتان
 * مطابقتان على الأقل، لأن نصًّا لم يكتمل بعدُ يتبدّل مع كل كلمة ولا يُحكم على نصفه.
 *
 * يرجع: `cursor` الجديد، و`bad` فهرس الكلمة التي يُطلب منه أن يعيد منها (أو -1)، و`done` اكتمل المدى.
 */
export const advance = (expected, cursor, heardText, opts = {}) => {
  // نافذةٌ أمام المؤشّر لا المدى كله: المقارنة تتضاعف كلفتها بطول المتوقَّع، والكلام لا يسبق المؤشّر إلا بقدره
  const rest = expected.slice(cursor, cursor + WINDOW);
  if (!rest.length) return { cursor, bad: -1, done: true, status: [] };
  const r = judge(rest, heardText, opts);
  let k = 0;
  while (k < r.status.length && r.status[k] === 'ok') k++;
  const next = cursor + k;
  if (next >= expected.length) return { cursor: next, bad: -1, done: true, status: r.status };
  if (k >= r.status.length) return { cursor: next, bad: -1, done: false, status: r.status };
  const st = r.status[k];
  let bad = -1;
  if (st === 'wrong' || st === 'missing') {
    const after = r.status.slice(k + 1).filter((s) => s === 'ok').length;
    if (opts.final || after >= 2) bad = next;
  }
  // لم يثبت شيءٌ عند المؤشّر (ينتظر، أو حاذى الضجيجَ بكلماتٍ بعيدة): قد يكون قفز
  if (bad < 0 && st !== 'ok' && jumped(expected, next, heardText, opts.level, k, rest.length)) bad = next;
  return { cursor: next, bad, done: false, status: r.status };
};
