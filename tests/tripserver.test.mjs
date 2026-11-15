/** اختبار الخادم نفسه: من يرى السفرة ومن يكتب فيها، على مخزنٍ في الذاكرة. */
import handler from './build/state.bundle.mjs';
const call = async (body) => {
  const r = await handler(new Request('http://x.test/.netlify/functions/state', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  return { status: r.status, body: await r.json() };
};
let ok = 0, bad = 0;
const check = (name, cond, extra = '') => { if (cond) { ok++; console.log('  ✓ ' + name); } else { bad++; console.log('  ✗ ' + name, extra); } };

const trip = (id, name, managers, amt) => ({ id, name, date: '1448/06/03', managers, people: ['العلوان'], incomeItems: [], expenseItems: [{ id: 'e' + id, name: 'سكن', amount: amt, paidBy: 'العلوان' }], settlements: [{ id: 's' + id, person: 'العلوان', amount: 50 }] });
const data0 = {
  currentYear: '1448', currentTerm: 'الأول', years: ['1448'], terms: ['الأول'],
  faidAccounts: [{ id: 'rajhi', name: 'الراجحي' }],
  faidAdjustments: [{ id: 'adj1', accountId: 'rajhi', type: 'إيراد', amount: 777, note: 'سرّي' }],
  programs: [{ id: 'p1', name: 'برنامج', type: 'منفصل', weeks: [{ id: 'w1', name: 'أ', status: 'مغلق', participants: [{ id: 'x1', name: 'طالب', amount: 321, accountId: 'rajhi', attendance: 'حاضر' }], expenseItems: [{ id: 'ex1', name: 'ماء', amount: 40, accountId: 'rajhi' }], collections: [], schoolPayouts: [], faidPayouts: [] }] }],
  trips: [trip('t1', 'الشرقية', ['u1'], 600), trip('t2', 'الجنوب', [], 150)],
  students: [], guardians: [],
};
const admin = { id: 'a', name: 'المدير', username: 'admin', password: 'pw-admin', role: 'مدير', permissions: [] };

let r = await call({ op: 'init', user: admin, data: data0 });
check('init', r.status === 200, JSON.stringify(r.body).slice(0, 200));
let adminTok = r.body.token, rev = r.body.rev;

// المدير يضيف الحسابات
r = await call({ op: 'pull', token: adminTok, sinceRev: 0 });
let d = r.body.data; rev = r.body.rev;
d.users = [...d.users,
  { id: 'u1', name: 'سعد', username: 'saad', password: 'pw1', role: 'مشرف برنامج', permissions: [], status: 'نشط' },
  { id: 'u2', name: 'خالد', username: 'khalid', password: 'pw2', role: 'مسؤول فيض', permissions: ['السفرات'], status: 'نشط' },
  { id: 'u3', name: 'نورة', username: 'noura', password: 'pw3', role: 'مسجل حضور', permissions: [], status: 'نشط' }];
r = await call({ op: 'push', token: adminTok, baseRev: rev, data: d });
check('المدير يضيف الحسابات', r.status === 200, JSON.stringify(r.body).slice(0, 200)); rev = r.body.rev;

const login = async (u, p) => (await call({ op: 'login', username: u, password: p })).body.token;
const saad = await login('saad', 'pw1'), khalid = await login('khalid', 'pw2'), noura = await login('noura', 'pw3');
check('الدخول بالحسابات الثلاثة', saad && khalid && noura);

// ---- ما يصل كل حساب ----
r = await call({ op: 'pull', token: saad, sinceRev: 0 }); const sd = r.body.data;
check('المسؤول: سفرة واحدة فقط', sd.trips.length === 1 && sd.trips[0].id === 't1', JSON.stringify(sd.trips.map((t) => t.id)));
check('المسؤول: مصروفاتها وتسوياتها وشبابها كاملة', sd.trips[0].expenseItems.length === 1 && sd.trips[0].settlements.length === 1 && sd.trips[0].people[0] === 'العلوان');
check('المسؤول: مال البرامج محجوب', sd.faidAdjustments.length === 0 && (sd.programs[0].weeks[0].expenseItems || []).length === 0 && !JSON.stringify(sd.programs).includes('321'));

r = await call({ op: 'pull', token: khalid, sinceRev: 0 }); const kd = r.body.data;
check('صاحب «السفرات» بلا مال: يرى السفرتين بلا مبالغ', kd.trips.length === 2 && kd.trips.every((t) => t.expenseItems.length === 0 && t.settlements.length === 0));

r = await call({ op: 'pull', token: noura, sinceRev: 0 });
check('من لا صلاحية له: لا سفرات', r.body.data.trips.length === 0);

// ---- ما يُقبل من المسؤول ----
const mine = JSON.parse(JSON.stringify(sd));
mine.trips[0].expenseItems.push({ id: 'new1', name: 'بنزين', amount: 80, paidBy: 'تركي', cat: 'بنزين', day: 'اليوم الأول' });
mine.trips[0].settlements.push({ id: 'ns1', person: 'تركي', amount: 20 });
mine.trips[0].managers = ['u1', 'u3'];                        // محاولة تعيين غيره
mine.trips.push({ ...JSON.parse(JSON.stringify(data0.trips[1])), name: 'اخترقت', expenseItems: [] }); // سفرة ليست له
mine.trips.push({ id: 't9', name: 'مزوّرة', managers: ['u1'], incomeItems: [], expenseItems: [] }); // سفرة جديدة
r = await call({ op: 'pull', token: saad, sinceRev: 0 });
r = await call({ op: 'push', token: saad, baseRev: r.body.rev, data: mine });
check('حفظة المسؤول تُقبل', r.status === 200, JSON.stringify(r.body).slice(0, 300));

r = await call({ op: 'pull', token: adminTok, sinceRev: 0 }); const ad = r.body.data;
const t1 = ad.trips.find((t) => t.id === 't1'), t2 = ad.trips.find((t) => t.id === 't2');
check('المصروف الجديد حُفظ في سفرته', t1.expenseItems.some((x) => x.id === 'new1') && t1.settlements.some((x) => x.id === 'ns1'));
check('ولم يضف مسؤولًا', JSON.stringify(t1.managers) === '["u1"]', JSON.stringify(t1.managers));
check('السفرة الأخرى كما كانت', t2.name === 'الجنوب' && t2.expenseItems.length === 1, JSON.stringify(t2).slice(0, 200));
check('ولم تُولد سفرة مزوّرة', !ad.trips.some((x) => x.id === 't9') && ad.trips.length === 2);
check('ومال البرامج وفيض سليمان لم يُمحَ', ad.faidAdjustments.length === 1 && ad.faidAdjustments[0].amount === 777 && ad.programs[0].weeks[0].participants[0].amount === 321 && ad.programs[0].weeks[0].expenseItems.length === 1);

// ---- غياب سفرته من حفظته لا يحذفها ----
r = await call({ op: 'pull', token: saad, sinceRev: 0 });
const none = JSON.parse(JSON.stringify(r.body.data)); none.trips = [];
r = await call({ op: 'push', token: saad, baseRev: r.body.rev, data: none });
r = await call({ op: 'pull', token: adminTok, sinceRev: 0 });
check('حفظةٌ بلا سفرات لا تحذف شيئًا', r.body.data.trips.length === 2 && r.body.data.trips.find((t) => t.id === 't1').expenseItems.length === 2);

// ---- صاحب «السفرات» بلا مال: لا يمحو مبالغ السفرات ولا يعيّن مسؤولًا ----
r = await call({ op: 'pull', token: khalid, sinceRev: 0 });
const kk = JSON.parse(JSON.stringify(r.body.data)); kk.trips[1].name = 'الجنوب 2'; kk.trips[1].managers = ['u2'];
r = await call({ op: 'push', token: khalid, baseRev: r.body.rev, data: kk });
r = await call({ op: 'pull', token: adminTok, sinceRev: 0 });
const t1b = r.body.data.trips.find((t) => t.id === 't1'), t2b = r.body.data.trips.find((t) => t.id === 't2');
check('صاحب «السفرات» يعدّل الاسم', t2b.name === 'الجنوب 2');
check('ولا يعيّن مسؤولًا', JSON.stringify(t2b.managers) === '[]', JSON.stringify(t2b.managers));
check('ومبالغ السفرتين لم تُمحَ بحفظته', t1b.expenseItems.length === 2 && t2b.expenseItems.length === 1);

// ---- المدير يعيّن المسؤولين ----
r = await call({ op: 'pull', token: adminTok, sinceRev: 0 });
const ad2 = JSON.parse(JSON.stringify(r.body.data)); ad2.trips.find((t) => t.id === 't2').managers = ['u3'];
r = await call({ op: 'push', token: adminTok, baseRev: r.body.rev, data: ad2 });
r = await call({ op: 'pull', token: noura, sinceRev: 0 });
check('المدير عيّن نورة: ترى الجنوب وحدها كاملة', r.body.data.trips.length === 1 && r.body.data.trips[0].id === 't2' && r.body.data.trips[0].expenseItems.length === 1);
r = await call({ op: 'pull', token: saad, sinceRev: 0 });
check('وسعد ما زال يرى الشرقية وحدها', r.body.data.trips.length === 1 && r.body.data.trips[0].id === 't1');

console.log(`\n${bad ? '✗' : '✅'} ${ok} نجح، ${bad} فشل`);
process.exit(bad ? 1 : 0);
