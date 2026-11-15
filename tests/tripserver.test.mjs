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
  { id: 'u3', name: 'نورة', username: 'noura', password: 'pw3', role: 'مسجل حضور', permissions: [], status: 'نشط' },
  { id: 'u7', name: 'تركي العريني', username: 'turki', password: 'pw7', role: 'مسجل حضور', permissions: [], payerName: 'تركي', status: 'نشط' },
  { id: 'u4', name: 'العلوان', username: 'alawan', password: 'pw4', role: 'مسجل حضور', permissions: [], status: 'نشط' }];
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

// ---- المُدخِل: يضيف ويرى ما أدخله هو وحده ----
r = await call({ op: 'pull', token: adminTok, sinceRev: 0 });
const ad3 = JSON.parse(JSON.stringify(r.body.data));
const g = ad3.trips.find((t) => t.id === 't1');
g.entrants = ['u4']; g.settlements = [{ id: 'sx', person: 'تركي', amount: 60 }];
r = await call({ op: 'push', token: adminTok, baseRev: r.body.rev, data: ad3 });
const alawan = await login('alawan', 'pw4');
r = await call({ op: 'pull', token: alawan, sinceRev: 0 });
let od = r.body.data;
check('المُدخِل: سفرته وحدها', od.trips.length === 1 && od.trips[0].id === 't1', JSON.stringify(od.trips.map((t) => t.id)));
check('المُدخِل: لا يرى مصروفات غيره ولا التسويات ولا الشباب', od.trips[0].expenseItems.length === 0 && od.trips[0].settlements.length === 0 && od.trips[0].people.length === 0);
check('المُدخِل: لا يرى مال البرامج ولا فيض', od.faidAdjustments.length === 0 && !JSON.stringify(od.programs).includes('321'));

const mineAdd = JSON.parse(JSON.stringify(od));
mineAdd.trips[0].expenseItems.push({ id: 'al1', name: 'غداء', amount: 120, cat: 'أكل وشرب', sub: 'غداء', day: 'اليوم الأول', paidBy: 'العلوان', by: 'u1' });
mineAdd.trips[0].settlements.push({ id: 'evil', person: 'العلوان', amount: 999 });   // محاولة تسوية لنفسه
mineAdd.trips[0].entrants = ['u4', 'u1'];
mineAdd.trips[0].managers = ['u4'];
r = await call({ op: 'pull', token: alawan, sinceRev: 0 });
r = await call({ op: 'push', token: alawan, baseRev: r.body.rev, data: mineAdd });
check('حفظة المُدخِل تُقبل', r.status === 200, JSON.stringify(r.body).slice(0, 200));
r = await call({ op: 'pull', token: adminTok, sinceRev: 0 });
const ta = r.body.data.trips.find((t) => t.id === 't1');
const al1 = ta.expenseItems.find((x) => x.id === 'al1');
check('البند الجديد حُفظ باسمه', Boolean(al1) && al1.by === 'u4' && al1.amount === 120 && al1.paidBy === 'العلوان', JSON.stringify(al1));
check('وبنود غيره وتسوياتهم كما كانت', ta.expenseItems.length === 3 && ta.expenseItems.some((x) => x.id === 'et1') && ta.expenseItems.some((x) => x.id === 'new1') && ta.settlements.length === 1 && ta.settlements[0].id === 'sx', JSON.stringify(ta.settlements));
check('ولم يعيّن مسؤولًا ولا مُدخِلًا', JSON.stringify(ta.managers) === '["u1"]' && JSON.stringify(ta.entrants) === '["u4"]', JSON.stringify([ta.managers, ta.entrants]));
r = await call({ op: 'pull', token: alawan, sinceRev: 0 });
check('ويرى بنده هو بعد الحفظ، لا غيره', r.body.data.trips[0].expenseItems.length === 1 && r.body.data.trips[0].expenseItems[0].id === 'al1');
check('ومال البرامج وفيض ما زالا سليمين', (await call({ op: 'pull', token: adminTok, sinceRev: 0 })).body.data.faidAdjustments.length === 1);

// ---- السفرة المقفلة ----
r = await call({ op: 'pull', token: adminTok, sinceRev: 0 });
const ad4 = JSON.parse(JSON.stringify(r.body.data));
ad4.trips.find((t) => t.id === 't1').closed = true;
r = await call({ op: 'push', token: adminTok, baseRev: r.body.rev, data: ad4 });
check('المدير يقفل السفرة', r.status === 200);
const lockedBefore = JSON.stringify((await call({ op: 'pull', token: adminTok, sinceRev: 0 })).body.data.trips.find((t) => t.id === 't1'));

r = await call({ op: 'pull', token: saad, sinceRev: 0 });
check('المسؤول ما زال يراها مقفلة', r.body.data.trips.find((t) => t.id === 't1').closed === true);
const mgrTry = JSON.parse(JSON.stringify(r.body.data));
mgrTry.trips[0].expenseItems.push({ id: 'late1', name: 'متأخر', amount: 77, paidBy: 'تركي' });
mgrTry.trips[0].closed = false;                                  // محاولة فتحها
mgrTry.trips[0].settlements.push({ id: 'late2', person: 'تركي', amount: 5 });
r = await call({ op: 'push', token: saad, baseRev: r.body.rev, data: mgrTry });
let after = (await call({ op: 'pull', token: adminTok, sinceRev: 0 })).body.data.trips.find((t) => t.id === 't1');
check('المسؤول لا يضيف ولا يفتح ولا يسدّد في المقفلة', JSON.stringify(after) === lockedBefore, JSON.stringify(after).slice(0, 200));

r = await call({ op: 'pull', token: alawan, sinceRev: 0 });
const entTry = JSON.parse(JSON.stringify(r.body.data));
entTry.trips[0].expenseItems.push({ id: 'late3', name: 'متأخر', amount: 8, paidBy: 'العلوان' });
r = await call({ op: 'push', token: alawan, baseRev: r.body.rev, data: entTry });
after = (await call({ op: 'pull', token: adminTok, sinceRev: 0 })).body.data.trips.find((t) => t.id === 't1');
check('والمُدخِل لا يضيف في المقفلة', JSON.stringify(after) === lockedBefore);

r = await call({ op: 'pull', token: adminTok, sinceRev: 0 });
const ad5 = JSON.parse(JSON.stringify(r.body.data));
ad5.trips.find((t) => t.id === 't1').closed = false;
r = await call({ op: 'push', token: adminTok, baseRev: r.body.rev, data: ad5 });
r = await call({ op: 'pull', token: alawan, sinceRev: 0 });
const again = JSON.parse(JSON.stringify(r.body.data));
again.trips[0].expenseItems.push({ id: 'ok1', name: 'بعد الفتح', amount: 9, paidBy: 'العلوان' });
r = await call({ op: 'push', token: alawan, baseRev: r.body.rev, data: again });
after = (await call({ op: 'pull', token: adminTok, sinceRev: 0 })).body.data.trips.find((t) => t.id === 't1');
check('المدير يفتحها فيعود الإدخال', after.closed === false && after.expenseItems.some((x) => x.id === 'ok1'));

// ---- سكنٌ مقسَّم على أيام يُدخِله مُدخِل ----
r = await call({ op: 'pull', token: alawan, sinceRev: 0 });
const spread = JSON.parse(JSON.stringify(r.body.data));
spread.trips[0].expenseItems.push(
  { id: 'sp1', name: 'سكن', amount: 334, cat: 'سكن', day: 'اليوم الأول', paidBy: 'العلوان', grp: 'sp1', part: '١ من ٢' },
  { id: 'sp2', name: 'سكن', amount: 333, cat: 'سكن', day: 'اليوم الثاني', paidBy: 'العلوان', grp: 'sp1', part: '٢ من ٢' });
r = await call({ op: 'push', token: alawan, baseRev: r.body.rev, data: spread });
after = (await call({ op: 'pull', token: adminTok, sinceRev: 0 })).body.data.trips.find((t) => t.id === 't1');
const sp = after.expenseItems.filter((x) => x.grp === 'sp1');
check('أجزاء السكن من المُدخِل تُحفظ بمجموعتها وعلامتها وباسمه', sp.length === 2 && sp.every((x) => x.by === 'u4' && x.paidBy === 'العلوان') && sp.map((x) => x.part).join() === '١ من ٢,٢ من ٢', JSON.stringify(sp));

// ---- الدافع المربوط بحسابه ----
const turki = await login('turki', 'pw7');
r = await call({ op: 'pull', token: turki, sinceRev: 0 });
const td = r.body.data;
const tr1 = td.trips.find((t) => t.id === 't1');
check('الدافع المربوط يرى السفرة التي له فيها حساب فقط', td.trips.length === 1 && Boolean(tr1), JSON.stringify(td.trips.map((t) => t.id)));
check('وبنوده هو فقط، لا بند غيره', tr1.expenseItems.length > 0 && tr1.expenseItems.every((x) => x.paidBy === 'تركي'), JSON.stringify(tr1.expenseItems.map((x) => x.paidBy)));
check('وتسوياته هو، ولا شباب ولا إيراد ولا مسؤولين', tr1.settlements.every((x) => x.person === 'تركي') && JSON.stringify(tr1.people) === '["تركي"]' && tr1.incomeItems.length === 0 && tr1.managers.length === 0);
check('ومال البرامج وفيض محجوب عنه', td.faidAdjustments.length === 0 && !JSON.stringify(td.programs).includes('321'));
const tk = JSON.parse(JSON.stringify(td));
tk.trips[0].expenseItems.push({ id: 'fake', name: 'مزوّر', amount: 9999, paidBy: 'تركي' });
tk.trips[0].settlements.push({ id: 'fakeS', person: 'تركي', amount: 8888 });
r = await call({ op: 'push', token: turki, baseRev: (await call({ op: 'pull', token: turki, sinceRev: 0 })).body.rev, data: tk });
after = (await call({ op: 'pull', token: adminTok, sinceRev: 0 })).body.data.trips.find((t) => t.id === 't1');
check('ولا يكتب شيئًا: القراءة فقط', !after.expenseItems.some((x) => x.id === 'fake') && !after.settlements.some((x) => x.id === 'fakeS'));
check('وبقية حسابات الشباب باقية عند المدير', after.expenseItems.some((x) => x.paidBy === 'العلوان') && after.expenseItems.length >= 4);

console.log(`\n${bad ? '✗' : '✅'} ${ok} نجح، ${bad} فشل`);
process.exit(bad ? 1 : 0);
