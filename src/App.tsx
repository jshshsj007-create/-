import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Home, BookOpen, Wallet, Settings, Plus, X, Check, ChevronLeft, Trash2, Pencil,
  Users as UsersIcon, Calendar, TrendingUp, TrendingDown, Layers, ShieldCheck,
  Lock, Unlock, Trophy, LogOut, KeyRound, Plane, Search, AlertTriangle, Send,
  RotateCcw, Wand2, CalendarDays, FileText, Copy,
} from 'lucide-react';
import { api, clone, merge3, readSession, writeSession, clearSession, readPending, writePending, clearPending } from './cloud.js';
import {
  normalizePhone, isValidPhone, formatPhone, normalizeName, sameName,
  studentsOf, upsertRegistration, findDuplicates, mergeGuardians, mergeStudents, guardianNameFrom,
  dedupeByPhone, remapParticipants,
} from './people.js';
import { makeToken as makeSignupToken } from './signup.js';
import { runningBuild, publishedBuild, isStale, hardReload } from './freshness.js';
import { FaidLogo } from './logo.jsx';

const STORAGE_KEY = 'nadi-alahya-data-v1';
/** يظهر في شاشة البداية والإعدادات: يعرّفك أي نسخة تشوف. */
const APP_VERSION = 'v5.0 · ولي أمر واحد';
const PERMS = ['البرامج', 'الأسابيع والحضور', 'المصروفات والتقارير', 'فيض - الإيرادات والمصروفات', 'الإعداد (المسابقات)', 'السفرات', 'أولياء الأمور', 'المستخدمون والصلاحيات'];
const ROLES = ['مدير', 'مشرف برنامج', 'مسجل حضور', 'مسؤول مسابقات', 'مسؤول فيض'];
const ACCOUNT_COLORS = ['#8B5CF6', '#10B981', '#3B82F6', '#F59E0B', '#EC4899', '#14B8A6'];
const LEVELS = ['أولية', 'متوسطة', 'عليا'];
export const ORDINALS = ['الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس', 'السابع', 'الثامن', 'التاسع', 'العاشر',
  'الحادي عشر', 'الثاني عشر', 'الثالث عشر', 'الرابع عشر', 'الخامس عشر', 'السادس عشر', 'السابع عشر', 'الثامن عشر',
  'التاسع عشر', 'العشرون'];

const uid = () => Math.random().toString(36).slice(2, 9);
const fmt = (n) => Number(n || 0).toLocaleString('en-US');
export const sumAmt = (arr) => (arr || []).reduce((s, x) => s + Number(x.amount || 0), 0);
/**
 * المحصّل فعلًا. تسجيل الرابط اللي ينتظر تأكيدك ما يُحسب إيرادًا مهما كتب ولي
 * الأمر — «قال إنه حوّل» غير «الفلوس وصلت»، والحسابات تتبع الثاني.
 */
export const paidAmount = (parts) => (parts || [])
  .filter((p) => p.accountId !== 'unpaid' && !p.pending)
  .reduce((s, p) => s + Number(p.amount || 0), 0);

/**
 * الدفتر المالي (ledger): كائن فيه participants / collections / expenseItems / schoolPayouts / faidPayouts.
 * البرنامج المنفصل: الدفتر يعيش على مستوى الأسبوع (كل يوم مستقل ماليًا).
 * البرنامج المجمّع: الدفتر يعيش على مستوى البرنامج (تسجيل واحد لكل الأيام)، والأيام للحضور فقط.
 *
 * معادلة التوزيع المتفق عليها:
 *   الإيراد = تحصيل المشاركين + التحصيل الإضافي
 *   الصافي  = الإيراد − مصروفات البرنامج
 *   الصافي يُوزَّع يدويًا: نصيب مدارس الرواد + نصيب فريق فيض
 *   المتبقي = الصافي − (نصيب المدرسة + نصيب فيض)   ← لازم يساوي صفر عند اكتمال التوزيع
 */
/**
 * وضع التسجيل في الدفتر:
 *  quick — عدد طلاب ومبلغ إيراد فقط (البرنامج المنفصل: يوم واحد، ما يحتاج أسماء).
 *  named — أسماء المشاركين، وهو اللازم للتحضير (البرنامج المجمّع دائمًا كذا).
 */
export const tripIncome = (t) => sumAmt(t?.incomeItems);
export const tripExpenses = (t) => sumAmt(t?.expenseItems);
export const tripNet = (t) => tripIncome(t) - tripExpenses(t);

export const isQuick = (l) => (l?.mode || 'named') === 'quick';
export const headcount = (l) => (isQuick(l) ? Number(l?.quickCount || 0) : (l?.participants || []).length);

export const L = {
  revenue: (l) => (isQuick(l) ? Number(l?.quickRevenue || 0) : paidAmount(l?.participants)) + sumAmt(l?.collections),
  expenses: (l) => sumAmt(l?.expenseItems),
  net: (l) => L.revenue(l) - L.expenses(l),
  school: (l) => sumAmt(l?.schoolPayouts),
  faid: (l) => sumAmt(l?.faidPayouts),
  remaining: (l) => L.net(l) - L.school(l) - L.faid(l),
};

/**
 * التسجيل في البرنامج المجمّع: المشترك يختار الأيام اللي سجّل فيها.
 * يقدر يسجّل كل الأيام، أو يوم واحد، أو يجي متأخر ويسجّل من اليوم الثالث.
 * `days` غير موجودة = مسجّل في كل الأيام (بيانات قديمة أُدخلت قبل التسجيل الجزئي).
 */
export const isEnrolled = (participant, weekId) =>
  !participant?.days || participant.days.includes(weekId);
export const enrolledDays = (participant, weeks) =>
  (weeks || []).filter((w) => isEnrolled(participant, w.id));
export const enrolledIn = (participants, weekId) =>
  (participants || []).filter((p) => isEnrolled(p, weekId));

const emptyLedger = (mode = 'named') => ({
  mode, quickCount: 0, quickRevenue: 0,
  participants: [], collections: [], expenseItems: [], schoolPayouts: [], faidPayouts: [], faidTransfer: null,
});

/** حالة اليوم المعروضة: تُحسب من البيانات، ما هي حقل يدوي. */
export const weekState = (l) => {
  if (l?.status === 'مغلق') return 'مكتمل';
  const started = headcount(l) > 0 || L.revenue(l) > 0 || L.expenses(l) > 0;
  return started ? 'جاري' : 'لم يبدأ';
};

const storage = {
  async get(key) {
    try {
      if (typeof window !== 'undefined' && window.storage?.get) {
        const res = await window.storage.get(key, true);
        return res ? res.value : null;
      }
      return localStorage.getItem(key);
    } catch { return null; }
  },
  async set(key, value) {
    try {
      if (typeof window !== 'undefined' && window.storage?.set) return await window.storage.set(key, value, true);
      localStorage.setItem(key, value);
    } catch (e) { console.error('storage error', e); }
  },
};

const defaultData = () => ({
  years: ['1448'],
  terms: ['الأول', 'الثاني'],
  currentYear: '1448',
  currentTerm: 'الأول',
  programs: [],
  faidAccounts: [
    { id: uid(), name: 'الراجحي' },
    { id: uid(), name: 'أبو فارس' },
    { id: uid(), name: 'القاسم' },
    { id: uid(), name: 'كاش' },
  ],
  faidAdjustments: [],
  competitions: [],
  trips: [],
  users: [],
  // قاعدة العملاء: ولي الأمر ← أبناؤه. تعيش عبر المواسم كلها، مو داخل ترم واحد.
  guardians: [],
  students: [],
  /**
   * نموذج التسجيل الذاتي: واحد لكل الروابط، تعدّله مرة وينطبق على الكل.
   * الجوال واسم الطالب مقفولان — الأول يمنع التكرار، والثاني هو المشترك نفسه.
   */
  signupFields: defaultSignupFields(),
});

export const LOCKED_FIELDS = ['gPhone', 'name'];

export const defaultSignupFields = () => ([
  // ما نسأل عن اسم ولي الأمر: اسم الطالب الثلاثي يعطيه
  { id: 'gPhone', label: 'جوال ولي الأمر', type: 'phone', required: true },
  { id: 'name', label: 'اسم الطالب الثلاثي', type: 'text', required: true },
  { id: 'age', label: 'العمر', type: 'number', required: true },
  { id: 'grade', label: 'الصف', type: 'text', required: false },
  { id: 'school', label: 'المدرسة', type: 'text', required: false },
  { id: 'health', label: 'ملاحظات صحية', type: 'text', required: false },
]);

/** ترقية البيانات القديمة للشكل الجديد بدون فقدان أي شيء مسجّل سابقًا. */
export function migrate(loaded) {
  const d = { ...defaultData(), ...loaded };
  if (!d.faidAccounts?.length) d.faidAccounts = defaultData().faidAccounts;
  if (!d.faidAccounts.some((a) => a.name === 'كاش')) d.faidAccounts.push({ id: uid(), name: 'كاش' });

  d.programs = (d.programs || []).map((p) => {
    const prog = { ...emptyLedger('named'), attendance: {}, status: 'مفتوح', ...p };
    prog.mode = 'named';
    prog.weeks = (p.weeks || []).map((w) => {
      const week = { ...emptyLedger('named'), ...w };
      // التسجيل بالأسماء هو الأصل. الوضع السريع يبقى فقط لو فعلًا فيه أرقام مسجّلة فيه.
      if (!week.mode) week.mode = 'named';
      if (week.mode === 'quick' && !Number(week.quickCount || 0) && !Number(week.quickRevenue || 0)) week.mode = 'named';
      if (prog.type === 'مجمع') week.mode = 'named';
      // مصروفات النسخة القديمة كانت رقمًا مفردًا على الأسبوع
      if (w.expenses && !(w.expenseItems || []).length) {
        week.expenseItems = [{ id: uid(), accountId: d.faidAccounts[0]?.id, amount: Number(w.expenses), note: 'مصروف سابق' }];
      }
      delete week.expenses;
      return week;
    });
    return prog;
  });
  // 1447 ما عادت سنة افتراضية؛ نشيلها إذا ما فيها ولا برنامج
  if (d.years.includes('1447') && !d.programs.some((p) => (p.termKey || '').startsWith('1447'))) {
    d.years = d.years.filter((y) => y !== '1447');
    if (!d.years.length) d.years = ['1448'];
    if (d.currentYear === '1447') d.currentYear = d.years[0];
  }
  d.faidAdjustments = (d.faidAdjustments || []).map((a) => ({ ...a }));
  d.competitions = (d.competitions || []).map((c) => ({ idea: '', tools: [], photos: [], ...c }));
  d.trips = (d.trips || []).map((t) => {
    const trip = { incomeItems: [], expenseItems: [], ...t };
    // الأرقام المجملة القديمة تتحول لبند واحد باسم واضح
    if (Number(t.revenue) > 0 && !trip.incomeItems.length) trip.incomeItems = [{ id: uid(), name: 'إيراد سابق', amount: Number(t.revenue) }];
    if (Number(t.expenses) > 0 && !trip.expenseItems.length) trip.expenseItems = [{ id: uid(), name: 'مصروف سابق', amount: Number(t.expenses) }];
    delete trip.revenue; delete trip.expenses;
    return trip;
  });
  // الدخول صار باسم مستخدم وكلمة مرور بدل «اختر اسمك + رمز»؛ نحوّل المستخدمين القدامى
  d.users = (d.users || []).map((u, i) => {
    const user = { accessScope: 'all', allowedWeeks: [], permissions: [], ...u };
    if (!user.username) user.username = (user.name || `user${i + 1}`).split(' ')[0];
    if (!user.password) user.password = user.code || '';
    delete user.code;
    return user;
  });
  // قاعدة أولياء الأمور جديدة؛ الجوالات تُوحَّد مرة وحدة عشان المقارنة تصير سريعة
  d.guardians = (d.guardians || []).map((g) => ({ notes: '', altPhone: '', ...g, phone: normalizePhone(g.phone) }));
  d.students = (d.students || []).map((s) => ({ age: '', grade: '', school: '', health: '', ...s }));
  // بيانات أُنشئت قبل ما يصير الجوال مفتاحًا فريدًا: نوحّدها مرة وحدة
  const dedup = dedupeByPhone(d);
  if (dedup.mergedGuardians || dedup.mergedStudents) {
    d.guardians = dedup.guardians;
    d.students = dedup.students;
    d.programs = remapParticipants(d.programs, dedup.remap);
  }
  // النموذج لازم يبقى فيه الخانتان المقفولتان مهما عبث فيه أحد
  d.signupFields = (d.signupFields?.length ? d.signupFields : defaultSignupFields());
  // خانة اسم ولي الأمر انشالت: اسم الطالب الثلاثي يعطيه. مرة وحدة عشان
  // ما نصادر قرار من يبيها لاحقًا.
  if (!d.signupFieldsV2) {
    d.signupFields = d.signupFields.filter((f) => f.id !== 'gName');
    d.signupFields = d.signupFields.map((f) => (f.id === 'name' ? { ...f, label: 'اسم الطالب الثلاثي' } : f));
    d.signupFieldsV2 = true;
  }
  for (const f of defaultSignupFields()) {
    if (LOCKED_FIELDS.includes(f.id) && !d.signupFields.some((x) => x.id === f.id)) d.signupFields.push(f);
  }
  d.faidAccounts = d.faidAccounts.map((a) => ({ transferInfo: '', publicName: '', needsReceipt: false, ...a }));
  // التسعير كان خيارًا واحدًا لا غير؛ صار اليومي والباقات يتعايشان
  d.programs = d.programs.map((p) => {
    if (!p.signup || p.signup.allowPerDay !== undefined) return p;
    const { mode, ...rest } = p.signup;
    return { ...p, signup: { ...rest, allowPerDay: mode !== 'packages' } };
  });
  return d;
}

/** إعدادات رابط التسجيل لبرنامج: مقفول ما لم يفتحه صاحبه. */
export const emptySignup = () => ({
  enabled: false, token: '', price: '', openWeeks: [], accounts: [], extraFields: [],
  // البرنامج المجمّع يُباع إما بسعر اليوم أو بباقات يحددها صاحب التطبيق
  allowPerDay: true, packages: [],
});

/* ------------------------------ عناصر واجهة عامة ------------------------------ */

function Badge({ children, tone = 'brand' }) {
  const tones = {
    brand: 'bg-brand-100 text-brand-700',
    green: 'bg-green-100 text-green-700',
    red: 'bg-red-100 text-red-700',
    blue: 'bg-blue-100 text-blue-700',
    slate: 'bg-slate-100 text-slate-600',
    amber: 'bg-amber-100 text-amber-700',
  };
  return <span className={`px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${tones[tone]}`}>{children}</span>;
}

function Modal({ title, onClose, children, wide }) {
  return (
    <div className="fixed inset-0 bg-slate-900/50 flex items-end sm:items-center justify-center z-50 sm:p-4" onClick={onClose}>
      <div
        className={`bg-white rounded-t-2xl sm:rounded-2xl w-full ${wide ? 'sm:max-w-lg' : 'sm:max-w-md'} p-6 shadow-2xl max-h-[88vh] overflow-y-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-bold text-lg text-slate-800">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children, hint }) {
  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-slate-600 mb-1.5">{label}</label>
      {children}
      {hint && <div className="text-xs text-slate-400 mt-1.5">{hint}</div>}
    </div>
  );
}

const inputCls = 'w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent';
const btnPrimary = 'bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors flex items-center gap-1.5 justify-center disabled:opacity-40 disabled:cursor-not-allowed';
const btnGhost = 'text-slate-500 hover:text-slate-800 text-sm font-medium px-4 py-2.5 rounded-lg transition-colors';
const btnDanger = 'bg-red-600 hover:bg-red-700 text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors flex items-center gap-1.5 justify-center';
const cardCls = 'bg-white rounded-2xl border border-slate-100 p-5';
const emptyCls = 'bg-white rounded-2xl border border-dashed border-slate-200 p-10 text-center text-slate-400';

function StatCard({ label, value, icon: Icon, tone = 'brand' }) {
  const tones = {
    brand: 'text-brand-600 bg-brand-50',
    green: 'text-green-600 bg-green-50',
    red: 'text-red-600 bg-red-50',
    blue: 'text-blue-600 bg-blue-50',
    amber: 'text-amber-600 bg-amber-50',
  };
  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-4 sm:p-5 flex items-center gap-3 sm:gap-4">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${tones[tone]}`}><Icon size={20} /></div>
      <div className="min-w-0">
        <div className="text-xs text-slate-400 mb-0.5">{label}</div>
        <div className="text-lg sm:text-xl font-bold text-slate-800 truncate">{value}</div>
      </div>
    </div>
  );
}

/** قائمة بنود مالية (تحصيل / مصروف / نصيب) مع إمكانية الحذف. */
function ItemList({ title, subtitle, items, accounts, onAdd, onRemove, tone = 'red', emptyText, locked }) {
  const total = sumAmt(items);
  return (
    <div className={cardCls}>
      <div className="flex items-start justify-between mb-3 gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-700">{title}</div>
          {subtitle && <div className="text-xs text-slate-400 mt-0.5">{subtitle}</div>}
        </div>
        <button onClick={onAdd} disabled={locked} className="text-xs text-brand-600 flex items-center gap-1 shrink-0 disabled:opacity-40 disabled:cursor-not-allowed">
          <Plus size={14} /> إضافة
        </button>
      </div>
      {!items?.length ? (
        <div className="text-sm text-slate-400">{emptyText}</div>
      ) : (
        <div className="space-y-2">
          {items.map((it) => (
            <div key={it.id} className="flex items-center justify-between text-sm border-b border-slate-50 pb-2 gap-2">
              <span className="text-slate-600 min-w-0 truncate">
                {accounts.find((a) => a.id === it.accountId)?.name || '-'}{it.note ? ` - ${it.note}` : ''}
              </span>
              <span className="flex items-center gap-2 shrink-0">
                <span className={`font-semibold ${tone === 'red' ? 'text-red-600' : 'text-green-600'}`}>{fmt(it.amount)} ر.س</span>
                <button onClick={() => onRemove(it.id)} disabled={locked} className="text-slate-300 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed"><Trash2 size={14} /></button>
              </span>
            </div>
          ))}
          <div className="flex items-center justify-between text-sm pt-1">
            <span className="text-slate-500 font-medium">الإجمالي</span>
            <span className="font-bold text-slate-800">{fmt(total)} ر.س</span>
          </div>
        </div>
      )}
    </div>
  );
}

function PaymentPie({ participants, accounts }) {
  const counts = accounts.map((a) => (participants || []).filter((p) => p.accountId === a.id).length);
  const unpaid = (participants || []).filter((p) => p.accountId === 'unpaid').length;
  const total = counts.reduce((a, b) => a + b, 0);
  let acc = 0;
  const stops = counts.map((c, i) => {
    const start = total ? (acc / total) * 360 : 0;
    acc += c;
    const end = total ? (acc / total) * 360 : 0;
    return `${ACCOUNT_COLORS[i % ACCOUNT_COLORS.length]} ${start}deg ${end}deg`;
  }).join(', ');
  return (
    <div className="flex items-center gap-8 flex-wrap">
      <div className="w-32 h-32 rounded-full shrink-0" style={{ background: total ? `conic-gradient(${stops})` : '#E5E7EB' }} />
      <div className="space-y-2.5">
        {accounts.map((a, i) => (
          <div key={a.id} className="flex items-center gap-2 text-sm">
            <span className="w-3 h-3 rounded-full inline-block shrink-0" style={{ background: ACCOUNT_COLORS[i % ACCOUNT_COLORS.length] }} />
            <span className="text-slate-600 min-w-[90px]">{a.name}</span>
            <span className="text-slate-800 font-bold">{counts[i]}</span>
          </div>
        ))}
        {unpaid > 0 && (
          <div className="flex items-center gap-2 text-sm">
            <span className="w-3 h-3 rounded-full inline-block shrink-0 bg-slate-300" />
            <span className="text-slate-600 min-w-[90px]">ما دفع</span>
            <span className="text-slate-800 font-bold">{unpaid}</span>
          </div>
        )}
      </div>
    </div>
  );
}

/** لوحة التوزيع: تعرض المعادلة كاملة وتنبّه لو التوزيع ما اكتمل. */
function DistributionPanel({ ledger, onDistributeRest, onTransfer, onUndoTransfer, canTransfer, locked }) {
  const net = L.net(ledger);
  const rest = L.remaining(ledger);
  const transfer = ledger.faidTransfer;
  const rows = [
    { label: 'تحصيل المشاركين', value: paidAmount(ledger.participants), tone: 'text-green-600' },
    { label: 'تحصيل إضافي', value: sumAmt(ledger.collections), tone: 'text-green-600' },
    { label: 'مصروفات البرنامج', value: -L.expenses(ledger), tone: 'text-red-600' },
  ];
  return (
    <div className={cardCls}>
      <div className="text-sm font-semibold text-slate-700 mb-4">التوزيع النهائي</div>
      <div className="space-y-2 text-sm">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between">
            <span className="text-slate-500">{r.label}</span>
            <span className={`font-semibold ${r.tone}`}>{fmt(r.value)} ر.س</span>
          </div>
        ))}
        <div className="flex items-center justify-between border-t border-slate-100 pt-2.5 mt-2.5">
          <span className="text-slate-700 font-semibold">الصافي القابل للتوزيع</span>
          <span className="font-bold text-slate-900">{fmt(net)} ر.س</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-slate-500">− نصيب مدارس الرواد</span>
          <span className="font-semibold text-slate-700">{fmt(L.school(ledger))} ر.س</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-slate-500">− نصيب فريق فيض</span>
          <span className="font-semibold text-slate-700">{fmt(L.faid(ledger))} ر.س</span>
        </div>
      </div>

      <div className={`mt-4 rounded-xl px-4 py-3 flex items-center justify-between gap-3 flex-wrap ${rest === 0 ? 'bg-green-50' : rest > 0 ? 'bg-amber-50' : 'bg-red-50'}`}>
        <div className="flex items-center gap-2 text-sm font-semibold">
          {rest === 0 ? <Check size={16} className="text-green-600" /> : <AlertTriangle size={16} className={rest > 0 ? 'text-amber-600' : 'text-red-600'} />}
          <span className={rest === 0 ? 'text-green-700' : rest > 0 ? 'text-amber-700' : 'text-red-700'}>
            {rest === 0 ? 'التوزيع مكتمل ومطابق' : rest > 0 ? `متبقي بدون توزيع: ${fmt(rest)} ر.س` : `التوزيع زائد عن الصافي بـ ${fmt(-rest)} ر.س`}
          </span>
        </div>
        {rest > 0 && !locked && (
          <button onClick={onDistributeRest} className="text-xs text-brand-700 font-semibold flex items-center gap-1 hover:underline">
            <Wand2 size={13} /> أضف الباقي لنصيب فيض
          </button>
        )}
      </div>

      {canTransfer && (
        <div className="mt-4 pt-4 border-t border-slate-100">
          {transfer ? (
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="text-sm text-slate-600">
                <Badge tone="green">مُرحّل لفيض</Badge>
                <span className="mr-2">{fmt(transfer.amount)} ر.س{transfer.date ? ` - ${transfer.date}` : ''}</span>
              </div>
              <button onClick={onUndoTransfer} className="text-xs text-red-600 flex items-center gap-1 hover:underline">
                <RotateCcw size={13} /> إلغاء الترحيل
              </button>
            </div>
          ) : (
            <button onClick={onTransfer} disabled={L.faid(ledger) <= 0} className={btnPrimary + ' w-full'}>
              <Send size={15} /> ترحيل نصيب فيض ({fmt(L.faid(ledger))} ر.س) إلى رصيد فيض
            </button>
          )}
          {!transfer && L.faid(ledger) <= 0 && (
            <div className="text-xs text-slate-400 mt-2 text-center">سجّل نصيب فيض أولًا عشان تقدر ترحّله للرصيد.</div>
          )}
        </div>
      )}
    </div>
  );
}

/* شعار فيض الرسمي — العلامة كاملة وعلامة الريشة وحدها، بالأبيض للخلفيات الداكنة. */

/** إطار الشاشة: عرض محدود يشبه الجوال، ويتمدّد على الشاشات الكبيرة. */
function Shell({ children, dark }) {
  return (
    <div dir="rtl" className={`min-h-screen flex flex-col ${dark ? 'bg-brand-900' : 'bg-[#F1F4F9]'}`} style={{ fontFamily: "'Tajawal', sans-serif" }}>
      <div className="w-full max-w-md mx-auto flex-1 flex flex-col">{children}</div>
    </div>
  );
}

function PickHeader({ title, subtitle, onBack }) {
  return (
    <div className="px-5 pt-8 pb-6">
      {onBack && <button onClick={onBack} className="text-slate-400 mb-4 block"><ChevronLeft size={22} className="rotate-180" /></button>}
      <h1 className="text-2xl font-extrabold text-slate-800">{title}</h1>
      {subtitle && <div className="text-sm text-slate-400 mt-1">{subtitle}</div>}
    </div>
  );
}

/** كرت اختيار كبير (سنة، ترم، نوع برنامج، قسم). */
function PickCard({ icon: Icon, title, note, onClick, chevron }) {
  return (
    <button onClick={onClick} className="w-full bg-white rounded-2xl p-4 flex items-center gap-4 text-right hover:shadow-md transition-shadow border border-slate-100">
      <span className="w-11 h-11 rounded-xl bg-brand-50 text-brand-700 flex items-center justify-center shrink-0"><Icon size={21} /></span>
      <span className="flex-1 min-w-0">
        <span className="block font-bold text-slate-800">{title}</span>
        {note && <span className="block text-xs text-slate-400 mt-0.5">{note}</span>}
      </span>
      {chevron && <ChevronLeft size={18} className="text-slate-300 shrink-0" />}
    </button>
  );
}

/** عدّاد + / − للأعداد (عدد الأسابيع، عدد الطلاب). */
function Stepper({ value, onChange, min = 1, max = 60 }) {
  const set = (v) => onChange(Math.min(max, Math.max(min, v)));
  return (
    <div className="flex items-center gap-3">
      <button type="button" onClick={() => set(Number(value || min) - 1)} className="w-11 h-11 rounded-xl bg-slate-100 text-slate-600 font-bold text-xl">−</button>
      <input type="number" value={value} onChange={(e) => set(Number(e.target.value))}
        className="flex-1 text-center text-xl font-extrabold text-slate-800 border border-slate-200 rounded-xl py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-400" />
      <button type="button" onClick={() => set(Number(value || min) + 1)} className="w-11 h-11 rounded-xl bg-brand-600 text-white font-bold text-xl">+</button>
    </div>
  );
}

/** شرائح فلترة أفقية مع عدّاد لكل خيار. */
function FilterChips({ options, value, onChange }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
      {options.map((o) => {
        const on = value === o.id;
        return (
          <button key={o.id} type="button" onClick={() => onChange(o.id)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
              on ? 'bg-brand-700 text-white border-brand-700' : 'bg-white border-slate-200 text-slate-600'}`}>
            {o.label}
            {o.count != null && <span className={`mr-1.5 ${on ? 'text-brand-200' : 'text-slate-400'}`}>{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** وين راحت الفلوس: تجميع حسب البند وحسب المستفيد، مع نسبة كل واحد. */
function FaidAnalysis({ breakdown, onDrill }) {
  const [type, setType] = useState('مصروف');
  const projects = breakdown('project', type);
  const payees = breakdown('payee', type);
  const isExp = type === 'مصروف';
  const bar = isExp ? 'bg-red-400' : 'bg-green-500';
  const money = isExp ? 'text-red-600' : 'text-green-700';

  const Group = ({ title, hint, data: g, keyName }) => (
    <div className={cardCls}>
      <div className="text-sm font-semibold text-slate-700">{title}</div>
      <div className="text-xs text-slate-400 mt-0.5 mb-3">{hint}</div>
      {!g.rows.length ? (
        <div className="text-sm text-slate-400">ما فيه شي موسوم بعد. أضف البند أو المستفيد وأنت تسجّل العملية.</div>
      ) : (
        <div className="space-y-3">
          {g.rows.map((r) => (
            <button key={r.name} onClick={() => onDrill({ [keyName]: r.name, type })} className="w-full text-right group">
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="text-slate-700 font-medium group-hover:text-brand-700">{r.name}</span>
                <span className={`font-bold ${money}`}>{fmt(r.amount)} ر.س</span>
              </div>
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div className={`h-full ${bar} rounded-full`} style={{ width: `${g.total ? (r.amount / g.total) * 100 : 0}%` }} />
              </div>
            </button>
          ))}
          {g.untagged > 0 && (
            <div className="flex items-center justify-between text-xs text-slate-400 pt-1 border-t border-slate-50">
              <span>بدون تصنيف</span>
              <span>{fmt(g.untagged)} ر.س</span>
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-3">
      <FilterChips
        options={[{ id: 'مصروف', label: 'المصروفات' }, { id: 'إيراد', label: 'الإيرادات' }]}
        value={type} onChange={setType} />
      <Group title="حسب البند" hint="على وش انصرفت: برنامج خيركم، رواتب…" data={projects} keyName="project" />
      <Group title="حسب المستفيد" hint="مين استلمها خلال الترم" data={payees} keyName="payee" />
      <div className="text-xs text-slate-400 px-1">اضغط أي اسم عشان تشوف عملياته بالتفصيل.</div>
    </div>
  );
}

/** بنود سفرة بأسماء حرة (أكل، سكن…) مع مجموعها. */
function TripItems({ title, subtitle, items, tone, onAdd, onRemove }) {
  const list = items || [];
  const total = sumAmt(list);
  const color = tone === 'red' ? 'text-red-600' : 'text-green-600';
  return (
    <div className={cardCls}>
      <div className="flex items-start justify-between mb-3 gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-700">{title}</div>
          <div className="text-xs text-slate-400 mt-0.5">{subtitle}</div>
        </div>
        <button onClick={onAdd} className="text-xs text-brand-700 font-semibold flex items-center gap-1 shrink-0 bg-brand-50 px-3 py-1.5 rounded-lg">
          <Plus size={14} /> إضافة
        </button>
      </div>
      {!list.length ? (
        <div className="text-sm text-slate-400">ما فيه بنود بعد.</div>
      ) : (
        <div className="space-y-2">
          {list.map((it) => (
            <div key={it.id} className="flex items-center justify-between text-sm border-b border-slate-50 pb-2 gap-2">
              <span className="text-slate-700 font-medium min-w-0 truncate">{it.name}</span>
              <span className="flex items-center gap-2 shrink-0">
                <span className={`font-semibold ${color}`}>{fmt(it.amount)} ر.س</span>
                <button onClick={() => onRemove(it.id)} className="text-slate-300 hover:text-red-500"><Trash2 size={14} /></button>
              </span>
            </div>
          ))}
          <div className="flex items-center justify-between text-sm pt-1">
            <span className="text-slate-500 font-medium">الإجمالي</span>
            <span className="font-bold text-slate-800">{fmt(total)} ر.س</span>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-4 flex items-center gap-3">
      <span className="w-10 h-10 rounded-xl bg-brand-50 text-brand-700 flex items-center justify-center shrink-0"><Icon size={18} /></span>
      <span className="text-sm text-slate-500 flex-1">{label}</span>
      <span className="font-bold text-slate-800">{value}</span>
    </div>
  );
}

function MiniStat({ label, value, icon: Icon, tone = 'brand' }) {
  const tones = { brand: 'text-brand-700 bg-brand-50', green: 'text-green-700 bg-green-50', red: 'text-red-600 bg-red-50' };
  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-4">
      <span className={`w-9 h-9 rounded-xl flex items-center justify-center mb-2 ${tones[tone]}`}><Icon size={17} /></span>
      <div className="text-lg font-extrabold text-slate-800 truncate">{value}</div>
      <div className="text-[11px] text-slate-400">{label}</div>
    </div>
  );
}

function NavItem({ id, label, icon: Icon, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${active ? 'bg-white text-brand-700' : 'text-brand-100 hover:bg-brand-800/50'}`}
    >
      <Icon size={18} />
      {label}
    </button>
  );
}

function Breadcrumb({ items }) {
  return (
    <div className="flex items-center gap-1.5 text-sm text-slate-400 mb-1 flex-wrap">
      {items.map((it, i) => (
        <React.Fragment key={i}>
          {i > 0 && <ChevronLeft size={14} />}
          <span className={i === items.length - 1 ? 'text-slate-700 font-semibold' : 'hover:text-slate-600 cursor-pointer'} onClick={it.onClick}>{it.label}</span>
        </React.Fragment>
      ))}
    </div>
  );
}

function Tabs({ tabs, value, onChange }) {
  return (
    // تلتف لسطر ثانٍ بدل ما يختفي تبويب برّا الشاشة على الجوال
    <div className="flex flex-wrap gap-1 bg-white rounded-xl p-1 border border-slate-100 mb-5 w-full sm:w-fit">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`px-3 sm:px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap ${value === t.id ? 'bg-brand-600 text-white' : 'text-slate-500 hover:text-slate-700'}`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/* --------------------------------- التطبيق --------------------------------- */

export default function App() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('home');
  const [selectedProgramId, setSelectedProgramId] = useState(null);
  const [selectedWeekId, setSelectedWeekId] = useState(null);
  const [selectedTripId, setSelectedTripId] = useState(null);
  const [selectedCompId, setSelectedCompId] = useState(null);
  const [selectedGuardianId, setSelectedGuardianId] = useState(null);
  const [guardianSearch, setGuardianSearch] = useState('');
  const [weekTab, setWeekTab] = useState('finance');
  const [programTab, setProgramTab] = useState('days');
  const [settingsTab, setSettingsTab] = useState('users');
  const [setupLevel, setSetupLevel] = useState('الكل');
  const [payFilter, setPayFilter] = useState('all');   // فلترة الطلاب حسب طريقة الدفع
  const [faidFilter, setFaidFilter] = useState('الكل'); // فلترة عمليات فيض حسب النوع
  const [faidTab, setFaidTab] = useState('txns');        // العمليات أو التحليل
  const [faidProject, setFaidProject] = useState('');    // فلترة ببند معيّن
  const [faidPayee, setFaidPayee] = useState('');        // فلترة بمستفيد معيّن
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [confirm, setConfirm] = useState(null);
  const [search, setSearch] = useState('');
  const [currentUser, setCurrentUser] = useState(null);
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [stage, setStage] = useState('splash'); // splash → login → year → term → app
  const [savedAt, setSavedAt] = useState(null); // وقت آخر حفظ تلقائي
  const [staleBuild, setStaleBuild] = useState(false); // فيه نسخة أحدث على الخادم
  const [loginError, setLoginError] = useState('');

  /** نقارن نسختنا بالمنشورة عند الفتح وكل ما رجع للتطبيق، وكل خمس دقائق. */
  useEffect(() => {
    let alive = true;
    const check = async () => {
      const published = await publishedBuild();
      if (alive && isStale(runningBuild(), published)) setStaleBuild(true);
    };
    check();
    const t = setInterval(check, 5 * 60 * 1000);
    const onFocus = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onFocus);
    return () => { alive = false; clearInterval(t); document.removeEventListener('visibilitychange', onFocus); };
  }, []);

  useEffect(() => {
    if (!savedAt) return;
    const t = setTimeout(() => setSavedAt(null), 2000);
    return () => clearTimeout(t);
  }, [savedAt]);

  /* ------------------------------- المزامنة ------------------------------- */
  /**
   * وضعان: `cloud` — البيانات على الخادم ويتشاركها الفريق كله؛ و`local` — احتياطي
   * لما يكون الخادم غير متاح، فالتطبيق يظل يشتغل على هذا الجهاز وحده.
   */
  const [cloudMode, setCloudMode] = useState('checking'); // checking | cloud | local
  const [cloudInit, setCloudInit] = useState(false);      // هل أُنشئ حساب المدير الأول؟
  const [syncState, setSyncState] = useState('idle');     // idle | saving | offline
  const sess = useRef({ token: null, username: '' });
  const revRef = useRef(0);
  const baseRef = useRef(null);   // آخر نسخة متفق عليها مع الخادم — مرجع الدمج
  const queueRef = useRef(null);  // آخر حالة تنتظر الحفظ
  const busyRef = useRef(false);
  const cloudOn = cloudMode === 'cloud';

  /** تبنّي نسخة جاية من الخادم كما هي. */
  const adopt = useCallback((serverData, rev) => {
    revRef.current = Number(rev) || 0;
    baseRef.current = clone(serverData);
    setData(migrate(clone(serverData)));
  }, []);

  /**
   * تعديل انقطع عنه النت وأُقفلت الصفحة قبل ما يُحفظ: ندمجه فوق نسخة الخادم
   * ونرسله. لصاحبه فقط — ما ننقل تعديل مستخدم لحساب مستخدم ثاني.
   */
  const resumePending = useCallback((serverData, username) => {
    const pend = readPending();
    if (!pend?.local || pend.username !== username) { clearPending(); return null; }
    const merged = merge3(pend.base, pend.local, serverData);
    queueRef.current = merged;
    return merged;
  }, []);

  useEffect(() => {
    (async () => {
      const st = await api('status');
      if (!st.ok) {
        // ما فيه خادم (تشغيل محلي أو انقطاع): نرجع للتخزين في المتصفح
        setCloudMode('local');
        const raw = await storage.get(STORAGE_KEY);
        try { setData(migrate(raw ? JSON.parse(raw) : defaultData())); } catch { setData(defaultData()); }
        setLoading(false);
        return;
      }
      setCloudMode('cloud');
      setCloudInit(Boolean(st.body?.initialized));

      const saved = readSession();
      if (st.body?.initialized && saved?.token) {
        const r = await api('pull', { token: saved.token, sinceRev: -1 });
        if (r.status === 200 && r.body?.data) {
          sess.current = { token: saved.token, username: saved.username };
          adopt(r.body.data, r.body.rev);
          const pending = resumePending(r.body.data, saved.username);
          if (pending) setData(migrate(clone(pending)));
          const me = ((pending || r.body.data).users || []).find((u) => (u.username || '').toLowerCase() === String(saved.username).toLowerCase());
          if (me) setCurrentUser(me);
          setLoading(false);
          return;
        }
        clearSession(); // التوكن انتهى أو الحساب عُطّل
      }
      // قبل الدخول ما عندنا بيانات — نبدأ بهيكل فاضي عشان تطلع شاشة الدخول
      setData(defaultData());
      setLoading(false);
    })();
  }, [adopt]);

  /** يدفع آخر حالة للخادم، ويدمج لو أحد ثاني سبقنا. */
  const flush = useCallback(async () => {
    if (busyRef.current || !queueRef.current || !sess.current.token) return;
    busyRef.current = true;
    let payload = queueRef.current;
    queueRef.current = null;
    setSyncState('saving');
    try {
      for (let attempt = 0; attempt < 4; attempt++) {
        const r = await api('push', { token: sess.current.token, baseRev: revRef.current, data: payload });
        if (r.status === 200) {
          revRef.current = r.body.rev;
          baseRef.current = clone(payload);
          clearPending();
          setData(payload);
          setSavedAt(Date.now());
          setSyncState('idle');
          break;
        }
        if (r.status === 409 && r.body?.data) {
          // أحد حفظ قبلي: أدمج شغلي فوق نسخته بدل ما أطمسها
          payload = merge3(baseRef.current, payload, r.body.data);
          revRef.current = r.body.rev;
          baseRef.current = clone(r.body.data);
          continue;
        }
        if (r.status === 401) { clearSession(); sess.current = { token: null, username: '' }; setCurrentUser(null); setSyncState('idle'); break; }
        throw new Error('push_failed');
      }
    } catch {
      // ما وصل: نحتفظ بالتعديل في الجهاز ونعيد المحاولة — حتى لو أُقفلت الصفحة
      queueRef.current = queueRef.current || payload;
      writePending(sess.current.username, baseRef.current, queueRef.current);
      setSyncState('offline');
    } finally {
      busyRef.current = false;
    }
  }, []);

  // إعادة محاولة دورية للحفظ المعلّق + سحب تعديلات الزملاء
  useEffect(() => {
    if (!cloudOn || !sess.current.token) return;
    const t = setInterval(async () => {
      if (queueRef.current) { flush(); return; }
      if (busyRef.current) return;
      const r = await api('pull', { token: sess.current.token, sinceRev: revRef.current });
      if (r.status === 200 && r.body?.data) { adopt(r.body.data, r.body.rev); setSyncState('idle'); }
      else if (r.status === 200) setSyncState('idle');
      else if (r.status === 0) setSyncState('offline');
    }, 7000);
    return () => clearInterval(t);
  }, [cloudOn, currentUser, flush, adopt]);

  /** حفظ تلقائي: كل تعديل ينحفظ فورًا، ما فيه زر حفظ. */
  const save = useCallback(async (next) => {
    setData(next);
    if (!cloudOn) {
      await storage.set(STORAGE_KEY, JSON.stringify(next));
      setSavedAt(Date.now());
      return;
    }
    queueRef.current = next;
    flush();
  }, [cloudOn, flush]);

  if (loading || !data) {
    return <div dir="rtl" className="min-h-screen flex items-center justify-center text-slate-400" style={{ fontFamily: "'Tajawal', sans-serif" }}>جاري التحميل...</div>;
  }

  const termKey = `${data.currentYear}-${data.currentTerm}`;
  const allTermPrograms = data.programs.filter((p) => p.termKey === termKey);
  const program = data.programs.find((p) => p.id === selectedProgramId);
  const week = program?.weeks.find((w) => w.id === selectedWeekId);
  const trip = data.trips.find((t) => t.id === selectedTripId);
  const competition = data.competitions.find((c) => c.id === selectedCompId);
  const isGrouped = program?.type === 'مجمع';

  /** الدفتر المالي الفعّال + مرجعه: البرنامج المجمّع يحسب على مستوى البرنامج، والمنفصل على مستوى الأسبوع. */
  const activeLedger = isGrouped ? program : week;
  const activeRef = isGrouped
    ? { kind: 'program', programId: program?.id }
    : { kind: 'week', programId: program?.id, weekId: week?.id };
  const ledgerLocked = (isGrouped ? program?.status : week?.status) === 'مغلق';

  /* ------------------------------ حسابات فيض ------------------------------ */
  /**
   * التحويل للاستثمار حركة داخلية: الفلوس تطلع من الحساب فينقص رصيده، لكنها
   * ما هي مصروفًا ولا إيرادًا — فما تدخل «إجمالي المصروفات» ولا التقارير،
   * وإلا صار الادخار يبان كأنه صرف.
   */
  const isInvestmentMove = (a) => a.kind === 'investment';

  const accountStats = data.faidAccounts.map((acc) => {
    let rev = 0, exp = 0, moved = 0;
    data.faidAdjustments.filter((a) => a.accountId === acc.id).forEach((a) => {
      const amt = Number(a.amount || 0);
      if (isInvestmentMove(a)) { moved += a.type === 'إيراد' ? -amt : amt; return; }
      if (a.type === 'إيراد') rev += amt; else exp += amt;
    });
    // `moved` موجب = طلع للاستثمار، وسالب = رجع منه
    return { ...acc, revenue: rev, expenses: exp, invested: moved, balance: rev - exp - moved };
  });
  const totalRevenue = accountStats.reduce((s, a) => s + a.revenue, 0);
  const totalExpenses = accountStats.reduce((s, a) => s + a.expenses, 0);
  /** رصيد الفريق المتاح — ما يشمل المحوَّل للاستثمار، لأنه خرج من الحسابات. */
  const balance = accountStats.reduce((s, a) => s + a.balance, 0);
  /** رصيد الاستثمار: مجموع اللي دخله ناقص اللي رجع منه. */
  const investmentBalance = accountStats.reduce((s, a) => s + a.invested, 0);

  // العمليات المقسّمة على أكثر من حساب تُعرض بسطر واحد، ورصيد كل حساب يبقى محسوبًا من العمليات الأصلية.
  const faidTransactions = (() => {
    const withNames = data.faidAdjustments.map((a) => ({ ...a, accountName: data.faidAccounts.find((acc) => acc.id === a.accountId)?.name || '-' }));
    const grouped = [];
    const seenBatches = new Set();
    withNames.forEach((a) => {
      if (a.batchId) {
        if (seenBatches.has(a.batchId)) return;
        seenBatches.add(a.batchId);
        const parts = withNames.filter((x) => x.batchId === a.batchId);
        grouped.push({
          id: a.batchId, batchId: a.batchId, date: a.date, type: a.type, note: a.note, source: a.source,
          project: a.project, payee: a.payee,
          amount: sumAmt(parts),
          accountName: parts.map((x) => `${x.accountName} ${fmt(x.amount)}`).join(' + '),
        });
      } else {
        grouped.push(a);
      }
    });
    return grouped.sort((x, y) => (y.date || '').localeCompare(x.date || ''));
  })();

  const shownFaid = faidTransactions.filter((t) =>
    (faidFilter === 'الكل' || t.type === faidFilter)
    && (!faidProject || (t.project || '').trim() === faidProject)
    && (!faidPayee || (t.payee || '').trim() === faidPayee));

  /** يفتح العمليات مفلترة على بند أو مستفيد. */
  const drillFaid = ({ project = '', payee = '', type }) => {
    setFaidProject(project); setFaidPayee(payee);
    if (type) setFaidFilter(type);
    setFaidTab('txns');
  };
  const clearFaidDrill = () => { setFaidProject(''); setFaidPayee(''); };

  const goto = (v) => { setView(v); setModal(null); setSearch(''); setPayFilter('all'); };
  const closeModal = () => { setModal(null); setForm({}); };
  /** نص زر الموافقة يوصف الفعل نفسه — «نعم، احذف» ما تصلح لتأكيد استلام مبلغ. */
  const askConfirm = (text, onYes, yes = 'نعم، احذف') => setConfirm({ text, onYes, yes });

  /* --------------------------- تعديل الدفاتر --------------------------- */

  /** يرجّع نسخة جديدة من البيانات بعد تعديل دفتر محدد (بدون حفظ). */
  const withLedger = (base, ref, updater) => ({
    ...base,
    programs: base.programs.map((p) => {
      if (p.id !== ref.programId) return p;
      if (ref.kind === 'program') return { ...p, ...updater(p) };
      return { ...p, weeks: p.weeks.map((w) => (w.id !== ref.weekId ? w : { ...w, ...updater(w) })) };
    }),
  });
  const patchLedger = (ref, updater) => save(withLedger(data, ref, updater));

  const addLedgerItem = (key) => {
    // كان الزر ما يسوي شيئًا بصمت لو نسي يختار الحساب
    if (!form.accountId) { setForm({ ...form, error: 'اختر الحساب' }); return; }
    if (!(Number(form.amount) > 0)) { setForm({ ...form, error: 'اكتب المبلغ' }); return; }
    patchLedger(activeRef, (l) => ({ [key]: [...(l[key] || []), { id: uid(), accountId: form.accountId, amount: Number(form.amount), note: form.note || '' }] }));
    closeModal();
  };
  const removeLedgerItem = (key, itemId) =>
    patchLedger(activeRef, (l) => ({ [key]: (l[key] || []).filter((x) => x.id !== itemId) }));

  const distributeRestToFaid = () => {
    const rest = L.remaining(activeLedger);
    if (rest <= 0) return;
    patchLedger(activeRef, (l) => ({
      faidPayouts: [...(l.faidPayouts || []), { id: uid(), accountId: data.faidAccounts[0]?.id, amount: rest, note: 'الباقي بعد نصيب المدرسة' }],
    }));
  };

  /* ------------------------------ المشاركون ------------------------------ */
  const addParticipant = () => {
    if (!form.name?.trim()) { setForm({ ...form, error: 'اكتب اسم الطالب' }); return; }
    const accountId = form.accountId || data.faidAccounts[0]?.id;
    // في المجمّع لازم يكون مسجّل بيوم واحد على الأقل؛ في المنفصل ما فيه أيام أصلًا.
    if (isGrouped && !(form.days || []).length) { setForm({ ...form, error: 'اختر يوم واحد على الأقل' }); return; }
    patchLedger(activeRef, (l) => {
      const patch = {
        participants: [...(l.participants || []), {
          id: uid(), name: form.name.trim(),
          amount: accountId === 'unpaid' ? 0 : Number(form.amount || 0),
          accountId, attendance: 'معلق',
          // الربط بسجلّ الطالب هو اللي يخلّي تاريخه عبر المواسم يتجمّع في مكان واحد
          ...(form.studentId ? { studentId: form.studentId } : {}),
          ...(isGrouped ? { days: form.days } : {}),
        }],
      };
      // أول اسم يُسجَّل في يوم «سريع» يحوّله للأسماء، والمبلغ المسجّل سابقًا
      // ينتقل لبند تحصيل إضافي حتى ما يضيع من الحساب
      if (isQuick(l)) Object.assign(patch, quickToNamed(l));
      return patch;
    });
    setSearch(''); // عشان الجديد يبان فورًا لو كان فيه بحث شغّال
    closeModal();
  };
  const saveParticipantEdit = () => {
    if (!form.name?.trim() || !form.id) { setForm({ ...form, error: 'اكتب اسم الطالب' }); return; }
    const accountId = form.accountId;
    if (isGrouped && !(form.days || []).length) { setForm({ ...form, error: 'اختر يوم واحد على الأقل' }); return; }
    patchLedger(activeRef, (l) => ({
      participants: (l.participants || []).map((p) => (p.id !== form.id ? p : {
        ...p, name: form.name.trim(), accountId, amount: accountId === 'unpaid' ? 0 : Number(form.amount || 0),
        // التعديل يقدر يربط تسجيلًا قديمًا بسجلّ الطالب، أو يفك الربط
        studentId: form.studentId || undefined,
        ...(isGrouped ? { days: form.days } : {}),
      })),
    }));
    closeModal();
  };
  /** تحويل يوم من التسجيل السريع للأسماء بدون ما يضيع المبلغ المسجّل. */
  const quickToNamed = (l) => {
    const rev = Number(l.quickRevenue || 0);
    return {
      mode: 'named', quickCount: 0, quickRevenue: 0,
      ...(rev > 0
        ? { collections: [...(l.collections || []), { id: uid(), accountId: data.faidAccounts[0]?.id, amount: rev, note: 'تحصيل من التسجيل السريع' }] }
        : {}),
    };
  };

  /** أيام البرنامج المجمّع في مودال المشترك، مع اقتراح المبلغ من سعر اليوم إن وُجد. */
  const toggleParticipantDay = (weekId) => {
    const cur = form.days || [];
    const days = cur.includes(weekId) ? cur.filter((d) => d !== weekId) : [...cur, weekId];
    const price = Number(program?.dayPrice || 0);
    // نقترح المبلغ تلقائيًا ما دام المستخدم ما كتبه بنفسه
    const amount = price > 0 && !form.amountTouched ? days.length * price : form.amount;
    setForm({ ...form, days, amount, error: '' });
  };
  const toggleAllParticipantDays = (selectAll) => {
    const days = selectAll ? (program?.weeks || []).map((w) => w.id) : [];
    const price = Number(program?.dayPrice || 0);
    const amount = price > 0 && !form.amountTouched ? days.length * price : form.amount;
    setForm({ ...form, days, amount, error: '' });
  };
  const removeParticipant = (pid) =>
    patchLedger(activeRef, (l) => ({ participants: (l.participants || []).filter((p) => p.id !== pid) }));

  /** الحضور: المنفصل يخزّنه على المشارك، والمجمّع في خريطة attendance[weekId][participantId]. */
  const attendanceOf = (p, weekId) =>
    (isGrouped ? program?.attendance?.[weekId]?.[p.id] : p.attendance) || 'معلق';

  const setAttendance = (pid, status, weekId = selectedWeekId) => {
    if (isGrouped) {
      patchLedger({ kind: 'program', programId: program.id }, (p) => ({
        attendance: { ...(p.attendance || {}), [weekId]: { ...((p.attendance || {})[weekId] || {}), [pid]: status } },
      }));
    } else {
      patchLedger(activeRef, (l) => ({
        participants: (l.participants || []).map((x) => (x.id !== pid ? x : { ...x, attendance: status })),
      }));
    }
  };
  const markAll = (status, list, weekId = selectedWeekId) => {
    if (isGrouped) {
      patchLedger({ kind: 'program', programId: program.id }, (p) => {
        const dayMap = { ...((p.attendance || {})[weekId] || {}) };
        list.forEach((x) => { dayMap[x.id] = status; });
        return { attendance: { ...(p.attendance || {}), [weekId]: dayMap } };
      });
    } else {
      const ids = new Set(list.map((x) => x.id));
      patchLedger(activeRef, (l) => ({
        participants: (l.participants || []).map((x) => (ids.has(x.id) ? { ...x, attendance: status } : x)),
      }));
    }
  };

  /* -------------------------- الترحيل إلى فيض -------------------------- */
  const doTransferFaid = () => {
    const amount = L.faid(activeLedger);
    if (amount <= 0) return;
    const rows = form.splitMode
      ? (form.splitRows || []).filter((r) => r.accountId && Number(r.amount) > 0)
      : (form.accountId ? [{ accountId: form.accountId, amount }] : []);
    if (!rows.length) return;
    if (sumAmt(rows) !== amount) { setForm({ ...form, error: `مجموع التقسيم لازم يساوي ${fmt(amount)} ر.س` }); return; }

    const batchId = uid();
    const label = isGrouped ? program.name : `${program.name} - ${week.name}`;
    const source = { ...activeRef, label };
    const txns = rows.map((r) => ({
      id: uid(), batchId, source, accountId: r.accountId, project: program.name,
      date: form.date || (isGrouped ? '' : week?.date) || '',
      type: 'إيراد', amount: Number(r.amount),
      note: form.note || `نصيب فيض - ${label}`,
    }));
    let next = { ...data, faidAdjustments: [...data.faidAdjustments, ...txns] };
    next = withLedger(next, activeRef, () => ({ faidTransfer: { batchId, amount, date: txns[0].date } }));
    save(next);
    closeModal();
  };

  const undoTransfer = (ref, batchId) => {
    let next = { ...data, faidAdjustments: data.faidAdjustments.filter((a) => a.batchId !== batchId) };
    next = withLedger(next, ref, () => ({ faidTransfer: null }));
    save(next);
  };

  const deleteFaidTxn = (t) => {
    const next0 = {
      ...data,
      faidAdjustments: data.faidAdjustments.filter((a) => (t.batchId ? a.batchId !== t.batchId : a.id !== t.id)),
    };
    // لو العملية مرحّلة من برنامج، نفكّ علامة الترحيل عن دفتره عشان يقدر يرحّل من جديد
    save(t.source ? withLedger(next0, t.source, () => ({ faidTransfer: null })) : next0);
  };

  /* ------------------------------ عمليات فيض ------------------------------ */
  const addFaidAdjustment = () => {
    // البند = على وش صُرف (برنامج خيركم، رواتب…)، المستفيد = لمين راح (فهد، عبدالعزيز)
    const tags = { project: (form.project || '').trim(), payee: (form.payee || '').trim() };
    if (form.splitMode) {
      const rows = (form.splitRows || []).filter((r) => r.accountId && Number(r.amount) > 0);
      if (!rows.length) { setForm({ ...form, error: 'اكتب حسابًا ومبلغًا في سطر واحد على الأقل' }); return; }
      const batchId = uid();
      const txns = rows.map((r) => ({ id: uid(), batchId, accountId: r.accountId, date: form.date || '', type: form.type || 'إيراد', amount: Number(r.amount), note: form.note || '', ...tags }));
      save({ ...data, faidAdjustments: [...data.faidAdjustments, ...txns] });
      closeModal();
      return;
    }
    // كان الزر ما يسوي شيئًا بصمت لو نسي يختار الحساب
    if (!form.accountId) { setForm({ ...form, error: 'اختر الحساب' }); return; }
    if (!(Number(form.amount) > 0)) { setForm({ ...form, error: 'اكتب المبلغ' }); return; }
    save({ ...data, faidAdjustments: [...data.faidAdjustments, { id: uid(), accountId: form.accountId, date: form.date || '', type: form.type || 'إيراد', amount: Number(form.amount), note: form.note || '', ...tags }] });
    closeModal();
  };

  /**
   * تحويل بين حساب والاستثمار. نسجّله كعملية على الحساب عشان رصيده ينقص
   * (أو يزيد) طبيعيًا ويظهر في سجلّه، ومعلَّمة `investment` عشان ما تُحسب
   * صرفًا ولا دخلًا في التقارير.
   */
  const moveInvestment = () => {
    const amount = Number(form.amount || 0);
    const dir = form.dir || 'in';
    if (!(amount > 0)) { setForm({ ...form, error: 'اكتب المبلغ' }); return; }
    if (!form.accountId) { setForm({ ...form, error: 'اختر الحساب' }); return; }

    const acc = accountStats.find((a) => a.id === form.accountId);
    if (dir === 'in' && amount > acc.balance) {
      setForm({ ...form, error: `رصيد «${acc.name}» ${fmt(acc.balance)} ر.س فقط` });
      return;
    }
    if (dir === 'out' && amount > investmentBalance) {
      setForm({ ...form, error: `رصيد الاستثمار ${fmt(investmentBalance)} ر.س فقط` });
      return;
    }

    save({
      ...data,
      faidAdjustments: [...data.faidAdjustments, {
        id: uid(), accountId: form.accountId, date: form.date || '',
        // «مصروف» على الحساب = طلعت منه للاستثمار، و«إيراد» = رجعت له
        type: dir === 'in' ? 'مصروف' : 'إيراد',
        amount, kind: 'investment',
        note: (form.note || '').trim() || (dir === 'in' ? 'تحويل للاستثمار' : 'سحب من الاستثمار'),
      }],
    });
    closeModal();
  };

  /** القيم المستخدمة سابقًا تُقترح عند الكتابة عشان الأسماء تتوحّد. */
  const faidValues = (key) => [...new Set(data.faidAdjustments.map((a) => (a[key] || '').trim()).filter(Boolean))].sort();

  /** تجميع المصروفات أو الإيرادات حسب البند أو المستفيد. */
  const faidBreakdown = (key, type) => {
    const totals = new Map();
    data.faidAdjustments.filter((a) => a.type === type && (a[key] || '').trim()).forEach((a) => {
      const k = a[key].trim();
      totals.set(k, (totals.get(k) || 0) + Number(a.amount || 0));
    });
    const untagged = data.faidAdjustments.filter((a) => a.type === type && !(a[key] || '').trim())
      .reduce((sy, a) => sy + Number(a.amount || 0), 0);
    const rows = [...totals.entries()].map(([name, amount]) => ({ name, amount })).sort((x, y) => y.amount - x.amount);
    return { rows, untagged, total: rows.reduce((sy, r) => sy + r.amount, 0) + untagged };
  };
  const updateSplitRow = (idx, patch) => {
    const rows = [...(form.splitRows || [{}, {}])];
    rows[idx] = { ...rows[idx], ...patch };
    setForm({ ...form, splitRows: rows, error: '' });
  };
  const addSplitRow = () => setForm({ ...form, splitRows: [...(form.splitRows || [{}, {}]), {}] });
  const removeSplitRow = (idx) => setForm({ ...form, splitRows: (form.splitRows || []).filter((_, i) => i !== idx) });

  const addFaidAccount = () => {
    if (!form.value) return;
    save({ ...data, faidAccounts: [...data.faidAccounts, { id: uid(), name: form.value.trim() }] });
    closeModal();
  };
  const removeFaidAccount = (accId) => {
    save({ ...data, faidAccounts: data.faidAccounts.filter((a) => a.id !== accId) });
  };
  const accountInUse = (accId) =>
    data.faidAdjustments.some((a) => a.accountId === accId) ||
    data.programs.some((p) => [p, ...p.weeks].some((l) =>
      ['participants', 'collections', 'expenseItems', 'schoolPayouts', 'faidPayouts'].some((k) => (l[k] || []).some((x) => x.accountId === accId))));

  /* ------------------------- البرامج والأسابيع ------------------------- */
  const addProgram = () => {
    if (!form.name?.trim()) { setForm({ ...form, error: 'اكتب اسم البرنامج' }); return; }
    const type = form.type || 'منفصل';
    const count = Math.max(0, Math.min(60, Number(form.weekCount || 0)));
    const unit = type === 'مجمع' ? 'اليوم' : 'الأسبوع';
    // ننشئ الأيام/الأسابيع دفعة وحدة بدل ما يضيفها وحدة وحدة
    const weeks = Array.from({ length: count }, (_, i) => ({
      id: uid(), name: `${unit} ${ORDINALS[i] || i + 1}`, date: '', status: 'مفتوح',
      ...emptyLedger('named'),
    }));
    const id = uid();
    save({ ...data, programs: [...data.programs, { id, name: form.name.trim(), type, termKey, status: 'مفتوح', dayPrice: Number(form.dayPrice || 0), weeks, attendance: {}, ...emptyLedger('named') }] });
    setSelectedProgramId(id); setProgramTab('days'); goto('programDetail');
    setForm({});
  };
  const patchProgram = (patch) => save({ ...data, programs: data.programs.map((p) => (p.id !== selectedProgramId ? p : { ...p, ...patch })) });
  const removeProgram = (pid) => {
    save({ ...data, programs: data.programs.filter((p) => p.id !== pid) });
    goto('programs');
  };
  const addWeek = () => {
    if (!form.name?.trim()) { setForm({ ...form, error: 'اكتب اسم اليوم' }); return; }
    patchLedger({ kind: 'program', programId: selectedProgramId }, (p) => ({
      weeks: [...p.weeks, { id: uid(), name: form.name.trim(), date: form.date || '', status: 'مفتوح',
        ...emptyLedger('named') }],
    }));
    closeModal();
  };
  const patchWeek = (patch) => patchLedger({ kind: 'week', programId: selectedProgramId, weekId: selectedWeekId }, () => patch);
  const removeWeek = (weekId) => {
    patchLedger({ kind: 'program', programId: selectedProgramId }, (p) => {
      const attendance = { ...(p.attendance || {}) };
      delete attendance[weekId];
      return {
        weeks: p.weeks.filter((w) => w.id !== weekId),
        attendance,
        // نشيل اليوم المحذوف من تسجيلات المشتركين عشان ما يبقى مرجع ميّت
        participants: (p.participants || []).map((x) => (x.days ? { ...x, days: x.days.filter((d) => d !== weekId) } : x)),
      };
    });
    if (selectedWeekId === weekId) goto('programDetail');
  };

  /* --------------------------- بقية الكيانات --------------------------- */
  const saveUser = async () => {
    const username = (form.username || '').trim().toLowerCase();
    if (!form.name || !username) { setForm({ ...form, error: 'الاسم واسم المستخدم مطلوبين' }); return; }
    if (!/^[a-z0-9._-]{3,}$/.test(username)) { setForm({ ...form, error: 'اسم المستخدم: حروف إنجليزية وأرقام، ٣ خانات على الأقل' }); return; }
    if (data.users.some((u) => u.username === username && u.id !== form.id)) { setForm({ ...form, error: 'اسم المستخدم هذا مستخدم من قبل' }); return; }
    if (!form.id && !form.password) { setForm({ ...form, error: 'اكتب كلمة مرور' }); return; }

    // أول حساب في التطبيق لازم يكون مديرًا (حساب صاحب التطبيق)، وإلا انقفل بره
    const forceAdmin = !form.id && data.users.length === 0;
    const fields = {
      name: form.name.trim(), username, role: forceAdmin ? 'مدير' : (form.role || ROLES[0]),
      permissions: form.permissions || [], accessScope: form.accessScope || 'all', allowedWeeks: form.allowedWeeks || [],
    };
    if (form.id) {
      // كلمة المرور تتغيّر فقط لو كتب وحدة جديدة
      save({ ...data, users: data.users.map((u) => (u.id !== form.id ? u : { ...u, ...fields, ...(form.password ? { password: form.password } : {}) })) });
    } else {
      const created = { id: uid(), ...fields, password: form.password, status: 'نشط' };
      if (modal === 'rescueAdmin') created.role = 'مدير';

      // أول حساب على الخادم: ينشئ المخزن المشترك ويفتح الجلسة مباشرة
      if (needsFirstAdmin) {
        created.role = 'مدير';
        const r = await api('init', { user: created, data: { ...defaultData(), users: [] } });
        if (r.status !== 200 || !r.body?.data) {
          setForm({ ...form, error: r.status === 409 ? 'فيه حساب مُنشأ من قبل — سجّل دخولك.' : 'ما قدرت أوصل للخادم. تأكد من الإنترنت.' });
          return;
        }
        sess.current = { token: r.body.token, username };
        writeSession(sess.current);
        setCloudInit(true);
        adopt(r.body.data, r.body.rev);
        setCurrentUser((r.body.data.users || [])[0] || null);
        setStage('app');
        closeModal();
        return;
      }

      save({ ...data, users: [...data.users, created] });
      // أول حساب (أو حساب الإنقاذ) ندخّله على طول، بدل ما نطرد صاحبه لشاشة الدخول
      if (modal === 'rescueAdmin' || (forceAdmin && !currentUser)) { setCurrentUser(created); setStage('app'); }
    }
    closeModal();
  };
  const isLastAdmin = (userId) => {
    const u = data.users.find((x) => x.id === userId);
    return u?.role === 'مدير' && u.status === 'نشط' && activeAdmins.length === 1;
  };
  const toggleUserStatus = (userId) => {
    if (isLastAdmin(userId)) { setConfirm({ text: 'هذا آخر حساب مدير نشط. لو عطّلته ما راح يقدر أحد يدخل الإعدادات. أنشئ مديرًا ثانيًا أول.', onYes: null }); return; }
    save({ ...data, users: data.users.map((u) => (u.id !== userId ? u : { ...u, status: u.status === 'نشط' ? 'غير نشط' : 'نشط' })) });
  };
  const removeUser = (userId) => {
    if (isLastAdmin(userId)) { setConfirm({ text: 'هذا آخر حساب مدير نشط، وما ينحذف. أنشئ مديرًا ثانيًا أول.', onYes: null }); return; }
    save({ ...data, users: data.users.filter((u) => u.id !== userId) });
  };

  const saveCompetition = () => {
    if (!form.name?.trim()) { setForm({ ...form, error: 'اكتب اسم المسابقة' }); return; }
    const fields = {
      name: form.name.trim(), level: form.level || LEVELS[0], date: form.date || '',
      participants: Number(form.participants || 0), idea: form.idea || '',
      tools: form.tools || [], photos: form.photos || [],
    };
    save({
      ...data,
      competitions: form.id
        ? data.competitions.map((c) => (c.id !== form.id ? c : { ...c, ...fields }))
        : [...data.competitions, { id: uid(), ...fields }],
    });
    closeModal();
  };
  const removeCompetition = (cid) => save({ ...data, competitions: data.competitions.filter((c) => c.id !== cid) });

  /** أدوات المسابقة: اسم الأداة وكميتها (أقماع ٦، كورة ٢…). */
  const addTool = () => {
    const name = (form.toolName || '').trim();
    if (!name) return;
    setForm({ ...form, tools: [...(form.tools || []), { id: uid(), name, qty: Number(form.toolQty || 1) }], toolName: '', toolQty: '' });
  };
  const removeTool = (id) => setForm({ ...form, tools: (form.tools || []).filter((t) => t.id !== id) });

  /** الصور تُصغَّر قبل الحفظ لأن التخزين محلي ومحدود. */
  const addPhotos = async (files) => {
    const shrink = (file) => new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const max = 1000;
          const scale = Math.min(1, max / Math.max(img.width, img.height));
          const c = document.createElement('canvas');
          c.width = Math.round(img.width * scale);
          c.height = Math.round(img.height * scale);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          resolve(c.toDataURL('image/jpeg', 0.72));
        };
        img.onerror = () => resolve(null);
        img.src = reader.result;
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
    const added = [];
    for (const f of Array.from(files).slice(0, 6)) {
      const src = await shrink(f);
      if (src) added.push({ id: uid(), src });
    }
    setForm((prev) => ({ ...prev, photos: [...(prev.photos || []), ...added] }));
  };
  const removePhoto = (id) => setForm({ ...form, photos: (form.photos || []).filter((p) => p.id !== id) });

  const addTrip = () => {
    if (!form.name) return;
    save({ ...data, trips: [...data.trips, { id: uid(), name: form.name.trim(), date: form.date || '', incomeItems: [], expenseItems: [] }] });
    closeModal();
  };
  const patchTrip = (patch) => save({ ...data, trips: data.trips.map((t) => (t.id !== selectedTripId ? t : { ...t, ...patch })) });
  /** بنود السفرة: كل بند باسمه ومبلغه، عشان تعرف كل سفرة وين راحت فلوسها. */
  const addTripItem = (key) => {
    if (!form.name?.trim()) { setForm({ ...form, error: 'اكتب اسم البند' }); return; }
    patchTrip({ [key]: [...(trip[key] || []), { id: uid(), name: form.name.trim(), amount: Number(form.amount || 0) }] });
    closeModal();
  };
  const removeTripItem = (key, itemId) => patchTrip({ [key]: (trip[key] || []).filter((x) => x.id !== itemId) });
  const removeTrip = (tid) => { save({ ...data, trips: data.trips.filter((t) => t.id !== tid) }); goto('trips'); };

  /* --------------------------- رابط التسجيل --------------------------- */

  const patchSignup = (patch) => save({
    ...data,
    programs: data.programs.map((p) => (p.id !== program.id ? p
      : { ...p, signup: { ...emptySignup(), ...(p.signup || {}), ...patch } })),
  });

  /** أول فتح يولّد الرمز ويقترح إعدادات معقولة بدل ما يبدأ من فراغ. */
  const toggleSignup = () => {
    const s = { ...emptySignup(), ...(program.signup || {}) };
    if (s.enabled) { patchSignup({ enabled: false }); return; }
    patchSignup({
      enabled: true,
      token: s.token || makeSignupToken(),
      price: s.price || (program.type === 'مجمع' ? program.dayPrice || '' : ''),
      allowPerDay: s.allowPerDay !== false,
      openWeeks: s.openWeeks?.length ? s.openWeeks : (program.weeks || []).map((w) => w.id),
      accounts: s.accounts?.length ? s.accounts : data.faidAccounts.map((a) => a.id),
    });
  };

  const regenerateToken = () => { patchSignup({ token: makeSignupToken() }); closeModal(); };

  /** التسجيلات اللي تنتظر تأكيد وصول مبلغها، عبر البرنامج وأسابيعه. */
  const signupPending = (p) => {
    const out = [];
    for (const part of p.participants || []) {
      if (part.pending) out.push({ part, where: 'البرنامج', weekId: null });
    }
    for (const w of p.weeks || []) {
      for (const part of w.participants || []) {
        if (part.pending) out.push({ part, where: w.name, weekId: w.id });
      }
    }
    return out;
  };

  /** التأكيد يعني: الفلوس وصلت الحساب فعلًا. عندها فقط يدخل الإيراد. */
  const clearPendingFlag = (pred) => save({
    ...data,
    programs: data.programs.map((p) => {
      if (p.id !== program.id) return p;
      const fix = (part) => (pred(part) ? { ...part, pending: false, confirmedAt: Date.now() } : part);
      return {
        ...p,
        participants: (p.participants || []).map(fix),
        weeks: (p.weeks || []).map((w) => ({ ...w, participants: (w.participants || []).map(fix) })),
      };
    }),
  });

  const confirmPending = (partId) => clearPendingFlag((part) => part.id === partId);
  const confirmAllPending = () => { clearPendingFlag((part) => !!part.pending); closeModal(); };

  const savePackage = () => {
    const name = (form.name || '').trim();
    const price = Number(form.price || 0);
    const dayCount = Number(form.dayCount || 0);
    if (!name) { setForm({ ...form, error: 'اكتب اسم الباقة' }); return; }
    if (!(price > 0)) { setForm({ ...form, error: 'اكتب سعر الباقة' }); return; }
    const open = ((program.signup || {}).openWeeks || []).length;
    if (dayCount < 0 || dayCount > open) {
      setForm({ ...form, error: `عدد الأيام لازم يكون بين صفر و${open} — هذي الأيام اللي فتحتها للتسجيل` });
      return;
    }
    patchSignup({ packages: [...((program.signup || {}).packages || []), { id: uid(), name, price, dayCount }] });
    closeModal();
  };

  const saveSignupField = () => {
    const label = (form.label || '').trim();
    if (!label) { setForm({ ...form, error: 'اكتب نص السؤال' }); return; }
    const options = (form.options || '').split(/[,،\n]/).map((s) => s.trim()).filter(Boolean);
    if (form.type === 'choice' && options.length < 2) { setForm({ ...form, error: 'اكتب خيارين على الأقل، بينهما فاصلة' }); return; }
    const field = { id: `f_${uid()}`, label, type: form.type || 'text', required: !!form.required, ...(form.type === 'choice' ? { options } : {}) };
    if (form.scope === 'program') {
      patchSignup({ extraFields: [...((program.signup || {}).extraFields || []), field] });
    } else {
      save({ ...data, signupFields: [...data.signupFields, field] });
    }
    closeModal();
  };

  /* --------------------------- أولياء الأمور --------------------------- */

  /** كل تسجيلات طالب عبر المواسم كلها — من البرنامج المجمّع أو من أسابيع المنفصل. */
  const historyOf = (studentId) => {
    const out = [];
    for (const p of data.programs || []) {
      for (const part of p.participants || []) {
        if (part.studentId === studentId) out.push({ program: p, week: null, part });
      }
      for (const w of p.weeks || []) {
        for (const part of w.participants || []) {
          if (part.studentId === studentId) out.push({ program: p, week: w, part });
        }
      }
    }
    return out;
  };

  /** ملخّص ولي أمر: أبناؤه، وكم تسجيلًا لهم، وكم دفع فعلًا عبر المواسم. */
  const guardianSummary = (g) => {
    const kids = studentsOf(data.students, g.id);
    const regs = kids.flatMap((k) => historyOf(k.id));
    const paid = regs
      .filter((r) => r.part.accountId !== 'unpaid' && !r.part.pending)
      .reduce((s, r) => s + Number(r.part.amount || 0), 0);
    return { kids, regs, paid };
  };

  const saveGuardian = () => {
    const name = (form.name || '').trim();
    const phone = (form.phone || '').trim();
    if (!name) { setForm({ ...form, error: 'الاسم مطلوب' }); return; }
    if (!isValidPhone(phone)) { setForm({ ...form, error: 'رقم جوال غير صحيح — مثال: 0551234567' }); return; }
    const clash = data.guardians.find((g) => normalizePhone(g.phone) === normalizePhone(phone) && g.id !== form.id);
    if (clash) { setForm({ ...form, error: `هذا الجوال مسجّل باسم «${clash.name}»` }); return; }

    const fields = { name, phone: normalizePhone(phone), notes: (form.notes || '').trim() };
    if (form.id) {
      save({ ...data, guardians: data.guardians.map((g) => (g.id === form.id ? { ...g, ...fields } : g)) });
    } else {
      const created = { id: uid(), ...fields, altPhone: '', createdAt: Date.now(), lastSeenAt: Date.now() };
      save({ ...data, guardians: [...data.guardians, created] });
      // نفتح صفحته على طول — الخطوة الطبيعية بعدها إضافة أبنائه
      setSelectedGuardianId(created.id);
      goto('guardianDetail');
    }
    closeModal();
  };

  const removeGuardian = (gid) => {
    save({
      ...data,
      guardians: data.guardians.filter((g) => g.id !== gid),
      students: data.students.filter((s) => s.guardianId !== gid),
    });
    goto('guardians');
  };

  /**
   * إضافة مشترك من شاشة واحدة: الطالب + جوال ولي أمره. لو الجوال معروف
   * ينضاف تحت نفس ولي الأمر بدل ما ننشئ له سجلًا ثانيًا — نفس منطق الرابط.
   */
  const savePerson = () => {
    const name = (form.name || '').trim();
    const phone = (form.gPhone || '').trim();
    if (!name) { setForm({ ...form, error: 'اسم الطالب مطلوب' }); return; }
    if (!isValidPhone(phone)) { setForm({ ...form, error: 'رقم جوال ولي الأمر غير صحيح — مثال: 0551234567' }); return; }

    const res = upsertRegistration({ guardians: data.guardians, students: data.students, newId: uid }, {
      guardian: { name: (form.gName || '').trim(), phone },
      kids: [{ name, age: form.age || '', grade: (form.grade || '').trim(), school: (form.school || '').trim(), health: (form.health || '').trim() }],
    });
    save({ ...data, guardians: res.guardians, students: res.students });
    setSelectedGuardianId(res.guardian.id);
    goto('guardianDetail');
    closeModal();
  };

  const saveStudent = () => {
    const name = (form.name || '').trim();
    if (!name) { setForm({ ...form, error: 'اسم الطالب مطلوب' }); return; }
    const fields = {
      name, age: form.age || '', grade: (form.grade || '').trim(),
      school: (form.school || '').trim(), health: (form.health || '').trim(),
    };
    if (form.id) {
      save({ ...data, students: data.students.map((s) => (s.id === form.id ? { ...s, ...fields } : s)) });
    } else {
      const twin = studentsOf(data.students, form.guardianId).find((s) => sameName(s.name, name));
      if (twin) { setForm({ ...form, error: `«${twin.name}» مسجّل تحته من قبل` }); return; }
      save({ ...data, students: [...data.students, { id: uid(), guardianId: form.guardianId, ...fields, createdAt: Date.now() }] });
    }
    closeModal();
  };

  /** حذف الطالب ما يمس تسجيلاته المالية — يفك الربط فقط عشان الحسابات ما تختل. */
  const removeStudent = (sid) => {
    save({ ...data, students: data.students.filter((s) => s.id !== sid) });
  };

  /** الدمج ينقل الأبناء، والتسجيلات القديمة تتبع الطالب الباقي. */
  /** دمج ابنين تحت نفس ولي الأمر: تسجيلات المحذوف تتبع الباقي. */
  const doMergeStudents = (keepId, dropId) => {
    const { students, remap } = mergeStudents(data, keepId, dropId);
    const fixPart = (part) => (remap[part.studentId] ? { ...part, studentId: remap[part.studentId] } : part);
    const programs = data.programs.map((p) => ({
      ...p,
      participants: (p.participants || []).map(fixPart),
      weeks: (p.weeks || []).map((w) => ({ ...w, participants: (w.participants || []).map(fixPart) })),
    }));
    save({ ...data, students, programs });
    closeModal();
  };

  const doMerge = (keepId, dropId) => {
    const { guardians, students, remap } = mergeGuardians(data, keepId, dropId);
    const fixPart = (part) => (remap[part.studentId] ? { ...part, studentId: remap[part.studentId] } : part);
    const programs = data.programs.map((p) => ({
      ...p,
      participants: (p.participants || []).map(fixPart),
      weeks: (p.weeks || []).map((w) => ({ ...w, participants: (w.participants || []).map(fixPart) })),
    }));
    save({ ...data, guardians, students, programs });
    setSelectedGuardianId(keepId);
    closeModal();
  };

  /* --------------------------- النسخ الاحتياطي --------------------------- */
  const backupText = () => JSON.stringify({ app: 'faid', version: 1, savedAt: new Date().toISOString(), data }, null, 2);
  const backupName = () => `faid-backup-${new Date().toISOString().slice(0, 10)}.json`;

  const downloadBackup = () => {
    try {
      const blob = new Blob([backupText()], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = backupName();
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setForm({ ...form, msg: 'لو نزّل الملف، احفظه في مكان آمن. وإذا ما نزّل شي، استخدم «نسخ البيانات».' });
    } catch {
      setForm({ ...form, msg: 'التنزيل ما اشتغل هنا. استخدم «نسخ البيانات» بدلًا منه.' });
    }
  };
  const copyBackup = async () => {
    try {
      await navigator.clipboard.writeText(backupText());
      setForm({ ...form, msg: 'اننسخت البيانات. الصقها في ملاحظة أو أرسلها لنفسك واحفظها.' });
    } catch {
      setForm({ ...form, msg: 'ما قدر ينسخ. جرّب زر التنزيل.' });
    }
  };
  /** يتحقق من النسخة قبل ما يستبدل أي شي، ويعرض محتواها للتأكيد. */
  const previewRestore = (text) => {
    try {
      const parsed = JSON.parse(text);
      const d = parsed?.data && parsed?.app === 'faid' ? parsed.data : parsed;
      if (!d || !Array.isArray(d.programs) || !Array.isArray(d.faidAccounts)) {
        setForm({ ...form, restoreText: text, restore: null, msg: 'هذا الملف ما يشبه نسخة فيض.' });
        return;
      }
      const weeks = d.programs.reduce((n, p) => n + (p.weeks || []).length, 0);
      setForm({ ...form, restoreText: text, msg: '', restore: { d, programs: d.programs.length, weeks, users: (d.users || []).length, txns: (d.faidAdjustments || []).length } });
    } catch {
      setForm({ ...form, restoreText: text, restore: null, msg: 'الملف مو صالح. تأكد أنك نسخت النسخة كاملة.' });
    }
  };
  const applyRestore = () => {
    if (!form.restore?.d) return;
    save(migrate(form.restore.d));
    setForm({}); setModal(null); setStage('year');
  };

  const addYearOrTerm = (which) => {
    if (!form.value) return;
    const key = which === 'year' ? 'years' : 'terms';
    if (data[key].includes(form.value)) { closeModal(); return; }
    save({ ...data, [key]: [...data[key], form.value.trim()] });
    closeModal();
  };
  /** السنة أو الفصل ما ينحذف لو فيه برامج، ولا لو كان الأخير. */
  const removeYearOrTerm = (which, value) => {
    const key = which === 'year' ? 'years' : 'terms';
    const label = which === 'year' ? 'السنة' : 'الفصل';
    if (data[key].length <= 1) { setConfirm({ text: `لازم يبقى ${label} واحد على الأقل.`, onYes: null }); return; }
    const used = data.programs.filter((p) => (which === 'year'
      ? (p.termKey || '').startsWith(`${value}-`)
      : (p.termKey || '').endsWith(`-${value}`)));
    if (used.length) {
      setConfirm({ text: `فيه ${used.length} برنامج مسجّل على ${label} «${value}». احذف برامجه أول، أو خلّه كما هو.`, onYes: null });
      return;
    }
    const next = data[key].filter((x) => x !== value);
    const cur = which === 'year' ? 'currentYear' : 'currentTerm';
    save({ ...data, [key]: next, ...(data[cur] === value ? { [cur]: next[0] } : {}) });
  };

  const togglePerm = (perm) => {
    const cur = form.permissions || [];
    setForm({ ...form, permissions: cur.includes(perm) ? cur.filter((p) => p !== perm) : [...cur, perm] });
  };
  const toggleAllowedWeek = (programId, weekId) => {
    const cur = form.allowedWeeks || [];
    const exists = cur.some((a) => a.programId === programId && a.weekId === weekId);
    setForm({ ...form, allowedWeeks: exists ? cur.filter((a) => !(a.programId === programId && a.weekId === weekId)) : [...cur, { programId, weekId }] });
  };

  /* ------------------------------ الصلاحيات ------------------------------ */
  const effectiveUser = currentUser || (data.users.length === 0 ? { role: 'مدير', permissions: PERMS, accessScope: 'all', allowedWeeks: [] } : null);
  const isAdmin = effectiveUser?.role === 'مدير';
  const can = (perm) => isAdmin || (effectiveUser?.permissions || []).includes(perm);
  const canSeeWeek = (programId, weekId) => isAdmin || effectiveUser?.accessScope === 'all' || (effectiveUser?.allowedWeeks || []).some((a) => a.programId === programId && a.weekId === weekId);
  const canMoney = can('المصروفات والتقارير');
  /**
   * إسناد أيام لمستخدم يعني ضمنًا أنه مكلّف بها: يحضّر ويسجّل فيها،
   * حتى لو المدير نسي يعلّم صلاحية «الأسابيع والحضور».
   */
  const hasAssignedWeeks = !isAdmin && effectiveUser?.accessScope === 'limited'
    && (effectiveUser?.allowedWeeks || []).length > 0;
  const canAttend = can('الأسابيع والحضور') || can('البرامج') || hasAssignedWeeks;
  /**
   * التسجيل مسموح لمسجّل الحضور كمان: يقدر يضيف طالب بمبلغه وطريقة دفعه.
   * لكن يبقى ما يشوف مبالغ اللي سجّلهم غيره — الإدخال مسموح والقراءة لا.
   * التعديل والحذف يظلان للماليين، لأن نافذة التعديل تعرض المبلغ المسجّل أصلًا.
   */
  const canEnroll = canMoney || canAttend;
  const limitedScope = !isAdmin && effectiveUser?.accessScope === 'limited';
  /** البرنامج يظهر فقط لو فيه يوم واحد على الأقل يقدر يشوفه المستخدم. */
  const termPrograms = !limitedScope ? allTermPrograms
    : allTermPrograms.filter((p) => p.weeks.some((w) => canSeeWeek(p.id, w.id)));
  /** أيام المستخدم المحدود عبر كل البرامج — عشان يوصل لها من الرئيسية مباشرة. */
  const myWeeks = !limitedScope ? [] : termPrograms.flatMap((p) =>
    p.weeks.filter((w) => canSeeWeek(p.id, w.id)).map((w) => ({ program: p, week: w })));
  const canTransfer = can('فيض - الإيرادات والمصروفات') && canMoney;
  /**
   * جوالات الأهالي وأعمار الأطفال وملاحظاتهم الصحية بيانات حسّاسة، فلها صلاحية
   * مستقلة: مسجّل الحضور يشوف الأسماء عشان يحضّر، وما يشوف تفاصيل أهاليهم.
   */
  const canGuardians = can('أولياء الأمور');
  /** فتح رابط عام قرار مالي وإداري، فيبقى لمن يملك المال والمشتركين معًا. */
  const canSignup = canMoney && canGuardians;
  /** التكرار المحتمل: التطبيق يشتبه، والمستخدم يقرّر. */
  const duplicates = canGuardians ? findDuplicates(data.guardians, data.students) : [];

  /** آخر مدير نشط ما ينحذف ولا يتعطّل، وإلا انقفل التطبيق على الجميع. */
  const activeAdmins = data.users.filter((u) => u.role === 'مدير' && u.status === 'نشط');
  const noAdminExists = data.users.length > 0 && activeAdmins.length === 0;
  /** في الوضع المشترك ما نعرف المستخدمين إلا بعد الدخول، فالشرط على حالة الخادم. */
  const mustLogin = cloudOn ? !currentUser : (data.users.length > 0 && !currentUser);
  /** أول مرة يُفتح فيها التطبيق على الخادم: لازم يُنشأ حساب المدير. */
  const needsFirstAdmin = cloudOn && !cloudInit && !currentUser;

  const doLogin = async () => {
    const entered = (loginForm.username || '').trim().toLowerCase();
    if (!cloudOn) {
      const u = data.users.find((x) => (x.username || '').toLowerCase() === entered);
      // رسالة واحدة للحالتين عشان ما نكشف أي أسماء مستخدمين موجودة
      if (!u || u.password !== loginForm.password) { setLoginError('اسم المستخدم أو كلمة المرور غير صحيحة'); return; }
      if (u.status !== 'نشط') { setLoginError('هذا الحساب غير مفعّل. راجع المدير.'); return; }
      setCurrentUser(u); setLoginError(''); setLoginForm({ username: '', password: '' });
      setStage('year');
      return;
    }
    // في الوضع المشترك التحقق يصير في الخادم، فكلمات المرور ما تنزل للمتصفح أصلًا
    setLoginError('...جاري التحقق');
    const r = await api('login', { username: entered, password: loginForm.password });
    if (r.status === 401) { setLoginError('اسم المستخدم أو كلمة المرور غير صحيحة'); return; }
    if (r.status === 403) { setLoginError('هذا الحساب غير مفعّل. راجع المدير.'); return; }
    if (r.status !== 200 || !r.body?.data) { setLoginError('ما قدرت أوصل للخادم. تأكد من الإنترنت وجرّب مرة ثانية.'); return; }
    sess.current = { token: r.body.token, username: entered };
    writeSession(sess.current);
    adopt(r.body.data, r.body.rev);
    const pending = resumePending(r.body.data, entered);
    if (pending) setData(migrate(clone(pending)));
    const me = ((pending || r.body.data).users || []).find((x) => (x.username || '').toLowerCase() === entered);
    setCurrentUser(me || null);
    setLoginError(''); setLoginForm({ username: '', password: '' });
    setStage('year');
  };
  const doLogout = () => {
    if (cloudOn) {
      clearSession();
      sess.current = { token: null, username: '' };
      queueRef.current = null;
      revRef.current = 0;
      baseRef.current = null;
      setData(defaultData()); // ما نخلي بيانات الفريق في الجهاز بعد الخروج
    }
    setCurrentUser(null); setStage('year'); goto('home');
  };

  /* ------------------------------ الشاشة الأولى ------------------------------ */
  if (stage === 'splash') {
    return (
      <Shell dark>
        <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
          <FaidLogo size={116} variant="full" />
          <div className="text-brand-200 text-base font-semibold mt-8">فريق فيض</div>
          <button onClick={() => setStage(mustLogin ? 'login' : 'year')}
            className="mt-12 bg-white text-brand-900 font-bold text-sm px-10 py-3.5 rounded-2xl">
            ابدأ
          </button>
          <div className="text-brand-300/70 text-[11px] mt-6">{APP_VERSION}</div>
        </div>
      </Shell>
    );
  }

  /* ------------------------------ تسجيل الدخول ------------------------------ */
  if (mustLogin) {
    return (
      <Shell dark>
        <div className="flex-1 flex flex-col justify-center px-6">
          <div className="flex flex-col items-center mb-8">
            <FaidLogo size={84} variant="full" />
          </div>
          <div className="bg-white rounded-3xl p-6 shadow-xl">
            {needsFirstAdmin ? (
              /* أول تشغيل للفريق: ما فيه ولا حساب بعد، فنبدأ بحساب صاحب التطبيق */
              <>
                <h2 className="font-bold text-lg text-slate-800 mb-1">أهلًا! نبدأ بحسابك أنت</h2>
                <div className="text-sm text-slate-400 mb-5">
                  أنشئ حساب المدير — بصلاحيات كاملة. بعدها تقدر تضيف الموظفين وتحدد صلاحياتهم،
                  ويشتغلون معك على نفس البيانات من أجهزتهم.
                </div>
                <button className={btnPrimary + ' w-full'}
                  onClick={() => { setForm({ permissions: [], role: 'مدير' }); setModal('rescueAdmin'); }}>
                  <ShieldCheck size={16} /> إنشاء حساب المدير
                </button>
              </>
            ) : (
            <>
            <h2 className="font-bold text-lg text-slate-800 mb-1">تسجيل الدخول</h2>
            <div className="text-sm text-slate-400 mb-5">ادخل باسم المستخدم وكلمة المرور</div>
            <Field label="اسم المستخدم">
              <input className={inputCls} autoComplete="username" value={loginForm.username || ''}
                onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && doLogin()} placeholder="مثال: saad" />
            </Field>
            <Field label="كلمة المرور">
              <input type="password" autoComplete="current-password" className={inputCls} value={loginForm.password || ''}
                onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && doLogin()} placeholder="••••••" />
            </Field>
            {loginError && <div className="text-red-500 text-xs mb-3">{loginError}</div>}
            <button className={btnPrimary + ' w-full'} onClick={doLogin}><KeyRound size={16} /> دخول</button>

            {/* مخرج لمن انقفل برّا: ما فيه ولا حساب مدير نشط يقدر يدير التطبيق */}
            {noAdminExists && (
              <div className="mt-5 pt-5 border-t border-slate-100">
                <div className="text-xs text-slate-500 mb-3 flex items-start gap-2">
                  <AlertTriangle size={15} className="shrink-0 mt-0.5 text-amber-600" />
                  <span>ما فيه حساب مدير نشط، فما أحد يقدر يوصل للإعدادات. أنشئ حساب مدير عشان ترجع تتحكم.</span>
                </div>
                <button className="w-full bg-amber-50 text-amber-900 text-sm font-semibold px-4 py-2.5 rounded-lg"
                  onClick={() => { setForm({ permissions: [], role: 'مدير' }); setModal('rescueAdmin'); }}>
                  إنشاء حساب مدير
                </button>
              </div>
            )}
            </>
            )}
          </div>

          {modal === 'rescueAdmin' && (
            <Modal title="إنشاء حساب مدير" onClose={closeModal}>
              <div className="text-sm text-slate-500 mb-4">حساب بصلاحيات كاملة يرجّعك تتحكم بالتطبيق وبقية المستخدمين.</div>
              <Field label="الاسم"><input className={inputCls} value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value, error: '' })} /></Field>
              <Field label="اسم المستخدم"><input className={inputCls} dir="ltr" value={form.username || ''} onChange={(e) => setForm({ ...form, username: e.target.value, error: '' })} placeholder="admin" /></Field>
              <Field label="كلمة المرور"><input className={inputCls} dir="ltr" value={form.password || ''} onChange={(e) => setForm({ ...form, password: e.target.value, error: '' })} /></Field>
              {form.error && <div className="text-red-500 text-xs mb-3">{form.error}</div>}
              <div className="flex gap-2 mt-5">
                <button className={btnPrimary + ' flex-1'} onClick={saveUser}>إنشاء</button>
                <button className={btnGhost} onClick={closeModal}>إلغاء</button>
              </div>
            </Modal>
          )}
        </div>
      </Shell>
    );
  }

  /* --------------------------- اختيار السنة والترم --------------------------- */
  if (stage === 'year') {
    return (
      <Shell>
        <PickHeader title="اختيار السنة الهجرية" subtitle="اختر السنة اللي تبي تشتغل عليها" />
        <div className="px-5 space-y-3">
          {data.years.map((y, i) => (
            <PickCard key={y} icon={Calendar} title={`${y} هـ`} note={i === 0 ? 'السنة الجالية' : 'السنة القادمة'}
              onClick={() => { save({ ...data, currentYear: y }); setStage('term'); }} />
          ))}
          {isAdmin && (
            <button onClick={() => { setForm({ value: '' }); setModal('addYear'); }} className="w-full text-sm text-brand-700 font-semibold py-3 flex items-center justify-center gap-1.5">
              <Plus size={16} /> إضافة سنة
            </button>
          )}
        </div>
        {modal === 'addYear' && (
          <Modal title="إضافة سنة" onClose={closeModal}>
            <Field label="السنة (هـ)"><input className={inputCls} value={form.value || ''} onChange={(e) => setForm({ ...form, value: e.target.value })} placeholder="1449" /></Field>
            <div className="flex gap-2 mt-5"><button className={btnPrimary + ' flex-1'} onClick={() => addYearOrTerm('year')}>إضافة</button><button className={btnGhost} onClick={closeModal}>إلغاء</button></div>
          </Modal>
        )}
      </Shell>
    );
  }

  if (stage === 'term') {
    return (
      <Shell>
        <PickHeader title={`السنة ${data.currentYear} هـ`} subtitle="اختر الترم" onBack={() => setStage('year')} />
        <div className="px-5 space-y-3">
          {data.terms.map((t, i) => (
            <PickCard key={t} icon={i === 0 ? BookOpen : Layers} title={`الترم ${t}`}
              note={i === 0 ? 'من بداية السنة إلى منتصفها' : 'من منتصف السنة إلى نهايتها'}
              onClick={() => { save({ ...data, currentTerm: t }); setStage('app'); goto('home'); }} />
          ))}
          {isAdmin && (
            <button onClick={() => { setForm({ value: '' }); setModal('addTerm'); }} className="w-full text-sm text-brand-700 font-semibold py-3 flex items-center justify-center gap-1.5">
              <Plus size={16} /> إضافة ترم
            </button>
          )}
        </div>
        {modal === 'addTerm' && (
          <Modal title="إضافة فصل" onClose={closeModal}>
            <Field label="اسم الفصل"><input className={inputCls} value={form.value || ''} onChange={(e) => setForm({ ...form, value: e.target.value })} placeholder="الثالث" /></Field>
            <div className="flex gap-2 mt-5"><button className={btnPrimary + ' flex-1'} onClick={() => addYearOrTerm('term')}>إضافة</button><button className={btnGhost} onClick={closeModal}>إلغاء</button></div>
          </Modal>
        )}
      </Shell>
    );
  }

  const sections = [
    { id: 'programs', label: 'البرامج', desc: 'عرض وإدارة البرامج', icon: BookOpen, show: canAttend },
    { id: 'faid', label: 'فيض', desc: 'حسابات فيض والأرصدة', icon: Wallet, show: can('فيض - الإيرادات والمصروفات') },
    { id: 'competitions', label: 'المسابقات', desc: 'بنك الأفكار والأدوات', icon: Trophy, show: can('الإعداد (المسابقات)') },
    { id: 'trips', label: 'السفرات', desc: 'الرحلات وحساباتها', icon: Plane, show: can('السفرات') },
    { id: 'guardians', label: 'المشتركين', desc: 'الطلاب وأولياء أمورهم', icon: UsersIcon, show: canGuardians },
    { id: 'reports', label: 'التقارير', desc: 'التقارير والإحصائيات', icon: FileText, show: canMoney },
    { id: 'settings', label: 'الإعدادات', desc: 'المستخدمون والصلاحيات', icon: Settings, show: isAdmin },
  ].filter((c) => c.show);

  const navItems = [
    { id: 'home', label: 'الرئيسية', icon: Home, show: true },
    { id: 'programs', label: 'البرامج', icon: BookOpen, show: canAttend },
    { id: 'faid', label: 'فيض', icon: Wallet, show: can('فيض - الإيرادات والمصروفات') },
    { id: 'reports', label: 'التقارير', icon: FileText, show: canMoney },
    { id: 'settings', label: 'الإعدادات', icon: Settings, show: isAdmin },
  ].filter((n) => n.show);
  const isNavActive = (id) =>
    view === id ||
    (id === 'programs' && (view === 'programDetail' || view === 'weekDetail')) ||
    (id === 'home' && (view === 'competitions' || view === 'trips' || view === 'tripDetail'
      || view === 'competitionDetail' || view === 'guardians' || view === 'guardianDetail'));

  /** فلترة حسب طريقة الدفع: حساب معيّن، أو «ما دفع»، أو الكل. */
  const byPay = (p) => payFilter === 'all' || p.accountId === payFilter;
  const matches = (p) => (!search || p.name.includes(search)) && byPay(p);

  /** خيارات الفلترة مع عدّاد كل خيار، مبنية من القائمة المعروضة. */
  const payOptions = (list) => [
    { id: 'all', label: 'الكل', count: list.length },
    ...data.faidAccounts
      .map((a) => ({ id: a.id, label: a.name, count: list.filter((p) => p.accountId === a.id).length }))
      .filter((o) => o.count > 0),
    ...(list.some((p) => p.accountId === 'unpaid')
      ? [{ id: 'unpaid', label: 'ما دفع', count: list.filter((p) => p.accountId === 'unpaid').length }] : []),
  ];

  /** مشاركو الدفتر بعد البحث والفلترة. */
  const allParticipants = activeLedger?.participants || [];
  const visibleParticipants = allParticipants.filter(matches);

  /** حضور يوم معيّن في المجمّع يخص المسجّلين في ذاك اليوم فقط. */
  const dayRoster = isGrouped && week ? enrolledIn(program.participants, week.id) : [];
  const visibleDayRoster = dayRoster.filter(matches);

  // التبويبات تتغيّر حسب نوع البرنامج وصلاحية المستخدم، فنرجع للتبويب الأول لو المختار غير متاح.
  // من صلاحيته الحضور فقط ما يشوف إلا الأيام: لا مبالغ، لا مشتركين، لا تقارير
  const programTabs = !program ? [] : [
    { id: 'days', label: isGrouped ? 'الأيام والحضور' : 'الأيام' },
    ...(isGrouped && canMoney ? [{ id: 'participants', label: 'المشتركون' }] : []),
    ...(canMoney ? [{ id: 'finance', label: isGrouped ? 'المالية والتوزيع' : 'ملخص البرنامج' }] : []),
    ...(canMoney ? [{ id: 'report', label: 'التقرير' }] : []),
    ...(canSignup ? [{ id: 'signup', label: 'رابط التسجيل' }] : []),
  ];
  const activeProgramTab = programTabs.some((t) => t.id === programTab) ? programTab : programTabs[0]?.id;

  const weekTabs = !program || isGrouped ? [] : [
    ...(canMoney ? [{ id: 'overview', label: 'نظرة عامة' }] : []),
    ...(canMoney ? [{ id: 'finance', label: 'المالية والتوزيع' }] : []),
    // يظهر دائمًا: التسجيل بالاسم في يوم «سريع» يحوّله للأسماء تلقائيًا،
    // وبدونه يبقى المحضّر بلا أي تبويب فتطلع له شاشة فاضية
    { id: 'participants', label: 'الطلاب والحضور' },
    ...(canMoney ? [{ id: 'report', label: 'تقرير اليوم' }] : []),
  ];
  const activeWeekTab = weekTabs.some((t) => t.id === weekTab) ? weekTab : weekTabs[0]?.id;

  return (
    <div dir="rtl" className="min-h-screen bg-[#F1F4F9]" style={{ fontFamily: "'Tajawal', sans-serif" }}>

      <div className="w-full max-w-md mx-auto min-h-screen flex flex-col">
        {/* الهيدر: الترم الحالي + قائمة الحساب */}
        <header className="px-5 pt-6 pb-4 flex items-center justify-between gap-3">
          <button onClick={() => setStage('year')} className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
            الترم {data.currentTerm} {data.currentYear} هـ
            <ChevronLeft size={15} className="text-slate-400 -rotate-90" />
          </button>
          <div className="flex items-center gap-3">
            {syncState === 'offline'
              ? <span className="text-[11px] text-amber-600 flex items-center gap-1"><AlertTriangle size={12} /> غير متصل — بيحفظ لما يرجع النت</span>
              : savedAt && <span className="text-[11px] text-brand-600 flex items-center gap-1"><Check size={12} /> {cloudOn ? 'محفوظ للفريق' : 'محفوظ'}</span>}
            {currentUser && (
              <button onClick={() => setModal('account')} className="w-9 h-9 rounded-full bg-brand-100 text-brand-800 text-xs font-bold flex items-center justify-center">
                {currentUser.name.slice(0, 1)}
              </button>
            )}
          </div>
        </header>

      {/* النسخة المحفوظة في المتصفح تخفي التحسينات عن صاحبها بلا ما يدري */}
      {staleBuild && (
        <div className="px-5 pt-4">
          <div className="bg-brand-600 text-white rounded-2xl px-4 py-3 flex items-center gap-3">
            <RotateCcw size={18} className="shrink-0" />
            <div className="flex-1 min-w-0 text-sm">
              <div className="font-bold">فيه نسخة أحدث</div>
              <div className="text-brand-100 text-xs mt-0.5">اللي عندك محفوظ في المتصفح من قبل.</div>
            </div>
            <button className="shrink-0 bg-white text-brand-800 text-sm font-bold px-4 py-2 rounded-lg"
              onClick={hardReload}>تحديث</button>
          </div>
        </div>
      )}

      <main className="flex-1 px-5 pb-28 w-full">

        {/* ------------------------------- الرئيسية ------------------------------- */}
        {view === 'home' && (
          <div>
            <div className="bg-brand-800 rounded-3xl p-6 mb-5 text-white">
              <div className="text-lg font-bold mb-1">{currentUser ? `أهلًا ${currentUser.name}` : 'مرحبًا بك'} 👋</div>
              <div className="text-brand-200 text-sm">اختر القسم اللي تبي تشتغل عليه</div>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-5">
              <MiniStat label="برامج الترم" value={termPrograms.length} icon={BookOpen} />
              {can('فيض - الإيرادات والمصروفات')
                ? <MiniStat label="رصيد فيض" value={fmt(balance)} icon={Wallet} tone={balance >= 0 ? 'green' : 'red'} />
                : <MiniStat label="أيام مفتوحة" value={termPrograms.flatMap((p) => p.weeks).filter((w) => w.status === 'مفتوح').length} icon={Calendar} />}
            </div>
            {/* تسجيلات الرابط ما تنفع تنتظر بصمت داخل برنامج ما فتحته */}
            {canSignup && (() => {
              const waiting = termPrograms
                .map((p) => ({ p, n: signupPending(p).length }))
                .filter((x) => x.n > 0);
              if (!waiting.length) return null;
              const total = waiting.reduce((s, x) => s + x.n, 0);
              return (
                <div className="mb-5">
                  <div className="text-sm font-bold text-slate-700 mb-2">
                    تسجيلات جديدة تنتظر تأكيدك ({total})
                  </div>
                  <div className="space-y-2.5">
                    {waiting.map(({ p, n }) => (
                      <button key={p.id}
                        onClick={() => { setSelectedProgramId(p.id); setProgramTab('signup'); goto('programDetail'); }}
                        className="w-full bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3 text-right">
                        <span className="w-11 h-11 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0"><Send size={20} /></span>
                        <span className="flex-1 min-w-0">
                          <span className="block font-bold text-slate-800">{p.name}</span>
                          <span className="block text-xs text-amber-700 mt-0.5">{n} تسجيل من الرابط</span>
                        </span>
                        <ChevronLeft size={18} className="text-amber-300 shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>
              );
            })()}

            {limitedScope && myWeeks.length > 0 && (
              <div className="mb-5">
                <div className="text-sm font-bold text-slate-700 mb-2">أيامك</div>
                <div className="space-y-2.5">
                  {myWeeks.map(({ program: pr, week: w }) => (
                    <button key={w.id}
                      onClick={() => { setSelectedProgramId(pr.id); setSelectedWeekId(w.id); setWeekTab(pr.type === 'مجمع' ? 'attendance' : 'overview'); goto('weekDetail'); }}
                      className="w-full bg-white rounded-2xl border border-slate-100 p-4 flex items-center gap-3 text-right hover:shadow-md transition-shadow">
                      <span className="w-11 h-11 rounded-xl bg-brand-50 text-brand-700 flex items-center justify-center shrink-0"><Calendar size={20} /></span>
                      <span className="flex-1 min-w-0">
                        <span className="block font-bold text-slate-800">{w.name}</span>
                        <span className="block text-xs text-slate-400 mt-0.5">{pr.name}{w.date ? ` · ${w.date}` : ''}</span>
                      </span>
                      <ChevronLeft size={18} className="text-slate-300 shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="space-y-3">
              {sections.map((c) => (
                <PickCard key={c.id} icon={c.icon} title={c.label} note={c.desc} chevron onClick={() => goto(c.id)} />
              ))}
            </div>
          </div>
        )}

        {/* ------------------------------ قائمة البرامج ------------------------------ */}
        {view === 'programs' && (
          <div>
            <div className="flex items-center justify-between mb-5 gap-3">
              <h2 className="text-xl font-extrabold text-slate-800">البرامج</h2>
              {can('البرامج') && <button className={btnPrimary} onClick={() => { setForm({}); setModal('pickProgramType'); }}><Plus size={16} /> برنامج جديد</button>}
            </div>
            {termPrograms.length === 0 ? (
              <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-10 text-center">
                <div className="w-14 h-14 rounded-2xl bg-brand-50 text-brand-700 flex items-center justify-center mx-auto mb-4"><BookOpen size={26} /></div>
                {limitedScope ? (
                  <>
                    <div className="font-bold text-slate-700 mb-1">ما فيه أيام مسندة لك</div>
                    <div className="text-sm text-slate-400">صلاحيتك محدودة بأيام معيّنة، وما فيه أيام مسندة لك في الترم {data.currentTerm} {data.currentYear}هـ. راجع المدير.</div>
                  </>
                ) : (
                  <>
                    <div className="font-bold text-slate-700 mb-1">لا توجد برامج حاليًا</div>
                    <div className="text-sm text-slate-400 mb-5">يمكنك إضافة برنامج جديد للبدء</div>
                    {can('البرامج') && <button className={btnPrimary + ' w-full'} onClick={() => { setForm({}); setModal('pickProgramType'); }}><Plus size={16} /> إضافة برنامج</button>}
                  </>
                )}
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-100 overflow-x-auto">
                <table className="w-full text-sm min-w-[520px]">
                  <thead className="bg-slate-50 text-slate-500 text-xs"><tr>
                    <th className="text-right px-4 py-3 font-medium">اسم البرنامج</th>
                    <th className="text-right px-4 py-3 font-medium">النوع</th>
                    <th className="text-right px-4 py-3 font-medium">الأيام</th>
                    <th className="text-right px-4 py-3 font-medium">الصافي</th>
                    <th className="text-right px-4 py-3 font-medium"></th>
                  </tr></thead>
                  <tbody>
                    {termPrograms.map((p) => {
                      const net = p.type === 'مجمع' ? L.net(p) : p.weeks.reduce((s, w) => s + L.net(w), 0);
                      return (
                        <tr key={p.id} className="border-t border-slate-50 hover:bg-slate-50/50 cursor-pointer"
                          onClick={() => { setSelectedProgramId(p.id); setProgramTab('days'); goto('programDetail'); }}>
                          <td className="px-4 py-3 font-semibold text-slate-800">
                {p.name}
                {/* سجّل نفسه من الرابط ولسه ما تأكّد وصول مبلغه */}
                {p.pending && <span className="mr-2 align-middle"><Badge tone="amber">ينتظر تأكيدك</Badge></span>}
              </td>
                          <td className="px-4 py-3"><Badge tone={p.type === 'مجمع' ? 'blue' : 'brand'}>{p.type}</Badge></td>
                          <td className="px-4 py-3 text-slate-600">{p.weeks.length}</td>
                          <td className="px-4 py-3 font-semibold text-slate-700">{canMoney ? fmt(net) + ' ر.س' : '-'}</td>
                          <td className="px-4 py-3 text-left"><ChevronLeft size={16} className="text-slate-300" /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ------------------------------ تفاصيل البرنامج ------------------------------ */}
        {view === 'programDetail' && program && (
          <div>
            <Breadcrumb items={[{ label: 'البرامج', onClick: () => goto('programs') }, { label: program.name }]} />
            <div className="flex items-center justify-between mb-4 mt-2 gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-bold text-slate-800">{program.name}</h2>
                <Badge tone={isGrouped ? 'blue' : 'brand'}>{program.type}</Badge>
                {can('البرامج') && (
                  <>
                    <button onClick={() => { setForm({ name: program.name, dayPrice: program.dayPrice || '' }); setModal('editProgram'); }} className="text-slate-300 hover:text-brand-600"><Pencil size={15} /></button>
                    <button onClick={() => askConfirm(`حذف برنامج «${program.name}» وكل أيامه وبياناته؟`, () => removeProgram(program.id))} className="text-slate-300 hover:text-red-500"><Trash2 size={15} /></button>
                  </>
                )}
              </div>
              {isGrouped && canMoney && (
                <button onClick={() => patchProgram({ status: program.status === 'مفتوح' ? 'مغلق' : 'مفتوح' })}
                  className={`flex items-center gap-1.5 text-sm font-semibold px-3 py-2 rounded-lg ${program.status === 'مفتوح' ? 'bg-blue-50 text-blue-600' : 'bg-green-50 text-green-600'}`}>
                  {program.status === 'مفتوح' ? <Unlock size={15} /> : <Lock size={15} />} {program.status}
                </button>
              )}
            </div>

            {isGrouped && (
              <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-sm text-blue-800 mb-5 flex items-start gap-2">
                <CalendarDays size={16} className="shrink-0 mt-0.5" />
                <span>
                  برنامج مجمّع: المشترك يُسجّل مرة وحدة ويختار الأيام اللي سجّل فيها — كلها، أو يوم واحد، أو يجي متأخر ويسجّل من اليوم الثالث.
                  الحضور لكل يوم على حدة، والحساب المالي كله على مستوى البرنامج مو على كل يوم.
                </span>
              </div>
            )}

            <Tabs value={activeProgramTab} onChange={setProgramTab} tabs={programTabs} />

            {/* أيام البرنامج */}
            {activeProgramTab === 'days' && (
              <div>
                <div className="flex justify-end mb-3">
                  {can('البرامج') && <button className={btnPrimary} onClick={() => { setForm({}); setModal('addWeek'); }}><Plus size={16} /> {isGrouped ? 'يوم جديد' : 'أسبوع/يوم جديد'}</button>}
                </div>
                {program.weeks.filter((w) => canSeeWeek(program.id, w.id)).length === 0 ? (
                  <div className={emptyCls}>
                    {program.weeks.length === 0
                      ? 'لا توجد أيام بعد. أضف أول يوم.'
                      : 'ما فيه أيام مسندة لك في هذا البرنامج. راجع المدير لو تحتاج وصول.'}
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {program.weeks.filter((w) => canSeeWeek(program.id, w.id)).map((w) => {
                      const st = weekState(w);
                      const roster = isGrouped ? enrolledIn(program.participants, w.id) : null;
                      const present = isGrouped ? roster.filter((p) => program.attendance?.[w.id]?.[p.id] === 'حاضر').length : 0;
                      const note = isGrouped
                        ? (roster.length ? `${present} حاضر من ${roster.length} مسجّل` : 'ما فيه مسجّلين في هذا اليوم')
                        : (st === 'لم يبدأ' ? 'لم يبدأ بعد' : `${headcount(w)} طالب · ${fmt(L.revenue(w))} ر.س`);
                      return (
                        <button key={w.id} onClick={() => { setSelectedWeekId(w.id); setWeekTab(isGrouped ? 'attendance' : 'overview'); goto('weekDetail'); }}
                          className="w-full bg-white rounded-2xl border border-slate-100 p-4 flex items-center gap-3 text-right hover:shadow-md transition-shadow">
                          <span className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${st === 'مكتمل' ? 'bg-green-50 text-green-700' : st === 'جاري' ? 'bg-amber-50 text-amber-700' : 'bg-brand-50 text-brand-700'}`}>
                            <Calendar size={20} />
                          </span>
                          <span className="flex-1 min-w-0">
                            <span className="flex items-center gap-2">
                              <span className="font-bold text-slate-800">{w.name}</span>
                              {st === 'مكتمل' && <Badge tone="green">مكتمل</Badge>}
                              {st === 'جاري' && <Badge tone="amber">جاري</Badge>}
                            </span>
                            <span className="block text-xs text-slate-400 mt-0.5">{w.date ? `${w.date} · ` : ''}{note}</span>
                          </span>
                          <ChevronLeft size={18} className="text-slate-300 shrink-0" />
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* مشتركو البرنامج المجمّع */}
            {activeProgramTab === 'participants' && isGrouped && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="relative flex-1">
                    <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300" />
                    <input className={inputCls + ' pr-9'} placeholder="ابحث باسم المشترك" value={search} onChange={(e) => setSearch(e.target.value)} />
                  </div>
                  {canEnroll && (
                    <button className={btnPrimary + ' shrink-0'} disabled={ledgerLocked}
                      onClick={() => { setForm({ accountId: data.faidAccounts[0]?.id, days: program.weeks.map((w) => w.id), amount: Number(program.dayPrice || 0) * program.weeks.length || '' }); setModal('addParticipant'); }}>
                      <Plus size={16} /> مشترك
                    </button>
                  )}
                </div>
                {allParticipants.length > 0 && canMoney && (
                  <div className="mb-3"><FilterChips options={payOptions(allParticipants)} value={payFilter} onChange={setPayFilter} /></div>
                )}
                {ledgerLocked && <div className="text-xs text-amber-600 mb-3">البرنامج مغلق — افتحه من الأعلى عشان تعدّل المشتركين.</div>}
                {program.weeks.length === 0 ? (
                  <div className={emptyCls}>أضف أيام البرنامج أول من تبويب «الأيام والحضور»، عشان تقدر تحدّد أي أيام سجّل فيها كل مشترك.</div>
                ) : (
                  <ParticipantsTable
                    participants={visibleParticipants}
                    accounts={data.faidAccounts}
                    showAttendance={false}
                    showMoney={canMoney}
                    weeks={program.weeks}
                    locked={ledgerLocked}
                    onEdit={canMoney ? (p) => { setForm({ ...p, days: enrolledDays(p, program.weeks).map((w) => w.id), amountTouched: true }); setModal('editParticipant'); } : null}
                    onRemove={canMoney ? (p) => askConfirm(`حذف المشترك «${p.name}»؟`, () => removeParticipant(p.id)) : null}
                  />
                )}
                <div className="mt-3 text-sm text-slate-500 flex flex-wrap items-center justify-between gap-2 px-1">
                  <span>عدد المشتركين: <b className="text-slate-800">{(program.participants || []).length}</b></span>
                  {canMoney && <span>إجمالي التحصيل: <b className="text-slate-800">{fmt(paidAmount(program.participants))} ر.س</b></span>}
                </div>
                {program.weeks.length > 0 && (
                  <div className={cardCls + ' mt-4'}>
                    <div className="text-sm font-semibold text-slate-700 mb-3">المسجّلون في كل يوم</div>
                    <div className="space-y-2">
                      {program.weeks.map((w) => (
                        <div key={w.id} className="flex items-center justify-between text-sm border-b border-slate-50 pb-2">
                          <span className="text-slate-600">{w.name}{w.date ? ` - ${w.date}` : ''}</span>
                          <span className="font-semibold text-slate-800">{enrolledIn(program.participants, w.id).length} مسجّل</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* مالية البرنامج */}
            {activeProgramTab === 'finance' && canMoney && (
              isGrouped ? (
                <LedgerFinance
                  ledger={program}
                  accounts={data.faidAccounts}
                  locked={ledgerLocked}
                  canTransfer={canTransfer}
                  onAdd={(key) => { setForm({}); setModal(`add_${key}`); }}
                  onRemove={removeLedgerItem}
                  onDistributeRest={distributeRestToFaid}
                  onTransfer={() => { setForm({ date: '' }); setModal('transferFaid'); }}
                  onUndoTransfer={() => askConfirm('إلغاء ترحيل نصيب فيض وحذف العملية من رصيد فيض؟', () => undoTransfer(activeRef, program.faidTransfer.batchId))}
                />
              ) : (
                <ProgramTotals program={program} />
              )
            )}

            {/* تقرير البرنامج */}
            {activeProgramTab === 'report' && (
              isGrouped
                ? <GroupedReport program={program} accounts={data.faidAccounts} canMoney={canMoney} />
                : <SeparateReport program={program} accounts={data.faidAccounts} canMoney={canMoney} />
            )}

            {activeProgramTab === 'signup' && (() => {
              const s = { ...emptySignup(), ...(program.signup || {}) };
              const url = s.token ? `${location.origin}/r/${s.token}` : '';
              const pending = signupPending(program);
              return (
                <div className="space-y-4">
                  <div className={cardCls}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-bold text-slate-800">التسجيل الذاتي</div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          {s.enabled ? 'مفتوح — ولي الأمر يقدر يسجّل' : 'مقفل — ما أحد يقدر يسجّل'}
                        </div>
                      </div>
                      <button onClick={toggleSignup}
                        className={`shrink-0 w-14 h-8 rounded-full transition-colors relative ${s.enabled ? 'bg-brand-600' : 'bg-slate-200'}`}>
                        <span className={`absolute top-1 w-6 h-6 rounded-full bg-white transition-all ${s.enabled ? 'right-1' : 'right-7'}`} />
                      </button>
                    </div>
                  </div>

                  {s.enabled && (() => {
                    // نفس الفحص اللي يوقف الرابط، معروضًا لك قبل ما ترسله لأحد
                    const noDays = !(s.openWeeks || []).length;
                    const noPkgs = isGrouped
                      && !(s.allowPerDay !== false && Number(s.price || 0) > 0)
                      && !(s.packages || []).length;
                    if (!noDays && !noPkgs) return null;
                    return (
                      <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-start gap-2">
                        <AlertTriangle size={16} className="shrink-0 mt-0.5 text-amber-600" />
                        <span className="text-sm text-amber-900">
                          <b>الرابط ما راح يقبل تسجيلات.</b>{' '}
                          {noDays
                            ? ((program.weeks || []).length
                              ? 'ما اخترت ولا يوم متاح للتسجيل تحت. اختر الأيام اللي تبي الأهالي يسجّلون فيها.'
                              : 'البرنامج ما فيه أيام بعد. أضف يومًا واحدًا على الأقل من تبويب الأيام، وبعدها اختره هنا.')
                            : 'ما فيه طريقة تسجيل. فعّل «التسجيل اليومي» بسعره، أو أضف باقة وحدة على الأقل.'}
                        </span>
                      </div>
                    );
                  })()}

                  {s.enabled && (
                    <>
                      <div className={cardCls}>
                        <div className="text-xs text-slate-400 mb-2">الرابط — أرسله للأهالي</div>
                        <div className="bg-slate-50 rounded-xl px-3 py-2.5 text-sm text-slate-700 break-all mb-3" dir="ltr">{url}</div>
                        <div className="flex gap-2">
                          <button className={btnPrimary + ' flex-1'}
                            onClick={() => { navigator.clipboard?.writeText(url); setSavedAt(Date.now()); }}>
                            <Copy size={16} /> نسخ
                          </button>
                          <a className={btnPrimary + ' flex-1'} target="_blank" rel="noreferrer"
                            href={`https://wa.me/?text=${encodeURIComponent(`التسجيل في ${program.name}:\n${url}`)}`}>
                            <Send size={16} /> واتساب
                          </a>
                        </div>
                        <button className="text-xs text-slate-400 mt-3 w-full text-center"
                          onClick={() => askConfirm('نولّد رابطًا جديدًا؟ القديم بيتوقف فورًا، فمن عنده الرابط القديم ما راح يقدر يسجّل.', regenerateToken, 'نعم، ولّد رابطًا جديدًا')}>
                          رابط جديد (يبطّل القديم)
                        </button>
                      </div>

                      <div className={cardCls}>
                        {isGrouped ? (
                          <>
                            <Field label="التسجيل اليومي"
                              hint="ولي الأمر يختار أي أيام يبيها، والمبلغ = السعر × عدد أيامه.">
                              <label className="flex items-center gap-2 mb-3 text-sm text-slate-700">
                                <input type="checkbox" checked={s.allowPerDay !== false}
                                  onChange={(e) => patchSignup({ allowPerDay: e.target.checked })} />
                                اعرضه لولي الأمر
                              </label>
                              {s.allowPerDay !== false && (
                                <input type="number" className={inputCls} value={s.price ?? ''}
                                  onChange={(e) => patchSignup({ price: e.target.value })} placeholder="سعر اليوم — 40" />
                              )}
                            </Field>

                            <Field label="الباقات" hint="سعر مقطوع لعدد أيام. تنعرض جنب اليومي، وولي الأمر يختار وحدة.">
                            {(s.packages || []).length > 0 && (
                              <div className="space-y-2 mb-3">
                                {s.packages.map((pk) => (
                                  <div key={pk.id} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2.5">
                                    <div className="min-w-0">
                                      <div className="text-sm font-semibold text-slate-800 truncate">{pk.name}</div>
                                      <div className="text-[11px] text-slate-400">
                                        {fmt(pk.price)} ر.س · {Number(pk.dayCount) ? `${pk.dayCount} أيام` : 'كل الأيام المتاحة'}
                                      </div>
                                    </div>
                                    <button className="text-red-400 p-1 shrink-0"
                                      onClick={() => patchSignup({ packages: s.packages.filter((x) => x.id !== pk.id) })}>
                                      <Trash2 size={15} />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                            <button className={btnGhost + ' w-full border border-dashed border-slate-300'}
                              onClick={() => { setForm({ dayCount: '' }); setModal('addPackage'); }}>
                              <Plus size={15} /> باقة جديدة
                            </button>
                            </Field>
                          </>
                        ) : (
                          <Field label="سعر الاشتراك (ر.س)"
                            hint="لكل أسبوع. يُستخدم في الرابط فقط، وتبقى تكتب المبلغ اللي تبي في تسجيلك اليدوي.">
                            <input type="number" className={inputCls} value={s.price ?? ''}
                              onChange={(e) => patchSignup({ price: e.target.value })} placeholder="50" />
                          </Field>
                        )}

                        <Field label={isGrouped ? 'الأيام المتاحة للتسجيل' : 'الأسابيع المتاحة للتسجيل'}
                          hint="اللي ما تختاره ما يظهر لولي الأمر أصلًا.">
                          <div className="flex items-center gap-2 mb-2">
                            <button type="button" className="text-xs text-brand-600"
                              onClick={() => patchSignup({ openWeeks: program.weeks.map((w) => w.id) })}>تحديد الكل</button>
                            <span className="text-slate-200">|</span>
                            <button type="button" className="text-xs text-slate-500" onClick={() => patchSignup({ openWeeks: [] })}>إلغاء الكل</button>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            {(program.weeks || []).map((w) => {
                              const on = (s.openWeeks || []).includes(w.id);
                              return (
                                <button key={w.id} type="button"
                                  onClick={() => patchSignup({ openWeeks: on ? s.openWeeks.filter((x) => x !== w.id) : [...(s.openWeeks || []), w.id] })}
                                  className={`text-xs px-3 py-2 rounded-lg border text-right ${on ? 'bg-brand-600 text-white border-brand-600' : 'border-slate-200 text-slate-600'}`}>
                                  {w.name}
                                </button>
                              );
                            })}
                          </div>
                        </Field>

                        <Field label="طرق الدفع المعروضة" hint="تفاصيل التحويل (الآيبان أو الجوال) والاسم اللي يشوفه ولي الأمر تكتبها في الإعدادات ← طرق الدفع.">
                          <div className="space-y-2">
                            {data.faidAccounts.map((a) => {
                              const on = (s.accounts || []).includes(a.id);
                              return (
                                <button key={a.id} type="button"
                                  onClick={() => patchSignup({ accounts: on ? s.accounts.filter((x) => x !== a.id) : [...(s.accounts || []), a.id] })}
                                  className={`w-full text-right px-3 py-2.5 rounded-lg border flex items-center justify-between ${on ? 'border-brand-600 bg-brand-50' : 'border-slate-200'}`}>
                                  <span className="text-sm text-slate-800">
                                    {a.name}
                                    {a.publicName && a.publicName !== a.name && (
                                      <span className="text-xs text-slate-400"> ← يشوفه «{a.publicName}»</span>
                                    )}
                                  </span>
                                  <span className="text-xs text-slate-400">
                                    {a.needsReceipt ? 'يطلب إيصال' : a.transferInfo ? 'فيه تفاصيل تحويل' : 'بلا تفاصيل — يُدفع عند الحضور'}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </Field>

                        <Field label="أسئلة خاصة بهذا البرنامج" hint="تنضاف للنموذج العام، وتظهر في هذا الرابط فقط.">
                          {(s.extraFields || []).length > 0 && (
                            <div className="space-y-2 mb-3">
                              {s.extraFields.map((f) => (
                                <div key={f.id} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2">
                                  <div className="min-w-0">
                                    <div className="text-sm text-slate-800 truncate">{f.label}</div>
                                    <div className="text-[11px] text-slate-400">
                                      {f.type === 'choice' ? (f.options || []).join(' / ') : f.type === 'number' ? 'رقم' : 'نص'}
                                      {f.required ? ' · مطلوب' : ' · اختياري'}
                                    </div>
                                  </div>
                                  <button className="text-red-400 p-1 shrink-0"
                                    onClick={() => patchSignup({ extraFields: s.extraFields.filter((x) => x.id !== f.id) })}>
                                    <Trash2 size={15} />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                          <button className={btnGhost + ' w-full border border-dashed border-slate-300'}
                            onClick={() => { setForm({ scope: 'program', type: 'text' }); setModal('addSignupField'); }}>
                            <Plus size={15} /> سؤال جديد
                          </button>
                        </Field>
                      </div>
                    </>
                  )}

                  {pending.length > 0 && (
                    <div className={cardCls}>
                      <div className="font-bold text-slate-800 mb-1">ينتظر تأكيدك ({pending.length})</div>
                      <div className="text-xs text-slate-400 mb-4">
                        هذولا سجّلوا من الرابط. مبالغهم ما تُحسب إيرادًا لين تأكّد إن الفلوس وصلت.
                      </div>
                      <div className="space-y-2">
                        {pending.map(({ part, where, weekId }) => (
                          <div key={part.id} className="border border-amber-200 bg-amber-50 rounded-xl px-3 py-2.5">
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                <div className="font-semibold text-sm text-slate-800 truncate">{part.name}</div>
                                <div className="text-[11px] text-slate-500">
                                  {where} · {fmt(part.amount)} ر.س · {(data.faidAccounts.find((a) => a.id === part.accountId) || {}).name || 'بلا حساب'}
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                {part.receipt && (
                                  <button className="bg-white border border-slate-200 text-slate-600 text-xs font-semibold px-2.5 py-2 rounded-lg flex items-center gap-1"
                                    onClick={() => { setForm({ receipt: part.receipt, who: part.name }); setModal('viewReceipt'); }}>
                                    <FileText size={14} /> الإيصال
                                  </button>
                                )}
                                <button className="bg-green-600 text-white text-xs font-semibold px-3 py-2 rounded-lg flex items-center gap-1"
                                  onClick={() => confirmPending(part.id, weekId)}>
                                  <Check size={14} /> تأكيد
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      <button className={btnPrimary + ' w-full mt-3'}
                        onClick={() => askConfirm(`تأكيد وصول مبالغ ${pending.length} تسجيل؟ بتدخل الإيراد.`, confirmAllPending, 'نعم، وصلت')}>
                        <Check size={16} /> تأكيد الكل
                      </button>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* ------------------------------ تفاصيل اليوم ------------------------------ */}
        {view === 'weekDetail' && program && week && !canSeeWeek(program.id, week.id) && (
          <div className={emptyCls}>ما عندك صلاحية الوصول لهذا اليوم.</div>
        )}

        {view === 'weekDetail' && program && week && canSeeWeek(program.id, week.id) && (
          <div>
            <Breadcrumb items={[
              { label: 'البرامج', onClick: () => goto('programs') },
              { label: program.name, onClick: () => goto('programDetail') },
              { label: week.name },
            ]} />
            <div className="flex items-center justify-between mb-5 mt-2 gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-bold text-slate-800">{week.name}</h2>
                {can('البرامج') && (
                  <>
                    <button onClick={() => { setForm({ name: week.name, date: week.date || '' }); setModal('editWeek'); }} className="text-slate-300 hover:text-brand-600"><Pencil size={15} /></button>
                    <button onClick={() => askConfirm(`حذف «${week.name}» وكل بياناته؟`, () => removeWeek(week.id))} className="text-slate-300 hover:text-red-500"><Trash2 size={15} /></button>
                  </>
                )}
              </div>
              <button onClick={() => patchWeek({ status: week.status === 'مفتوح' ? 'مغلق' : 'مفتوح' })}
                className={`flex items-center gap-1.5 text-sm font-semibold px-3 py-2 rounded-lg ${week.status === 'مفتوح' ? 'bg-blue-50 text-blue-600' : 'bg-green-50 text-green-600'}`}>
                {week.status === 'مفتوح' ? <Unlock size={15} /> : <Lock size={15} />} {week.status === 'مفتوح' ? 'قيد العمل' : 'مكتمل'}
              </button>
            </div>

            {isGrouped ? (
              /* برنامج مجمّع: اليوم للحضور فقط */
              <div>
                <div className={cardCls + ' mb-4'}>
                  <div className="text-sm text-slate-500 mb-2">التاريخ (هـ)</div>
                  <input className={inputCls} value={week.date} onChange={(e) => patchWeek({ date: e.target.value })} placeholder="1447/01/19" />
                </div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="relative flex-1">
                    <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300" />
                    <input className={inputCls + ' pr-9'} placeholder="ابحث باسم المشترك" value={search} onChange={(e) => setSearch(e.target.value)} />
                  </div>
                  <button onClick={() => markAll('حاضر', visibleDayRoster)} disabled={week.status === 'مغلق'} className="text-xs font-semibold text-green-700 bg-green-50 px-3 py-2.5 rounded-lg shrink-0 disabled:opacity-40">الكل حاضر</button>
                  {/* التسجيل من داخل اليوم نفسه: اللي يجي متأخر ويبي يسجّل وأنت تحضّر */}
                  {canEnroll && (
                    <button className={btnPrimary + ' shrink-0'} disabled={week.status === 'مغلق' || ledgerLocked}
                      onClick={() => { setForm({ accountId: data.faidAccounts[0]?.id, days: [week.id], amount: Number(program.dayPrice || 0) || '' }); setModal('addParticipant'); }}>
                      <Plus size={16} /> تسجيل
                    </button>
                  )}
                </div>
                {dayRoster.length > 0 && canMoney && (
                  <div className="mb-3"><FilterChips options={payOptions(dayRoster)} value={payFilter} onChange={setPayFilter} /></div>
                )}
                {dayRoster.length === 0 ? (
                  <div className={emptyCls}>
                    {(program.participants || []).length === 0
                      ? 'ما فيه مشتركون بعد. سجّلهم من تبويب «المشتركون» في صفحة البرنامج.'
                      : 'ما فيه أحد مسجّل في هذا اليوم. تقدر تسجّل مشترك جديد أو تعدّل أيام مشترك موجود من تبويب «المشتركون».'}
                  </div>
                ) : (
                  <AttendanceTable
                    participants={visibleDayRoster}
                    statusOf={(p) => attendanceOf(p, week.id)}
                    subscriptionOf={(p) => enrolledDays(p, program.weeks).length}
                    totalDays={program.weeks.length}
                    locked={week.status === 'مغلق'}
                    onSet={(p, s) => setAttendance(p.id, s, week.id)}
                    onEdit={canMoney ? (p) => { setForm({ ...p, days: enrolledDays(p, program.weeks).map((w) => w.id), amountTouched: true }); setModal('editParticipant'); } : null}
                  />
                )}
                <div className="mt-3 text-sm text-slate-500 px-1 flex flex-wrap gap-x-4 gap-y-1">
                  <span>الحاضرون اليوم: <b className="text-slate-800">{dayRoster.filter((p) => attendanceOf(p, week.id) === 'حاضر').length}</b> من {dayRoster.length} مسجّل</span>
                  {dayRoster.length !== (program.participants || []).length && (
                    <span className="text-slate-400">(إجمالي مشتركي البرنامج: {(program.participants || []).length})</span>
                  )}
                </div>
              </div>
            ) : (
              /* برنامج منفصل: مالية + مشاركون + تقرير لهذا اليوم */
              <>
                <Tabs value={activeWeekTab} onChange={setWeekTab} tabs={weekTabs} />

                {activeWeekTab === 'overview' && (
                  <div className="space-y-3">
                    <div className={cardCls + ' flex items-center justify-between'}>
                      <span className="text-sm text-slate-500">حالة اليوم</span>
                      <Badge tone={weekState(week) === 'مكتمل' ? 'green' : weekState(week) === 'جاري' ? 'amber' : 'slate'}>{weekState(week)}</Badge>
                    </div>
                    <InfoRow icon={UsersIcon} label={isQuick(week) ? 'الطلاب المسجلين' : 'الطلاب'} value={`${headcount(week)} طالب`} />
                    {canMoney && <InfoRow icon={TrendingUp} label="إجمالي الإيراد" value={`${fmt(L.revenue(week))} ر.س`} />}
                    <InfoRow icon={Calendar} label="التاريخ" value={week.date || 'ما تحدد'} />

                    {isQuick(week) ? (
                      <>
                        <button className={btnPrimary + ' w-full mt-2'} disabled={ledgerLocked}
                          onClick={() => { setForm({ quickCount: week.quickCount || 0, quickRevenue: week.quickRevenue || '', date: week.date || '' }); setModal('quickRegister'); }}>
                          <Pencil size={16} /> {weekState(week) === 'لم يبدأ' ? 'تسجيل الطلاب والإيراد' : 'تعديل التسجيل'}
                        </button>
                        <button onClick={() => askConfirm('تحويل هذا اليوم لتسجيل بالأسماء؟ المبلغ المسجّل حاليًا ينتقل لبند «تحصيل إضافي» فما يضيع من الحساب.', () => patchWeek(quickToNamed(week)), 'نعم، حوّله')}
                          className="w-full text-xs text-slate-500 py-2 hover:text-brand-700">أو سجّل الطلاب بأسمائهم وحضورهم</button>
                      </>
                    ) : (
                      <>
                        <button className={btnPrimary + ' w-full mt-2'} onClick={() => setWeekTab('participants')}>
                          <UsersIcon size={16} /> الطلاب والحضور
                        </button>
                        {!(week.participants || []).length && (
                          <button onClick={() => patchWeek({ mode: 'quick' })} className="w-full text-xs text-slate-500 py-2 hover:text-brand-700">
                            أو سجّل بالعدد والمبلغ فقط (أسرع)
                          </button>
                        )}
                      </>
                    )}
                    {weekState(week) !== 'لم يبدأ' && (
                      <button className="w-full text-sm font-semibold text-brand-800 bg-brand-50 py-3 rounded-xl" onClick={() => setWeekTab('report')}>
                        عرض التقرير
                      </button>
                    )}
                  </div>
                )}

                {activeWeekTab === 'finance' && canMoney && (
                  <div className="space-y-4">
                    <div className={cardCls}>
                      <div className="text-sm text-slate-500 mb-2">التاريخ (هـ)</div>
                      <input className={inputCls} value={week.date} onChange={(e) => patchWeek({ date: e.target.value })} placeholder="1447/01/19" />
                    </div>
                    <LedgerFinance
                      ledger={week}
                      accounts={data.faidAccounts}
                      locked={ledgerLocked}
                      canTransfer={canTransfer}
                      onAdd={(key) => { setForm({}); setModal(`add_${key}`); }}
                      onRemove={removeLedgerItem}
                      onDistributeRest={distributeRestToFaid}
                      onTransfer={() => { setForm({ date: week.date || '' }); setModal('transferFaid'); }}
                      onUndoTransfer={() => askConfirm('إلغاء ترحيل نصيب فيض وحذف العملية من رصيد فيض؟', () => undoTransfer(activeRef, week.faidTransfer.batchId))}
                    />
                  </div>
                )}

                {activeWeekTab === 'participants' && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <div className="relative flex-1">
                        <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300" />
                        <input className={inputCls + ' pr-9'} placeholder="ابحث باسم الطالب" value={search} onChange={(e) => setSearch(e.target.value)} />
                      </div>
                      <button onClick={() => markAll('حاضر', visibleParticipants)} disabled={ledgerLocked}
                        title="يعلّم المعروضين حاليًا فقط" className="text-xs font-semibold text-green-700 bg-green-50 px-3 py-2.5 rounded-lg shrink-0 disabled:opacity-40">الكل حاضر</button>
                      {canEnroll && (
                        <button className={btnPrimary + ' shrink-0'} disabled={ledgerLocked} onClick={() => { setForm({ accountId: data.faidAccounts[0]?.id }); setModal('addParticipant'); }}>
                          <Plus size={16} /> مشارك
                        </button>
                      )}
                    </div>
                    {allParticipants.length > 0 && canMoney && (
                      <div className="mb-3"><FilterChips options={payOptions(allParticipants)} value={payFilter} onChange={setPayFilter} /></div>
                    )}
                    {ledgerLocked && <div className="text-xs text-amber-600 mb-3">اليوم مغلق — افتحه من الأعلى عشان تعدّل.</div>}
                    {isQuick(week) && canMoney && (
                      <div className="bg-brand-50 border border-brand-100 rounded-xl px-4 py-3 text-sm text-brand-900 mb-3">
                        هذا اليوم مسجّل بالعدد والمبلغ ({week.quickCount} طالب · {fmt(week.quickRevenue)} ر.س).
                        أول ما تسجّل طالبًا باسمه يتحوّل للأسماء، والمبلغ ينتقل لبند «تحصيل إضافي».
                      </div>
                    )}
                    {!week.participants.length ? (
                      <div className={emptyCls}>
                        {canEnroll ? 'ما فيه طلاب بعد. اضغط «+ مشارك» وسجّل أول واحد.' : 'ما فيه طلاب بعد.'}
                      </div>
                    ) : !canMoney ? (
                      // بلا صلاحية مالية: واجهة تحضير صرفة، نفس تجربة البرنامج المجمّع
                      <AttendanceTable
                        participants={visibleParticipants}
                        statusOf={(p) => p.attendance || 'معلق'}
                        locked={ledgerLocked}
                        onSet={(p, st) => setAttendance(p.id, st)}
                      />
                    ) : (
                      <ParticipantsTable
                        participants={visibleParticipants}
                        accounts={data.faidAccounts}
                        showAttendance
                        showMoney={canMoney}
                        statusOf={(p) => p.attendance || 'معلق'}
                        onSetAttendance={(p, s) => setAttendance(p.id, s)}
                        locked={ledgerLocked}
                        onEdit={canMoney ? (p) => { setForm({ ...p }); setModal('editParticipant'); } : null}
                        onRemove={canMoney ? (p) => askConfirm(`حذف «${p.name}»؟`, () => removeParticipant(p.id)) : null}
                      />
                    )}
                  </div>
                )}

                {activeWeekTab === 'report' && <WeekReport week={week} accounts={data.faidAccounts} canMoney={canMoney} programName={program.name} />}
              </>
            )}
          </div>
        )}

        {/* --------------------------------- فيض --------------------------------- */}
        {view === 'faid' && (
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-slate-800 mb-1">فيض</h2>
            <div className="text-sm text-slate-400 mb-5">رصيد الفريق — يتغيّر فقط بالعمليات اليدوية أو بترحيل نصيب فيض من البرامج.</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <StatCard label="الرصيد الحالي (الإجمالي)" value={fmt(balance) + ' ر.س'} icon={Wallet} tone={balance >= 0 ? 'green' : 'red'} />
              <StatCard label="إجمالي الإيرادات" value={fmt(totalRevenue) + ' ر.س'} icon={TrendingUp} tone="brand" />
              <StatCard label="إجمالي المصروفات" value={fmt(totalExpenses) + ' ر.س'} icon={TrendingDown} tone="red" />
            </div>

            {/* الاستثمار محجوز على أمد بعيد، فيُعرض على حدة وما يُجمع مع الرصيد */}
            <div className={cardCls + ' mb-6'}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm text-slate-500 mb-1 flex items-center gap-1.5">
                    <Layers size={15} className="text-brand-500" /> الاستثمار
                  </div>
                  <div className="text-2xl font-extrabold text-brand-700">{fmt(investmentBalance)} ر.س</div>
                  <div className="text-[11px] text-slate-400 mt-1">محجوز على أمد بعيد — ما يُحسب ضمن رصيد الفريق.</div>
                </div>
                {canTransfer && (
                  <div className="flex flex-col gap-1.5 shrink-0">
                    <button className="bg-brand-600 text-white text-xs font-semibold px-3 py-2 rounded-lg whitespace-nowrap"
                      onClick={() => { setForm({ dir: 'in', accountId: data.faidAccounts[0]?.id }); setModal('investment'); }}>
                      تحويل للاستثمار
                    </button>
                    {investmentBalance > 0 && (
                      <button className="bg-slate-100 text-slate-700 text-xs font-semibold px-3 py-2 rounded-lg whitespace-nowrap"
                        onClick={() => { setForm({ dir: 'out', accountId: data.faidAccounts[0]?.id }); setModal('investment'); }}>
                        سحب منه
                      </button>
                    )}
                  </div>
                )}
              </div>
              {investmentBalance > 0 && (
                <div className="mt-4 pt-4 border-t border-slate-100">
                  <div className="text-[11px] text-slate-400 mb-2">مصدره</div>
                  <div className="space-y-1.5">
                    {accountStats.filter((a) => a.invested !== 0).map((a) => (
                      <div key={a.id} className="flex items-center justify-between text-xs">
                        <span className="text-slate-600">{a.name}</span>
                        <span className="text-slate-800 font-semibold">{fmt(a.invested)} ر.س</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-slate-700">الحسابات</h3>
              <button onClick={() => { setForm({ value: '' }); setModal('addFaidAccount'); }} className="text-xs text-brand-600 flex items-center gap-1"><Plus size={14} /> حساب جديد</button>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
              {accountStats.map((a) => (
                <div key={a.id} className={cardCls + ' relative group'}>
                  <div className="text-sm text-slate-500 mb-1">{a.name}</div>
                  <div className={`text-lg sm:text-xl font-bold ${a.balance >= 0 ? 'text-slate-800' : 'text-red-600'}`}>{fmt(a.balance)} ر.س</div>
                  <div className="text-[11px] text-slate-400 mt-1">وارد {fmt(a.revenue)} · صادر {fmt(a.expenses)}</div>
                  {isAdmin && (
                    <button className="text-[11px] text-brand-600 mt-2 block"
                      onClick={() => { setForm({ id: a.id, transferInfo: a.transferInfo || '', publicName: a.publicName || '', needsReceipt: !!a.needsReceipt, name: a.name }); setModal('transferInfo'); }}>
                      {a.transferInfo ? 'تفاصيل التحويل ✓' : '+ تفاصيل التحويل'}
                    </button>
                  )}
                  {isAdmin && !accountInUse(a.id) && (
                    <button onClick={() => askConfirm(`حذف حساب «${a.name}»؟`, () => removeFaidAccount(a.id))}
                      className="absolute top-3 left-3 text-slate-200 hover:text-red-500"><Trash2 size={14} /></button>
                  )}
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-slate-700">الحركة المالية</h3>
              <button className={btnPrimary} onClick={() => { setForm({}); setModal('addFaid'); }}><Plus size={16} /> عملية يدوية</button>
            </div>

            <Tabs value={faidTab} onChange={(t) => { setFaidTab(t); if (t === 'analysis') clearFaidDrill(); }} tabs={[
              { id: 'txns', label: 'العمليات' },
              { id: 'analysis', label: 'وين راحت الفلوس' },
            ]} />

            {faidTab === 'analysis' && (
              <FaidAnalysis
                breakdown={faidBreakdown}
                onDrill={drillFaid}
              />
            )}

            {faidTab === 'txns' && <>
            {(faidProject || faidPayee) && (
              <div className="bg-brand-50 border border-brand-100 rounded-xl px-4 py-3 mb-3 flex items-center justify-between gap-3 flex-wrap">
                <div className="text-sm text-brand-900">
                  معروض:{' '}
                  {faidProject && <b>{faidProject}</b>}
                  {faidProject && faidPayee && ' · '}
                  {faidPayee && <b>{faidPayee}</b>}
                  <span className="mr-2 text-brand-700">({fmt(sumAmt(shownFaid))} ر.س من {shownFaid.length} عملية)</span>
                </div>
                <button onClick={clearFaidDrill} className="text-xs text-brand-700 font-semibold hover:underline">إلغاء الفلترة</button>
              </div>
            )}
            {faidTransactions.length > 0 && (
              <div className="mb-3">
                <FilterChips
                  options={[
                    { id: 'الكل', label: 'الكل', count: faidTransactions.length },
                    { id: 'إيراد', label: 'الإيرادات', count: faidTransactions.filter((t) => t.type === 'إيراد').length },
                    { id: 'مصروف', label: 'المصروفات', count: faidTransactions.filter((t) => t.type === 'مصروف').length },
                  ]}
                  value={faidFilter} onChange={setFaidFilter} />
                {faidFilter !== 'الكل' && (
                  <div className="mt-2 text-sm text-slate-500 px-1">
                    إجمالي {faidFilter === 'إيراد' ? 'الإيرادات' : 'المصروفات'} المعروضة:{' '}
                    <b className={faidFilter === 'إيراد' ? 'text-green-700' : 'text-red-600'}>{fmt(sumAmt(shownFaid))} ر.س</b>
                  </div>
                )}
              </div>
            )}
            {shownFaid.length === 0 ? (
              <div className={emptyCls}>
                {faidTransactions.length === 0 ? 'لا توجد عمليات بعد.'
                  : `ما فيه ${faidFilter === 'إيراد' ? 'إيرادات' : 'مصروفات'} مسجّلة.`}
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-100 overflow-x-auto">
                <table className="w-full text-sm min-w-[620px]">
                  <thead className="bg-slate-50 text-slate-500 text-xs"><tr>
                    <th className="text-right px-4 py-3 font-medium">البيان</th>
                    <th className="text-right px-4 py-3 font-medium">البند / المستفيد</th>
                    <th className="text-right px-4 py-3 font-medium">الحساب</th>
                    <th className="text-right px-4 py-3 font-medium">النوع</th>
                    <th className="text-right px-4 py-3 font-medium">التاريخ</th>
                    <th className="text-right px-4 py-3 font-medium">المبلغ</th>
                    <th className="text-right px-4 py-3 font-medium"></th>
                  </tr></thead>
                  <tbody>
                    {shownFaid.map((t) => (
                      <tr key={t.id} className="border-t border-slate-50">
                        <td className="px-4 py-3 text-slate-700">
                          {t.note || '-'}
                          {t.source && <span className="mr-2"><Badge tone="blue">مُرحّل من برنامج</Badge></span>}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {t.project && <div className="text-slate-700 text-xs font-semibold">{t.project}</div>}
                          {t.payee && <div className="text-slate-400 text-[11px]">← {t.payee}</div>}
                          {!t.project && !t.payee && <span className="text-slate-300">-</span>}
                        </td>
                        <td className="px-4 py-3"><Badge tone="slate">{t.accountName}</Badge></td>
                        <td className="px-4 py-3"><Badge tone={t.type === 'إيراد' ? 'green' : 'red'}>{t.type}</Badge></td>
                        <td className="px-4 py-3 text-slate-500">{t.date || '-'}</td>
                        <td className="px-4 py-3 font-semibold text-slate-800">{fmt(t.amount)} ر.س</td>
                        <td className="px-4 py-3 text-left">
                          <button onClick={() => askConfirm(t.source ? 'هذي عملية مُرحّلة من برنامج. حذفها يرجّع البرنامج لحالة «غير مُرحّل». تأكد؟' : 'حذف هذه العملية؟', () => deleteFaidTxn(t))}
                            className="text-slate-300 hover:text-red-500"><Trash2 size={15} /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            </>}
          </div>
        )}

        {/* -------------------------------- النادي -------------------------------- */}
        {view === 'competitions' && can('الإعداد (المسابقات)') && (
          <div>
            <div className="flex items-center justify-between mb-3 gap-3">
              <h3 className="font-bold text-slate-700">بنك المسابقات</h3>
              <button className={btnPrimary} onClick={() => { setForm({ tools: [], photos: [] }); setModal('editCompetition'); }}><Plus size={16} /> مسابقة</button>
            </div>
            <div className="text-xs text-slate-400 mb-4">كل مسابقة بفكرتها وأدواتها وصورها — مرجع تعيد استخدامه السنوات الجاية.</div>
            <FilterChips
              options={['الكل', ...LEVELS].map((lv) => ({
                id: lv, label: lv,
                count: lv === 'الكل' ? data.competitions.length : data.competitions.filter((c) => c.level === lv).length,
              }))}
              value={setupLevel} onChange={setSetupLevel} />
            <div className="h-3" />
            {(() => {
              const list = data.competitions.filter((c) => setupLevel === 'الكل' || c.level === setupLevel);
              return !list.length ? (
                <div className={emptyCls}>ما فيه مسابقات بعد. أضف أول مسابقة وتصير مرجعًا للسنوات الجاية.</div>
              ) : (
                <div className="space-y-2.5">
                  {list.map((c) => (
                    <button key={c.id} onClick={() => { setSelectedCompId(c.id); goto('competitionDetail'); }}
                      className="w-full bg-white rounded-2xl border border-slate-100 p-4 text-right hover:shadow-md transition-shadow">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-bold text-slate-800">{c.name}</div>
                          <div className="text-xs text-slate-400 mt-0.5 line-clamp-2">{c.idea || 'ما فيه وصف للفكرة'}</div>
                        </div>
                        <Badge tone="brand">{c.level}</Badge>
                      </div>
                      <div className="flex items-center gap-3 mt-3 text-[11px] text-slate-400">
                        {(c.tools || []).length > 0 && <span>🧰 {c.tools.length} أداة</span>}
                        {(c.photos || []).length > 0 && <span>📷 {c.photos.length} صورة</span>}
                        {c.date && <span>{c.date}</span>}
                      </div>
                    </button>
                  ))}
                </div>
              );
            })()}
          </div>
        )}

        {/* بطاقة المسابقة: الفكرة والأدوات والصور */}
        {view === 'competitionDetail' && competition && (
          <div>
            <Breadcrumb items={[{ label: 'النادي', onClick: () => goto('competitions') }, { label: competition.name }]} />
            <div className="flex items-center justify-between gap-2 mb-4 mt-2">
              <div className="flex items-center gap-2 min-w-0">
                <h2 className="text-lg font-bold text-slate-800 truncate">{competition.name}</h2>
                <Badge tone="brand">{competition.level}</Badge>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => { setForm({ ...competition, tools: competition.tools || [], photos: competition.photos || [] }); setModal('editCompetition'); }}
                  className="text-slate-400 hover:text-brand-700"><Pencil size={16} /></button>
                <button onClick={() => askConfirm(`حذف مسابقة «${competition.name}»؟`, () => { removeCompetition(competition.id); goto('competitions'); })}
                  className="text-slate-300 hover:text-red-500"><Trash2 size={16} /></button>
              </div>
            </div>

            <div className={cardCls + ' mb-3'}>
              <div className="text-sm font-semibold text-slate-700 mb-2">فكرة المسابقة</div>
              <div className="text-sm text-slate-600 whitespace-pre-wrap leading-relaxed">
                {competition.idea || <span className="text-slate-400">ما تكتبت الفكرة بعد. اضغط ✏️ فوق واكتبها.</span>}
              </div>
            </div>

            <div className={cardCls + ' mb-3'}>
              <div className="text-sm font-semibold text-slate-700 mb-3">الأدوات المطلوبة</div>
              {!(competition.tools || []).length ? (
                <div className="text-sm text-slate-400">ما فيه أدوات مسجّلة.</div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {competition.tools.map((t) => (
                    <span key={t.id} className="bg-brand-50 text-brand-800 rounded-xl px-3 py-2 text-sm font-medium">
                      {t.name}{t.qty > 1 && <span className="text-brand-500 mr-1.5">×{t.qty}</span>}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className={cardCls}>
              <div className="text-sm font-semibold text-slate-700 mb-3">صور مرجعية</div>
              {!(competition.photos || []).length ? (
                <div className="text-sm text-slate-400">ما فيه صور. أضفها من التعديل عشان تكون مرجعًا بصريًا.</div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {competition.photos.map((ph) => (
                    <img key={ph.id} src={ph.src} alt="" className="w-full h-32 object-cover rounded-xl border border-slate-100" />
                  ))}
                </div>
              )}
            </div>

            {competition.participants > 0 && (
              <div className="mt-3"><InfoRow icon={UsersIcon} label="عدد المشاركين آخر مرة" value={`${competition.participants}`} /></div>
            )}
          </div>
        )}

        {view === 'trips' && can('السفرات') && (
          <div>
            <div className="flex items-center justify-between mb-1 gap-3">
              <h3 className="font-bold text-slate-700">السفرات</h3>
              <button className={btnPrimary} onClick={() => { setForm({}); setModal('addTrip'); }}><Plus size={16} /> سفرة جديدة</button>
            </div>
            <div className="text-sm text-slate-400 mb-5">إيرادات ومصروفات كل سفرة على حدة - مستقلة عن فيض</div>
            {data.trips.length === 0 ? (
              <div className={emptyCls}>لا توجد سفرات بعد. أضف أول سفرة.</div>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-100 overflow-x-auto">
                <table className="w-full text-sm min-w-[620px]">
                  <thead className="bg-slate-50 text-slate-500 text-xs"><tr>
                    <th className="text-right px-4 py-3 font-medium">اسم السفرة</th>
                    <th className="text-right px-4 py-3 font-medium">التاريخ</th>
                    <th className="text-right px-4 py-3 font-medium">الإيرادات</th>
                    <th className="text-right px-4 py-3 font-medium">المصروفات</th>
                    <th className="text-right px-4 py-3 font-medium">الصافي</th>
                    <th className="text-right px-4 py-3 font-medium"></th>
                  </tr></thead>
                  <tbody>
                    {data.trips.map((t) => (
                      <tr key={t.id} className="border-t border-slate-50 hover:bg-slate-50/50 cursor-pointer" onClick={() => { setSelectedTripId(t.id); goto('tripDetail'); }}>
                        <td className="px-4 py-3 font-semibold text-slate-800">{t.name}</td>
                        <td className="px-4 py-3 text-slate-500">{t.date || '-'}</td>
                        <td className="px-4 py-3 text-green-600">{fmt(tripIncome(t))} ر.س</td>
                        <td className="px-4 py-3 text-red-500">{fmt(tripExpenses(t))} ر.س</td>
                        <td className={`px-4 py-3 font-semibold ${tripNet(t) >= 0 ? 'text-slate-800' : 'text-red-600'}`}>{fmt(tripNet(t))} ر.س</td>
                        <td className="px-4 py-3 text-left"><ChevronLeft size={16} className="text-slate-300" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {view === 'tripDetail' && trip && (
          <div>
            <Breadcrumb items={[{ label: 'السفرات', onClick: () => goto('trips') }, { label: trip.name }]} />
            <div className="flex items-center gap-2 mb-5 mt-2">
              <h2 className="text-lg sm:text-xl font-bold text-slate-800">{trip.name}</h2>
              <button onClick={() => askConfirm(`حذف سفرة «${trip.name}»؟`, () => removeTrip(trip.id))} className="text-slate-300 hover:text-red-500"><Trash2 size={15} /></button>
            </div>
            <div className={cardCls + ' mb-3'}>
              <div className="text-sm text-slate-500 mb-2">التاريخ (هـ)</div>
              <input className={inputCls} value={trip.date} onChange={(e) => patchTrip({ date: e.target.value })} placeholder="1447/03/01" />
            </div>

            <div className="grid grid-cols-3 gap-2 mb-4">
              <MiniStat label="الإيراد" value={fmt(tripIncome(trip))} icon={TrendingUp} tone="green" />
              <MiniStat label="المصروفات" value={fmt(tripExpenses(trip))} icon={TrendingDown} tone="red" />
              <MiniStat label="الصافي" value={fmt(tripNet(trip))} icon={Wallet} tone={tripNet(trip) >= 0 ? 'brand' : 'red'} />
            </div>

            <TripItems
              title="المصروفات" subtitle="كل بند باسمه: أكل، سكن، مواصلات…"
              items={trip.expenseItems} tone="red"
              onAdd={() => { setForm({ itemKey: 'expenseItems' }); setModal('addTripItem'); }}
              onRemove={(id) => removeTripItem('expenseItems', id)} />

            <div className="h-3" />

            <TripItems
              title="الإيرادات" subtitle="اشتراكات المشاركين، دعم، أي دخل للسفرة"
              items={trip.incomeItems} tone="green"
              onAdd={() => { setForm({ itemKey: 'incomeItems' }); setModal('addTripItem'); }}
              onRemove={(id) => removeTripItem('incomeItems', id)} />
          </div>
        )}

        {/* ------------------------------- الإعدادات ------------------------------- */}
        {view === 'settings' && (
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-slate-800 mb-5">الإعدادات</h2>
            <Tabs value={settingsTab} onChange={(t) => { setSettingsTab(t); setForm({}); }} tabs={[
              { id: 'users', label: 'المستخدمون والصلاحيات' },
              { id: 'terms', label: 'السنوات والفصول' },
              { id: 'signup', label: 'نموذج التسجيل' },
              { id: 'pay', label: 'طرق الدفع' },
              { id: 'backup', label: 'النسخ الاحتياطي' },
            ]} />

            {settingsTab === 'users' && (
              <div>
                <div className="flex justify-end mb-3">
                  <button className={btnPrimary} onClick={() => { setForm({ permissions: [] }); setModal('addUser'); }}><Plus size={16} /> مستخدم جديد</button>
                </div>
                {data.users.length === 0 ? (
                  <div className={emptyCls}>لا يوجد مستخدمون بعد. الصلاحيات تُدار من هنا فقط، ولا تتكرر عند تغيير الترم.</div>
                ) : (
                  <div className="bg-white rounded-2xl border border-slate-100 overflow-x-auto">
                    <table className="w-full text-sm min-w-[760px]">
                      <thead className="bg-slate-50 text-slate-500 text-xs"><tr>
                        <th className="text-right px-4 py-3 font-medium">اسم المستخدم</th>
                        <th className="text-right px-4 py-3 font-medium">الدور</th>
                        <th className="text-right px-4 py-3 font-medium">الصلاحيات</th>
                        <th className="text-right px-4 py-3 font-medium">نطاق الأيام</th>
                        <th className="text-right px-4 py-3 font-medium">الحالة</th>
                        <th className="text-right px-4 py-3 font-medium"></th>
                      </tr></thead>
                      <tbody>
                        {data.users.map((u) => (
                          <tr key={u.id} className="border-t border-slate-50">
                            <td className="px-4 py-3">
                              <div className="font-semibold text-slate-800">{u.name}</div>
                              <div className="text-[11px] text-slate-400" dir="ltr">{u.username}</div>
                            </td>
                            <td className="px-4 py-3"><Badge tone="brand">{u.role}</Badge></td>
                            <td className="px-4 py-3"><div className="flex flex-wrap gap-1">{u.permissions.length ? u.permissions.map((p) => <Badge key={p} tone="slate">{p}</Badge>) : <span className="text-slate-300 text-xs">-</span>}</div></td>
                            <td className="px-4 py-3">{u.accessScope === 'limited' ? <Badge tone="amber">{(u.allowedWeeks || []).length} محدد</Badge> : <Badge tone="slate">الكل</Badge>}</td>
                            <td className="px-4 py-3"><Badge tone={u.status === 'نشط' ? 'green' : 'slate'}>{u.status}</Badge></td>
                            <td className="px-4 py-3 text-left whitespace-nowrap">
                              <button onClick={() => { setForm({ ...u, password: '' }); setModal('editUser'); }} className="text-slate-300 hover:text-brand-600 align-middle"><Pencil size={14} /></button>
                              <button onClick={() => toggleUserStatus(u.id)} className="text-xs text-brand-600 hover:underline mr-3">{u.status === 'نشط' ? 'تعطيل' : 'تفعيل'}</button>
                              <button onClick={() => askConfirm(`حذف المستخدم «${u.name}»؟`, () => removeUser(u.id))} className="text-slate-300 hover:text-red-500 mr-3 align-middle"><Trash2 size={14} /></button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {settingsTab === 'terms' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className={cardCls}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="font-semibold text-slate-700">السنوات</div>
                    <button onClick={() => { setForm({ value: '' }); setModal('addYear'); }} className="text-brand-600"><Plus size={18} /></button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {data.years.map((y) => (
                      <span key={y} className="inline-flex items-center gap-1 bg-brand-100 text-brand-700 rounded-full pr-2.5 pl-1 py-1 text-xs font-semibold">
                        {y} هـ
                        <button onClick={() => removeYearOrTerm('year', y)} className="text-brand-400 hover:text-red-500"><X size={13} /></button>
                      </span>
                    ))}
                  </div>
                </div>
                <div className={cardCls}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="font-semibold text-slate-700">الفصول</div>
                    <button onClick={() => { setForm({ value: '' }); setModal('addTerm'); }} className="text-brand-600"><Plus size={18} /></button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {data.terms.map((t) => (
                      <span key={t} className="inline-flex items-center gap-1 bg-brand-100 text-brand-700 rounded-full pr-2.5 pl-1 py-1 text-xs font-semibold">
                        الترم {t}
                        <button onClick={() => removeYearOrTerm('term', t)} className="text-brand-400 hover:text-red-500"><X size={13} /></button>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {settingsTab === 'signup' && (
              <div className="space-y-4">
                <div className="text-sm text-slate-500">
                  هذي الخانات اللي يعبّيها ولي الأمر في كل روابط التسجيل. تعدّلها هنا مرة، وتنطبق على الكل.
                </div>
                <div className={cardCls}>
                  <div className="space-y-2">
                    {data.signupFields.map((f) => {
                      const locked = LOCKED_FIELDS.includes(f.id);
                      return (
                        <div key={f.id} className="flex items-center justify-between gap-2 bg-slate-50 rounded-xl px-3 py-2.5">
                          <div className="min-w-0">
                            <div className="text-sm text-slate-800 truncate">
                              {f.label}
                              {locked && <span className="text-[11px] text-slate-400 mr-1.5">🔒</span>}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {f.type === 'choice' ? (f.options || []).join(' / ') : f.type === 'number' ? 'رقم' : f.type === 'phone' ? 'جوال' : 'نص'}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <select className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 disabled:opacity-50"
                              disabled={locked} value={f.required ? 'req' : 'opt'}
                              onChange={(e) => save({
                                ...data,
                                signupFields: data.signupFields.map((x) => (x.id === f.id ? { ...x, required: e.target.value === 'req' } : x)),
                              })}>
                              <option value="req">مطلوب</option>
                              <option value="opt">اختياري</option>
                            </select>
                            {!locked && (
                              <button className="text-red-400 p-1"
                                onClick={() => askConfirm(`حذف خانة «${f.label}» من كل الروابط؟`, () => save({
                                  ...data, signupFields: data.signupFields.filter((x) => x.id !== f.id),
                                }))}>
                                <Trash2 size={15} />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <button className={btnGhost + ' w-full mt-3 border border-dashed border-slate-300'}
                    onClick={() => { setForm({ scope: 'global', type: 'text' }); setModal('addSignupField'); }}>
                    <Plus size={15} /> خانة جديدة
                  </button>
                </div>

                <div className="bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3 text-xs text-slate-500 flex items-start gap-2">
                  <ShieldCheck size={15} className="shrink-0 mt-0.5 text-slate-400" />
                  <span>
                    <b>جوال ولي الأمر</b> و<b>اسم الطالب</b> مقفولان وما ينحذفان:
                    الجوال هو اللي يمنع تكرار ولي الأمر لو سجّل مرة ثانية، والاسم هو المشترك نفسه.
                  </span>
                </div>

                <div className="bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3 text-xs text-slate-500">
                  رابط كل برنامج تفتحه من داخله: <b>البرامج ← افتح البرنامج ← تبويب «رابط التسجيل»</b>.
                  وهناك تحدد سعره وأيامه وطرق الدفع، وتقدر تضيف أسئلة تخصّه وحده.
                </div>
              </div>
            )}

            {settingsTab === 'pay' && (
              <div className="space-y-4">
                <div className="text-sm text-slate-500">
                  هذي حساباتك. اللي تعطيه تفاصيل تحويل يقدر يظهر لولي الأمر في روابط التسجيل،
                  وتقدر تعدّله وقت ما تبي.
                </div>
                {data.faidAccounts.map((a) => (
                  <div key={a.id} className={cardCls}>
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="min-w-0">
                        <div className="font-bold text-slate-800">{a.name}</div>
                        {a.publicName && a.publicName !== a.name && (
                          <div className="text-xs text-slate-400 mt-0.5">ولي الأمر يشوفه «{a.publicName}»</div>
                        )}
                      </div>
                      {a.needsReceipt && <Badge tone="amber">يطلب إيصال</Badge>}
                    </div>
                    <div className="bg-slate-50 rounded-xl px-3 py-2.5 mb-3">
                      <div className="text-[11px] text-slate-400 mb-0.5">الآيبان أو رقم الجوال</div>
                      <div className="text-sm text-slate-800 break-all font-mono" dir="ltr">
                        {a.transferInfo || '—'}
                      </div>
                    </div>
                    <button className={btnGhost + ' w-full border border-slate-200'}
                      onClick={() => { setForm({ id: a.id, transferInfo: a.transferInfo || '', publicName: a.publicName || '', needsReceipt: !!a.needsReceipt, name: a.name }); setModal('transferInfo'); }}>
                      <Pencil size={15} /> تعديل
                    </button>
                  </div>
                ))}
                <div className="bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3 text-xs text-slate-500 flex items-start gap-2">
                  <ShieldCheck size={15} className="shrink-0 mt-0.5 text-slate-400" />
                  <span>
                    تفاصيل التحويل تظهر لولي الأمر فقط لما تختار الحساب في «طرق الدفع المعروضة»
                    داخل رابط البرنامج. الحساب اللي ما تختاره ما تخرج بياناته أبدًا.
                  </span>
                </div>
              </div>
            )}

            {settingsTab === 'backup' && (
              <div className="space-y-4">
                <div className="bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3 text-sm text-amber-900 flex items-start gap-2">
                  <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                  <span>بياناتك محفوظة داخل هذا المتصفح فقط. لو مسحت بيانات المتصفح أو غيّرت الجهاز، تروح.
                    خذ نسخة احتياطية كل فترة — خصوصًا بعد ما تسجّل برنامج كامل.</span>
                </div>

                <div className={cardCls}>
                  <div className="font-semibold text-slate-700 mb-1">أخذ نسخة احتياطية</div>
                  <div className="text-xs text-slate-400 mb-4">
                    فيها كل شي: البرامج والأيام والمشاركين والحضور وحسابات فيض والمستخدمين.
                  </div>
                  <button className={btnPrimary + ' w-full'} onClick={copyBackup}><Layers size={16} /> نسخ البيانات</button>
                  <div className="text-xs text-slate-400 mt-2 mb-4">
                    الصقها في ملاحظات جوالك أو أرسلها لنفسك في واتساب واحتفظ فيها.
                  </div>
                  <button className="w-full bg-brand-50 text-brand-800 text-sm font-semibold px-4 py-2.5 rounded-lg flex items-center gap-1.5 justify-center" onClick={downloadBackup}>
                    <FileText size={16} /> تنزيل كملف
                  </button>
                  <div className="text-xs text-slate-400 mt-2">
                    التنزيل ما يشتغل في كل البيئات. لو ما نزّل شي، استخدم النسخ فوق.
                  </div>
                </div>

                <div className={cardCls}>
                  <div className="font-semibold text-slate-700 mb-1">استرجاع نسخة</div>
                  <div className="text-xs text-red-500 mb-4">تنبيه: الاسترجاع يستبدل كل البيانات الحالية.</div>
                  <input type="file" accept="application/json,.json" className="block w-full text-sm text-slate-500 mb-3 file:mr-0 file:ml-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-brand-50 file:text-brand-800"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      const r = new FileReader();
                      r.onload = () => previewRestore(String(r.target.result || ''));
                      r.readAsText(f);
                    }} />
                  <textarea className={inputCls + ' h-24 font-mono text-xs'} dir="ltr" placeholder='أو الصق محتوى النسخة هنا'
                    value={form.restoreText || ''} onChange={(e) => previewRestore(e.target.value)} />

                  {form.restore && (
                    <div className="bg-brand-50 rounded-xl px-4 py-3 text-sm text-brand-900 mt-3">
                      <div className="font-semibold mb-1">النسخة سليمة، وفيها:</div>
                      <div className="text-xs">{form.restore.programs} برنامج · {form.restore.weeks} يوم · {form.restore.users} مستخدم · {form.restore.txns} عملية فيض</div>
                      <button className={btnDanger + ' w-full mt-3'}
                        onClick={() => askConfirm('استبدال كل البيانات الحالية بهذه النسخة؟ ما فيه تراجع.', applyRestore, 'نعم، استرجع')}>
                        <RotateCcw size={15} /> استرجاع هذه النسخة
                      </button>
                    </div>
                  )}
                </div>

                {form.msg && <div className="text-sm text-brand-700 text-center">{form.msg}</div>}
              </div>
            )}
          </div>
        )}
        {/* ---------------------------- أولياء الأمور ---------------------------- */}
        {view === 'guardians' && canGuardians && (() => {
          const q = normalizeName(guardianSearch);
          const digits = normalizePhone(guardianSearch);
          // القائمة بأسماء الطلاب — هم اللي تشتغل عليهم، وولي الأمر تفصيل تحت الاسم
          const list = data.students.filter((s) => {
            if (!guardianSearch.trim()) return true;
            const g = data.guardians.find((x) => x.id === s.guardianId);
            if (q && normalizeName(s.name).includes(q)) return true;
            if (q && g && normalizeName(g.name).includes(q)) return true;
            if (digits && g && normalizePhone(g.phone).includes(digits)) return true;
            if (q && normalizeName(s.school || '').includes(q)) return true;
            return false;
          }).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

          return (
            <div>
              <div className="flex items-center justify-between mb-1 gap-3">
                <h2 className="text-xl font-extrabold text-slate-800">المشتركين</h2>
                <button className={btnPrimary} onClick={() => { setForm({}); setModal('newPerson'); }}><Plus size={16} /> مشترك</button>
              </div>
              <div className="text-sm text-slate-400 mb-4">
                الطلاب وأولياء أمورهم — تعيش عبر المواسم كلها، مو داخل ترم واحد.
              </div>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className={cardCls + ' text-center'}>
                  <div className="text-2xl font-extrabold text-brand-700">{data.students.length}</div>
                  <div className="text-xs text-slate-400 mt-1">طالب</div>
                </div>
                <div className={cardCls + ' text-center'}>
                  <div className="text-2xl font-extrabold text-brand-700">{data.guardians.length}</div>
                  <div className="text-xs text-slate-400 mt-1">ولي أمر</div>
                </div>
              </div>

              {duplicates.length > 0 && (
                <button className="w-full text-right bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 mb-4 flex items-start gap-2"
                  onClick={() => { setForm({}); setModal('duplicates'); }}>
                  <AlertTriangle size={16} className="shrink-0 mt-0.5 text-amber-600" />
                  <span className="text-sm text-amber-900">
                    فيه <b>{duplicates.length}</b> تكرار محتمل — راجعه واختر تدمج ولا لا.
                  </span>
                </button>
              )}

              <div className="relative mb-4">
                <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input className={inputCls + ' pr-9'} value={guardianSearch} onChange={(e) => setGuardianSearch(e.target.value)}
                  placeholder="ابحث باسم الطالب أو ولي أمره أو الجوال" />
              </div>

              {list.length === 0 ? (
                <div className={emptyCls}>
                  {data.students.length === 0
                    ? 'ما فيه مشتركين بعد. أضف واحدًا، أو خلّهم يسجّلون بأنفسهم من رابط التسجيل.'
                    : 'ما فيه نتيجة لهذا البحث.'}
                </div>
              ) : (
                <div className="space-y-2">
                  {list.map((s) => {
                    const g = data.guardians.find((x) => x.id === s.guardianId);
                    const regs = historyOf(s.id);
                    return (
                      <button key={s.id} className="w-full text-right bg-white rounded-2xl border border-slate-100 p-4 flex items-center gap-3"
                        onClick={() => { setSelectedGuardianId(s.guardianId); goto('guardianDetail'); }}>
                        <div className="w-10 h-10 rounded-full bg-brand-100 text-brand-800 font-bold flex items-center justify-center shrink-0">
                          {(s.name || '؟').slice(0, 1)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-slate-800 truncate">{s.name}</div>
                          <div className="text-xs text-slate-400 truncate">
                            {[s.age && `${s.age} سنة`, s.grade, s.school].filter(Boolean).join(' · ') || 'بلا تفاصيل'}
                          </div>
                          {g && (
                            <div className="text-xs text-slate-500 mt-1 truncate">
                              {g.name} · <span dir="ltr">{formatPhone(g.phone)}</span>
                            </div>
                          )}
                          {s.health && <div className="text-[11px] text-amber-700 mt-1 truncate">⚠ {s.health}</div>}
                        </div>
                        <div className="shrink-0 text-left">
                          {regs.length > 0
                            ? <Badge tone="brand">{regs.length} تسجيل</Badge>
                            : <Badge tone="slate">جديد</Badge>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}

        {view === 'guardianDetail' && canGuardians && (() => {
          const g = data.guardians.find((x) => x.id === selectedGuardianId);
          if (!g) return <div className={emptyCls}>ما لقيت ولي الأمر هذا.</div>;
          const { kids, regs, paid } = guardianSummary(g);
          return (
            <div>
              <Breadcrumb items={[{ label: 'المشتركين', onClick: () => goto('guardians') }, { label: g.name || 'بلا اسم' }]} />

              <div className={cardCls + ' mb-4'}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-bold text-lg text-slate-800">{g.name || 'بلا اسم'}</div>
                    <a className="text-sm text-brand-600 block mt-1" dir="ltr" href={`tel:0${normalizePhone(g.phone)}`}>{formatPhone(g.phone)}</a>
                    {g.altPhone && <div className="text-xs text-slate-400 mt-0.5" dir="ltr">{formatPhone(g.altPhone)}</div>}
                    {g.notes && <div className="text-sm text-slate-500 mt-2">{g.notes}</div>}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button className="text-slate-400 p-1.5" onClick={() => { setForm({ ...g }); setModal('editGuardian'); }}><Pencil size={16} /></button>
                    <button className="text-red-400 p-1.5"
                      onClick={() => askConfirm(
                        regs.length > 0
                          ? `حذف «${g.name}» وأبناءه من قاعدة أولياء الأمور؟ تسجيلاتهم في البرامج ومبالغها تبقى كما هي.`
                          : `حذف «${g.name}» وأبناءه؟`,
                        () => removeGuardian(g.id))}><Trash2 size={16} /></button>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-slate-100 text-center">
                  <div><div className="font-bold text-slate-800">{kids.length}</div><div className="text-[11px] text-slate-400">طالب</div></div>
                  <div><div className="font-bold text-slate-800">{regs.length}</div><div className="text-[11px] text-slate-400">تسجيل</div></div>
                  <div><div className="font-bold text-brand-700">{fmt(paid)}</div><div className="text-[11px] text-slate-400">ريال مدفوع</div></div>
                </div>
              </div>

              <div className="flex items-center justify-between mb-3 gap-3">
                <h3 className="font-bold text-slate-700">الأبناء</h3>
                <button className={btnPrimary} onClick={() => { setForm({ guardianId: g.id }); setModal('editStudent'); }}><Plus size={16} /> طالب</button>
              </div>

              {kids.length === 0 ? (
                <div className={emptyCls}>ما فيه أبناء مسجّلون تحته.</div>
              ) : (
                <div className="space-y-3">
                  {kids.map((s) => {
                    const hist = historyOf(s.id);
                    return (
                      <div key={s.id} className={cardCls}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-800">{s.name}</div>
                            <div className="text-xs text-slate-400 mt-1">
                              {[s.age && `${s.age} سنة`, s.grade, s.school].filter(Boolean).join(' · ') || 'بلا تفاصيل'}
                            </div>
                            {s.health && (
                              <div className="text-xs text-amber-700 bg-amber-50 rounded-lg px-2 py-1 mt-2 inline-flex items-center gap-1">
                                <AlertTriangle size={12} /> {s.health}
                              </div>
                            )}
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <button className="text-slate-400 p-1.5" onClick={() => { setForm({ ...s }); setModal('editStudent'); }}><Pencil size={16} /></button>
                            <button className="text-red-400 p-1.5"
                              onClick={() => askConfirm(`حذف «${s.name}» من قاعدة البيانات؟ تسجيلاته في البرامج تبقى كما هي.`, () => removeStudent(s.id))}><Trash2 size={16} /></button>
                          </div>
                        </div>
                        {hist.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-slate-100 space-y-1.5">
                            {hist.map(({ program, week, part }, i) => (
                              <div key={i} className="flex items-center justify-between text-xs gap-2">
                                <span className="text-slate-600 truncate">{program.name}{week ? ` · ${week.name}` : ''}</span>
                                <span className="shrink-0 text-slate-400">
                                  {part.pending ? <Badge tone="amber">يحتاج تأكيد</Badge>
                                    : part.accountId === 'unpaid' ? <Badge tone="red">ما دفع</Badge>
                                    : `${fmt(part.amount)} ر.س`}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}

        {/* ------------------------------- التقارير ------------------------------- */}
        {view === 'reports' && canMoney && (
          <TermReport programs={termPrograms} year={data.currentYear} term={data.currentTerm} balance={balance}
            onOpenProgram={(p) => { setSelectedProgramId(p.id); setProgramTab('days'); goto('programDetail'); }} />
        )}
      </main>

      {/* شريط التنقل السفلي */}
      <nav className="fixed bottom-0 inset-x-0 z-40 bg-white border-t border-slate-100">
        <div className="max-w-md mx-auto flex justify-around px-1 py-2">
          {navItems.slice(0, 5).map((n) => {
            const on = isNavActive(n.id);
            return (
              <button key={n.id} onClick={() => goto(n.id)}
                className={`flex flex-col items-center gap-1 px-3 py-1 rounded-xl text-[10px] font-semibold ${on ? 'text-brand-800' : 'text-slate-400'}`}>
                <n.icon size={20} />
                {n.label}
              </button>
            );
          })}
        </div>
      </nav>
      </div>

      {/* --------------------------------- المودالات --------------------------------- */}
      {/* اختيار نوع البرنامج أولًا، مثل التصميم */}
      {modal === 'pickProgramType' && (
        <Modal title="إضافة برنامج جديد" onClose={closeModal}>
          <div className="text-sm text-slate-400 -mt-3 mb-4">اختر نوع البرنامج</div>
          <div className="space-y-3">
            <PickCard icon={Calendar} title="منفصل" note="كل يوم برنامج مستقل بمشاركيه وحسابه"
              onClick={() => { setForm({ type: 'منفصل', weekCount: 8 }); setModal('addProgram'); }} />
            <PickCard icon={Layers} title="مجمع" note="عدة أيام في برنامج واحد، والمشترك يختار أيامه"
              onClick={() => { setForm({ type: 'مجمع', weekCount: 4 }); setModal('addProgram'); }} />
          </div>
        </Modal>
      )}

      {modal === 'addProgram' && (
        <Modal title={`إضافة برنامج ${form.type || 'منفصل'}`} onClose={closeModal}>
          <Field label="اسم البرنامج"><input className={inputCls} value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value, error: '' })} placeholder="مثال: جمعة الرواد" /></Field>
          <Field label={form.type === 'مجمع' ? 'عدد الأيام' : 'عدد الأسابيع'}
            hint={Number(form.weekCount || 0) > 0
              ? `سيتم إنشاء ${form.weekCount} ${form.type === 'مجمع' ? 'يوم داخل البرنامج' : 'أسبوع مستقل'}. تقدر تزيد أو تحذف بعدين.`
              : 'تقدر تبدأ بصفر وتضيف الأيام يدويًا.'}>
            <Stepper value={form.weekCount ?? (form.type === 'مجمع' ? 4 : 8)} min={0} max={60}
              onChange={(v) => setForm({ ...form, weekCount: v })} />
          </Field>
          {form.type === 'مجمع' && (
            <Field label="سعر اليوم (اختياري)" hint="لو حطيته، يُقترح مبلغ كل مشترك تلقائيًا حسب عدد أيامه، وتقدر تعدّله دايم.">
              <input type="number" className={inputCls} value={form.dayPrice || ''} onChange={(e) => setForm({ ...form, dayPrice: e.target.value })} placeholder="مثال: 50" />
            </Field>
          )}
          {form.error && <div className="text-red-500 text-xs mb-3">{form.error}</div>}
          <div className="flex gap-2 mt-5"><button className={btnPrimary + ' flex-1'} onClick={addProgram}>إضافة</button><button className={btnGhost} onClick={closeModal}>إلغاء</button></div>
        </Modal>
      )}

      {modal === 'editProgram' && (
        <Modal title="تعديل البرنامج" onClose={closeModal}>
          <Field label="اسم البرنامج"><input className={inputCls} value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          {isGrouped && (
            <Field label="سعر اليوم (اختياري)" hint="يُستخدم لاقتراح مبلغ المشترك حسب عدد أيامه فقط، وما يغيّر المبالغ المسجّلة سابقًا.">
              <input type="number" className={inputCls} value={form.dayPrice ?? ''} onChange={(e) => setForm({ ...form, dayPrice: e.target.value })} placeholder="مثال: 50" />
            </Field>
          )}
          <div className="flex gap-2 mt-5">
            <button className={btnPrimary + ' flex-1'}
              onClick={() => { if (form.name) { patchProgram({ name: form.name.trim(), ...(isGrouped ? { dayPrice: Number(form.dayPrice || 0) } : {}) }); closeModal(); } }}>حفظ</button>
            <button className={btnGhost} onClick={closeModal}>إلغاء</button>
          </div>
        </Modal>
      )}

      {modal === 'addWeek' && (
        <Modal title={isGrouped ? 'يوم جديد' : 'أسبوع/يوم جديد'} onClose={closeModal}>
          <Field label="الاسم"><input className={inputCls} value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value, error: '' })} placeholder={isGrouped ? 'اليوم الأول' : 'الأسبوع الخامس'} /></Field>
          <Field label="التاريخ (هـ)"><input className={inputCls} value={form.date || ''} onChange={(e) => setForm({ ...form, date: e.target.value })} placeholder="1447/02/01" /></Field>
          {form.error && <div className="text-red-500 text-xs mb-3">{form.error}</div>}
          <div className="flex gap-2 mt-5"><button className={btnPrimary + ' flex-1'} onClick={addWeek}>إضافة</button><button className={btnGhost} onClick={closeModal}>إلغاء</button></div>
        </Modal>
      )}

      {modal === 'editWeek' && week && (
        <Modal title="تعديل اليوم" onClose={closeModal}>
          <Field label="الاسم" hint="سمّه زي ما تبي: «جمعة ١٩ محرم»، «اليوم الرياضي»، أو أي اسم يناسبك.">
            <input className={inputCls} value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="التاريخ (هـ)">
            <input className={inputCls} value={form.date || ''} onChange={(e) => setForm({ ...form, date: e.target.value })} placeholder="1447/01/19" />
          </Field>
          <div className="flex gap-2 mt-5">
            <button className={btnPrimary + ' flex-1'} onClick={() => { if (form.name?.trim()) { patchWeek({ name: form.name.trim(), date: form.date || '' }); closeModal(); } }}>حفظ</button>
            <button className={btnGhost} onClick={closeModal}>إلغاء</button>
          </div>
        </Modal>
      )}

      {(modal === 'addParticipant' || modal === 'editParticipant') && (
        <Modal title={modal === 'addParticipant' ? (isGrouped ? 'إضافة مشترك' : 'إضافة مشارك') : 'تعديل المشارك'} onClose={closeModal}>
          {/*
            الاسم يبحث في قاعدة المشتركين وأنت تكتب: تختار الموجود فينربط تسجيله
            بسجلّه (فتعرف بعدين كم برنامجًا حضر وكم دفع)، أو تكمل باسم جديد.
          */}
          <Field label="اسم الطالب"
            hint={form.studentId ? undefined : (canGuardians ? 'اكتب الاسم — لو مسجّل عندك من قبل بيطلع لك.' : undefined)}>
            <input className={inputCls} value={form.name || ''} autoComplete="off"
              onChange={(e) => setForm({ ...form, name: e.target.value, studentId: null, error: '' })} />
          </Field>

          {form.studentId && (() => {
            const s = data.students.find((x) => x.id === form.studentId);
            const g = s && data.guardians.find((x) => x.id === s.guardianId);
            return (
              <div className="-mt-2 mb-4 bg-brand-50 rounded-xl px-3 py-2 flex items-center justify-between gap-2">
                <div className="text-xs text-brand-900 min-w-0">
                  <b>مربوط بسجلّه</b>
                  {g && <span className="text-brand-700"> · ولي الأمر: {g.name}</span>}
                  {s?.health && <span className="block text-amber-700 mt-0.5">⚠ {s.health}</span>}
                </div>
                <button type="button" className="text-xs text-slate-500 shrink-0" onClick={() => setForm({ ...form, studentId: null })}>فك</button>
              </div>
            );
          })()}

          {canGuardians && !form.studentId && (form.name || '').trim().length >= 2 && (() => {
            const q = normalizeName(form.name);
            const hits = data.students
              .filter((s) => normalizeName(s.name).includes(q))
              .slice(0, 5);
            if (!hits.length) return null;
            return (
              <div className="-mt-2 mb-4 border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden">
                {hits.map((s) => {
                  const g = data.guardians.find((x) => x.id === s.guardianId);
                  return (
                    <button key={s.id} type="button" className="w-full text-right px-3 py-2.5 hover:bg-slate-50"
                      onClick={() => setForm({ ...form, name: s.name, studentId: s.id, error: '' })}>
                      <div className="text-sm font-semibold text-slate-800">{s.name}</div>
                      <div className="text-[11px] text-slate-400">
                        {[g?.name, s.school, s.age && `${s.age} سنة`].filter(Boolean).join(' · ') || 'بلا تفاصيل'}
                      </div>
                    </button>
                  );
                })}
              </div>
            );
          })()}

          <Field label="طريقة الدفع / التصنيف">
            <select className={inputCls} value={form.accountId || data.faidAccounts[0]?.id || ''}
              onChange={(e) => setForm({ ...form, accountId: e.target.value, ...(e.target.value === 'unpaid' ? { amount: 0 } : {}) })}>
              {data.faidAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              <option value="unpaid">ما دفع</option>
            </select>
          </Field>
          {isGrouped && (
            <Field label="الأيام المسجّل فيها" hint="يقدر يسجّل كل الأيام، أو يوم واحد، أو يجي متأخر ويسجّل من اليوم الثالث.">
              <div className="flex items-center gap-2 mb-2">
                <button type="button" onClick={() => toggleAllParticipantDays(true)} className="text-xs text-brand-600 hover:underline">تحديد الكل</button>
                <span className="text-slate-200">|</span>
                <button type="button" onClick={() => toggleAllParticipantDays(false)} className="text-xs text-slate-500 hover:underline">إلغاء الكل</button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(program?.weeks || []).map((w) => {
                  const on = (form.days || []).includes(w.id);
                  return (
                    <button key={w.id} type="button" onClick={() => toggleParticipantDay(w.id)}
                      className={`text-xs px-3 py-2 rounded-lg border text-right ${on ? 'bg-brand-600 text-white border-brand-600' : 'border-slate-200 text-slate-600'}`}>
                      {w.name}{w.date ? <span className={`block text-[10px] ${on ? 'text-brand-200' : 'text-slate-400'}`}>{w.date}</span> : null}
                    </button>
                  );
                })}
              </div>
              <div className="text-xs text-slate-500 mt-2">مسجّل في <b>{(form.days || []).length}</b> من {(program?.weeks || []).length} يوم</div>
            </Field>
          )}
          {form.accountId !== 'unpaid' && (
            <Field
              label={isGrouped ? 'مبلغ الاشتراك (ر.س)' : 'المبلغ (ر.س)'}
              hint={isGrouped
                ? (Number(program?.dayPrice || 0) > 0
                  ? `مقترح من سعر اليوم (${fmt(program.dayPrice)} ر.س × ${(form.days || []).length} يوم). تقدر تعدّله.`
                  : 'المبلغ المدفوع فعليًا عن الأيام المسجّل فيها، يُحتسب مرة وحدة.')
                : undefined}>
              <input type="number" className={inputCls} value={form.amount ?? ''}
                onChange={(e) => setForm({ ...form, amount: e.target.value, amountTouched: true })} />
            </Field>
          )}
          {form.error && <div className="text-red-500 text-xs mb-3">{form.error}</div>}
          <div className="flex gap-2 mt-5">
            <button className={btnPrimary + ' flex-1'} onClick={modal === 'addParticipant' ? addParticipant : saveParticipantEdit}>
              {modal === 'addParticipant' ? 'إضافة' : 'حفظ'}
            </button>
            <button className={btnGhost} onClick={closeModal}>إلغاء</button>
          </div>
        </Modal>
      )}

      {modal === 'add_collections' && (
        <LedgerItemModal title="تحصيل إضافي" accounts={data.faidAccounts} form={form} setForm={setForm}
          accountLabel="استلم في حساب" notePlaceholder="مثال: تحصيل عام للبرنامج"
          hint="يُضاف لإيراد البرنامج. ما يمس رصيد فيض إلا لما ترحّل نصيب فيض."
          onSubmit={() => addLedgerItem('collections')} onClose={closeModal} />
      )}
      {modal === 'add_expenseItems' && (
        <LedgerItemModal title="مصروف برنامج" accounts={data.faidAccounts} form={form} setForm={setForm}
          accountLabel="صُرف من حساب" notePlaceholder="مثال: ميداليات"
          hint="يُخصم من إيراد البرنامج قبل التوزيع بين المدرسة وفيض."
          onSubmit={() => addLedgerItem('expenseItems')} onClose={closeModal} />
      )}
      {modal === 'add_schoolPayouts' && (
        <LedgerItemModal title="نصيب مدارس الرواد" accounts={data.faidAccounts} form={form} setForm={setForm}
          accountLabel="صُرف من حساب" notePlaceholder="مثال: تسليم نقدي"
          hint="جزء من الصافي بعد خصم المصروفات."
          onSubmit={() => addLedgerItem('schoolPayouts')} onClose={closeModal} />
      )}
      {modal === 'add_faidPayouts' && (
        <LedgerItemModal title="نصيب فريق فيض" accounts={data.faidAccounts} form={form} setForm={setForm}
          accountLabel="الحساب المرجعي" notePlaceholder="مثال: نصيب الفريق"
          hint="بعد تسجيله تقدر ترحّله لرصيد فيض بضغطة زر من لوحة التوزيع."
          onSubmit={() => addLedgerItem('faidPayouts')} onClose={closeModal} />
      )}

      {modal === 'transferFaid' && activeLedger && (
        <Modal title="ترحيل نصيب فيض إلى الرصيد" onClose={closeModal} wide>
          <div className="bg-brand-50 rounded-xl px-4 py-3 mb-4 text-sm text-brand-800">
            المبلغ المُرحّل: <b>{fmt(L.faid(activeLedger))} ر.س</b>
            <div className="text-xs text-brand-600 mt-1">راح تُسجَّل عملية «إيراد» في فيض، ويقدر ترجع عنها بإلغاء الترحيل.</div>
          </div>

          <div className="flex items-center gap-2 mb-4">
            <button type="button" onClick={() => setForm({ ...form, splitMode: !form.splitMode, splitRows: [{}, {}], error: '' })}
              className={`text-xs px-3 py-1.5 rounded-lg border ${form.splitMode ? 'bg-brand-600 text-white border-brand-600' : 'border-slate-200 text-slate-600'}`}>
              تقسيم المبلغ على أكثر من حساب
            </button>
          </div>

          {!form.splitMode ? (
            <Field label="يدخل في حساب">
              <select className={inputCls} value={form.accountId || ''} onChange={(e) => setForm({ ...form, accountId: e.target.value, error: '' })}>
                <option value="">اختر الحساب</option>
                {data.faidAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </Field>
          ) : (
            <Field label="توزيع المبلغ على الحسابات">
              <div className="space-y-2">
                {(form.splitRows || [{}, {}]).map((row, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <select className={inputCls} value={row.accountId || ''} onChange={(e) => updateSplitRow(idx, { accountId: e.target.value })}>
                      <option value="">الحساب</option>
                      {data.faidAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                    <input type="number" className={inputCls} placeholder="المبلغ" value={row.amount || ''} onChange={(e) => updateSplitRow(idx, { amount: e.target.value })} />
                    <button type="button" onClick={() => removeSplitRow(idx)} className="text-slate-400 hover:text-red-500 shrink-0"><X size={16} /></button>
                  </div>
                ))}
                <button type="button" onClick={addSplitRow} className="text-xs text-brand-600 flex items-center gap-1"><Plus size={14} /> إضافة حساب</button>
                <div className="text-xs text-slate-400 pt-1">
                  المجموع: {fmt(sumAmt(form.splitRows))} من {fmt(L.faid(activeLedger))} ر.س
                </div>
              </div>
            </Field>
          )}

          <Field label="البيان"><input className={inputCls} value={form.note || ''} onChange={(e) => setForm({ ...form, note: e.target.value })}
            placeholder={isGrouped ? `نصيب فيض - ${program?.name}` : `نصيب فيض - ${program?.name} - ${week?.name}`} /></Field>
          <Field label="التاريخ (هـ)"><input className={inputCls} value={form.date || ''} onChange={(e) => setForm({ ...form, date: e.target.value })} placeholder="1447/02/01" /></Field>
          {form.error && <div className="text-red-500 text-xs mb-3">{form.error}</div>}
          <div className="flex gap-2 mt-5"><button className={btnPrimary + ' flex-1'} onClick={doTransferFaid}><Send size={15} /> ترحيل</button><button className={btnGhost} onClick={closeModal}>إلغاء</button></div>
        </Modal>
      )}

      {modal === 'addFaid' && (
        <Modal title="عملية يدوية - فيض" onClose={closeModal} wide>
          <Field label="النوع">
            <div className="flex gap-2">
              {['إيراد', 'مصروف'].map((t) => (
                <button key={t} onClick={() => setForm({ ...form, type: t })}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border ${(form.type || 'إيراد') === t ? 'bg-brand-600 text-white border-brand-600' : 'border-slate-200 text-slate-600'}`}>{t}</button>
              ))}
            </div>
          </Field>

          <div className="flex items-center gap-2 mb-4">
            <button type="button" onClick={() => setForm({ ...form, splitMode: !form.splitMode, splitRows: [{}, {}] })}
              className={`text-xs px-3 py-1.5 rounded-lg border ${form.splitMode ? 'bg-brand-600 text-white border-brand-600' : 'border-slate-200 text-slate-600'}`}>
              تقسيم المبلغ على أكثر من حساب
            </button>
          </div>

          {!form.splitMode && (
            <>
              <Field label="الحساب">
                <select className={inputCls} value={form.accountId || ''} onChange={(e) => setForm({ ...form, accountId: e.target.value, error: '' })}>
                  <option value="">اختر الحساب</option>
                  {data.faidAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </Field>
              <Field label="المبلغ (ر.س)"><input type="number" className={inputCls} value={form.amount || ''} onChange={(e) => setForm({ ...form, amount: e.target.value, error: '' })} /></Field>
            </>
          )}

          {form.splitMode && (
            <Field label="توزيع المبلغ على الحسابات">
              <div className="space-y-2">
                {(form.splitRows || [{}, {}]).map((row, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <select className={inputCls} value={row.accountId || ''} onChange={(e) => updateSplitRow(idx, { accountId: e.target.value })}>
                      <option value="">الحساب</option>
                      {data.faidAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                    <input type="number" className={inputCls} placeholder="المبلغ" value={row.amount || ''} onChange={(e) => updateSplitRow(idx, { amount: e.target.value })} />
                    <button type="button" onClick={() => removeSplitRow(idx)} className="text-slate-400 hover:text-red-500 shrink-0"><X size={16} /></button>
                  </div>
                ))}
                <button type="button" onClick={addSplitRow} className="text-xs text-brand-600 flex items-center gap-1"><Plus size={14} /> إضافة حساب</button>
                <div className="text-xs text-slate-400 pt-1">الإجمالي: {fmt(sumAmt(form.splitRows))} ر.س</div>
              </div>
            </Field>
          )}

          <Field label="البند" hint="على وش صُرف أو منين جا: برنامج خيركم، رواتب، تشغيلي…">
            <input className={inputCls} list="faid-projects" value={form.project || ''} onChange={(e) => setForm({ ...form, project: e.target.value })} placeholder="برنامج خيركم" />
            <datalist id="faid-projects">{faidValues('project').map((v) => <option key={v} value={v} />)}</datalist>
          </Field>
          <Field label="المستفيد (اختياري)" hint="مين استلم المبلغ: فهد، عبدالعزيز…">
            <input className={inputCls} list="faid-payees" value={form.payee || ''} onChange={(e) => setForm({ ...form, payee: e.target.value })} placeholder="فهد" />
            <datalist id="faid-payees">{faidValues('payee').map((v) => <option key={v} value={v} />)}</datalist>
          </Field>
          <Field label="البيان"><input className={inputCls} value={form.note || ''} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="مثال: راتب الترم الأول" /></Field>
          <Field label="التاريخ (هـ)"><input className={inputCls} value={form.date || ''} onChange={(e) => setForm({ ...form, date: e.target.value })} placeholder="1448/02/01" /></Field>
          {form.error && <div className="text-red-500 text-xs mb-3">{form.error}</div>}
          <div className="flex gap-2 mt-5"><button className={btnPrimary + ' flex-1'} onClick={addFaidAdjustment}>إضافة</button><button className={btnGhost} onClick={closeModal}>إلغاء</button></div>
        </Modal>
      )}

      {modal === 'addFaidAccount' && (
        <Modal title="حساب فيض جديد" onClose={closeModal}>
          <Field label="اسم الحساب"><input className={inputCls} value={form.value || ''} onChange={(e) => setForm({ ...form, value: e.target.value })} placeholder="مثال: أبو فارس" /></Field>
          <div className="flex gap-2 mt-5"><button className={btnPrimary + ' flex-1'} onClick={addFaidAccount}>إضافة</button><button className={btnGhost} onClick={closeModal}>إلغاء</button></div>
        </Modal>
      )}

      {(modal === 'addUser' || modal === 'editUser') && (
        <Modal title={modal === 'editUser' ? 'تعديل المستخدم' : (data.users.length === 0 ? 'أنشئ حسابك أنت أولًا' : 'مستخدم جديد')} onClose={closeModal} wide>
          {modal === 'addUser' && data.users.length === 0 && (
            <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 text-sm text-amber-900 mb-4 flex items-start gap-2">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <span>أول ما تضيف مستخدم، يصير الدخول إجباريًا. فأنشئ <b>حسابك أنت</b> أول (بدور مدير)، وبعدها ضيف بقية الفريق — وإلا انقفلت برّا التطبيق.</span>
            </div>
          )}
          <Field label="الاسم"><input className={inputCls} value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="اسم المستخدم" hint="اللي يكتبه عند الدخول. حروف إنجليزية وأرقام بدون مسافات.">
            <input className={inputCls} dir="ltr" value={form.username || ''} onChange={(e) => setForm({ ...form, username: e.target.value, error: '' })} placeholder="saad" />
          </Field>
          <Field label={modal === 'editUser' ? 'كلمة مرور جديدة (اتركها فاضية لو ما تبي تغيّرها)' : 'كلمة المرور'}>
            <input className={inputCls} dir="ltr" value={form.password || ''} onChange={(e) => setForm({ ...form, password: e.target.value, error: '' })} placeholder="••••••" />
          </Field>
          <Field label="الدور" hint={modal === 'addUser' && data.users.length === 0
            ? 'أول حساب لازم يكون مديرًا — هذا حسابك أنت.'
            : 'دور «مدير» يملك كل الصلاحيات ويقدر يدير المستخدمين.'}>
            <select className={inputCls} disabled={modal === 'addUser' && data.users.length === 0}
              value={modal === 'addUser' && data.users.length === 0 ? 'مدير' : (form.role || ROLES[0])}
              onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </Field>
          <Field label="الصلاحيات (الأقسام التي يقدر يشوفها)" hint="دور «مدير» يملك كل الصلاحيات تلقائيًا.">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {PERMS.map((p) => (
                <button key={p} type="button" onClick={() => togglePerm(p)}
                  className={`text-xs px-3 py-2 rounded-lg border text-right ${(form.permissions || []).includes(p) ? 'bg-brand-600 text-white border-brand-600' : 'border-slate-200 text-slate-600'}`}>{p}</button>
              ))}
            </div>
          </Field>
          <Field label="نطاق الوصول للأيام">
            <div className="flex gap-2 mb-2">
              {[{ v: 'all', l: 'كل الأيام' }, { v: 'limited', l: 'أيام محددة فقط' }].map((o) => (
                <button key={o.v} type="button" onClick={() => setForm({ ...form, accessScope: o.v })}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border ${(form.accessScope || 'all') === o.v ? 'bg-brand-600 text-white border-brand-600' : 'border-slate-200 text-slate-600'}`}>{o.l}</button>
              ))}
            </div>
            {form.accessScope === 'limited' && (
              <div className="text-xs text-brand-800 bg-brand-50 border border-brand-100 rounded-lg px-3 py-2 mb-2">
                الأيام اللي تحددها له يقدر يحضّرها ويسجّل فيها، حتى لو ما علّمت له صلاحية «الأسابيع والحضور».
              </div>
            )}
            {form.accessScope === 'limited' && (
              <div className="max-h-40 overflow-y-auto border border-slate-100 rounded-lg p-2 space-y-1">
                {data.programs.length === 0 && <div className="text-xs text-slate-400 p-2">لا توجد برامج/أيام بعد</div>}
                {data.programs.map((p) => (
                  <div key={p.id}>
                    <div className="text-xs font-semibold text-slate-500 px-1 pt-1">{p.name}</div>
                    {p.weeks.map((w) => (
                      <label key={w.id} className="flex items-center gap-2 px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50 rounded cursor-pointer">
                        <input type="checkbox" checked={(form.allowedWeeks || []).some((a) => a.programId === p.id && a.weekId === w.id)} onChange={() => toggleAllowedWeek(p.id, w.id)} />
                        {w.name}
                      </label>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </Field>
          {form.error && <div className="text-red-500 text-xs mb-3">{form.error}</div>}
          <div className="flex gap-2 mt-5"><button className={btnPrimary + ' flex-1'} onClick={saveUser}>{modal === 'editUser' ? 'حفظ' : 'إضافة'}</button><button className={btnGhost} onClick={closeModal}>إلغاء</button></div>
        </Modal>
      )}

      {modal === 'editCompetition' && (
        <Modal title={form.id ? 'تعديل المسابقة' : 'مسابقة جديدة'} onClose={closeModal} wide>
          <Field label="اسم المسابقة">
            <input className={inputCls} value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value, error: '' })} placeholder="مثال: سباق الأقماع" />
          </Field>
          <Field label="فكرة المسابقة" hint="اشرحها بحيث أي أحد يقراها بعد سنة يقدر ينفذها.">
            <textarea className={inputCls + ' h-28'} value={form.idea || ''} onChange={(e) => setForm({ ...form, idea: e.target.value })}
              placeholder="تُقسّم المجموعة فريقين، وكل فريق يمرّر الكورة بين الأقماع بدون ما تطيح…" />
          </Field>
          <Field label="المرحلة">
            <div className="flex gap-2">
              {LEVELS.map((lv) => (
                <button key={lv} type="button" onClick={() => setForm({ ...form, level: lv })}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border ${(form.level || LEVELS[0]) === lv ? 'bg-brand-700 text-white border-brand-700' : 'border-slate-200 text-slate-600'}`}>{lv}</button>
              ))}
            </div>
          </Field>

          <Field label="الأدوات المطلوبة" hint="اسم الأداة وكميتها. مثال: أقماع ٦، كورة ٢.">
            <div className="flex gap-2 mb-2">
              <input className={inputCls} value={form.toolName || ''} onChange={(e) => setForm({ ...form, toolName: e.target.value })}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTool(); } }} placeholder="أقماع" />
              <input type="number" className={inputCls + ' w-24'} value={form.toolQty || ''} onChange={(e) => setForm({ ...form, toolQty: e.target.value })} placeholder="العدد" />
              <button type="button" onClick={addTool} className="bg-brand-50 text-brand-800 px-4 rounded-lg text-sm font-semibold shrink-0">إضافة</button>
            </div>
            {(form.tools || []).length > 0 && (
              <div className="flex flex-wrap gap-2">
                {form.tools.map((t) => (
                  <span key={t.id} className="inline-flex items-center gap-1.5 bg-slate-100 text-slate-700 rounded-lg pr-3 pl-1.5 py-1.5 text-sm">
                    {t.name}{t.qty > 1 && <span className="text-slate-400">×{t.qty}</span>}
                    <button type="button" onClick={() => removeTool(t.id)} className="text-slate-400 hover:text-red-500"><X size={13} /></button>
                  </span>
                ))}
              </div>
            )}
          </Field>

          <Field label="صور مرجعية" hint="تُصغَّر تلقائيًا قبل الحفظ. خلّها في حدود ٦ صور للمسابقة عشان التخزين المحلي.">
            <input type="file" accept="image/*" multiple onChange={(e) => { addPhotos(e.target.files); e.target.value = ''; }}
              className="block w-full text-sm text-slate-500 file:mr-0 file:ml-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-brand-50 file:text-brand-800" />
            {(form.photos || []).length > 0 && (
              <div className="grid grid-cols-3 gap-2 mt-3">
                {form.photos.map((ph) => (
                  <div key={ph.id} className="relative">
                    <img src={ph.src} alt="" className="w-full h-20 object-cover rounded-lg border border-slate-100" />
                    <button type="button" onClick={() => removePhoto(ph.id)}
                      className="absolute top-1 left-1 bg-white/90 rounded-full p-1 text-slate-500 hover:text-red-500"><X size={12} /></button>
                  </div>
                ))}
              </div>
            )}
          </Field>

          <Field label="تاريخ التنفيذ (هـ) — اختياري">
            <input className={inputCls} value={form.date || ''} onChange={(e) => setForm({ ...form, date: e.target.value })} placeholder="1448/02/10" />
          </Field>
          <Field label="عدد المشاركين — اختياري">
            <input type="number" className={inputCls} value={form.participants || ''} onChange={(e) => setForm({ ...form, participants: e.target.value })} />
          </Field>
          {form.error && <div className="text-red-500 text-xs mb-3">{form.error}</div>}
          <div className="flex gap-2 mt-5">
            <button className={btnPrimary + ' flex-1'} onClick={saveCompetition}>{form.id ? 'حفظ' : 'إضافة'}</button>
            <button className={btnGhost} onClick={closeModal}>إلغاء</button>
          </div>
        </Modal>
      )}

      {modal === 'addTripItem' && (
        <Modal title={form.itemKey === 'expenseItems' ? 'مصروف جديد' : 'إيراد جديد'} onClose={closeModal}>
          <Field label="البند" hint={form.itemKey === 'expenseItems' ? 'مثال: أكل، سكن، مواصلات، تذاكر' : 'مثال: اشتراكات المشاركين، دعم'}>
            <input className={inputCls} value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value, error: '' })}
              placeholder={form.itemKey === 'expenseItems' ? 'أكل' : 'اشتراكات'} />
          </Field>
          <Field label="المبلغ (ر.س)">
            <input type="number" className={inputCls} value={form.amount || ''} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </Field>
          {form.error && <div className="text-red-500 text-xs mb-3">{form.error}</div>}
          <div className="flex gap-2 mt-5">
            <button className={btnPrimary + ' flex-1'} onClick={() => addTripItem(form.itemKey)}>إضافة</button>
            <button className={btnGhost} onClick={closeModal}>إلغاء</button>
          </div>
        </Modal>
      )}

      {modal === 'addTrip' && (
        <Modal title="سفرة جديدة" onClose={closeModal}>
          <Field label="اسم السفرة"><input className={inputCls} value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="مثال: سفرة القصيم" /></Field>
          <Field label="التاريخ (هـ)"><input className={inputCls} value={form.date || ''} onChange={(e) => setForm({ ...form, date: e.target.value })} placeholder="1447/03/01" /></Field>
          <div className="flex gap-2 mt-5"><button className={btnPrimary + ' flex-1'} onClick={addTrip}>إضافة</button><button className={btnGhost} onClick={closeModal}>إلغاء</button></div>
        </Modal>
      )}

      {modal === 'addYear' && (
        <Modal title="إضافة سنة" onClose={closeModal}>
          <Field label="السنة (هـ)"><input className={inputCls} value={form.value || ''} onChange={(e) => setForm({ ...form, value: e.target.value })} placeholder="1449" /></Field>
          <div className="flex gap-2 mt-5"><button className={btnPrimary + ' flex-1'} onClick={() => addYearOrTerm('year')}>إضافة</button><button className={btnGhost} onClick={closeModal}>إلغاء</button></div>
        </Modal>
      )}

      {modal === 'addTerm' && (
        <Modal title="إضافة فصل" onClose={closeModal}>
          <Field label="اسم الفصل"><input className={inputCls} value={form.value || ''} onChange={(e) => setForm({ ...form, value: e.target.value })} placeholder="الترم الثالث" /></Field>
          <div className="flex gap-2 mt-5"><button className={btnPrimary + ' flex-1'} onClick={() => addYearOrTerm('term')}>إضافة</button><button className={btnGhost} onClick={closeModal}>إلغاء</button></div>
        </Modal>
      )}

      {/* تسجيل الطلاب والإيراد للبرنامج المنفصل — شاشة 10 بالتصميم */}
      {modal === 'quickRegister' && week && (
        <Modal title="تسجيل الطلاب والإيراد" onClose={closeModal}>
          <Field label="عدد الطلاب">
            <Stepper value={form.quickCount ?? 0} min={0} max={999} onChange={(v) => setForm({ ...form, quickCount: v })} />
          </Field>
          <Field label="مبلغ الإيراد (ريال)" hint="إجمالي اللي تحصّل من الطلاب في هذا اليوم.">
            <input type="number" className={inputCls} value={form.quickRevenue ?? ''}
              onChange={(e) => setForm({ ...form, quickRevenue: e.target.value })} placeholder="1500" />
          </Field>
          <Field label="التاريخ (هـ)">
            <input className={inputCls} value={form.date || ''} onChange={(e) => setForm({ ...form, date: e.target.value })} placeholder="1447/01/19" />
          </Field>
          <div className="flex gap-2 mt-5">
            <button className={btnPrimary + ' flex-1'} onClick={() => {
              patchWeek({ quickCount: Number(form.quickCount || 0), quickRevenue: Number(form.quickRevenue || 0), date: form.date || '' });
              closeModal();
            }}>حفظ</button>
            <button className={btnGhost} onClick={closeModal}>إلغاء</button>
          </div>
        </Modal>
      )}

      {modal === 'transferInfo' && (
        <Modal title={`تفاصيل تحويل «${form.name}»`} onClose={closeModal}>
          <div className="text-sm text-slate-500 mb-4">
            تظهر لولي الأمر في رابط التسجيل لما يختار هذا الحساب. اتركها فاضية لو الدفع عند الحضور (كاش).
          </div>
          <Field label="الاسم اللي يشوفه ولي الأمر" hint="اتركه فاضيًا لو تبيه نفس اسم الحساب. مثال: حساب «أبو فارس» عندك، وولي الأمر يشوف «STC Pay».">
            <input className={inputCls} value={form.publicName ?? ''}
              onChange={(e) => setForm({ ...form, publicName: e.target.value })} placeholder={form.name} />
          </Field>
          <Field label="الآيبان أو رقم الجوال">
            <input className={inputCls} dir="ltr" value={form.transferInfo || ''}
              onChange={(e) => setForm({ ...form, transferInfo: e.target.value })}
              placeholder="SA00 0000 0000 0000 0000 0000" />
          </Field>
          <label className="flex items-start gap-2 mb-4 text-sm text-slate-700">
            <input type="checkbox" className="mt-1" checked={!!form.needsReceipt}
              onChange={(e) => setForm({ ...form, needsReceipt: e.target.checked })} />
            <span>
              يطلب إيصال
              <span className="block text-xs text-slate-400 mt-0.5">
                ما يكمل التسجيل إلا لو أرفق صورة التحويل. علّمها للراجحي و STC، واتركها للكاش.
              </span>
            </span>
          </label>
          <div className="flex gap-2 mt-2">
            <button className={btnPrimary + ' flex-1'}
              onClick={() => {
                save({ ...data, faidAccounts: data.faidAccounts.map((a) => (a.id === form.id ? {
                  ...a, transferInfo: (form.transferInfo || '').trim(), publicName: (form.publicName || '').trim(),
                  needsReceipt: !!form.needsReceipt,
                } : a)) });
                closeModal();
              }}>حفظ</button>
            <button className={btnGhost} onClick={closeModal}>إلغاء</button>
          </div>
        </Modal>
      )}

      {modal === 'investment' && (() => {
        const dirIn = (form.dir || 'in') === 'in';
        const acc = accountStats.find((a) => a.id === form.accountId);
        const cap = dirIn ? (acc?.balance ?? 0) : investmentBalance;
        return (
          <Modal title={dirIn ? 'تحويل للاستثمار' : 'سحب من الاستثمار'} onClose={closeModal}>
            <div className="text-sm text-slate-500 mb-4">
              {dirIn
                ? 'المبلغ يطلع من الحساب ويُحجز في الاستثمار، فينقص رصيد الفريق بقدره. وما يُحسب مصروفًا في التقارير.'
                : 'المبلغ يرجع من الاستثمار للحساب، فيزيد رصيد الفريق بقدره.'}
            </div>
            <Field label={dirIn ? 'من حساب' : 'إلى حساب'}>
              <select className={inputCls} value={form.accountId || ''}
                onChange={(e) => setForm({ ...form, accountId: e.target.value, error: '' })}>
                {accountStats.map((a) => (
                  <option key={a.id} value={a.id}>{a.name} — {fmt(a.balance)} ر.س</option>
                ))}
              </select>
            </Field>
            <Field label="المبلغ (ر.س)" hint={`المتاح: ${fmt(cap)} ر.س`}>
              <input type="number" className={inputCls} value={form.amount ?? ''}
                onChange={(e) => setForm({ ...form, amount: e.target.value, error: '' })} placeholder="100" />
            </Field>
            <Field label="التاريخ (هـ)">
              <input className={inputCls} value={form.date || ''} onChange={(e) => setForm({ ...form, date: e.target.value })} placeholder="1448/02/01" />
            </Field>
            <Field label="ملاحظة (اختياري)">
              <input className={inputCls} value={form.note || ''} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </Field>
            {form.error && <div className="text-red-500 text-xs mb-3">{form.error}</div>}
            <div className="flex gap-2 mt-2">
              <button className={btnPrimary + ' flex-1'} onClick={moveInvestment}>{dirIn ? 'حوّل' : 'اسحب'}</button>
              <button className={btnGhost} onClick={closeModal}>إلغاء</button>
            </div>
          </Modal>
        );
      })()}

      {modal === 'viewReceipt' && form.receipt && (
        <Modal title={`إيصال ${form.who || ''}`} onClose={closeModal} wide>
          {form.receipt.type === 'application/pdf' ? (
            <div className="text-center py-6">
              <FileText size={36} className="mx-auto text-slate-300 mb-3" />
              <div className="text-sm text-slate-500 mb-4">{form.receipt.name}</div>
              <a className={btnPrimary + ' w-full'} href={form.receipt.data} target="_blank" rel="noreferrer">فتح الملف</a>
            </div>
          ) : (
            <>
              <img src={form.receipt.data} alt="الإيصال" className="w-full rounded-xl border border-slate-100" />
              <a className={btnGhost + ' w-full mt-3 block text-center'} href={form.receipt.data} target="_blank" rel="noreferrer">
                فتحها بحجم كامل
              </a>
            </>
          )}
        </Modal>
      )}

      {modal === 'addPackage' && (
        <Modal title="باقة جديدة" onClose={closeModal}>
          <Field label="اسم الباقة">
            <input className={inputCls} value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value, error: '' })} placeholder="مثال: الموسم كامل" />
          </Field>
          <Field label="السعر (ر.س)">
            <input type="number" className={inputCls} value={form.price ?? ''} onChange={(e) => setForm({ ...form, price: e.target.value, error: '' })} placeholder="800" />
          </Field>
          <Field label="عدد الأيام" hint="اتركه فاضيًا (أو صفر) لو الباقة تشمل كل الأيام المتاحة. وإلا يختار ولي الأمر هذا العدد من الأيام.">
            <input type="number" className={inputCls} value={form.dayCount ?? ''} onChange={(e) => setForm({ ...form, dayCount: e.target.value, error: '' })} placeholder="4" />
          </Field>
          {form.error && <div className="text-red-500 text-xs mb-3">{form.error}</div>}
          <div className="flex gap-2 mt-2">
            <button className={btnPrimary + ' flex-1'} onClick={savePackage}>إضافة</button>
            <button className={btnGhost} onClick={closeModal}>إلغاء</button>
          </div>
        </Modal>
      )}

      {modal === 'addSignupField' && (
        <Modal title="سؤال جديد" onClose={closeModal}>
          <div className="text-sm text-slate-500 mb-4">
            {form.scope === 'program'
              ? 'يظهر في رابط هذا البرنامج فقط.'
              : 'يظهر في كل روابط التسجيل.'}
          </div>
          <Field label="نص السؤال">
            <input className={inputCls} value={form.label || ''} onChange={(e) => setForm({ ...form, label: e.target.value, error: '' })} placeholder="مثال: هل يحتاج نقل؟" />
          </Field>
          <Field label="النوع">
            <select className={inputCls} value={form.type || 'text'} onChange={(e) => setForm({ ...form, type: e.target.value, error: '' })}>
              <option value="text">نص</option>
              <option value="number">رقم</option>
              <option value="choice">اختيار من قائمة</option>
            </select>
          </Field>
          {form.type === 'choice' && (
            <Field label="الخيارات" hint="افصل بينها بفاصلة. مثال: نعم، لا">
              <input className={inputCls} value={form.options || ''} onChange={(e) => setForm({ ...form, options: e.target.value, error: '' })} placeholder="نعم، لا" />
            </Field>
          )}
          <label className="flex items-center gap-2 mb-4 text-sm text-slate-700">
            <input type="checkbox" checked={!!form.required} onChange={(e) => setForm({ ...form, required: e.target.checked })} />
            مطلوب — ما يقدر يرسل بدونه
          </label>
          {form.error && <div className="text-red-500 text-xs mb-3">{form.error}</div>}
          <div className="flex gap-2 mt-2">
            <button className={btnPrimary + ' flex-1'} onClick={saveSignupField}>إضافة</button>
            <button className={btnGhost} onClick={closeModal}>إلغاء</button>
          </div>
        </Modal>
      )}

      {modal === 'newPerson' && (() => {
        const known = isValidPhone(form.gPhone || '')
          ? data.guardians.find((g) => normalizePhone(g.phone) === normalizePhone(form.gPhone)) : null;
        return (
          <Modal title="مشترك جديد" onClose={closeModal}>
            <Field label="اسم الطالب الثلاثي" hint="منه نعرف اسم ولي الأمر، فما نحتاج نسأل عنه.">
              <input className={inputCls} value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value, error: '' })} placeholder="محمد سعد القاسم" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="العمر"><input type="number" className={inputCls} value={form.age || ''} onChange={(e) => setForm({ ...form, age: e.target.value })} placeholder="10" /></Field>
              <Field label="الصف"><input className={inputCls} value={form.grade || ''} onChange={(e) => setForm({ ...form, grade: e.target.value })} placeholder="رابع ابتدائي" /></Field>
            </div>
            <Field label="المدرسة"><input className={inputCls} value={form.school || ''} onChange={(e) => setForm({ ...form, school: e.target.value })} placeholder="الرواد" /></Field>
            <Field label="ملاحظات صحية" hint="حساسية، ربو، دواء... يشوفها المشرف قبل النشاط.">
              <input className={inputCls} value={form.health || ''} onChange={(e) => setForm({ ...form, health: e.target.value })} />
            </Field>

            <div className="border-t border-slate-100 pt-4 mt-1">
              <Field label="جوال ولي الأمر" hint="هذا اللي يمنع التكرار — لو مسجّل من قبل ينضاف تحته مباشرة.">
                <input className={inputCls} dir="ltr" inputMode="tel" value={form.gPhone || ''}
                  onChange={(e) => setForm({ ...form, gPhone: e.target.value, error: '' })} placeholder="0551234567" />
              </Field>
              {known ? (
                <div className="-mt-2 mb-4 bg-brand-50 rounded-xl px-3 py-2 text-xs text-brand-900">
                  مسجّل عندك: <b>{known.name || 'بلا اسم'}</b> — بينضاف تحته بدل ما نكرّره.
                </div>
              ) : (
                <Field label="اسم ولي الأمر (اختياري)"
                  hint={guardianNameFrom(form.name) ? `لو تركته، بنسمّيه «${guardianNameFrom(form.name)}» من اسم الطالب.` : undefined}>
                  <input className={inputCls} value={form.gName || ''} onChange={(e) => setForm({ ...form, gName: e.target.value })}
                    placeholder={guardianNameFrom(form.name) || 'سعد القاسم'} />
                </Field>
              )}
            </div>

            {form.error && <div className="text-red-500 text-xs mb-3">{form.error}</div>}
            <div className="flex gap-2 mt-2">
              <button className={btnPrimary + ' flex-1'} onClick={savePerson}>إضافة</button>
              <button className={btnGhost} onClick={closeModal}>إلغاء</button>
            </div>
          </Modal>
        );
      })()}

      {modal === 'editGuardian' && (
        <Modal title={form.id ? 'تعديل ولي أمر' : 'ولي أمر جديد'} onClose={closeModal}>
          <Field label="الاسم">
            <input className={inputCls} value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value, error: '' })} placeholder="مثال: محمد العتيبي" />
          </Field>
          <Field label="رقم الجوال" hint="هذا اللي يمنع التكرار — لو سجّل مرة ثانية نعرف إنه هو نفسه.">
            <input className={inputCls} dir="ltr" inputMode="tel" value={form.phone || ''}
              onChange={(e) => setForm({ ...form, phone: e.target.value, error: '' })} placeholder="0551234567" />
          </Field>
          <Field label="ملاحظات (اختياري)">
            <input className={inputCls} value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
          {form.error && <div className="text-red-500 text-xs mb-3">{form.error}</div>}
          <div className="flex gap-2 mt-5">
            <button className={btnPrimary + ' flex-1'} onClick={saveGuardian}>{form.id ? 'حفظ' : 'إضافة'}</button>
            <button className={btnGhost} onClick={closeModal}>إلغاء</button>
          </div>
        </Modal>
      )}

      {modal === 'editStudent' && (
        <Modal title={form.id ? 'تعديل طالب' : 'طالب جديد'} onClose={closeModal}>
          <Field label="اسم الطالب">
            <input className={inputCls} value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value, error: '' })} placeholder="مثال: سعد" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="العمر"><input type="number" className={inputCls} value={form.age || ''} onChange={(e) => setForm({ ...form, age: e.target.value })} placeholder="10" /></Field>
            <Field label="الصف"><input className={inputCls} value={form.grade || ''} onChange={(e) => setForm({ ...form, grade: e.target.value })} placeholder="رابع ابتدائي" /></Field>
          </div>
          <Field label="المدرسة"><input className={inputCls} value={form.school || ''} onChange={(e) => setForm({ ...form, school: e.target.value })} placeholder="الرواد" /></Field>
          <Field label="ملاحظات صحية" hint="حساسية، ربو، دواء... يشوفها المشرف قبل النشاط.">
            <input className={inputCls} value={form.health || ''} onChange={(e) => setForm({ ...form, health: e.target.value })} />
          </Field>
          {form.error && <div className="text-red-500 text-xs mb-3">{form.error}</div>}
          <div className="flex gap-2 mt-5">
            <button className={btnPrimary + ' flex-1'} onClick={saveStudent}>{form.id ? 'حفظ' : 'إضافة'}</button>
            <button className={btnGhost} onClick={closeModal}>إلغاء</button>
          </div>
        </Modal>
      )}

      {modal === 'duplicates' && (
        <Modal title="تكرار محتمل" onClose={closeModal} wide>
          <div className="text-sm text-slate-500 mb-4">
            التطبيق ما يدمج من نفسه — هذولا اشتباهات، وأنت اللي تقرّر.
            الدمج يوحّدهم في سجل واحد، والتسجيلات والمبالغ تنتقل معه — ما يضيع شي.
          </div>
          {duplicates.length === 0 ? (
            <div className={emptyCls}>ما فيه تكرار.</div>
          ) : (
            <div className="space-y-3">
              {duplicates.map((d, i) => {
                const { a, b, reason } = d;
                const isStudent = d.kind === 'student';
                const merge = isStudent ? doMergeStudents : doMerge;
                const label = (x) => x.name || (isStudent ? 'بلا اسم' : 'بلا اسم');
                return (
                  <div key={i} className="border border-slate-200 rounded-2xl p-4">
                    <Badge tone="amber">{reason}</Badge>
                    {isStudent && (
                      <div className="text-xs text-slate-500 mt-2">ولي الأمر: {d.guardian?.name || 'بلا اسم'}</div>
                    )}
                    <div className="grid grid-cols-2 gap-2 mt-3">
                      {[a, b].map((x) => (
                        <div key={x.id} className="bg-slate-50 rounded-xl p-3">
                          <div className="font-semibold text-sm text-slate-800 truncate">{label(x)}</div>
                          {isStudent ? (
                            <>
                              <div className="text-[11px] text-slate-400 mt-0.5">
                                {[x.age && `${x.age} سنة`, x.grade, x.school].filter(Boolean).join(' · ') || 'بلا تفاصيل'}
                              </div>
                              <div className="text-[11px] text-slate-500 mt-1">{historyOf(x.id).length} تسجيل</div>
                            </>
                          ) : (
                            <>
                              <div className="text-[11px] text-slate-400" dir="ltr">{formatPhone(x.phone)}</div>
                              <div className="text-[11px] text-slate-500 mt-1">
                                {studentsOf(data.students, x.id).map((k) => k.name).join(' · ') || 'بلا أبناء'}
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2 mt-3">
                      {[[a, b], [b, a]].map(([keep, drop]) => (
                        <button key={keep.id} className={btnPrimary + ' flex-1 text-xs'}
                          onClick={() => askConfirm(
                            isStudent
                              ? `نخلّيهم واحدًا باسم «${label(keep)}»؟ تسجيلات «${label(drop)}» تنتقل له.`
                              : `ندمجهم ونخلّي «${label(keep)}»؟`,
                            () => merge(keep.id, drop.id), 'نعم، ادمج')}>
                          خلّه «{label(keep)}»
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <button className={btnGhost + ' w-full mt-4'} onClick={closeModal}>إغلاق</button>
        </Modal>
      )}

      {modal === 'account' && currentUser && (
        <Modal title="الحساب" onClose={closeModal}>
          <div className="flex items-center gap-3 mb-5">
            <div className="w-12 h-12 rounded-full bg-brand-100 text-brand-800 font-bold flex items-center justify-center">{currentUser.name.slice(0, 1)}</div>
            <div>
              <div className="font-bold text-slate-800">{currentUser.name}</div>
              <div className="text-xs text-slate-400">{currentUser.username} · {currentUser.role}</div>
            </div>
          </div>
          <div className="text-xs text-slate-500 mb-2 font-semibold">الأقسام المتاحة لك</div>
          <div className="flex flex-wrap gap-1.5 mb-5">
            {isAdmin ? <Badge tone="brand">كل الصلاحيات</Badge>
              : (currentUser.permissions || []).map((p) => <Badge key={p} tone="slate">{p}</Badge>)}
          </div>
          <button className={btnDanger + ' w-full'} onClick={() => { closeModal(); doLogout(); }}><LogOut size={16} /> تسجيل خروج</button>
          <button className={btnGhost + ' w-full mt-2 border border-slate-200'} onClick={hardReload}>
            <RotateCcw size={15} /> تحديث التطبيق لآخر نسخة
          </button>
          <div className="text-center text-[11px] text-slate-400 mt-3">نسخة التطبيق: {APP_VERSION}</div>
        </Modal>
      )}

      {confirm && (
        <Modal title={confirm.onYes ? 'تأكيد' : 'ما ينفع'} onClose={() => setConfirm(null)}>
          <div className="text-sm text-slate-600 mb-5">{confirm.text}</div>
          {confirm.onYes ? (
            <div className="flex gap-2">
              <button className={(confirm.yes === 'نعم، احذف' ? btnDanger : btnPrimary) + ' flex-1'}
                onClick={() => { confirm.onYes(); setConfirm(null); }}>{confirm.yes || 'نعم، احذف'}</button>
              <button className={btnGhost} onClick={() => setConfirm(null)}>إلغاء</button>
            </div>
          ) : (
            <button className={btnPrimary + ' w-full'} onClick={() => setConfirm(null)}>تمام</button>
          )}
        </Modal>
      )}
    </div>
  );
}

/* ------------------------------ مكوّنات فرعية ------------------------------ */

function LedgerItemModal({ title, accounts, form, setForm, accountLabel, notePlaceholder, hint, onSubmit, onClose }) {
  return (
    <Modal title={title} onClose={onClose}>
      <Field label={accountLabel}>
        <select className={inputCls} value={form.accountId || ''} onChange={(e) => setForm({ ...form, accountId: e.target.value })}>
          <option value="">اختر الحساب</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </Field>
      <Field label="المبلغ (ر.س)"><input type="number" className={inputCls} value={form.amount || ''} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field>
      <Field label="البيان (اختياري)" hint={hint}>
        <input className={inputCls} value={form.note || ''} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder={notePlaceholder} />
      </Field>
      <div className="flex gap-2 mt-5"><button className={btnPrimary + ' flex-1'} onClick={onSubmit}>إضافة</button><button className={btnGhost} onClick={onClose}>إلغاء</button></div>
    </Modal>
  );
}

/** الشاشة المالية الموحّدة لأي دفتر (أسبوع منفصل أو برنامج مجمّع). */
function LedgerFinance({ ledger, accounts, locked, canTransfer, onAdd, onRemove, onDistributeRest, onTransfer, onUndoTransfer }) {
  return (
    <div className="space-y-4">
      {locked && (
        <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 text-sm text-amber-800 flex items-center gap-2">
          <Lock size={15} /> مغلق — افتحه من الأعلى عشان تعدّل البنود المالية.
        </div>
      )}
      {isQuick(ledger) && (
        <div className="bg-brand-50 border border-brand-100 rounded-xl px-4 py-3 text-sm text-brand-900">
          الإيراد الأساسي ({fmt(ledger.quickRevenue)} ر.س من {ledger.quickCount} طالب) مسجّل من تبويب «نظرة عامة».
          اللي تضيفه هنا مصروفات وتحصيل إضافي وتوزيع.
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="الإيراد" value={fmt(L.revenue(ledger)) + ' ر.س'} icon={TrendingUp} tone="green" />
        <StatCard label="المصروفات" value={fmt(L.expenses(ledger)) + ' ر.س'} icon={TrendingDown} tone="red" />
        <StatCard label="الصافي" value={fmt(L.net(ledger)) + ' ر.س'} icon={Wallet} tone={L.net(ledger) >= 0 ? 'brand' : 'red'} />
      </div>

      <ItemList title="تحصيل إضافي" subtitle="مبالغ غير مرتبطة بمشارك معيّن" items={ledger.collections} accounts={accounts}
        onAdd={() => onAdd('collections')} onRemove={(id) => onRemove('collections', id)} tone="green" locked={locked}
        emptyText="مثال: حصلت 500 كاش من البرنامج. لا يوجد تحصيل إضافي." />

      <ItemList title="مصروفات البرنامج" subtitle="تُخصم من الإيراد قبل التوزيع" items={ledger.expenseItems} accounts={accounts}
        onAdd={() => onAdd('expenseItems')} onRemove={(id) => onRemove('expenseItems', id)} tone="red" locked={locked}
        emptyText="مثال: 50 ميداليات من الراجحي. لا توجد مصروفات." />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ItemList title="نصيب مدارس الرواد" items={ledger.schoolPayouts} accounts={accounts}
          onAdd={() => onAdd('schoolPayouts')} onRemove={(id) => onRemove('schoolPayouts', id)} tone="red" locked={locked}
          emptyText="لم يُسجَّل نصيب المدرسة بعد." />
        <ItemList title="نصيب فريق فيض" items={ledger.faidPayouts} accounts={accounts}
          onAdd={() => onAdd('faidPayouts')} onRemove={(id) => onRemove('faidPayouts', id)} tone="green" locked={locked || !!ledger.faidTransfer}
          emptyText="لم يُسجَّل نصيب فيض بعد." />
      </div>

      <DistributionPanel
        ledger={ledger}
        locked={locked || !!ledger.faidTransfer}
        canTransfer={canTransfer}
        onDistributeRest={onDistributeRest}
        onTransfer={onTransfer}
        onUndoTransfer={onUndoTransfer}
      />
    </div>
  );
}

function ParticipantsTable({ participants, accounts, showAttendance, statusOf, onSetAttendance, onEdit, onRemove, locked, weeks, showMoney = true }) {
  if (!participants.length) {
    return <div className={emptyCls}>ما فيه نتائج.</div>;
  }
  return (
    <div className="bg-white rounded-2xl border border-slate-100 overflow-x-auto">
      <table className="w-full text-sm min-w-[560px]">
        <thead className="bg-slate-50 text-slate-500 text-xs"><tr>
          <th className="text-right px-4 py-3 font-medium">الاسم</th>
          {weeks && <th className="text-right px-4 py-3 font-medium">الأيام المسجّلة</th>}
          {showMoney && <th className="text-right px-4 py-3 font-medium">المبلغ</th>}
          {showMoney && <th className="text-right px-4 py-3 font-medium">التصنيف</th>}
          {showAttendance && <th className="text-right px-4 py-3 font-medium">الحضور</th>}
          <th className="text-right px-4 py-3 font-medium"></th>
        </tr></thead>
        <tbody>
          {participants.map((p) => (
            <tr key={p.id} className="border-t border-slate-50">
              <td className="px-4 py-3 font-semibold text-slate-800">
                {p.name}
                {/* سجّل نفسه من الرابط ولسه ما تأكّد وصول مبلغه */}
                {p.pending && <span className="mr-2 align-middle"><Badge tone="amber">ينتظر تأكيدك</Badge></span>}
              </td>
              {weeks && (() => {
                const mine = enrolledDays(p, weeks);
                const all = mine.length === weeks.length;
                return (
                  <td className="px-4 py-3">
                    <Badge tone={all ? 'brand' : 'amber'}>{all ? `كل الأيام (${weeks.length})` : `${mine.length} من ${weeks.length}`}</Badge>
                    {!all && <div className="text-[11px] text-slate-400 mt-1">{mine.map((w) => w.name).join('، ') || 'ما فيه أيام'}</div>}
                  </td>
                );
              })()}
              {showMoney && <td className="px-4 py-3 text-slate-600">{p.accountId === 'unpaid' ? '-' : fmt(p.amount) + ' ر.س'}</td>}
              {showMoney && (
                <td className="px-4 py-3">
                  {p.accountId === 'unpaid'
                    ? <Badge tone="amber">ما دفع</Badge>
                    : <span className="text-slate-600">{accounts.find((a) => a.id === p.accountId)?.name || '-'}</span>}
                </td>
              )}
              {showAttendance && (
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    {['حاضر', 'غائب'].map((st) => {
                      const on = statusOf(p) === st;
                      return (
                        <button key={st} onClick={() => onSetAttendance(p, on ? 'معلق' : st)} disabled={locked}
                          className={`text-xs font-semibold px-3 py-1.5 rounded-lg border whitespace-nowrap disabled:opacity-40 ${
                            on ? (st === 'حاضر' ? 'bg-green-600 text-white border-green-600' : 'bg-red-500 text-white border-red-500')
                               : 'border-slate-200 text-slate-500'}`}>{st}</button>
                      );
                    })}
                  </div>
                </td>
              )}
              <td className="px-4 py-3 text-left whitespace-nowrap">
                {onEdit && <button onClick={() => onEdit(p)} disabled={locked} className="text-slate-300 hover:text-brand-600 disabled:opacity-30"><Pencil size={14} /></button>}
                {onRemove && <button onClick={() => onRemove(p)} disabled={locked} className="text-slate-300 hover:text-red-500 mr-2 disabled:opacity-30"><Trash2 size={14} /></button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** جدول حضور يوم واحد في البرنامج المجمّع. */
function AttendanceTable({ participants, statusOf, onSet, locked, subscriptionOf, totalDays, onEdit }) {
  if (!participants.length) return <div className={emptyCls}>ما فيه نتائج.</div>;
  return (
    <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden divide-y divide-slate-50">
      {participants.map((p) => {
        const st = statusOf(p);
        const subDays = subscriptionOf?.(p);
        return (
          <div key={p.id} className="flex items-center justify-between px-4 py-3 gap-3">
            <span className="min-w-0">
              <span className="font-semibold text-slate-800 text-sm truncate block">{p.name}</span>
              {subDays != null && (
                <span className="text-[11px] text-slate-400 flex items-center gap-1.5">
                  {subDays === 1 ? 'مشترك يوم واحد' : subDays === totalDays ? `مشترك كل الأيام (${subDays})` : `مشترك ${subDays} من ${totalDays} أيام`}
                  {onEdit && !locked && (
                    <button onClick={() => onEdit(p)} className="text-slate-300 hover:text-brand-600"><Pencil size={11} /></button>
                  )}
                </span>
              )}
            </span>
            <div className="flex items-center gap-1.5 shrink-0">
              {['حاضر', 'غائب'].map((s) => (
                <button key={s} onClick={() => onSet(p, st === s ? 'معلق' : s)} disabled={locked}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-lg border disabled:opacity-40 ${
                    st === s
                      ? (s === 'حاضر' ? 'bg-green-600 text-white border-green-600' : 'bg-red-500 text-white border-red-500')
                      : 'border-slate-200 text-slate-500'
                  }`}>{s}</button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** ملخص برنامج منفصل: كل يوم بسطر + إجماليات. */
function ProgramTotals({ program }) {
  const t = program.weeks.reduce((a, w) => ({
    revenue: a.revenue + L.revenue(w), expenses: a.expenses + L.expenses(w),
    net: a.net + L.net(w), school: a.school + L.school(w), faid: a.faid + L.faid(w),
  }), { revenue: 0, expenses: 0, net: 0, school: 0, faid: 0 });
  const rest = t.net - t.school - t.faid;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="إجمالي الإيراد" value={fmt(t.revenue) + ' ر.س'} icon={TrendingUp} tone="green" />
        <StatCard label="إجمالي المصروفات" value={fmt(t.expenses) + ' ر.س'} icon={TrendingDown} tone="red" />
        <StatCard label="الصافي" value={fmt(t.net) + ' ر.س'} icon={Wallet} tone="brand" />
        <StatCard label="نصيب المدرسة" value={fmt(t.school) + ' ر.س'} icon={Layers} tone="blue" />
        <StatCard label="نصيب فيض" value={fmt(t.faid) + ' ر.س'} icon={ShieldCheck} tone="brand" />
        <StatCard label="غير موزّع" value={fmt(rest) + ' ر.س'} icon={AlertTriangle} tone={rest === 0 ? 'green' : 'amber'} />
      </div>
      <div className="text-xs text-slate-400 px-1">
        التوزيع في البرنامج المنفصل يتم داخل كل يوم على حدة. افتح اليوم من تبويب «الأيام» لتسجيل النصيب أو ترحيله لفيض.
      </div>
    </div>
  );
}

function SeparateReport({ program, accounts, canMoney }) {
  const rows = program.weeks;
  const t = rows.reduce((a, w) => ({
    p: a.p + headcount(w),
    present: a.present + (isQuick(w) ? 0 : w.participants.filter((x) => x.attendance === 'حاضر').length),
    revenue: a.revenue + L.revenue(w), expenses: a.expenses + L.expenses(w),
    net: a.net + L.net(w), school: a.school + L.school(w), faid: a.faid + L.faid(w),
  }), { p: 0, present: 0, revenue: 0, expenses: 0, net: 0, school: 0, faid: 0 });

  if (!rows.length) return <div className={emptyCls}>ما فيه أيام مسجّلة بعد.</div>;

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-slate-100 overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead className="bg-slate-50 text-slate-500 text-xs"><tr>
            <th className="text-right px-4 py-3 font-medium">اليوم</th>
            <th className="text-right px-4 py-3 font-medium">الحضور</th>
            {canMoney && <>
              <th className="text-right px-4 py-3 font-medium">الإيراد</th>
              <th className="text-right px-4 py-3 font-medium">المصروفات</th>
              <th className="text-right px-4 py-3 font-medium">الصافي</th>
              <th className="text-right px-4 py-3 font-medium">المدرسة</th>
              <th className="text-right px-4 py-3 font-medium">فيض</th>
              <th className="text-right px-4 py-3 font-medium">الترحيل</th>
            </>}
          </tr></thead>
          <tbody>
            {rows.map((w) => (
              <tr key={w.id} className="border-t border-slate-50">
                <td className="px-4 py-3 font-semibold text-slate-800">{w.name}</td>
                <td className="px-4 py-3 text-slate-600">
                  {isQuick(w) ? `${headcount(w)} طالب` : `${w.participants.filter((x) => x.attendance === 'حاضر').length} / ${w.participants.length}`}
                </td>
                {canMoney && <>
                  <td className="px-4 py-3 text-green-600">{fmt(L.revenue(w))}</td>
                  <td className="px-4 py-3 text-red-500">{fmt(L.expenses(w))}</td>
                  <td className="px-4 py-3 font-semibold text-slate-800">{fmt(L.net(w))}</td>
                  <td className="px-4 py-3 text-slate-600">{fmt(L.school(w))}</td>
                  <td className="px-4 py-3 text-slate-600">{fmt(L.faid(w))}</td>
                  <td className="px-4 py-3">{w.faidTransfer ? <Badge tone="green">مُرحّل</Badge> : <Badge tone="slate">لا</Badge>}</td>
                </>}
              </tr>
            ))}
            <tr className="border-t-2 border-slate-100 bg-slate-50/60 font-bold text-slate-800">
              <td className="px-4 py-3">الإجمالي</td>
              <td className="px-4 py-3">{t.present} / {t.p}</td>
              {canMoney && <>
                <td className="px-4 py-3 text-green-700">{fmt(t.revenue)}</td>
                <td className="px-4 py-3 text-red-600">{fmt(t.expenses)}</td>
                <td className="px-4 py-3">{fmt(t.net)}</td>
                <td className="px-4 py-3">{fmt(t.school)}</td>
                <td className="px-4 py-3">{fmt(t.faid)}</td>
                <td className="px-4 py-3"></td>
              </>}
            </tr>
          </tbody>
        </table>
      </div>
      {canMoney && rows.some((w) => !isQuick(w) && w.participants.length) && (
        <div className={cardCls}>
          <div className="text-sm font-semibold text-slate-700 mb-4">توزيع المشاركين حسب طريقة الدفع (الأيام المسجّلة بالأسماء)</div>
          <PaymentPie participants={rows.filter((w) => !isQuick(w)).flatMap((w) => w.participants)} accounts={accounts} />
        </div>
      )}
    </div>
  );
}

/** تقرير البرنامج المجمّع: مصفوفة مشترك × يوم + الملخص المالي. */
function GroupedReport({ program, accounts, canMoney }) {
  const parts = program.participants || [];
  const days = program.weeks;
  if (!parts.length) return <div className={emptyCls}>ما فيه مشتركون بعد.</div>;
  const st = (pid, wid) => program.attendance?.[wid]?.[pid] || 'معلق';

  return (
    <div className="space-y-4">
      {canMoney && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard label="عدد المشتركين" value={parts.length} icon={UsersIcon} tone="blue" />
          <StatCard label="الصافي" value={fmt(L.net(program)) + ' ر.س'} icon={Wallet} tone="brand" />
          <StatCard label="نصيب فيض" value={fmt(L.faid(program)) + ' ر.س'} icon={ShieldCheck} tone="green" />
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-100 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs"><tr>
            <th className="text-right px-4 py-3 font-medium sticky right-0 bg-slate-50">المشترك</th>
            {days.map((d) => <th key={d.id} className="px-3 py-3 font-medium text-center whitespace-nowrap">{d.name}</th>)}
            <th className="px-3 py-3 font-medium text-center">الحضور</th>
          </tr></thead>
          <tbody>
            {parts.map((p) => {
              const mine = enrolledDays(p, days);
              const present = mine.filter((d) => st(p.id, d.id) === 'حاضر').length;
              return (
                <tr key={p.id} className="border-t border-slate-50">
                  <td className="px-4 py-2.5 font-semibold text-slate-800 sticky right-0 bg-white whitespace-nowrap">{p.name}</td>
                  {days.map((d) => {
                    // اليوم اللي ما سجّل فيه يظهر فاضي، مو «معلق» — فرق مهم في التقرير
                    if (!isEnrolled(p, d.id)) {
                      return <td key={d.id} className="px-3 py-2.5 text-center text-slate-200 text-xs">·</td>;
                    }
                    const s = st(p.id, d.id);
                    return (
                      <td key={d.id} className="px-3 py-2.5 text-center">
                        <span className={`inline-flex w-6 h-6 rounded-full items-center justify-center text-xs font-bold ${
                          s === 'حاضر' ? 'bg-green-100 text-green-700' : s === 'غائب' ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-400'
                        }`}>{s === 'حاضر' ? '✓' : s === 'غائب' ? '✕' : '–'}</span>
                      </td>
                    );
                  })}
                  <td className="px-3 py-2.5 text-center font-bold text-slate-700">{present}/{mine.length}</td>
                </tr>
              );
            })}
            <tr className="border-t-2 border-slate-100 bg-slate-50/60 font-bold text-slate-800">
              <td className="px-4 py-3 sticky right-0 bg-slate-50">المسجّلون</td>
              {days.map((d) => (
                <td key={d.id} className="px-3 py-3 text-center">{enrolledIn(parts, d.id).length}</td>
              ))}
              <td className="px-3 py-3"></td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="text-xs text-slate-400 px-1">
        ✓ حاضر · ✕ غائب · – ما سُجّل حضوره · نقطة رمادية = مو مسجّل في هذا اليوم
      </div>

      {canMoney && (
        <div className={cardCls}>
          <div className="text-sm font-semibold text-slate-700 mb-4">توزيع المشتركين حسب طريقة الدفع</div>
          <PaymentPie participants={parts} accounts={accounts} />
        </div>
      )}
    </div>
  );
}

/** تقرير الترم: كل برامج الترم بسطر واحد + الإجمالي. */
function TermReport({ programs, year, term, balance, onOpenProgram }) {
  const row = (p) => {
    const ledgers = p.type === 'مجمع' ? [p] : p.weeks;
    return ledgers.reduce((a, l) => ({
      revenue: a.revenue + L.revenue(l), expenses: a.expenses + L.expenses(l),
      net: a.net + L.net(l), school: a.school + L.school(l), faid: a.faid + L.faid(l),
      transferred: a.transferred + (l.faidTransfer ? Number(l.faidTransfer.amount || 0) : 0),
    }), { revenue: 0, expenses: 0, net: 0, school: 0, faid: 0, transferred: 0 });
  };
  const rows = programs.map((p) => ({ p, ...row(p) }));
  const t = rows.reduce((a, r) => ({
    revenue: a.revenue + r.revenue, expenses: a.expenses + r.expenses, net: a.net + r.net,
    school: a.school + r.school, faid: a.faid + r.faid, transferred: a.transferred + r.transferred,
  }), { revenue: 0, expenses: 0, net: 0, school: 0, faid: 0, transferred: 0 });
  const pending = t.faid - t.transferred;

  return (
    <div>
      <h2 className="text-xl font-extrabold text-slate-800 mb-1">التقارير</h2>
      <div className="text-sm text-slate-400 mb-4">الترم {term} {year} هـ</div>

      {!programs.length ? (
        <div className={emptyCls}>ما فيه برامج في هذا الترم بعد.</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <MiniStat label="إجمالي إيراد البرامج" value={fmt(t.revenue)} icon={TrendingUp} tone="green" />
            <MiniStat label="إجمالي المصروفات" value={fmt(t.expenses)} icon={TrendingDown} tone="red" />
            <MiniStat label="نصيب مدارس الرواد" value={fmt(t.school)} icon={Layers} />
            <MiniStat label="نصيب فيض" value={fmt(t.faid)} icon={ShieldCheck} />
          </div>

          {pending !== 0 && (
            <div className="bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3 text-sm text-amber-800 mb-4 flex items-start gap-2">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <span>فيه <b>{fmt(pending)} ر.س</b> نصيب فيض مسجّل بس ما تم ترحيله للرصيد. افتح البرنامج ورحّله من لوحة التوزيع.</span>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-slate-100 overflow-x-auto mb-4">
            <table className="w-full text-sm min-w-[560px]">
              <thead className="bg-slate-50 text-slate-500 text-xs"><tr>
                <th className="text-right px-4 py-3 font-medium">البرنامج</th>
                <th className="text-right px-4 py-3 font-medium">الإيراد</th>
                <th className="text-right px-4 py-3 font-medium">المصروفات</th>
                <th className="text-right px-4 py-3 font-medium">الصافي</th>
                <th className="text-right px-4 py-3 font-medium">المدرسة</th>
                <th className="text-right px-4 py-3 font-medium">فيض</th>
              </tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.p.id} className="border-t border-slate-50 cursor-pointer hover:bg-slate-50/50" onClick={() => onOpenProgram(r.p)}>
                    <td className="px-4 py-3 font-semibold text-slate-800 whitespace-nowrap">{r.p.name}</td>
                    <td className="px-4 py-3 text-green-600">{fmt(r.revenue)}</td>
                    <td className="px-4 py-3 text-red-500">{fmt(r.expenses)}</td>
                    <td className="px-4 py-3 font-semibold text-slate-800">{fmt(r.net)}</td>
                    <td className="px-4 py-3 text-slate-600">{fmt(r.school)}</td>
                    <td className="px-4 py-3 text-slate-600">{fmt(r.faid)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-slate-100 bg-slate-50/60 font-bold text-slate-800">
                  <td className="px-4 py-3">الإجمالي</td>
                  <td className="px-4 py-3 text-green-700">{fmt(t.revenue)}</td>
                  <td className="px-4 py-3 text-red-600">{fmt(t.expenses)}</td>
                  <td className="px-4 py-3">{fmt(t.net)}</td>
                  <td className="px-4 py-3">{fmt(t.school)}</td>
                  <td className="px-4 py-3">{fmt(t.faid)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className={cardCls}>
        <div className="text-sm font-semibold text-slate-700 mb-1">رصيد فيض الحالي</div>
        <div className={`text-2xl font-extrabold ${balance >= 0 ? 'text-slate-800' : 'text-red-600'}`}>{fmt(balance)} ر.س</div>
        <div className="text-xs text-slate-400 mt-1">شامل العمليات اليدوية والمُرحّل من البرامج.</div>
      </div>
    </div>
  );
}

/** نص التقرير للمشاركة عبر واتساب أو أي تطبيق. */
function weekReportText(week, programName, canMoney) {
  const lines = [`تقرير ${week.name} - ${programName}`];
  if (week.date) lines.push(`التاريخ: ${week.date}`);
  lines.push(`الطلاب المسجلين: ${headcount(week)}`);
  if (!isQuick(week)) {
    lines.push(`الحاضرون: ${(week.participants || []).filter((p) => p.attendance === 'حاضر').length} من ${(week.participants || []).length}`);
  }
  if (canMoney) {
    lines.push(`إجمالي الإيراد: ${fmt(L.revenue(week))} ر.س`);
    lines.push(`المصروفات: ${fmt(L.expenses(week))} ر.س`);
    lines.push(`الصافي: ${fmt(L.net(week))} ر.س`);
    lines.push(`نصيب مدارس الرواد: ${fmt(L.school(week))} ر.س`);
    lines.push(`نصيب فريق فيض: ${fmt(L.faid(week))} ر.س`);
  }
  return lines.join('\n');
}

function WeekReport({ week, accounts, canMoney, programName }) {
  const [shared, setShared] = useState('');
  const share = async () => {
    const text = weekReportText(week, programName, canMoney);
    try {
      if (navigator.share) { await navigator.share({ title: `تقرير ${week.name}`, text }); return; }
      await navigator.clipboard.writeText(text);
      setShared('اننسخ التقرير، الصقه وين ما تبي');
    } catch {
      setShared('ما قدر ينسخ. حدّد النص ونسخه يدويًا.');
    }
    setTimeout(() => setShared(''), 3000);
  };

  return (
    <div className="space-y-3">
      <InfoRow icon={UsersIcon} label="الطلاب المسجلين" value={`${headcount(week)} طالب`} />
      {!isQuick(week) && (
        <InfoRow icon={Check} label="الحاضرون" value={`${(week.participants || []).filter((p) => p.attendance === 'حاضر').length} من ${(week.participants || []).length}`} />
      )}
      {canMoney && <>
        <InfoRow icon={TrendingUp} label="إجمالي الإيراد" value={`${fmt(L.revenue(week))} ر.س`} />
        <InfoRow icon={TrendingDown} label="المصروفات" value={`${fmt(L.expenses(week))} ر.س`} />
        <InfoRow icon={Wallet} label="الصافي" value={`${fmt(L.net(week))} ر.س`} />
        <InfoRow icon={Layers} label="نصيب مدارس الرواد" value={`${fmt(L.school(week))} ر.س`} />
        <InfoRow icon={ShieldCheck} label="نصيب فريق فيض" value={`${fmt(L.faid(week))} ر.س`} />
      </>}
      <InfoRow icon={Calendar} label="التاريخ" value={week.date || 'ما تحدد'} />

      {canMoney && !isQuick(week) && (week.participants || []).length > 0 && (
        <div className={cardCls}>
          <div className="text-sm font-semibold text-slate-700 mb-4">توزيع التحصيل حسب طريقة الدفع</div>
          <PaymentPie participants={week.participants} accounts={accounts} />
        </div>
      )}

      <button className={btnPrimary + ' w-full'} onClick={share}><Send size={16} /> مشاركة التقرير</button>
      {shared && <div className="text-xs text-center text-slate-500">{shared}</div>}
    </div>
  );
}
