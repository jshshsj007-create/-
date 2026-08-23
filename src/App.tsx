import React, { useState, useEffect, useCallback } from 'react';
import {
  Home, BookOpen, Wallet, Settings, Plus, X, Check, ChevronLeft, Trash2, Pencil,
  Users as UsersIcon, Calendar, TrendingUp, TrendingDown, Layers, ShieldCheck,
  Lock, Unlock, Trophy, LogOut, KeyRound, Plane, Search, AlertTriangle, Send,
  RotateCcw, Wand2, CalendarDays, FileText,
} from 'lucide-react';

const STORAGE_KEY = 'nadi-alahya-data-v1';
const PERMS = ['البرامج', 'الأسابيع والحضور', 'المصروفات والتقارير', 'فيض - الإيرادات والمصروفات', 'الإعداد (المسابقات)', 'السفرات', 'المستخدمون والصلاحيات'];
const ROLES = ['مدير', 'مشرف برنامج', 'مسجل حضور', 'مسؤول مسابقات', 'مسؤول فيض'];
const ACCOUNT_COLORS = ['#8B5CF6', '#10B981', '#3B82F6', '#F59E0B', '#EC4899', '#14B8A6'];
const LEVELS = ['أولية', 'متوسطة', 'عليا'];
export const ORDINALS = ['الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس', 'السابع', 'الثامن', 'التاسع', 'العاشر',
  'الحادي عشر', 'الثاني عشر', 'الثالث عشر', 'الرابع عشر', 'الخامس عشر', 'السادس عشر', 'السابع عشر', 'الثامن عشر',
  'التاسع عشر', 'العشرون'];

const uid = () => Math.random().toString(36).slice(2, 9);
const fmt = (n) => Number(n || 0).toLocaleString('en-US');
export const sumAmt = (arr) => (arr || []).reduce((s, x) => s + Number(x.amount || 0), 0);
export const paidAmount = (parts) => (parts || []).filter((p) => p.accountId !== 'unpaid').reduce((s, p) => s + Number(p.amount || 0), 0);

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
});

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
  return d;
}

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
const LOGO_FULL_WHITE = 'data:image/png;base64,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';
const LOGO_MARK_WHITE = 'data:image/png;base64,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';

/** شعار فيض. mark = الريشة فقط، full = الريشة مع الاسم. */
function FaidLogo({ size = 64, variant = 'mark' }) {
  const full = variant === 'full';
  return (
    <img
      src={full ? LOGO_FULL_WHITE : LOGO_MARK_WHITE}
      alt="فيض"
      width={full ? size * 2.45 : size}
      height={size}
      style={{ width: full ? size * 2.45 : size, height: 'auto' }}
      draggable="false"
    />
  );
}

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
    <div className="flex gap-1 bg-white rounded-xl p-1 border border-slate-100 mb-5 w-full sm:w-fit overflow-x-auto">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap ${value === t.id ? 'bg-brand-600 text-white' : 'text-slate-500 hover:text-slate-700'}`}
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
  const [weekTab, setWeekTab] = useState('finance');
  const [programTab, setProgramTab] = useState('days');
  const [settingsTab, setSettingsTab] = useState('users');
  const [setupLevel, setSetupLevel] = useState('الكل');
  const [clubTab, setClubTab] = useState('competitions');
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
  const [loginError, setLoginError] = useState('');

  useEffect(() => {
    if (!savedAt) return;
    const t = setTimeout(() => setSavedAt(null), 2000);
    return () => clearTimeout(t);
  }, [savedAt]);

  useEffect(() => {
    (async () => {
      const raw = await storage.get(STORAGE_KEY);
      try {
        setData(migrate(raw ? JSON.parse(raw) : defaultData()));
      } catch {
        setData(defaultData());
      }
      setLoading(false);
    })();
  }, []);

  /** حفظ تلقائي: كل تعديل ينحفظ فورًا، ما فيه زر حفظ. */
  const save = useCallback(async (next) => {
    setData(next);
    await storage.set(STORAGE_KEY, JSON.stringify(next));
    setSavedAt(Date.now());
  }, []);

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
  const accountStats = data.faidAccounts.map((acc) => {
    let rev = 0, exp = 0;
    data.faidAdjustments.filter((a) => a.accountId === acc.id).forEach((a) => {
      if (a.type === 'إيراد') rev += Number(a.amount || 0); else exp += Number(a.amount || 0);
    });
    return { ...acc, revenue: rev, expenses: exp, balance: rev - exp };
  });
  const totalRevenue = accountStats.reduce((s, a) => s + a.revenue, 0);
  const totalExpenses = accountStats.reduce((s, a) => s + a.expenses, 0);
  const balance = totalRevenue - totalExpenses;

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
  const askConfirm = (text, onYes) => setConfirm({ text, onYes });

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
    if (!form.amount || !form.accountId) return;
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
    patchLedger(activeRef, (l) => ({
      participants: [...(l.participants || []), {
        id: uid(), name: form.name.trim(),
        amount: accountId === 'unpaid' ? 0 : Number(form.amount || 0),
        accountId, attendance: 'معلق',
        ...(isGrouped ? { days: form.days } : {}),
      }],
    }));
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
        ...(isGrouped ? { days: form.days } : {}),
      })),
    }));
    closeModal();
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
      if (!rows.length) return;
      const batchId = uid();
      const txns = rows.map((r) => ({ id: uid(), batchId, accountId: r.accountId, date: form.date || '', type: form.type || 'إيراد', amount: Number(r.amount), note: form.note || '', ...tags }));
      save({ ...data, faidAdjustments: [...data.faidAdjustments, ...txns] });
      closeModal();
      return;
    }
    if (!form.amount || !form.accountId) return;
    save({ ...data, faidAdjustments: [...data.faidAdjustments, { id: uid(), accountId: form.accountId, date: form.date || '', type: form.type || 'إيراد', amount: Number(form.amount), note: form.note || '', ...tags }] });
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
  const saveUser = () => {
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
  const removeTrip = (tid) => { save({ ...data, trips: data.trips.filter((t) => t.id !== tid) }); goto('club'); };

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
   * التسجيل مسموح لمسجّل الحضور كمان: يقدر يضيف طالب بمبلغه وطريقة دفعه.
   * لكن يبقى ما يشوف مبالغ اللي سجّلهم غيره — الإدخال مسموح والقراءة لا.
   * التعديل والحذف يظلان للماليين، لأن نافذة التعديل تعرض المبلغ المسجّل أصلًا.
   */
  const canEnroll = canMoney || can('البرامج') || can('الأسابيع والحضور');
  const limitedScope = !isAdmin && effectiveUser?.accessScope === 'limited';
  /** البرنامج يظهر فقط لو فيه يوم واحد على الأقل يقدر يشوفه المستخدم. */
  const termPrograms = !limitedScope ? allTermPrograms
    : allTermPrograms.filter((p) => p.weeks.some((w) => canSeeWeek(p.id, w.id)));
  /** أيام المستخدم المحدود عبر كل البرامج — عشان يوصل لها من الرئيسية مباشرة. */
  const myWeeks = !limitedScope ? [] : termPrograms.flatMap((p) =>
    p.weeks.filter((w) => canSeeWeek(p.id, w.id)).map((w) => ({ program: p, week: w })));
  const canTransfer = can('فيض - الإيرادات والمصروفات') && canMoney;

  /** آخر مدير نشط ما ينحذف ولا يتعطّل، وإلا انقفل التطبيق على الجميع. */
  const activeAdmins = data.users.filter((u) => u.role === 'مدير' && u.status === 'نشط');
  const noAdminExists = data.users.length > 0 && activeAdmins.length === 0;

  const doLogin = () => {
    const entered = (loginForm.username || '').trim().toLowerCase();
    const u = data.users.find((x) => (x.username || '').toLowerCase() === entered);
    // رسالة واحدة للحالتين عشان ما نكشف أي أسماء مستخدمين موجودة
    if (!u || u.password !== loginForm.password) { setLoginError('اسم المستخدم أو كلمة المرور غير صحيحة'); return; }
    if (u.status !== 'نشط') { setLoginError('هذا الحساب غير مفعّل. راجع المدير.'); return; }
    setCurrentUser(u); setLoginError(''); setLoginForm({ username: '', password: '' });
    setStage('year');
  };
  const doLogout = () => { setCurrentUser(null); setStage('year'); goto('home'); };

  /* ------------------------------ الشاشة الأولى ------------------------------ */
  if (stage === 'splash') {
    return (
      <Shell dark>
        <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
          <FaidLogo size={116} variant="full" />
          <div className="text-brand-200 text-base font-semibold mt-8">فريق فيض</div>
          <button onClick={() => setStage(data.users.length > 0 && !currentUser ? 'login' : 'year')}
            className="mt-12 bg-white text-brand-900 font-bold text-sm px-10 py-3.5 rounded-2xl">
            ابدأ
          </button>
        </div>
      </Shell>
    );
  }

  /* ------------------------------ تسجيل الدخول ------------------------------ */
  if (data.users.length > 0 && !currentUser) {
    return (
      <Shell dark>
        <div className="flex-1 flex flex-col justify-center px-6">
          <div className="flex flex-col items-center mb-8">
            <FaidLogo size={84} variant="full" />
          </div>
          <div className="bg-white rounded-3xl p-6 shadow-xl">
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

  // «النادي» يجمع المسابقات والسفرات في قسم واحد مثل التصميم
  const canClub = can('الإعداد (المسابقات)') || can('السفرات');
  const sections = [
    { id: 'programs', label: 'البرامج', desc: 'عرض وإدارة البرامج', icon: BookOpen, show: can('البرامج') || can('الأسابيع والحضور') },
    { id: 'faid', label: 'فيض', desc: 'حسابات فيض والأرصدة', icon: Wallet, show: can('فيض - الإيرادات والمصروفات') },
    { id: 'club', label: 'النادي', desc: 'المسابقات والسفرات', icon: Trophy, show: canClub },
    { id: 'reports', label: 'التقارير', desc: 'التقارير والإحصائيات', icon: FileText, show: canMoney },
    { id: 'settings', label: 'الإعدادات', desc: 'المستخدمون والصلاحيات', icon: Settings, show: isAdmin },
  ].filter((c) => c.show);

  const navItems = [
    { id: 'home', label: 'الرئيسية', icon: Home, show: true },
    { id: 'programs', label: 'البرامج', icon: BookOpen, show: can('البرامج') || can('الأسابيع والحضور') },
    { id: 'faid', label: 'فيض', icon: Wallet, show: can('فيض - الإيرادات والمصروفات') },
    { id: 'reports', label: 'التقارير', icon: FileText, show: canMoney },
    { id: 'settings', label: 'الإعدادات', icon: Settings, show: isAdmin },
  ].filter((n) => n.show);
  const isNavActive = (id) =>
    view === id ||
    (id === 'programs' && (view === 'programDetail' || view === 'weekDetail')) ||
    (id === 'reports' && view === 'club') ||
    (id === 'home' && (view === 'club' || view === 'tripDetail' || view === 'competitionDetail'));

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
  ];
  const activeProgramTab = programTabs.some((t) => t.id === programTab) ? programTab : programTabs[0]?.id;

  const weekTabs = !program || isGrouped ? [] : [
    ...(canMoney ? [{ id: 'overview', label: 'نظرة عامة' }] : []),
    ...(canMoney ? [{ id: 'finance', label: 'المالية والتوزيع' }] : []),
    ...(week && !isQuick(week) ? [{ id: 'participants', label: 'الطلاب والحضور' }] : []),
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
            {savedAt && <span className="text-[11px] text-brand-600 flex items-center gap-1"><Check size={12} /> محفوظ</span>}
            {currentUser && (
              <button onClick={() => setModal('account')} className="w-9 h-9 rounded-full bg-brand-100 text-brand-800 text-xs font-bold flex items-center justify-center">
                {currentUser.name.slice(0, 1)}
              </button>
            )}
          </div>
        </header>

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
                          <td className="px-4 py-3 font-semibold text-slate-800">{p.name}</td>
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
                        <button onClick={() => askConfirm('تحويل هذا اليوم لتسجيل بالأسماء؟ راح تقدر تسجّل كل طالب باسمه وتحضّره، والعدد والمبلغ الحاليين ما راح ينحسبون.', () => patchWeek({ mode: 'named' }))}
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
                    {!week.participants.length ? (
                      <div className={emptyCls}>لا يوجد مشاركون بعد.</div>
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
        {view === 'club' && (
          <div className="mb-4">
            <h2 className="text-xl font-extrabold text-slate-800 mb-1">النادي</h2>
            <div className="text-sm text-slate-400 mb-4">المسابقات والسفرات</div>
            <Tabs value={clubTab} onChange={setClubTab} tabs={[
              ...(can('الإعداد (المسابقات)') ? [{ id: 'competitions', label: 'المسابقات' }] : []),
              ...(can('السفرات') ? [{ id: 'trips', label: 'السفرات' }] : []),
            ]} />
          </div>
        )}

        {view === 'club' && clubTab === 'competitions' && can('الإعداد (المسابقات)') && (
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
            <Breadcrumb items={[{ label: 'النادي', onClick: () => { setClubTab('competitions'); goto('club'); } }, { label: competition.name }]} />
            <div className="flex items-center justify-between gap-2 mb-4 mt-2">
              <div className="flex items-center gap-2 min-w-0">
                <h2 className="text-lg font-bold text-slate-800 truncate">{competition.name}</h2>
                <Badge tone="brand">{competition.level}</Badge>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => { setForm({ ...competition, tools: competition.tools || [], photos: competition.photos || [] }); setModal('editCompetition'); }}
                  className="text-slate-400 hover:text-brand-700"><Pencil size={16} /></button>
                <button onClick={() => askConfirm(`حذف مسابقة «${competition.name}»؟`, () => { removeCompetition(competition.id); setClubTab('competitions'); goto('club'); })}
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

        {view === 'club' && clubTab === 'trips' && can('السفرات') && (
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
            <Breadcrumb items={[{ label: 'السفرات', onClick: () => { setClubTab('trips'); goto('club'); } }, { label: trip.name }]} />
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
                        onClick={() => askConfirm('استبدال كل البيانات الحالية بهذه النسخة؟ ما فيه تراجع.', applyRestore)}>
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
          <Field label="الاسم"><input className={inputCls} value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value, error: '' })} /></Field>
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
                <select className={inputCls} value={form.accountId || ''} onChange={(e) => setForm({ ...form, accountId: e.target.value })}>
                  <option value="">اختر الحساب</option>
                  {data.faidAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </Field>
              <Field label="المبلغ (ر.س)"><input type="number" className={inputCls} value={form.amount || ''} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field>
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
        </Modal>
      )}

      {confirm && (
        <Modal title={confirm.onYes ? 'تأكيد' : 'ما ينفع'} onClose={() => setConfirm(null)}>
          <div className="text-sm text-slate-600 mb-5">{confirm.text}</div>
          {confirm.onYes ? (
            <div className="flex gap-2">
              <button className={btnDanger + ' flex-1'} onClick={() => { confirm.onYes(); setConfirm(null); }}>نعم، احذف</button>
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
              <td className="px-4 py-3 font-semibold text-slate-800">{p.name}</td>
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
                  <div className="flex items-center gap-2">
                    <Badge tone={statusOf(p) === 'حاضر' ? 'green' : statusOf(p) === 'غائب' ? 'red' : 'slate'}>{statusOf(p)}</Badge>
                    <button onClick={() => onSetAttendance(p, 'حاضر')} disabled={locked} className="text-green-500 hover:bg-green-50 rounded p-1 disabled:opacity-30"><Check size={14} /></button>
                    <button onClick={() => onSetAttendance(p, 'غائب')} disabled={locked} className="text-red-500 hover:bg-red-50 rounded p-1 disabled:opacity-30"><X size={14} /></button>
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
