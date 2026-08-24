/**
 * اختبارات قاعدة أولياء الأمور:
 * ولي أمر واحد مهما سجّل، وأبناؤه ما يتكررون، والمعلومة ما تنمسح.
 */
import assert from 'node:assert/strict';
import {
  normalizePhone, isValidPhone, formatPhone, normalizeName, sameName, firstName,
  findGuardianByPhone, studentsOf, findStudent, upsertRegistration, findDuplicates, mergeGuardians, mergeStudents,
} from '../src/people.js';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('  ✓ ' + name); };

let n = 0;
const db0 = { guardians: [], students: [], newId: () => `id${++n}` };

/* ------------------------------ توحيد الجوال ------------------------------ */

test('كل صيغ الجوال السعودي تُقرأ نفس الرقم', () => {
  const same = ['0551234567', '551234567', '+966551234567', '00966551234567', '966551234567',
    '055 123 4567', '٠٥٥١٢٣٤٥٦٧', '0٥٥1234567', ' 0551234567 '];
  const all = new Set(same.map(normalizePhone));
  assert.equal(all.size, 1, `توقعت صيغة واحدة، طلع: ${[...all].join(' | ')}`);
  assert.equal([...all][0], '551234567');
});

test('جوالان مختلفان يبقيان مختلفين', () => {
  assert.notEqual(normalizePhone('0551234567'), normalizePhone('0551234568'));
});

test('التحقق من صحة الجوال', () => {
  assert.equal(isValidPhone('0551234567'), true);
  assert.equal(isValidPhone('+966501112222'), true);
  assert.equal(isValidPhone('055123456'), false);  // ناقص خانة
  assert.equal(isValidPhone('0451234567'), false); // ما يبدأ بـ 5
  assert.equal(isValidPhone(''), false);
  assert.equal(isValidPhone('كلام'), false);
});

test('العرض بصيغة مقروءة', () => {
  assert.equal(formatPhone('+966551234567'), '055 123 4567');
});

/* ------------------------------- توحيد الاسم ------------------------------- */

test('اختلاف الهمزة والتاء المربوطة ما يفرّق الاسم', () => {
  assert.equal(normalizeName('أحمد'), normalizeName('احمد'));
  assert.equal(normalizeName('حمزة'), normalizeName('حمزه'));
  assert.equal(normalizeName('  عبدالله   العتيبي '), 'عبدالله العتيبي');
});

test('الاسم المختصر يطابق الكامل، والمختلف لا', () => {
  assert.equal(sameName('سعد', 'سعد محمد العتيبي'), true);
  assert.equal(sameName('سعد محمد', 'سعد محمد العتيبي'), true);
  assert.equal(sameName('محمد بن سعد', 'محمد سعد'), true); // «بن» ما تفرّق
  assert.equal(sameName('سعد', 'سعود'), false);
  assert.equal(sameName('سعد محمد', 'محمد سعد'), false);   // الترتيب مهم
  assert.equal(sameName('', 'سعد'), false);
});

test('الاسم الناقص يطابق الكامل مهما كان موضعه', () => {
  // «سعد» و«محمد سعد» طلعوا سجلّين مختلفين، والاثنان لنفس الولد
  assert.equal(sameName('سعد', 'محمد سعد'), true, 'الناقص في الآخر');
  assert.equal(sameName('محمد', 'محمد سعد'), true, 'الناقص في الأول');
  assert.equal(sameName('محمد القاسم', 'محمد فهد القاسم'), true, 'ناقص من الوسط');
  assert.equal(sameName('سعد محمد', 'محمد سعد'), false, 'الترتيب يفرّق');
  assert.equal(sameName('عمر', 'محمد سعد'), false);
});

test('الاسم الأول', () => {
  assert.equal(firstName('عبدالله بن محمد العتيبي'), 'عبدالله');
});

/* --------------------- السيناريو اللي سأل عنه المستخدم --------------------- */

test('سجّل، ثم رجع بعد أسبوع وسجّل نفس الابن → ولي أمر واحد وابن واحد', () => {
  const first = upsertRegistration(db0, {
    guardian: { name: 'محمد العتيبي', phone: '0551234567' },
    kids: [{ name: 'سعد', age: 10, school: 'الرواد' }],
  });
  assert.equal(first.guardians.length, 1);
  assert.equal(first.students.length, 1);
  assert.equal(first.guardianIsNew, true);

  // بعد أسبوع، وبصيغة جوال ثانية واسم أطول
  const second = upsertRegistration({ ...first, newId: db0.newId }, {
    guardian: { name: 'محمد العتيبي', phone: '+966 55 123 4567' },
    kids: [{ name: 'سعد محمد', age: 10 }],
  });
  assert.equal(second.guardians.length, 1, 'ما ينضاف ولي أمر ثاني');
  assert.equal(second.students.length, 1, 'ما ينضاف ابن ثاني');
  assert.equal(second.guardianIsNew, false);
  assert.equal(second.linked[0].isNew, false);
});

test('رجع وسجّل ابنه الثاني → ولي أمر واحد، ابنان', () => {
  const a = upsertRegistration(db0, {
    guardian: { name: 'محمد', phone: '0551234567' }, kids: [{ name: 'سعد' }],
  });
  const b = upsertRegistration({ ...a, newId: db0.newId }, {
    guardian: { name: 'محمد', phone: '0551234567' }, kids: [{ name: 'عمر' }],
  });
  assert.equal(b.guardians.length, 1);
  assert.deepEqual(studentsOf(b.students, b.guardian.id).map((s) => s.name), ['سعد', 'عمر']);
});

test('يسجّل ثلاثة أبناء دفعة وحدة', () => {
  const r = upsertRegistration(db0, {
    guardian: { name: 'فهد', phone: '0500000001' },
    kids: [{ name: 'خالد' }, { name: 'ناصر' }, { name: 'تركي' }],
  });
  assert.equal(r.guardians.length, 1);
  assert.equal(r.students.length, 3);
  assert.ok(r.linked.every((l) => l.isNew));
});

test('وليّا أمر مختلفان بنفس اسم الابن ما ينخلطان', () => {
  const a = upsertRegistration(db0, { guardian: { name: 'محمد', phone: '0551111111' }, kids: [{ name: 'سعد' }] });
  const b = upsertRegistration({ ...a, newId: db0.newId }, { guardian: { name: 'خالد', phone: '0552222222' }, kids: [{ name: 'سعد' }] });
  assert.equal(b.guardians.length, 2);
  assert.equal(b.students.length, 2);
});

test('التسجيل الثاني يكمّل المعلومة الناقصة ولا يمسح المسجّلة', () => {
  const a = upsertRegistration(db0, {
    guardian: { name: 'محمد', phone: '0551234567' },
    kids: [{ name: 'سعد', age: 10, school: 'الرواد' }],
  });
  const b = upsertRegistration({ ...a, newId: db0.newId }, {
    guardian: { name: '', phone: '0551234567' },
    kids: [{ name: 'سعد', age: '', school: '', health: 'حساسية فول سوداني' }],
  });
  const kid = b.students[0];
  assert.equal(kid.age, 10, 'العمر المسجّل ما ينمسح بفاضي');
  assert.equal(kid.school, 'الرواد');
  assert.equal(kid.health, 'حساسية فول سوداني', 'الجديد ينضاف');
  assert.equal(b.guardian.name, 'محمد', 'اسم ولي الأمر ما ينمسح');
});

test('الاسم الأطول يفوز لما يكتبه كاملًا في المرة الثانية', () => {
  const a = upsertRegistration(db0, { guardian: { phone: '0551234567' }, kids: [{ name: 'سعد' }] });
  const b = upsertRegistration({ ...a, newId: db0.newId }, { guardian: { phone: '0551234567' }, kids: [{ name: 'سعد محمد العتيبي' }] });
  assert.equal(b.students.length, 1);
  assert.equal(b.students[0].name, 'سعد محمد العتيبي');
});

test('الأسماء الفاضية تُتجاهل ولا تنشئ سجلات وهمية', () => {
  const r = upsertRegistration(db0, {
    guardian: { name: 'فهد', phone: '0500000002' },
    kids: [{ name: 'خالد' }, { name: '   ' }, { name: '' }],
  });
  assert.equal(r.students.length, 1);
});

/* ------------------------------ التكرار المحتمل ------------------------------ */

test('ولي أمر بجوالين يُشتبه فيه بدل ما يُدمج تلقائيًا', () => {
  const a = upsertRegistration(db0, { guardian: { name: 'محمد', phone: '0551111111' }, kids: [{ name: 'سعد', school: 'الرواد' }] });
  const b = upsertRegistration({ ...a, newId: db0.newId }, { guardian: { name: 'ابو سعد', phone: '0553333333' }, kids: [{ name: 'سعد', school: 'الرواد' }] });
  // ما اندمجوا من نفسهم
  assert.equal(b.guardians.length, 2);
  // لكن التطبيق يشتبه ويعرضهم
  const dups = findDuplicates(b.guardians, b.students);
  assert.equal(dups.length, 1);
  assert.match(dups[0].reason, /سعد/);
});

test('أولياء أمور مختلفون فعلًا ما يظهرون كتكرار', () => {
  const a = upsertRegistration(db0, { guardian: { name: 'محمد', phone: '0551111111' }, kids: [{ name: 'سعد', school: 'الرواد' }] });
  const b = upsertRegistration({ ...a, newId: db0.newId }, { guardian: { name: 'خالد', phone: '0552222222' }, kids: [{ name: 'عمر', school: 'التربية' }] });
  assert.deepEqual(findDuplicates(b.guardians, b.students), []);
});

/* ---------------- ابنان تحت نفس ولي الأمر وهما واحد ---------------- */

test('سجّل «سعد» ثم «محمد سعد» بنفس الجوال → ابن واحد', () => {
  const a = upsertRegistration(db0, {
    guardian: { name: 'سعد', phone: '0557821586' }, kids: [{ name: 'سعد', age: 10 }],
  });
  const b = upsertRegistration({ ...a, newId: db0.newId }, {
    guardian: { name: 'سعد', phone: '0557821586' }, kids: [{ name: 'محمد سعد', age: 10 }],
  });
  assert.equal(b.guardians.length, 1);
  assert.equal(b.students.length, 1, 'ما ينضاف ابن ثاني');
  assert.equal(b.students[0].name, 'محمد سعد', 'والاسم الكامل يفوز');
});

test('الأخوان الحقيقيان ما ينخلطان', () => {
  const a = upsertRegistration(db0, {
    guardian: { name: 'سعد', phone: '0557821586' }, kids: [{ name: 'محمد سعد' }, { name: 'عبدالله سعد' }],
  });
  assert.equal(a.students.length, 2, 'اسمان مختلفان = ابنان');
});

test('المكرر الموجود من قبل يظهر كاشتباه تحت نفس ولي الأمر', () => {
  // البيانات القديمة اللي انسجّلت قبل الإصلاح
  const db = {
    guardians: [{ id: 'g1', name: 'سعد', phone: '557821586' }],
    students: [
      { id: 's1', guardianId: 'g1', name: 'سعد', age: 10 },
      { id: 's2', guardianId: 'g1', name: 'محمد سعد', age: 10, school: 'الرواد' },
    ],
  };
  const dups = findDuplicates(db.guardians, db.students);
  assert.equal(dups.length, 1);
  assert.equal(dups[0].kind, 'student');
  assert.equal(dups[0].guardian.id, 'g1');
});

test('دمج الابنين يوحّدهما ويكمّل الناقص', () => {
  const db = {
    guardians: [{ id: 'g1', name: 'سعد', phone: '557821586' }],
    students: [
      { id: 's1', guardianId: 'g1', name: 'سعد', age: 10 },
      { id: 's2', guardianId: 'g1', name: 'محمد سعد', age: '', school: 'الرواد', health: 'حساسية' },
    ],
  };
  const m = mergeStudents(db, 's1', 's2');
  assert.equal(m.students.length, 1);
  const kid = m.students[0];
  assert.equal(kid.id, 's1', 'الباقي هو اللي اخترته');
  assert.equal(kid.name, 'محمد سعد', 'والاسم الأطول');
  assert.equal(kid.age, 10, 'معلومة الأول باقية');
  assert.equal(kid.school, 'الرواد', 'ومعلومة الثاني انضافت');
  assert.equal(kid.health, 'حساسية');
  assert.equal(m.remap.s2, 's1', 'وتسجيلاته القديمة تتبعه');
  assert.deepEqual(findDuplicates(db.guardians, m.students), [], 'وما عاد فيه اشتباه');
});

test('دمج طالب في نفسه ما يغيّر شيئًا', () => {
  const db = { students: [{ id: 's1', guardianId: 'g1', name: 'سعد' }] };
  const m = mergeStudents(db, 's1', 's1');
  assert.equal(m.students.length, 1);
  assert.deepEqual(m.remap, {});
});

/* --------------------------------- الدمج --------------------------------- */

test('الدمج ينقل الأبناء ويوحّد المكرر ويحتفظ بالجوال الثاني', () => {
  const a = upsertRegistration(db0, { guardian: { name: 'محمد', phone: '0551111111' }, kids: [{ name: 'سعد', school: 'الرواد' }] });
  const b = upsertRegistration({ ...a, newId: db0.newId }, { guardian: { name: 'ابو سعد', phone: '0553333333' }, kids: [{ name: 'سعد', age: 11 }, { name: 'عمر' }] });

  const keep = b.guardians[0];
  const drop = b.guardians[1];
  const m = mergeGuardians(b, keep.id, drop.id);

  assert.equal(m.guardians.length, 1, 'صاروا واحدًا');
  const kids = studentsOf(m.students, keep.id);
  assert.deepEqual(kids.map((k) => k.name).sort(), ['سعد', 'عمر'].sort(), 'سعد ما تكرر، وعمر انتقل');
  assert.equal(kids.find((k) => k.name === 'سعد').school, 'الرواد', 'معلومة الأول باقية');
  assert.equal(kids.find((k) => k.name === 'سعد').age, 11, 'ومعلومة الثاني انضافت');
  assert.equal(normalizePhone(m.guardians[0].altPhone), '553333333', 'الجوال الثاني محفوظ');
  assert.ok(m.remap[b.students.find((s) => s.guardianId === drop.id && s.name === 'سعد').id], 'فيه خريطة للتسجيلات القديمة');
});

test('دمج ولي أمر في نفسه ما يغيّر شيئًا', () => {
  const a = upsertRegistration(db0, { guardian: { name: 'محمد', phone: '0551111111' }, kids: [{ name: 'سعد' }] });
  const m = mergeGuardians(a, a.guardian.id, a.guardian.id);
  assert.equal(m.guardians.length, 1);
  assert.equal(m.students.length, 1);
});

/* --------------------------------- البحث --------------------------------- */

test('البحث بالجوال يشتغل مهما كانت صيغة المُدخَل', () => {
  const a = upsertRegistration(db0, { guardian: { name: 'محمد', phone: '0551234567' }, kids: [] });
  assert.ok(findGuardianByPhone(a.guardians, '+966551234567'));
  assert.ok(findGuardianByPhone(a.guardians, '٠٥٥١٢٣٤٥٦٧'));
  assert.equal(findGuardianByPhone(a.guardians, '0559999999'), null);
  assert.equal(findGuardianByPhone(a.guardians, ''), null);
});

test('البحث عن ابن داخل أبناء ولي أمره فقط', () => {
  const a = upsertRegistration(db0, { guardian: { name: 'محمد', phone: '0551111111' }, kids: [{ name: 'سعد' }] });
  const b = upsertRegistration({ ...a, newId: db0.newId }, { guardian: { name: 'خالد', phone: '0552222222' }, kids: [{ name: 'عمر' }] });
  const g1 = b.guardians[0];
  assert.ok(findStudent(b.students, g1.id, 'سعد'));
  assert.equal(findStudent(b.students, g1.id, 'عمر'), null, 'ابن غيره ما يظهر تحته');
});

test('قاعدة فاضية ما تطيح', () => {
  assert.deepEqual(studentsOf(undefined, 'x'), []);
  assert.deepEqual(findDuplicates(undefined, undefined), []);
  assert.equal(findGuardianByPhone(undefined, '05'), null);
});

console.log(`\n${passed} اختبار نجح.`);
