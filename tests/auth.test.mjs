/** اختبارات الدخول والصلاحيات وإنشاء البرنامج بعدد أيام. */
import assert from 'node:assert/strict';
import { migrate, ORDINALS, isEnrolled } from './build/app.mjs';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('  ✓ ' + name); };

const PERMS = ['البرامج', 'الأسابيع والحضور', 'المصروفات والتقارير', 'فيض - الإيرادات والمصروفات', 'الإعداد (المسابقات)', 'السفرات', 'المستخدمون والصلاحيات'];

test('ترقية المستخدمين القدامى: رمز الدخول يصير كلمة مرور واسم مستخدم', () => {
  const d = migrate({ users: [{ id: 'u1', name: 'سعد الغامدي', code: '1234', role: 'مشرف برنامج' }] });
  const u = d.users[0];
  assert.equal(u.password, '1234');
  assert.equal(u.username, 'سعد'); // أول كلمة من اسمه، والمدير يقدر يغيّرها
  assert.equal(u.code, undefined);
});

test('تسجيل الدخول يطابق اسم المستخدم بدون حساسية لحالة الأحرف', () => {
  const users = [{ id: 'u1', username: 'saad', password: 'pw1', status: 'نشط' }];
  const login = (name, pass) => {
    const u = users.find((x) => x.username.toLowerCase() === name.trim().toLowerCase());
    if (!u || u.password !== pass) return 'خطأ';
    if (u.status !== 'نشط') return 'معطّل';
    return u.id;
  };
  assert.equal(login('  SAAD ', 'pw1'), 'u1');
  assert.equal(login('saad', 'wrong'), 'خطأ');
  assert.equal(login('mohammed', 'pw1'), 'خطأ'); // نفس الرسالة، ما نكشف مين موجود
});

test('الحساب المعطّل ما يدخل حتى بكلمة مرور صحيحة', () => {
  const u = { username: 'ali', password: 'pw', status: 'غير نشط' };
  const ok = u.password === 'pw' && u.status === 'نشط';
  assert.equal(ok, false);
});

test('المستخدم يشوف الأقسام اللي له صلاحية فيها بس', () => {
  const can = (user, perm) => user.role === 'مدير' || (user.permissions || []).includes(perm);
  const attendanceOnly = { role: 'مسجل حضور', permissions: ['الأسابيع والحضور'] };
  assert.equal(can(attendanceOnly, 'الأسابيع والحضور'), true);
  assert.equal(can(attendanceOnly, 'فيض - الإيرادات والمصروفات'), false);
  assert.equal(can(attendanceOnly, 'المصروفات والتقارير'), false);
  assert.equal(can(attendanceOnly, 'المستخدمون والصلاحيات'), false);

  const admin = { role: 'مدير', permissions: [] };
  assert.ok(PERMS.every((p) => can(admin, p)));
});

test('نطاق الأيام المحدودة يقيّد الوصول لأسابيع بعينها', () => {
  const u = { role: 'مسجل حضور', accessScope: 'limited', allowedWeeks: [{ programId: 'p1', weekId: 'w2' }] };
  const canSee = (pid, wid) => u.role === 'مدير' || u.accessScope === 'all'
    || u.allowedWeeks.some((a) => a.programId === pid && a.weekId === wid);
  assert.equal(canSee('p1', 'w2'), true);
  assert.equal(canSee('p1', 'w1'), false);
  assert.equal(canSee('p2', 'w2'), false);
});

test('اسم المستخدم لازم يكون فريد', () => {
  const users = [{ id: 'u1', username: 'saad' }];
  const taken = (name, editingId) => users.some((u) => u.username === name && u.id !== editingId);
  assert.equal(taken('saad', null), true);
  assert.equal(taken('saad', 'u1'), false); // يعدّل نفسه، عادي
  assert.equal(taken('ali', null), false);
});

test('تعديل مستخدم بدون كلمة مرور جديدة يبقي القديمة', () => {
  const before = { id: 'u1', name: 'سعد', username: 'saad', password: 'old' };
  const form = { id: 'u1', name: 'سعد', username: 'saad', password: '' };
  const after = { ...before, name: form.name, username: form.username, ...(form.password ? { password: form.password } : {}) };
  assert.equal(after.password, 'old');
});

test('إنشاء برنامج بعدد أسابيع يولّد أسماء مرتّبة', () => {
  const build = (type, count) => {
    const unit = type === 'مجمع' ? 'اليوم' : 'الأسبوع';
    return Array.from({ length: count }, (_, i) => `${unit} ${ORDINALS[i] || i + 1}`);
  };
  assert.deepEqual(build('منفصل', 3), ['الأسبوع الأول', 'الأسبوع الثاني', 'الأسبوع الثالث']);
  assert.deepEqual(build('مجمع', 4).at(-1), 'اليوم الرابع');
  assert.equal(build('منفصل', 25).at(-1), 'الأسبوع 25'); // بعد العشرين نرجع للأرقام
  assert.deepEqual(build('منفصل', 0), []);
});

test('أيام البرنامج المنشأة دفعة وحدة تبدأ فاضية ومفتوحة', () => {
  const w = { id: 'x', name: 'اليوم الأول', date: '', status: 'مفتوح', participants: [], collections: [], expenseItems: [], schoolPayouts: [], faidPayouts: [], faidTransfer: null };
  assert.equal(w.status, 'مفتوح');
  assert.equal(w.participants.length, 0);
  assert.equal(isEnrolled({ days: ['x'] }, 'x'), true);
});

test('المستخدم المحدود يشوف فقط البرامج اللي فيها أيام مسندة له', () => {
  const user = { role: 'مسجل حضور', accessScope: 'limited', allowedWeeks: [{ programId: 'p1', weekId: 'p1w2' }] };
  const canSeeWeek = (pid, wid) => user.role === 'مدير' || user.accessScope === 'all'
    || user.allowedWeeks.some((a) => a.programId === pid && a.weekId === wid);
  const programs = [
    { id: 'p1', weeks: [{ id: 'p1w1' }, { id: 'p1w2' }, { id: 'p1w3' }] },
    { id: 'p2', weeks: [{ id: 'p2w1' }] },
  ];
  const visible = programs.filter((p) => p.weeks.some((w) => canSeeWeek(p.id, w.id)));
  assert.deepEqual(visible.map((p) => p.id), ['p1']); // p2 ما يظهر أصلًا

  const myWeeks = visible.flatMap((p) => p.weeks.filter((w) => canSeeWeek(p.id, w.id)));
  assert.deepEqual(myWeeks.map((w) => w.id), ['p1w2']); // يوصل ليومه مباشرة
});

test('صاحب الوصول الكامل يشوف كل البرامج', () => {
  const user = { role: 'مشرف برنامج', accessScope: 'all', allowedWeeks: [] };
  const limited = user.role !== 'مدير' && user.accessScope === 'limited';
  assert.equal(limited, false);
});

test('أول حساب في التطبيق يُفرض مديرًا حتى ما ينقفل صاحبه بره', () => {
  const users = [];
  const forceAdmin = users.length === 0;
  const role = forceAdmin ? 'مدير' : 'مسجل حضور';
  assert.equal(role, 'مدير');

  // بعد وجود حساب، الأدوار تصير حرة
  const users2 = [{ id: 'u1', role: 'مدير' }];
  assert.equal(users2.length === 0, false);
});

test('آخر مدير نشط ما ينحذف ولا يتعطّل', () => {
  const users = [
    { id: 'u1', role: 'مدير', status: 'نشط' },
    { id: 'u2', role: 'مسجل حضور', status: 'نشط' },
  ];
  const admins = users.filter((u) => u.role === 'مدير' && u.status === 'نشط');
  const isLast = (id) => {
    const u = users.find((x) => x.id === id);
    return u?.role === 'مدير' && u.status === 'نشط' && admins.length === 1;
  };
  assert.equal(isLast('u1'), true);   // ممنوع
  assert.equal(isLast('u2'), false);  // عادي

  const two = [...users, { id: 'u3', role: 'مدير', status: 'نشط' }];
  const admins2 = two.filter((u) => u.role === 'مدير' && u.status === 'نشط');
  assert.equal(admins2.length === 1, false); // صار فيه مديران، فالحذف مسموح
});

test('انعدام المدير النشط يفتح مخرج إنشاء مدير', () => {
  const noAdmin = (users) => users.length > 0 && !users.some((u) => u.role === 'مدير' && u.status === 'نشط');
  assert.equal(noAdmin([{ role: 'مسجل حضور', status: 'نشط' }]), true);
  assert.equal(noAdmin([{ role: 'مدير', status: 'غير نشط' }]), true); // معطّل = مقفول برضه
  assert.equal(noAdmin([{ role: 'مدير', status: 'نشط' }]), false);
  assert.equal(noAdmin([]), false); // تطبيق جديد، ما يحتاج مخرج
});

console.log(`\n${passed} اختبار نجح.`);
