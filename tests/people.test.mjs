/**
 * اختبارات قاعدة أولياء الأمور:
 * ولي أمر واحد مهما سجّل، وأبناؤه ما يتكررون، والمعلومة ما تنمسح.
 */
import assert from 'node:assert/strict';
import {
  normalizePhone, isValidPhone, formatPhone, normalizeName, sameName, firstName,
  findGuardianByPhone, studentsOf, findStudent, upsertRegistration, findDuplicates, mergeGuardians, mergeStudents, guardianNameFrom, dedupeByPhone, remapParticipants,
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
  assert.equal(sameName('سعد محمد', 'محمد سعد'), false);   // الاسم الأول يفرّق
  assert.equal(sameName('', 'سعد'), false);
});

test('النقص في النسب ما يفرّق، والاسم الأول يفرّق', () => {
  // الاسم الأول هو الولد، والباقي نسبٌ يشترك فيه الإخوة
  assert.equal(sameName('محمد', 'محمد سعد'), true, 'النسب ناقص');
  assert.equal(sameName('محمد القاسم', 'محمد فهد القاسم'), true, 'ناقص من الوسط');
  assert.equal(sameName('سعد', 'محمد سعد'), false, 'اسمٌ أول مختلف = ولد آخر');
  assert.equal(sameName('سعد محمد', 'محمد سعد'), false, 'الترتيب يفرّق');
  assert.equal(sameName('عمر', 'محمد سعد'), false);
});

test('الاسم الأول', () => {
  assert.equal(firstName('عبدالله بن محمد العتيبي'), 'عبدالله');
});

test('اسم الأب يُقرأ من اسم الابن الثلاثي', () => {
  assert.equal(guardianNameFrom('محمد سعد القاسم'), 'سعد القاسم');
  assert.equal(guardianNameFrom('عبدالعزيز فهد'), 'فهد');
  assert.equal(guardianNameFrom('محمد'), '', 'الاسم المفرد ما يكفي');
  assert.equal(guardianNameFrom('  '), '');
});

test('التسجيل بلا اسم ولي أمر يسمّيه من اسم ابنه', () => {
  const r = upsertRegistration(db0, {
    guardian: { phone: '0557821586' },   // بلا اسم
    kids: [{ name: 'محمد سعد القاسم', age: 10 }],
  });
  assert.equal(r.guardians[0].name, 'سعد القاسم');
});

test('لو كتب اسمه صراحة فهو أولى', () => {
  const r = upsertRegistration(db0, {
    guardian: { name: 'أبو محمد', phone: '0557821587' },
    kids: [{ name: 'محمد سعد القاسم' }],
  });
  assert.equal(r.guardians[0].name, 'أبو محمد');
});

test('الاسم المفرد ما يخترع اسمًا لولي الأمر', () => {
  const r = upsertRegistration(db0, { guardian: { phone: '0557821588' }, kids: [{ name: 'محمد' }] });
  assert.equal(r.guardians[0].name, '', 'يبقى فاضيًا بدل ما نخمّن');
});

test('الاسم يُكمَّل لولي أمر موجود بلا اسم', () => {
  const a = upsertRegistration(db0, { guardian: { phone: '0557821589' }, kids: [{ name: 'محمد' }] });
  assert.equal(a.guardians[0].name, '');
  const b = upsertRegistration({ ...a, newId: db0.newId }, {
    guardian: { phone: '0557821589' }, kids: [{ name: 'عبدالله سعد القاسم' }],
  });
  assert.equal(b.guardians.length, 1);
  assert.equal(b.guardians[0].name, 'سعد القاسم', 'الابن الثاني عرّفنا بأبيه');
});

/* ------------------- القاعدة: الاسم الأول + جوال ولي الأمر ------------------- */

test('الاسم الناقص نسبًا هو نفس الولد', () => {
  assert.equal(sameName('محمد سعد فهد', 'محمد فهد'), true);
  assert.equal(sameName('محمد سعد فهد', 'محمد سعد فهد'), true);
  assert.equal(sameName('محمد سعد فهد', 'محمد'), true);
  assert.equal(sameName('محمد سعد فهد', 'محمد القاسم'), true, 'الأب واحد فما عنده محمدان');
});

test('الأخ باسم أول مختلف يبقى أخًا', () => {
  assert.equal(sameName('محمد سعد فهد', 'مبارك سعد فهد'), false);
  assert.equal(sameName('محمد سعد فهد', 'عبدالله سعد فهد'), false);
  assert.equal(sameName('سعد', 'سعود'), false);
});

test('«عبد» ما تنفصل عمّا بعدها', () => {
  assert.equal(firstName('عبد الله سعد'), firstName('عبدالله سعد'));
  assert.equal(sameName('عبد العزيز فهد', 'عبدالعزيز فهد'), true);
  assert.equal(sameName('عبدالله فهد', 'عبدالعزيز فهد'), false, 'ولا توحّد المختلفَين');
  assert.equal(sameName('ابو بكر سعد', 'أبوبكر سعد'), true);
});

test('«ال» التعريف و«بن» ما تفرّقان', () => {
  assert.equal(sameName('محمد القاسم', 'محمد قاسم'), true);
  assert.equal(sameName('محمد بن سعد', 'محمد سعد'), true);
});

/* ------------------- الجوال مفتاح فريد لا يقبل التكرار ------------------- */

test('سجلّان بنفس الجوال يتوحّدان، والأخ يبقى', () => {
  // نفس حالة المستخدم: ولي أمر انكتب مرتين، ومحمد كذلك، ومبارك أخوه
  const db = {
    guardians: [
      { id: 'g1', name: 'سعد', phone: '557821586', createdAt: 1 },
      { id: 'g2', name: 'سعد فهد', phone: '0557821586', createdAt: 2 },
    ],
    students: [
      { id: 's1', guardianId: 'g1', name: 'محمد سعد فهد', age: 10, createdAt: 1 },
      { id: 's2', guardianId: 'g2', name: 'محمد فهد', school: 'الرواد', createdAt: 2 },
      { id: 's3', guardianId: 'g2', name: 'مبارك سعد فهد', createdAt: 3 },
    ],
  };
  const r = dedupeByPhone(db);
  assert.equal(r.guardians.length, 1, 'ولي أمر واحد');
  assert.deepEqual(r.students.map((s) => s.name).sort(), ['مبارك سعد فهد', 'محمد سعد فهد'].sort());
  const kid = r.students.find((s) => s.name.startsWith('محمد'));
  assert.equal(kid.age, 10, 'معلومة الأول باقية');
  assert.equal(kid.school, 'الرواد', 'ومعلومة الثاني انضافت');
  assert.equal(r.remap.s2, 's1', 'وفيه خريطة للتسجيلات');
});

test('التسجيلات القديمة تتبع الطالب الباقي', () => {
  const programs = [{
    id: 'p1', participants: [{ id: 'x0', studentId: 's2' }],
    weeks: [{ id: 'w1', participants: [{ id: 'x1', studentId: 's2' }, { id: 'x2', studentId: 's9' }] }],
  }];
  const out = remapParticipants(programs, { s2: 's1' });
  assert.equal(out[0].participants[0].studentId, 's1');
  assert.equal(out[0].weeks[0].participants[0].studentId, 's1');
  assert.equal(out[0].weeks[0].participants[1].studentId, 's9', 'وغير المدموج ما يتغيّر');
});

test('جوالان مختلفان ما يُدمجان تلقائيًا', () => {
  const db = {
    guardians: [
      { id: 'g1', name: 'سعد', phone: '551111111', createdAt: 1 },
      { id: 'g2', name: 'ابو محمد', phone: '552222222', createdAt: 2 },
    ],
    students: [
      { id: 's1', guardianId: 'g1', name: 'محمد سعد', createdAt: 1 },
      { id: 's2', guardianId: 'g2', name: 'محمد سعد', createdAt: 2 },
    ],
  };
  const r = dedupeByPhone(db);
  assert.equal(r.guardians.length, 2, 'يبقيان ليقرّر المستخدم');
  assert.equal(r.students.length, 2);
  // ويظهران كتكرار محتمل
  assert.ok(findDuplicates(r.guardians, r.students).length > 0);
});

test('قاعدة نظيفة ما تتغيّر', () => {
  const db = {
    guardians: [{ id: 'g1', name: 'سعد', phone: '551111111', createdAt: 1 }],
    students: [
      { id: 's1', guardianId: 'g1', name: 'محمد سعد', createdAt: 1 },
      { id: 's2', guardianId: 'g1', name: 'مبارك سعد', createdAt: 2 },
    ],
  };
  const r = dedupeByPhone(db);
  assert.equal(r.mergedGuardians, 0);
  assert.equal(r.mergedStudents, 0);
  assert.deepEqual(r.students.map((s) => s.id), ['s1', 's2']);
});

test('ثلاثة سجلات بنفس الجوال تتوحّد كلها', () => {
  const db = {
    guardians: [
      { id: 'g1', phone: '551111111', createdAt: 1 },
      { id: 'g2', phone: '0551111111', createdAt: 2 },
      { id: 'g3', phone: '+966551111111', createdAt: 3 },
    ],
    students: [
      { id: 's1', guardianId: 'g1', name: 'محمد سعد', createdAt: 1 },
      { id: 's2', guardianId: 'g2', name: 'محمد', createdAt: 2 },
      { id: 's3', guardianId: 'g3', name: 'محمد سعد فهد', createdAt: 3 },
    ],
  };
  const r = dedupeByPhone(db);
  assert.equal(r.guardians.length, 1);
  assert.equal(r.students.length, 1, 'محمد واحد');
  assert.equal(r.students[0].name, 'محمد سعد فهد', 'والأطول نسبًا يفوز');
});

test('القاعدة الفاضية ما تطيح', () => {
  const r = dedupeByPhone({ guardians: [], students: [] });
  assert.deepEqual(r.guardians, []);
  assert.equal(r.mergedGuardians, 0);
  assert.deepEqual(remapParticipants(undefined, {}), undefined);
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

test('سجّل «محمد سعد فهد» ثم «محمد فهد» بنفس الجوال → ابن واحد', () => {
  const a = upsertRegistration(db0, {
    guardian: { phone: '0557821586' }, kids: [{ name: 'محمد سعد فهد', age: 10 }],
  });
  const b = upsertRegistration({ ...a, newId: db0.newId }, {
    guardian: { phone: '0557821586' }, kids: [{ name: 'محمد فهد', age: 10 }],
  });
  assert.equal(b.guardians.length, 1);
  assert.equal(b.students.length, 1, 'ما ينضاف ابن ثاني');
  assert.equal(b.students[0].name, 'محمد سعد فهد', 'والأكمل نسبًا يفوز');
});

test('اسمٌ أول مختلف تحت نفس الجوال يبقى أخًا', () => {
  // «سعد» ليس اختصارًا لـ«محمد سعد» — هو اسمٌ أول آخر، فقد يكون أخاه
  const a = upsertRegistration(db0, {
    guardian: { phone: '0557821587' }, kids: [{ name: 'محمد سعد فهد' }],
  });
  const b = upsertRegistration({ ...a, newId: db0.newId }, {
    guardian: { phone: '0557821587' }, kids: [{ name: 'مبارك سعد فهد' }],
  });
  assert.equal(b.guardians.length, 1, 'أبوهما واحد');
  assert.equal(b.students.length, 2, 'وهما اثنان');
});

test('الأخوان الحقيقيان ما ينخلطان', () => {
  const a = upsertRegistration(db0, {
    guardian: { name: 'سعد', phone: '0557821586' }, kids: [{ name: 'محمد سعد' }, { name: 'عبدالله سعد' }],
  });
  assert.equal(a.students.length, 2, 'اسمان مختلفان = ابنان');
});

test('المكرر الموجود من قبل يظهر كاشتباه تحت نفس ولي الأمر', () => {
  // بيانات قديمة: نفس الولد سُجّل مرتين بنسبٍ ناقص
  const db = {
    guardians: [{ id: 'g1', name: 'سعد فهد', phone: '557821586' }],
    students: [
      { id: 's1', guardianId: 'g1', name: 'محمد فهد', age: 10 },
      { id: 's2', guardianId: 'g1', name: 'محمد سعد فهد', age: 10, school: 'الرواد' },
    ],
  };
  const dups = findDuplicates(db.guardians, db.students);
  assert.equal(dups.length, 1);
  assert.equal(dups[0].kind, 'student');
  assert.equal(dups[0].guardian.id, 'g1');
});

test('دمج الابنين يوحّدهما ويكمّل الناقص', () => {
  const db = {
    guardians: [{ id: 'g1', name: 'سعد فهد', phone: '557821586' }],
    students: [
      { id: 's1', guardianId: 'g1', name: 'محمد فهد', age: 10 },
      { id: 's2', guardianId: 'g1', name: 'محمد سعد فهد', age: '', school: 'الرواد', health: 'حساسية' },
    ],
  };
  const m = mergeStudents(db, 's1', 's2');
  assert.equal(m.students.length, 1);
  const kid = m.students[0];
  assert.equal(kid.id, 's1', 'الباقي هو اللي اخترته');
  assert.equal(kid.name, 'محمد سعد فهد', 'والاسم الأطول');
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
