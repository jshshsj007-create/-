/**
 * حارس الساعة.
 *
 * كلُّ ما بُني قبله يحرس البياناتِ من الضياع، وهذا يحرسها من شيءٍ آخر: أن
 * تختلّ وأنت لا تدري. السجلُّ يضيع فيصرخ، والخللُ يسكت — إيصالٌ برقمٍ مكرّر،
 * ومشتركٌ بلا يومٍ فما يظهر في قائمة حضور، وتوزيعٌ زاد عن الصافي فصار الدفتر
 * يقول ما ليس فيه، وملفٌّ يقترب من سقف الخادم فإذا بلغه ما عاد يُحفظ.
 *
 * ولا يقع شيءٌ من ذلك فجأة: كلُّه يُرى قبل وقوعه لو نظر أحد. فهذا هو الناظر —
 * يمرّ على البيانات ويقول ما وجد، بلا أن تسأل.
 *
 * وهو **قراءةٌ لا تصليح**: لا يُبدّل حرفًا، وإنما يريك ما وجد لتقرّر. فالخلل
 * الذي يُصلَّح بلا علمك خللٌ ثانٍ.
 */

const num = (v) => Number(v || 0) || 0;
const ledgersOf = (p) => [p, ...(p?.weeks || [])];

/** درجات ما يُقال: ما يوجع الآن، وما سيوجع، وما هو خبرٌ لا غير. */
export const TONES = { bad: 'red', warn: 'amber', ok: 'green', info: 'slate' };

/**
 * سقف الخادم.
 *
 * الحفظة تمرّ في نداءٍ واحد، وله حدٌّ لا يتجاوزه. فإذا بلغه الملفُّ ما عاد
 * يُحفظ شيء — لا برسالةٍ ولا بخطأٍ يُفهم، بل بحفظةٍ لا تصل. ونقولها قبل
 * ذلك بمسافة، لا عنده.
 */
export const SIZE_WALL = 6 * 1024 * 1024;
export const SIZE_WARN = Math.round(SIZE_WALL * 0.6);

/** حجم ما يُرسل في الحفظة، بالبايت. */
export const dataSize = (data) => {
  try { return JSON.stringify(data ?? null).length; } catch { return 0; }
};

export const sizeText = (n) => {
  const mb = n / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} م.ب`;
  return `${Math.round(n / 1024)} ك.ب`;
};

/**
 * الفحص كلُّه. يرجّع صفوفًا: لكلٍّ نغمةٌ ونصٌّ وعددٌ وأمثلة.
 *
 * والأمثلة جزءٌ من الفحص لا زينة: «٣ إيصالات مكرّرة» خبرٌ لا يُعمل به،
 * و«٣ إيصالات مكرّرة: R-14 عند سعد وخالد» خبرٌ يُصلَّح.
 */
export const checkAll = (data, extra = {}) => {
  const out = [];
  const add = (id, tone, title, count, hints = []) => out.push({ id, tone, title, count, hints });

  /* ---------------- حجم الملف: يبلغ السقف فما عاد يُحفظ شيء ---------------- */
  const size = dataSize(data);
  if (size >= SIZE_WALL) {
    add('size', 'bad', `الملف بلغ ${sizeText(size)} — عند سقف الخادم، والحفظ ممكن ما يمرّ.`, 1,
      ['أكبر ما فيه غالبًا صور الإيصالات والملصقات.']);
  } else if (size >= SIZE_WARN) {
    add('size', 'warn', `الملف ${sizeText(size)} من ${sizeText(SIZE_WALL)}.`, 1,
      ['لو كبر أكثر وقف الحفظ. الصور أثقل ما فيه.']);
  }

  /* -------------------- إيصالٌ برقمٍ مكرّر: مالٌ يُحسب مرتين -------------------- */
  const refs = new Map();
  for (const p of data?.programs || []) {
    for (const l of ledgersOf(p)) {
      for (const x of l?.participants || []) {
        const r = String(x?.ref || '').trim();
        if (!r) continue;
        refs.set(r, [...(refs.get(r) || []), x?.name || '—']);
      }
    }
  }
  const dupes = [...refs.entries()].filter(([, who]) => who.length > 1);
  if (dupes.length) {
    add('refs', 'warn', `${dupes.length} رقم إيصال مكرّر.`, dupes.length,
      dupes.slice(0, 4).map(([r, who]) => `${r}: ${who.join(' و')}`));
  }

  /* ---------- توزيعٌ زاد عن الصافي: الدفتر يقول ما ليس فيه ---------- */
  const over = [];
  for (const p of data?.programs || []) {
    for (const l of ledgersOf(p)) {
      if (!l) continue;
      const rev = (l.mode === 'quick' ? num(l.quickRevenue) : (l.participants || []).reduce((s, x) => s + num(x?.amount), 0))
        + (l.collections || []).reduce((s, x) => s + num(x?.amount), 0);
      const net = rev - (l.expenseItems || []).reduce((s, x) => s + num(x?.amount), 0);
      const out2 = (l.schoolPayouts || []).reduce((s, x) => s + num(x?.amount), 0)
        + (l.faidPayouts || []).reduce((s, x) => s + num(x?.amount), 0);
      // ريالٌ واحد فرقُ تقريبٍ لا خلل؛ وما فوقه يُقال
      if (out2 - net > 1) over.push(`${p.name || 'برنامج'}${l === p ? '' : ` · ${l.name || 'يوم'}`}: وُزّع ${Math.round(out2)} والصافي ${Math.round(net)}`);
    }
  }
  if (over.length) add('over', 'bad', `${over.length} دفترًا وُزّع فيه أكثر من صافيه.`, over.length, over.slice(0, 4));

  /* ------------------------- مبلغٌ سالب: خطأُ كتابةٍ غالبًا ------------------------- */
  const neg = [];
  const eye = (where, rows) => rows.forEach((x) => { if (num(x?.amount) < 0) neg.push(`${where}: ${num(x.amount)}`); });
  for (const a of data?.faidAdjustments || []) if (num(a?.amount) < 0) neg.push(`حركة فيض: ${num(a.amount)}`);
  for (const h of data?.handovers || []) if (num(h?.amount) < 0) neg.push(`تسليم: ${num(h.amount)}`);
  for (const p of data?.programs || []) {
    for (const l of ledgersOf(p)) {
      if (!l) continue;
      const w = `${p.name || 'برنامج'}${l === p ? '' : ` · ${l.name || 'يوم'}`}`;
      eye(w, l.collections || []); eye(w, l.expenseItems || []);
      eye(w, l.schoolPayouts || []); eye(w, l.faidPayouts || []); eye(w, l.participants || []);
    }
  }
  if (neg.length) add('neg', 'bad', `${neg.length} مبلغًا سالبًا.`, neg.length, neg.slice(0, 4));

  /* -------- مشتركٌ بلا يوم: يختفي من كل قوائم الحضور وهو مسجّل ودافع -------- */
  const lost = [];
  for (const p of data?.programs || []) {
    if (p.type !== 'مجمع') continue;
    const live = new Set((p.weeks || []).map((w) => w.id));
    for (const x of p.participants || []) {
      if (!Array.isArray(x?.days)) continue;              // بلا أيامٍ أصلًا = كل الأيام
      if (x.days.some((id) => live.has(id))) continue;
      lost.push(`${p.name || 'برنامج'}: ${x.name || '—'}`);
    }
  }
  if (lost.length) add('lost', 'bad', `${lost.length} مشتركًا ما له يومٌ قائم — ما يظهر في أي حضور.`, lost.length, lost.slice(0, 4));

  /* ------------- سجلٌّ يشير إلى ما ذهب: طالبٌ حُذف ومشتركُه باقٍ ------------- */
  const students = new Set((data?.students || []).map((s) => s.id));
  const orphans = [];
  for (const p of data?.programs || []) {
    for (const l of ledgersOf(p)) {
      for (const x of l?.participants || []) {
        if (x?.studentId && !students.has(x.studentId)) orphans.push(`${p.name || 'برنامج'}: ${x.name || '—'}`);
      }
    }
  }
  if (orphans.length) {
    add('orphans', 'warn', `${orphans.length} مشتركًا مربوطًا بطالبٍ ما عاد موجودًا.`, orphans.length,
      [...orphans.slice(0, 4), 'يشتغل عاديًّا، لكن تاريخه عبر المواسم ما يتجمّع.']);
  }

  /* ---------------- رابطٌ منشورٌ لا يقبل تسجيلًا: يُقرأ «مقفل» ---------------- */
  const dead = [];
  for (const p of data?.programs || []) {
    if (!p?.signup?.enabled) continue;
    const open = (p.signup.openWeeks || []).length;
    const packDays = (p.weeks || []).filter((w) => w.status !== 'مغلق').length;
    const packs = (p.signup.packages || []).filter((k) => k.hidden !== true).length;
    const perDay = p.signup.allowPerDay !== false && num(p.signup.price) > 0 && open > 0;
    if (!perDay && !(packDays && packs)) dead.push(p.name || 'برنامج');
  }
  if (dead.length) add('dead', 'warn', `${dead.length} رابط تسجيل مفتوح وما يقبل أحدًا.`, dead.length, dead);

  /* ---------------------- النسخة الاحتياطية: متى آخرها ---------------------- */
  const at = Number(extra?.backupAt || 0);
  const days = at ? Math.floor((Date.now() - at) / 86400000) : -1;
  if (days < 0) add('backup', 'warn', 'ما صارت نسخة احتياطية بعد.', 1, ['من شاشة النسخ الاحتياطي.']);
  else if (days >= 3) add('backup', 'warn', `آخر نسخة احتياطية قبل ${days} يومًا.`, 1, []);

  /* --------------------------- ومطابقة الدفترين --------------------------- */
  if (num(extra?.missingMoney) > 0) {
    add('mal', 'bad', `دفتر المال يقول: ${extra.missingMoney} حركة ما لها أثر عندك.`, extra.missingMoney,
      [`مجموعها ${extra.missingMoneySum || 0} ر.س — من «طابق دفتر المال».`]);
  }
  if (num(extra?.missingSubs) > 0) {
    add('sub', 'bad', `دفتر التسجيلات يقول: ${extra.missingSubs} تسجيلًا ما له أثر عندك.`, extra.missingSubs, []);
  }

  return out;
};

/** أشدُّ ما وُجد — سطرٌ واحد يُقرأ بلمحة. */
export const worst = (rows) => {
  if (!rows?.length) return null;
  return rows.find((r) => r.tone === 'bad') || rows.find((r) => r.tone === 'warn') || rows[0];
};
