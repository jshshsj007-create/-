/**
 * قاعدة أولياء الأمور والطلاب.
 *
 * ثلاث طبقات: ولي الأمر ← أبناؤه ← تسجيلاتهم في البرامج.
 * ولي الأمر واحد مهما سجّل، والمفتاح اللي يمنع التكرار هو رقم جواله.
 */

const AR_DIGITS = { '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9' };

/**
 * يوحّد صيغة الجوال عشان `0551234567` و`+966 55 123 4567` و`٠٥٥١٢٣٤٥٦٧`
 * كلها تُقرأ نفس الشخص. يرجّع `5xxxxxxxx` للأرقام السعودية، أو الأرقام كما هي لغيرها.
 */
export const normalizePhone = (raw) => {
  if (!raw) return '';
  const digits = String(raw).replace(/[٠-٩۰-۹]/g, (d) => AR_DIGITS[d] || d).replace(/\D/g, '');
  if (!digits) return '';
  let n = digits;
  if (n.startsWith('00966')) n = n.slice(5);
  else if (n.startsWith('966')) n = n.slice(3);
  if (n.startsWith('0')) n = n.replace(/^0+/, '');
  return n;
};

/** رقم جوال سعودي سليم: يبدأ بـ 5 وطوله ٩ خانات. */
export const isValidPhone = (raw) => /^5\d{8}$/.test(normalizePhone(raw));

/** للعرض: 05X XXX XXXX */
export const formatPhone = (raw) => {
  const n = normalizePhone(raw);
  if (!/^5\d{8}$/.test(n)) return String(raw || '');
  return `0${n.slice(0, 2)} ${n.slice(2, 5)} ${n.slice(5)}`;
};

/**
 * يوحّد الاسم للمقارنة فقط: يشيل التشكيل ويوحّد الألف والتاء المربوطة
 * ويحذف الألقاب الشائعة، فـ«أبو سعد» و«ابو سعد» و«عبدالله  العتيبي» ما تتشتت.
 */
export const normalizeName = (raw) => String(raw || '')
  .replace(/[ً-ْـ]/g, '')
  .replace(/[أإآٱ]/g, 'ا')
  .replace(/ى/g, 'ي')
  .replace(/ة/g, 'ه')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase();

/** «بن/بنت/ال» وسط الاسم ما تفرّق بين شخصين. */
const nameTokens = (raw) => normalizeName(raw)
  .split(' ')
  .map((t) => t.replace(/^(ال)/, ''))
  .filter((t) => t && !['بن', 'ابن', 'بنت'].includes(t));

/** الاسم الأول — نستخدمه لما يكتب ولي الأمر اسم ابنه مختصرًا مرة وكاملًا مرة. */
export const firstName = (raw) => nameTokens(raw)[0] || '';

/**
 * اسم الأب من اسم الابن الثلاثي: «محمد سعد القاسم» ← «سعد القاسم».
 * فما نحتاج نسأل ولي الأمر عن اسمه، اسم ابنه يقوله أصلًا.
 * الاسم المفرد ما يكفي، فنرجّع فراغًا بدل ما نخترع اسمًا.
 */
export const guardianNameFrom = (studentName) => {
  const parts = String(studentName || '').trim().split(/\s+/).filter(Boolean);
  return parts.length >= 2 ? parts.slice(1).join(' ') : '';
};

/**
 * هل الاسمان لنفس الشخص على الأرجح؟
 *
 * الاسم العربي يُكتب ناقصًا بأي موضع: «سعد» و«محمد سعد» لنفس الولد، وكذلك
 * «محمد» و«محمد سعد». فنقبل الأقصر لو كانت كلماته موجودة في الأطول بنفس
 * ترتيبها — مو بدايته وحدها. والترتيب مهم: «سعد محمد» غير «محمد سعد».
 */
export const sameName = (a, b) => {
  const x = nameTokens(a);
  const y = nameTokens(b);
  if (!x.length || !y.length) return false;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  let i = 0;
  for (const t of long) {
    if (t === short[i]) i++;
    if (i === short.length) return true;
  }
  return false;
};

/* ------------------------------ البحث والربط ------------------------------ */

/** ولي الأمر صاحب هذا الجوال، إن وُجد. */
export const findGuardianByPhone = (guardians, phone) => {
  const n = normalizePhone(phone);
  if (!n) return null;
  return (guardians || []).find((g) => normalizePhone(g.phone) === n) || null;
};

/** أبناء ولي أمر معيّن. */
export const studentsOf = (students, guardianId) =>
  (students || []).filter((s) => s.guardianId === guardianId);

/** ابن ولي الأمر بهذا الاسم، إن كان مسجّلًا من قبل. */
export const findStudent = (students, guardianId, name) =>
  studentsOf(students, guardianId).find((s) => sameName(s.name, name)) || null;

/**
 * يستوعب تسجيلًا جديدًا في قاعدة البيانات ويرجّع الشكل الجديد لها مع ما تقرّر:
 * ولي أمر موجود أو جديد، وأبناء موجودون أو جدد. ما يكرّر أحدًا أبدًا.
 *
 * kids: [{ name, age, grade, school, health }]
 */
export const upsertRegistration = (db, { guardian, kids }, now = Date.now()) => {
  const guardians = [...(db.guardians || [])];
  const students = [...(db.students || [])];
  const newId = db.newId;

  // ما نسأل ولي الأمر عن اسمه: اسم ابنه الثلاثي يعطيه، ولو كتبه صراحة فهو أولى
  const firstKid = (kids || []).find((k) => String(k?.name || '').trim());
  const naming = String(guardian.name || '').trim() || guardianNameFrom(firstKid?.name);

  let g = findGuardianByPhone(guardians, guardian.phone);
  let guardianIsNew = false;
  if (g) {
    // الاسم اللي جانا هالمرة يحدّث القديم لو كان فاضيًا، وما نطمس اسمًا مكتوبًا
    const idx = guardians.indexOf(g);
    g = { ...g, name: g.name || naming, lastSeenAt: now };
    guardians[idx] = g;
  } else {
    guardianIsNew = true;
    g = {
      id: newId(),
      name: naming,
      phone: normalizePhone(guardian.phone),
      notes: '',
      createdAt: now,
      lastSeenAt: now,
    };
    guardians.push(g);
  }

  const linked = [];
  for (const kid of kids || []) {
    if (!String(kid.name || '').trim()) continue;
    const existing = findStudent(students, g.id, kid.name);
    if (existing) {
      // نكمّل الناقص فقط؛ ما نمسح معلومة مسجّلة بمعلومة فاضية
      const idx = students.indexOf(existing);
      const merged = { ...existing };
      for (const k of ['age', 'grade', 'school', 'health']) {
        if (!merged[k] && kid[k]) merged[k] = kid[k];
      }
      if (String(kid.name).trim().length > String(merged.name).trim().length) merged.name = String(kid.name).trim();
      students[idx] = merged;
      linked.push({ student: merged, isNew: false });
    } else {
      const s = {
        id: newId(),
        guardianId: g.id,
        name: String(kid.name).trim(),
        age: kid.age || '',
        grade: kid.grade || '',
        school: kid.school || '',
        health: kid.health || '',
        createdAt: now,
      };
      students.push(s);
      linked.push({ student: s, isNew: true });
    }
  }

  return { guardians, students, guardian: g, guardianIsNew, linked };
};

/* ------------------------------ التكرار المحتمل ------------------------------ */

/**
 * وليّا أمر بجوالين مختلفين ما يُكتشفان بالمفتاح، فنشتبه فيهما لما يتطابق
 * الاسم، أو يكون لهما ابن بنفس الاسم والمدرسة. الدمج قرار المستخدم لا التطبيق.
 */
export const findDuplicates = (guardians, students) => {
  const list = guardians || [];
  const out = [];

  // أول شي: ابنان تحت نفس ولي الأمر باسمين أحدهما ناقص — غالبًا هو نفسه،
  // سُجّل مرة باسم مختصر ومرة كاملًا.
  for (const g of list) {
    const kids = studentsOf(students, g.id);
    for (let i = 0; i < kids.length; i++) {
      for (let j = i + 1; j < kids.length; j++) {
        if (sameName(kids[i].name, kids[j].name)) {
          out.push({ kind: 'student', guardian: g, a: kids[i], b: kids[j], reason: 'نفس ولي الأمر واسمان متطابقان' });
        }
      }
    }
  }

  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      if (normalizePhone(a.phone) && normalizePhone(a.phone) === normalizePhone(b.phone)) {
        out.push({ kind: 'guardian', a, b, reason: 'نفس رقم الجوال' });
        continue;
      }
      const kidsA = studentsOf(students, a.id);
      const kidsB = studentsOf(students, b.id);
      const shared = kidsA.find((x) => kidsB.some((y) => sameName(x.name, y.name)
        && (!x.school || !y.school || normalizeName(x.school) === normalizeName(y.school))));
      if (shared) { out.push({ kind: 'guardian', a, b, reason: `ابن بنفس الاسم: ${shared.name}` }); continue; }
      if (a.name && b.name && sameName(a.name, b.name)) out.push({ kind: 'guardian', a, b, reason: 'نفس الاسم' });
    }
  }
  return out;
};

/**
 * يدمج طالبًا في آخر تحت نفس ولي الأمر: المعلومة الناقصة تُكمَّل من الاثنين،
 * والاسم الأطول يفوز. يرجّع القاعدة بعد الدمج + خريطة عشان تسجيلات المحذوف
 * القديمة تتبع الباقي.
 */
export const mergeStudents = (db, keepId, dropId) => {
  const students = [...(db.students || [])];
  const keep = students.find((s) => s.id === keepId);
  const drop = students.find((s) => s.id === dropId);
  if (!keep || !drop || keepId === dropId) return { students: db.students, remap: {} };

  const merged = { ...keep };
  for (const k of ['age', 'grade', 'school', 'health']) if (!merged[k] && drop[k]) merged[k] = drop[k];
  if (String(drop.name).trim().length > String(merged.name).trim().length) merged.name = String(drop.name).trim();

  return {
    students: students.filter((s) => s.id !== dropId).map((s) => (s.id === keepId ? merged : s)),
    remap: { [dropId]: keepId },
  };
};

/**
 * يدمج ولي أمر في آخر: أبناؤه ينتقلون، والمكرر منهم يُوحّد، والمعلومة الناقصة
 * تُكمَّل من الطرفين. يرجّع القاعدة بعد الدمج + خريطة الطلاب المدموجين
 * عشان التسجيلات القديمة تتبع الطالب الباقي.
 */
export const mergeGuardians = (db, keepId, dropId) => {
  const guardians = [...(db.guardians || [])];
  let students = [...(db.students || [])];
  const keep = guardians.find((g) => g.id === keepId);
  const drop = guardians.find((g) => g.id === dropId);
  if (!keep || !drop || keepId === dropId) return { guardians: db.guardians, students: db.students, remap: {} };

  const ki = guardians.indexOf(keep);
  guardians[ki] = {
    ...keep,
    name: keep.name || drop.name,
    phone: keep.phone || drop.phone,
    altPhone: keep.altPhone || (normalizePhone(drop.phone) !== normalizePhone(keep.phone) ? drop.phone : ''),
    notes: [keep.notes, drop.notes].filter(Boolean).join(' · '),
    createdAt: Math.min(keep.createdAt || Infinity, drop.createdAt || Infinity) || keep.createdAt,
  };
  guardians.splice(guardians.indexOf(drop), 1);

  const remap = {};
  for (const s of studentsOf(students, dropId)) {
    const twin = studentsOf(students, keepId).find((k) => sameName(k.name, s.name));
    if (twin) {
      const idx = students.indexOf(twin);
      const merged = { ...twin };
      for (const k of ['age', 'grade', 'school', 'health']) if (!merged[k] && s[k]) merged[k] = s[k];
      students[idx] = merged;
      remap[s.id] = twin.id;
      students = students.filter((x) => x.id !== s.id);
    } else {
      students = students.map((x) => (x.id === s.id ? { ...x, guardianId: keepId } : x));
    }
  }
  return { guardians, students, remap };
};
