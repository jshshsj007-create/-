import React, { useState, useEffect, useCallback } from 'react';
import {
  Home, BookOpen, Wallet, Settings, Plus, X, Check, ChevronLeft, Trash2, Pencil,
  Users as UsersIcon, Calendar, TrendingUp, TrendingDown, Layers, ShieldCheck,
  Lock, Unlock, Trophy, LogOut, KeyRound, Plane, Search, AlertTriangle, Send,
  RotateCcw, Wand2, CalendarDays,
} from 'lucide-react';

const STORAGE_KEY = 'nadi-alahya-data-v1';
const PERMS = ['البرامج', 'الأسابيع والحضور', 'المصروفات والتقارير', 'فيض - الإيرادات والمصروفات', 'الإعداد (المسابقات)', 'السفرات', 'المستخدمون والصلاحيات'];
const ROLES = ['مدير', 'مشرف برنامج', 'مسجل حضور', 'مسؤول مسابقات', 'مسؤول فيض'];
const ACCOUNT_COLORS = ['#8B5CF6', '#10B981', '#3B82F6', '#F59E0B', '#EC4899', '#14B8A6'];
const LEVELS = ['أولية', 'متوسطة', 'عليا'];

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
export const L = {
  revenue: (l) => paidAmount(l?.participants) + sumAmt(l?.collections),
  expenses: (l) => sumAmt(l?.expenseItems),
  net: (l) => L.revenue(l) - L.expenses(l),
  school: (l) => sumAmt(l?.schoolPayouts),
  faid: (l) => sumAmt(l?.faidPayouts),
  remaining: (l) => L.net(l) - L.school(l) - L.faid(l),
};

const emptyLedger = () => ({
  participants: [], collections: [], expenseItems: [], schoolPayouts: [], faidPayouts: [], faidTransfer: null,
});

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
  years: ['1447', '1448'],
  terms: ['الأول', 'الثاني'],
  currentYear: '1447',
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
function migrate(loaded) {
  const d = { ...defaultData(), ...loaded };
  if (!d.faidAccounts?.length) d.faidAccounts = defaultData().faidAccounts;
  if (!d.faidAccounts.some((a) => a.name === 'كاش')) d.faidAccounts.push({ id: uid(), name: 'كاش' });

  d.programs = (d.programs || []).map((p) => {
    const prog = { ...emptyLedger(), attendance: {}, status: 'مفتوح', ...p };
    prog.weeks = (p.weeks || []).map((w) => {
      const week = { ...emptyLedger(), ...w };
      // مصروفات النسخة القديمة كانت رقمًا مفردًا على الأسبوع
      if (w.expenses && !(w.expenseItems || []).length) {
        week.expenseItems = [{ id: uid(), accountId: d.faidAccounts[0]?.id, amount: Number(w.expenses), note: 'مصروف سابق' }];
      }
      delete week.expenses;
      return week;
    });
    return prog;
  });
  d.faidAdjustments = (d.faidAdjustments || []).map((a) => ({ ...a }));
  d.trips = (d.trips || []).map((t) => ({ ...t }));
  d.users = (d.users || []).map((u) => ({ accessScope: 'all', allowedWeeks: [], permissions: [], ...u }));
  return d;
}

/* ------------------------------ عناصر واجهة عامة ------------------------------ */

function Badge({ children, tone = 'violet' }) {
  const tones = {
    violet: 'bg-violet-100 text-violet-700',
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

const inputCls = 'w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent';
const btnPrimary = 'bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors flex items-center gap-1.5 justify-center disabled:opacity-40 disabled:cursor-not-allowed';
const btnGhost = 'text-slate-500 hover:text-slate-800 text-sm font-medium px-4 py-2.5 rounded-lg transition-colors';
const btnDanger = 'bg-red-600 hover:bg-red-700 text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors flex items-center gap-1.5 justify-center';
const cardCls = 'bg-white rounded-2xl border border-slate-100 p-5';
const emptyCls = 'bg-white rounded-2xl border border-dashed border-slate-200 p-10 text-center text-slate-400';

function StatCard({ label, value, icon: Icon, tone = 'violet' }) {
  const tones = {
    violet: 'text-violet-600 bg-violet-50',
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
        <button onClick={onAdd} disabled={locked} className="text-xs text-violet-600 flex items-center gap-1 shrink-0 disabled:opacity-40 disabled:cursor-not-allowed">
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
          <button onClick={onDistributeRest} className="text-xs text-violet-700 font-semibold flex items-center gap-1 hover:underline">
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

function NavItem({ id, label, icon: Icon, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${active ? 'bg-white text-violet-700' : 'text-violet-100 hover:bg-violet-800/50'}`}
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
          className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap ${value === t.id ? 'bg-violet-600 text-white' : 'text-slate-500 hover:text-slate-700'}`}
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
  const [weekTab, setWeekTab] = useState('finance');
  const [programTab, setProgramTab] = useState('days');
  const [settingsTab, setSettingsTab] = useState('users');
  const [setupLevel, setSetupLevel] = useState('الكل');
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [confirm, setConfirm] = useState(null);
  const [search, setSearch] = useState('');
  const [currentUser, setCurrentUser] = useState(null);
  const [loginForm, setLoginForm] = useState({ userId: '', code: '' });
  const [loginError, setLoginError] = useState('');

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

  const save = useCallback(async (next) => {
    setData(next);
    await storage.set(STORAGE_KEY, JSON.stringify(next));
  }, []);

  if (loading || !data) {
    return <div dir="rtl" className="min-h-screen flex items-center justify-center text-slate-400" style={{ fontFamily: "'Tajawal', sans-serif" }}>جاري التحميل...</div>;
  }

  const termKey = `${data.currentYear}-${data.currentTerm}`;
  const termPrograms = data.programs.filter((p) => p.termKey === termKey);
  const program = data.programs.find((p) => p.id === selectedProgramId);
  const week = program?.weeks.find((w) => w.id === selectedWeekId);
  const trip = data.trips.find((t) => t.id === selectedTripId);
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
          amount: sumAmt(parts),
          accountName: parts.map((x) => `${x.accountName} ${fmt(x.amount)}`).join(' + '),
        });
      } else {
        grouped.push(a);
      }
    });
    return grouped.sort((x, y) => (y.date || '').localeCompare(x.date || ''));
  })();

  const goto = (v) => { setView(v); setModal(null); setSearch(''); };
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
    if (!form.name) return;
    const accountId = form.accountId || data.faidAccounts[0]?.id;
    patchLedger(activeRef, (l) => ({
      participants: [...(l.participants || []), {
        id: uid(), name: form.name.trim(),
        amount: accountId === 'unpaid' ? 0 : Number(form.amount || 0),
        accountId, attendance: 'معلق',
      }],
    }));
    closeModal();
  };
  const saveParticipantEdit = () => {
    if (!form.name || !form.id) return;
    const accountId = form.accountId;
    patchLedger(activeRef, (l) => ({
      participants: (l.participants || []).map((p) => (p.id !== form.id ? p : {
        ...p, name: form.name.trim(), accountId, amount: accountId === 'unpaid' ? 0 : Number(form.amount || 0),
      })),
    }));
    closeModal();
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
      id: uid(), batchId, source, accountId: r.accountId,
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
    if (form.splitMode) {
      const rows = (form.splitRows || []).filter((r) => r.accountId && Number(r.amount) > 0);
      if (!rows.length) return;
      const batchId = uid();
      const txns = rows.map((r) => ({ id: uid(), batchId, accountId: r.accountId, date: form.date || '', type: form.type || 'إيراد', amount: Number(r.amount), note: form.note || '' }));
      save({ ...data, faidAdjustments: [...data.faidAdjustments, ...txns] });
      closeModal();
      return;
    }
    if (!form.amount || !form.accountId) return;
    save({ ...data, faidAdjustments: [...data.faidAdjustments, { id: uid(), accountId: form.accountId, date: form.date || '', type: form.type || 'إيراد', amount: Number(form.amount), note: form.note || '' }] });
    closeModal();
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
    if (!form.name) return;
    save({ ...data, programs: [...data.programs, { id: uid(), name: form.name.trim(), type: form.type || 'منفصل', termKey, status: 'مفتوح', weeks: [], attendance: {}, ...emptyLedger() }] });
    closeModal();
  };
  const patchProgram = (patch) => save({ ...data, programs: data.programs.map((p) => (p.id !== selectedProgramId ? p : { ...p, ...patch })) });
  const removeProgram = (pid) => {
    save({ ...data, programs: data.programs.filter((p) => p.id !== pid) });
    goto('programs');
  };
  const addWeek = () => {
    if (!form.name) return;
    patchLedger({ kind: 'program', programId: selectedProgramId }, (p) => ({
      weeks: [...p.weeks, { id: uid(), name: form.name.trim(), date: form.date || '', status: 'مفتوح', ...emptyLedger() }],
    }));
    closeModal();
  };
  const patchWeek = (patch) => patchLedger({ kind: 'week', programId: selectedProgramId, weekId: selectedWeekId }, () => patch);
  const removeWeek = (weekId) => {
    patchLedger({ kind: 'program', programId: selectedProgramId }, (p) => {
      const attendance = { ...(p.attendance || {}) };
      delete attendance[weekId];
      return { weeks: p.weeks.filter((w) => w.id !== weekId), attendance };
    });
    if (selectedWeekId === weekId) goto('programDetail');
  };

  /* --------------------------- بقية الكيانات --------------------------- */
  const addUser = () => {
    if (!form.name || !form.code) return;
    save({ ...data, users: [...data.users, { id: uid(), name: form.name.trim(), code: form.code, role: form.role || ROLES[0], permissions: form.permissions || [], accessScope: form.accessScope || 'all', allowedWeeks: form.allowedWeeks || [], status: 'نشط' }] });
    closeModal();
  };
  const toggleUserStatus = (userId) =>
    save({ ...data, users: data.users.map((u) => (u.id !== userId ? u : { ...u, status: u.status === 'نشط' ? 'غير نشط' : 'نشط' })) });
  const removeUser = (userId) => save({ ...data, users: data.users.filter((u) => u.id !== userId) });

  const addCompetition = () => {
    if (!form.name) return;
    save({ ...data, competitions: [...data.competitions, { id: uid(), name: form.name.trim(), level: form.level || LEVELS[0], date: form.date || '', participants: Number(form.participants || 0) }] });
    closeModal();
  };
  const removeCompetition = (cid) => save({ ...data, competitions: data.competitions.filter((c) => c.id !== cid) });

  const addTrip = () => {
    if (!form.name) return;
    save({ ...data, trips: [...data.trips, { id: uid(), name: form.name.trim(), date: form.date || '', revenue: 0, expenses: 0 }] });
    closeModal();
  };
  const patchTrip = (patch) => save({ ...data, trips: data.trips.map((t) => (t.id !== selectedTripId ? t : { ...t, ...patch })) });
  const removeTrip = (tid) => { save({ ...data, trips: data.trips.filter((t) => t.id !== tid) }); goto('trips'); };

  const addYearOrTerm = (which) => {
    if (!form.value) return;
    const key = which === 'year' ? 'years' : 'terms';
    if (data[key].includes(form.value)) { closeModal(); return; }
    save({ ...data, [key]: [...data[key], form.value.trim()] });
    closeModal();
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
  const canTransfer = can('فيض - الإيرادات والمصروفات') && canMoney;

  const doLogin = () => {
    const u = data.users.find((x) => x.id === loginForm.userId);
    if (!u || u.status !== 'نشط') { setLoginError('اختر مستخدم نشط'); return; }
    if (u.code !== loginForm.code) { setLoginError('رمز الدخول غير صحيح'); return; }
    setCurrentUser(u); setLoginError(''); setLoginForm({ userId: '', code: '' });
  };
  const doLogout = () => { setCurrentUser(null); goto('home'); };

  /* ------------------------------ شاشة الدخول ------------------------------ */
  if (data.users.length > 0 && !currentUser) {
    return (
      <div dir="rtl" className="min-h-screen bg-violet-900 flex items-center justify-center p-4" style={{ fontFamily: "'Tajawal', sans-serif" }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&display=swap');`}</style>
        <div className="bg-white rounded-2xl w-full max-w-sm p-7 shadow-2xl">
          <div className="w-12 h-12 rounded-xl bg-violet-100 text-violet-600 flex items-center justify-center mb-4"><KeyRound size={22} /></div>
          <h2 className="font-bold text-lg text-slate-800 mb-1">تسجيل الدخول</h2>
          <div className="text-sm text-slate-400 mb-5">نادي مدارس الأحياء</div>
          <Field label="المستخدم">
            <select className={inputCls} value={loginForm.userId} onChange={(e) => setLoginForm({ ...loginForm, userId: e.target.value })}>
              <option value="">اختر اسمك</option>
              {data.users.filter((u) => u.status === 'نشط').map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </Field>
          <Field label="رمز الدخول">
            <input type="password" className={inputCls} value={loginForm.code} onChange={(e) => setLoginForm({ ...loginForm, code: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && doLogin()} placeholder="****" />
          </Field>
          {loginError && <div className="text-red-500 text-xs mb-3">{loginError}</div>}
          <button className={btnPrimary + ' w-full'} onClick={doLogin}>دخول</button>
        </div>
      </div>
    );
  }

  const navItems = [
    { id: 'home', label: 'الرئيسية', icon: Home, show: true },
    { id: 'programs', label: 'البرامج', icon: BookOpen, show: can('البرامج') || can('الأسابيع والحضور') },
    { id: 'faid', label: 'فيض', icon: Wallet, show: can('فيض - الإيرادات والمصروفات') },
    { id: 'setup', label: 'الإعداد', icon: Trophy, show: can('الإعداد (المسابقات)') },
    { id: 'trips', label: 'السفرات', icon: Plane, show: can('السفرات') },
    { id: 'settings', label: 'الإعدادات', icon: Settings, show: isAdmin },
  ].filter((n) => n.show);
  const isNavActive = (id) =>
    view === id ||
    (id === 'programs' && (view === 'programDetail' || view === 'weekDetail')) ||
    (id === 'trips' && view === 'tripDetail');

  /** مشاركو الدفتر بعد البحث. */
  const visibleParticipants = (activeLedger?.participants || [])
    .filter((p) => !search || p.name.includes(search));

  // التبويبات تتغيّر حسب نوع البرنامج وصلاحية المستخدم، فنرجع للتبويب الأول لو المختار غير متاح.
  const programTabs = !program ? [] : [
    { id: 'days', label: isGrouped ? 'الأيام والحضور' : 'الأيام' },
    ...(isGrouped ? [{ id: 'participants', label: 'المشتركون' }] : []),
    ...(canMoney ? [{ id: 'finance', label: isGrouped ? 'المالية والتوزيع' : 'ملخص البرنامج' }] : []),
    { id: 'report', label: 'التقرير' },
  ];
  const activeProgramTab = programTabs.some((t) => t.id === programTab) ? programTab : programTabs[0]?.id;

  const weekTabs = !program || isGrouped ? [] : [
    ...(canMoney ? [{ id: 'finance', label: 'المالية والتوزيع' }] : []),
    { id: 'participants', label: 'الطلاب والحضور' },
    { id: 'report', label: 'تقرير اليوم' },
  ];
  const activeWeekTab = weekTabs.some((t) => t.id === weekTab) ? weekTab : weekTabs[0]?.id;

  return (
    <div dir="rtl" className="min-h-screen bg-violet-50 flex" style={{ fontFamily: "'Tajawal', sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&display=swap');`}</style>

      {/* Sidebar - شاشات كبيرة */}
      <aside className="hidden md:flex w-60 shrink-0 bg-violet-900 min-h-screen p-4 flex-col gap-1 sticky top-0 h-screen">
        <div className="flex items-center gap-3 px-2 py-4 mb-2">
          <div className="w-10 h-10 rounded-xl bg-violet-700 flex items-center justify-center text-white font-bold">ن</div>
          <div>
            <div className="text-white font-bold text-sm leading-tight">نادي مدارس الأحياء</div>
            <div className="text-violet-300 text-[11px]">تنظيم - دقة - نمو</div>
          </div>
        </div>
        {navItems.map((n) => <NavItem key={n.id} {...n} active={isNavActive(n.id)} onClick={() => goto(n.id)} />)}
        {currentUser && (
          <div className="mt-auto pt-3 border-t border-violet-800">
            <div className="text-violet-300 text-xs px-3 mb-2">مسجّل الدخول: <span className="text-white font-medium">{currentUser.name}</span></div>
            <button onClick={doLogout} className="w-full flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm text-violet-100 hover:bg-violet-800/50"><LogOut size={16} /> تسجيل خروج</button>
          </div>
        )}
      </aside>

      {/* Main */}
      <main className="flex-1 p-4 sm:p-6 pb-24 md:pb-6 max-w-5xl w-full">
        <div className="flex items-center justify-between gap-3 mb-5">
          <div className="md:hidden font-bold text-violet-900">نادي مدارس الأحياء</div>
          <div className="flex items-center gap-2 sm:gap-3 mr-auto">
            <select value={data.currentTerm} onChange={(e) => save({ ...data, currentTerm: e.target.value })} className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-600">
              {data.terms.map((t) => <option key={t} value={t}>الترم {t}</option>)}
            </select>
            <select value={data.currentYear} onChange={(e) => save({ ...data, currentYear: e.target.value })} className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-600">
              {data.years.map((y) => <option key={y} value={y}>{y} هـ</option>)}
            </select>
            {currentUser && <button onClick={doLogout} className="md:hidden text-slate-400"><LogOut size={18} /></button>}
          </div>
        </div>

        {/* ------------------------------- الرئيسية ------------------------------- */}
        {view === 'home' && (
          <div>
            <div className="bg-violet-600 rounded-2xl p-6 mb-6 text-white">
              <div className="text-lg font-bold mb-1">مرحبًا بك 👋</div>
              <div className="text-violet-100 text-sm">اختر القسم اللي تريد العمل عليه</div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <StatCard label="برامج هذا الترم" value={termPrograms.length} icon={BookOpen} />
              <StatCard label="أيام مفتوحة" value={termPrograms.flatMap((p) => p.weeks).filter((w) => w.status === 'مفتوح').length} icon={Calendar} tone="blue" />
              <StatCard label="رصيد فيض" value={fmt(balance) + ' ر.س'} icon={Wallet} tone={balance >= 0 ? 'green' : 'red'} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[
                { id: 'programs', label: 'البرامج', desc: 'البرامج والأيام والحضور والتوزيع', icon: BookOpen, show: can('البرامج') || can('الأسابيع والحضور') },
                { id: 'faid', label: 'فيض', desc: 'رصيد الفريق والإيرادات والمصروفات', icon: Wallet, show: can('فيض - الإيرادات والمصروفات') },
                { id: 'setup', label: 'الإعداد', desc: 'المسابقات حسب المرحلة', icon: Trophy, show: can('الإعداد (المسابقات)') },
                { id: 'trips', label: 'السفرات', desc: 'إيرادات ومصروفات كل سفرة', icon: Plane, show: can('السفرات') },
                { id: 'settings', label: 'الإعدادات', desc: 'المستخدمون والصلاحيات والسنوات', icon: Settings, show: isAdmin },
              ].filter((c) => c.show).map((c) => (
                <button key={c.id} onClick={() => goto(c.id)} className="bg-white rounded-2xl border border-slate-100 p-5 text-right hover:border-violet-300 hover:shadow-md transition-all">
                  <div className="w-10 h-10 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center mb-3"><c.icon size={20} /></div>
                  <div className="font-bold text-slate-800 mb-1">{c.label}</div>
                  <div className="text-xs text-slate-400">{c.desc}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ------------------------------ قائمة البرامج ------------------------------ */}
        {view === 'programs' && (
          <div>
            <div className="flex items-center justify-between mb-5 gap-3">
              <h2 className="text-lg sm:text-xl font-bold text-slate-800">البرامج - الترم {data.currentTerm} {data.currentYear}هـ</h2>
              {can('البرامج') && <button className={btnPrimary} onClick={() => { setForm({}); setModal('addProgram'); }}><Plus size={16} /> برنامج جديد</button>}
            </div>
            {termPrograms.length === 0 ? (
              <div className={emptyCls}>لا توجد برامج بعد لهذا الترم. أضف أول برنامج.</div>
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
                          <td className="px-4 py-3"><Badge tone={p.type === 'مجمع' ? 'blue' : 'violet'}>{p.type}</Badge></td>
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
                <Badge tone={isGrouped ? 'blue' : 'violet'}>{program.type}</Badge>
                {can('البرامج') && (
                  <>
                    <button onClick={() => { setForm({ name: program.name }); setModal('editProgram'); }} className="text-slate-300 hover:text-violet-600"><Pencil size={15} /></button>
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
                <span>برنامج مجمّع: المشترك يُسجّل مرة وحدة بمبلغ الاشتراك الكامل ويظهر في كل الأيام لتسجيل الحضور. الحساب المالي كله على مستوى البرنامج، مو على كل يوم.</span>
              </div>
            )}

            <Tabs value={activeProgramTab} onChange={setProgramTab} tabs={programTabs} />

            {/* أيام البرنامج */}
            {activeProgramTab === 'days' && (
              <div>
                <div className="flex justify-end mb-3">
                  {can('البرامج') && <button className={btnPrimary} onClick={() => { setForm({}); setModal('addWeek'); }}><Plus size={16} /> {isGrouped ? 'يوم جديد' : 'أسبوع/يوم جديد'}</button>}
                </div>
                {program.weeks.length === 0 ? (
                  <div className={emptyCls}>لا توجد أيام بعد. أضف أول يوم.</div>
                ) : (
                  <div className="bg-white rounded-2xl border border-slate-100 overflow-x-auto">
                    <table className="w-full text-sm min-w-[560px]">
                      <thead className="bg-slate-50 text-slate-500 text-xs"><tr>
                        <th className="text-right px-4 py-3 font-medium">الاسم</th>
                        <th className="text-right px-4 py-3 font-medium">التاريخ</th>
                        <th className="text-right px-4 py-3 font-medium">الحالة</th>
                        <th className="text-right px-4 py-3 font-medium">{isGrouped ? 'الحضور' : 'المشاركون'}</th>
                        {!isGrouped && canMoney && <th className="text-right px-4 py-3 font-medium">الصافي</th>}
                        <th className="text-right px-4 py-3 font-medium"></th>
                      </tr></thead>
                      <tbody>
                        {program.weeks.filter((w) => canSeeWeek(program.id, w.id)).map((w) => {
                          const present = isGrouped
                            ? (program.participants || []).filter((p) => program.attendance?.[w.id]?.[p.id] === 'حاضر').length
                            : w.participants.filter((p) => p.attendance === 'حاضر').length;
                          const totalP = isGrouped ? (program.participants || []).length : w.participants.length;
                          return (
                            <tr key={w.id} className="border-t border-slate-50 hover:bg-slate-50/50 cursor-pointer"
                              onClick={() => { setSelectedWeekId(w.id); setWeekTab(isGrouped ? 'attendance' : 'finance'); goto('weekDetail'); }}>
                              <td className="px-4 py-3 font-semibold text-slate-800">{w.name}</td>
                              <td className="px-4 py-3 text-slate-500">{w.date || '-'}</td>
                              <td className="px-4 py-3"><Badge tone={w.status === 'مفتوح' ? 'blue' : 'green'}>{w.status}</Badge></td>
                              <td className="px-4 py-3 text-slate-600">{isGrouped ? `${present} / ${totalP}` : totalP}</td>
                              {!isGrouped && canMoney && <td className="px-4 py-3 font-semibold text-slate-700">{fmt(L.net(w))} ر.س</td>}
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

            {/* مشتركو البرنامج المجمّع */}
            {activeProgramTab === 'participants' && isGrouped && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="relative flex-1">
                    <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300" />
                    <input className={inputCls + ' pr-9'} placeholder="ابحث باسم المشترك" value={search} onChange={(e) => setSearch(e.target.value)} />
                  </div>
                  <button className={btnPrimary + ' shrink-0'} disabled={ledgerLocked} onClick={() => { setForm({ accountId: data.faidAccounts[0]?.id }); setModal('addParticipant'); }}>
                    <Plus size={16} /> مشترك
                  </button>
                </div>
                {ledgerLocked && <div className="text-xs text-amber-600 mb-3">البرنامج مغلق — افتحه من الأعلى عشان تعدّل المشتركين.</div>}
                <ParticipantsTable
                  participants={visibleParticipants}
                  accounts={data.faidAccounts}
                  showAttendance={false}
                  locked={ledgerLocked}
                  onEdit={(p) => { setForm({ ...p }); setModal('editParticipant'); }}
                  onRemove={(p) => askConfirm(`حذف المشترك «${p.name}»؟`, () => removeParticipant(p.id))}
                />
                <div className="mt-3 text-sm text-slate-500 flex items-center justify-between px-1">
                  <span>عدد المشتركين: <b className="text-slate-800">{(program.participants || []).length}</b></span>
                  {canMoney && <span>إجمالي التحصيل: <b className="text-slate-800">{fmt(paidAmount(program.participants))} ر.س</b></span>}
                </div>
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
                  <button onClick={() => askConfirm(`حذف «${week.name}» وكل بياناته؟`, () => removeWeek(week.id))} className="text-slate-300 hover:text-red-500"><Trash2 size={15} /></button>
                )}
              </div>
              <button onClick={() => patchWeek({ status: week.status === 'مفتوح' ? 'مغلق' : 'مفتوح' })}
                className={`flex items-center gap-1.5 text-sm font-semibold px-3 py-2 rounded-lg ${week.status === 'مفتوح' ? 'bg-blue-50 text-blue-600' : 'bg-green-50 text-green-600'}`}>
                {week.status === 'مفتوح' ? <Unlock size={15} /> : <Lock size={15} />} {week.status}
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
                  <button onClick={() => markAll('حاضر', visibleParticipants)} disabled={week.status === 'مغلق'} className="text-xs font-semibold text-green-700 bg-green-50 px-3 py-2.5 rounded-lg shrink-0 disabled:opacity-40">تعليم الكل حاضر</button>
                </div>
                {(program.participants || []).length === 0 ? (
                  <div className={emptyCls}>ما فيه مشتركون بعد. سجّلهم من تبويب «المشتركون» في صفحة البرنامج.</div>
                ) : (
                  <AttendanceTable
                    participants={visibleParticipants}
                    statusOf={(p) => attendanceOf(p, week.id)}
                    locked={week.status === 'مغلق'}
                    onSet={(p, s) => setAttendance(p.id, s, week.id)}
                  />
                )}
                <div className="mt-3 text-sm text-slate-500 px-1">
                  الحاضرون اليوم: <b className="text-slate-800">{(program.participants || []).filter((p) => attendanceOf(p, week.id) === 'حاضر').length}</b> من {(program.participants || []).length}
                </div>
              </div>
            ) : (
              /* برنامج منفصل: مالية + مشاركون + تقرير لهذا اليوم */
              <>
                <Tabs value={activeWeekTab} onChange={setWeekTab} tabs={weekTabs} />

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
                      <button onClick={() => markAll('حاضر', visibleParticipants)} disabled={ledgerLocked} className="text-xs font-semibold text-green-700 bg-green-50 px-3 py-2.5 rounded-lg shrink-0 disabled:opacity-40">الكل حاضر</button>
                      <button className={btnPrimary + ' shrink-0'} disabled={ledgerLocked} onClick={() => { setForm({ accountId: data.faidAccounts[0]?.id }); setModal('addParticipant'); }}>
                        <Plus size={16} /> مشارك
                      </button>
                    </div>
                    {ledgerLocked && <div className="text-xs text-amber-600 mb-3">اليوم مغلق — افتحه من الأعلى عشان تعدّل.</div>}
                    {!week.participants.length ? (
                      <div className={emptyCls}>لا يوجد مشاركون بعد.</div>
                    ) : (
                      <ParticipantsTable
                        participants={visibleParticipants}
                        accounts={data.faidAccounts}
                        showAttendance
                        statusOf={(p) => p.attendance || 'معلق'}
                        onSetAttendance={(p, s) => setAttendance(p.id, s)}
                        locked={ledgerLocked}
                        onEdit={(p) => { setForm({ ...p }); setModal('editParticipant'); }}
                        onRemove={(p) => askConfirm(`حذف «${p.name}»؟`, () => removeParticipant(p.id))}
                      />
                    )}
                  </div>
                )}

                {activeWeekTab === 'report' && <WeekReport week={week} accounts={data.faidAccounts} canMoney={canMoney} />}
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
              <StatCard label="إجمالي الإيرادات" value={fmt(totalRevenue) + ' ر.س'} icon={TrendingUp} tone="violet" />
              <StatCard label="إجمالي المصروفات" value={fmt(totalExpenses) + ' ر.س'} icon={TrendingDown} tone="red" />
            </div>

            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-slate-700">الحسابات</h3>
              <button onClick={() => { setForm({ value: '' }); setModal('addFaidAccount'); }} className="text-xs text-violet-600 flex items-center gap-1"><Plus size={14} /> حساب جديد</button>
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
              <h3 className="font-bold text-slate-700">آخر العمليات</h3>
              <button className={btnPrimary} onClick={() => { setForm({}); setModal('addFaid'); }}><Plus size={16} /> عملية يدوية</button>
            </div>
            {faidTransactions.length === 0 ? (
              <div className={emptyCls}>لا توجد عمليات بعد.</div>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-100 overflow-x-auto">
                <table className="w-full text-sm min-w-[620px]">
                  <thead className="bg-slate-50 text-slate-500 text-xs"><tr>
                    <th className="text-right px-4 py-3 font-medium">البيان</th>
                    <th className="text-right px-4 py-3 font-medium">الحساب</th>
                    <th className="text-right px-4 py-3 font-medium">النوع</th>
                    <th className="text-right px-4 py-3 font-medium">التاريخ</th>
                    <th className="text-right px-4 py-3 font-medium">المبلغ</th>
                    <th className="text-right px-4 py-3 font-medium"></th>
                  </tr></thead>
                  <tbody>
                    {faidTransactions.map((t) => (
                      <tr key={t.id} className="border-t border-slate-50">
                        <td className="px-4 py-3 text-slate-700">
                          {t.note || '-'}
                          {t.source && <span className="mr-2"><Badge tone="blue">مُرحّل من برنامج</Badge></span>}
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
          </div>
        )}

        {/* -------------------------------- الإعداد -------------------------------- */}
        {view === 'setup' && (
          <div>
            <div className="flex items-center justify-between mb-5 gap-3">
              <h2 className="text-lg sm:text-xl font-bold text-slate-800">الإعداد - المسابقات</h2>
              <button className={btnPrimary} onClick={() => { setForm({}); setModal('addCompetition'); }}><Plus size={16} /> مسابقة جديدة</button>
            </div>
            <Tabs value={setupLevel} onChange={setSetupLevel} tabs={['الكل', ...LEVELS].map((lv) => ({ id: lv, label: lv }))} />
            {(() => {
              const list = data.competitions.filter((c) => setupLevel === 'الكل' || c.level === setupLevel);
              return list.length === 0 ? (
                <div className={emptyCls}>لا توجد مسابقات بعد.</div>
              ) : (
                <div className="bg-white rounded-2xl border border-slate-100 overflow-x-auto">
                  <table className="w-full text-sm min-w-[520px]">
                    <thead className="bg-slate-50 text-slate-500 text-xs"><tr>
                      <th className="text-right px-4 py-3 font-medium">اسم المسابقة</th>
                      <th className="text-right px-4 py-3 font-medium">المرحلة</th>
                      <th className="text-right px-4 py-3 font-medium">تاريخ التنفيذ</th>
                      <th className="text-right px-4 py-3 font-medium">عدد المشاركين</th>
                      <th className="text-right px-4 py-3 font-medium"></th>
                    </tr></thead>
                    <tbody>
                      {list.map((c) => (
                        <tr key={c.id} className="border-t border-slate-50">
                          <td className="px-4 py-3 font-semibold text-slate-800">{c.name}</td>
                          <td className="px-4 py-3"><Badge tone="violet">{c.level}</Badge></td>
                          <td className="px-4 py-3 text-slate-500">{c.date || '-'}</td>
                          <td className="px-4 py-3 text-slate-600">{c.participants}</td>
                          <td className="px-4 py-3 text-left">
                            <button onClick={() => askConfirm(`حذف مسابقة «${c.name}»؟`, () => removeCompetition(c.id))} className="text-slate-300 hover:text-red-500"><Trash2 size={15} /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </div>
        )}

        {/* ------------------------------- السفرات ------------------------------- */}
        {view === 'trips' && (
          <div>
            <div className="flex items-center justify-between mb-1 gap-3">
              <h2 className="text-lg sm:text-xl font-bold text-slate-800">السفرات</h2>
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
                    {data.trips.map((t) => {
                      const net = Number(t.revenue || 0) - Number(t.expenses || 0);
                      return (
                        <tr key={t.id} className="border-t border-slate-50 hover:bg-slate-50/50 cursor-pointer" onClick={() => { setSelectedTripId(t.id); goto('tripDetail'); }}>
                          <td className="px-4 py-3 font-semibold text-slate-800">{t.name}</td>
                          <td className="px-4 py-3 text-slate-500">{t.date || '-'}</td>
                          <td className="px-4 py-3 text-green-600">{fmt(t.revenue)} ر.س</td>
                          <td className="px-4 py-3 text-red-500">{fmt(t.expenses)} ر.س</td>
                          <td className={`px-4 py-3 font-semibold ${net >= 0 ? 'text-slate-800' : 'text-red-600'}`}>{fmt(net)} ر.س</td>
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

        {view === 'tripDetail' && trip && (
          <div>
            <Breadcrumb items={[{ label: 'السفرات', onClick: () => goto('trips') }, { label: trip.name }]} />
            <div className="flex items-center gap-2 mb-5 mt-2">
              <h2 className="text-lg sm:text-xl font-bold text-slate-800">{trip.name}</h2>
              <button onClick={() => askConfirm(`حذف سفرة «${trip.name}»؟`, () => removeTrip(trip.id))} className="text-slate-300 hover:text-red-500"><Trash2 size={15} /></button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div className={cardCls}>
                <div className="text-sm text-slate-500 mb-2">التاريخ (هـ)</div>
                <input className={inputCls} value={trip.date} onChange={(e) => patchTrip({ date: e.target.value })} placeholder="1447/03/01" />
              </div>
              <StatCard label="الصافي" value={fmt(Number(trip.revenue || 0) - Number(trip.expenses || 0)) + ' ر.س'} icon={Wallet}
                tone={(Number(trip.revenue || 0) - Number(trip.expenses || 0)) >= 0 ? 'green' : 'red'} />
              <div className={cardCls}>
                <div className="text-sm text-slate-500 mb-2">إجمالي الإيرادات (ر.س)</div>
                <input type="number" className={inputCls} value={trip.revenue} onChange={(e) => patchTrip({ revenue: e.target.value })} />
              </div>
              <div className={cardCls}>
                <div className="text-sm text-slate-500 mb-2">إجمالي المصروفات (ر.س)</div>
                <input type="number" className={inputCls} value={trip.expenses} onChange={(e) => patchTrip({ expenses: e.target.value })} />
              </div>
            </div>
          </div>
        )}

        {/* ------------------------------- الإعدادات ------------------------------- */}
        {view === 'settings' && (
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-slate-800 mb-5">الإعدادات</h2>
            <Tabs value={settingsTab} onChange={setSettingsTab} tabs={[
              { id: 'users', label: 'المستخدمون والصلاحيات' },
              { id: 'terms', label: 'السنوات والفصول' },
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
                            <td className="px-4 py-3 font-semibold text-slate-800">{u.name}</td>
                            <td className="px-4 py-3"><Badge tone="violet">{u.role}</Badge></td>
                            <td className="px-4 py-3"><div className="flex flex-wrap gap-1">{u.permissions.length ? u.permissions.map((p) => <Badge key={p} tone="slate">{p}</Badge>) : <span className="text-slate-300 text-xs">-</span>}</div></td>
                            <td className="px-4 py-3">{u.accessScope === 'limited' ? <Badge tone="amber">{(u.allowedWeeks || []).length} محدد</Badge> : <Badge tone="slate">الكل</Badge>}</td>
                            <td className="px-4 py-3"><Badge tone={u.status === 'نشط' ? 'green' : 'slate'}>{u.status}</Badge></td>
                            <td className="px-4 py-3 text-left whitespace-nowrap">
                              <button onClick={() => toggleUserStatus(u.id)} className="text-xs text-violet-600 hover:underline">{u.status === 'نشط' ? 'تعطيل' : 'تفعيل'}</button>
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
                    <button onClick={() => { setForm({ value: '' }); setModal('addYear'); }} className="text-violet-600"><Plus size={18} /></button>
                  </div>
                  <div className="flex flex-wrap gap-2">{data.years.map((y) => <Badge key={y} tone="violet">{y} هـ</Badge>)}</div>
                </div>
                <div className={cardCls}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="font-semibold text-slate-700">الفصول</div>
                    <button onClick={() => { setForm({ value: '' }); setModal('addTerm'); }} className="text-violet-600"><Plus size={18} /></button>
                  </div>
                  <div className="flex flex-wrap gap-2">{data.terms.map((t) => <Badge key={t} tone="violet">الترم {t}</Badge>)}</div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* شريط تنقل سفلي - الجوال */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 bg-violet-900 flex justify-around px-1 py-2 z-40">
        {navItems.slice(0, 5).map((n) => (
          <button key={n.id} onClick={() => goto(n.id)}
            className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-medium ${isNavActive(n.id) ? 'text-white' : 'text-violet-300'}`}>
            <n.icon size={19} />
            {n.label}
          </button>
        ))}
      </nav>

      {/* --------------------------------- المودالات --------------------------------- */}
      {modal === 'addProgram' && (
        <Modal title="برنامج جديد" onClose={closeModal}>
          <Field label="اسم البرنامج"><input className={inputCls} value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="مثال: جمعة الرواد" /></Field>
          <Field label="نوع البرنامج" hint={(form.type || 'منفصل') === 'مجمع'
            ? 'مجمّع: المشترك يسجّل مرة وحدة لكل الأيام، والحساب المالي على مستوى البرنامج كله.'
            : 'منفصل: كل يوم له مشاركوه وحسابه المالي المستقل.'}>
            <div className="flex gap-2">
              {['منفصل', 'مجمع'].map((t) => (
                <button key={t} onClick={() => setForm({ ...form, type: t })}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border ${(form.type || 'منفصل') === t ? 'bg-violet-600 text-white border-violet-600' : 'border-slate-200 text-slate-600'}`}>{t}</button>
              ))}
            </div>
          </Field>
          <div className="flex gap-2 mt-5"><button className={btnPrimary + ' flex-1'} onClick={addProgram}>إضافة</button><button className={btnGhost} onClick={closeModal}>إلغاء</button></div>
        </Modal>
      )}

      {modal === 'editProgram' && (
        <Modal title="تعديل البرنامج" onClose={closeModal}>
          <Field label="اسم البرنامج"><input className={inputCls} value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <div className="flex gap-2 mt-5">
            <button className={btnPrimary + ' flex-1'} onClick={() => { if (form.name) { patchProgram({ name: form.name.trim() }); closeModal(); } }}>حفظ</button>
            <button className={btnGhost} onClick={closeModal}>إلغاء</button>
          </div>
        </Modal>
      )}

      {modal === 'addWeek' && (
        <Modal title={isGrouped ? 'يوم جديد' : 'أسبوع/يوم جديد'} onClose={closeModal}>
          <Field label="الاسم"><input className={inputCls} value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={isGrouped ? 'اليوم الأول' : 'الأسبوع الخامس'} /></Field>
          <Field label="التاريخ (هـ)"><input className={inputCls} value={form.date || ''} onChange={(e) => setForm({ ...form, date: e.target.value })} placeholder="1447/02/01" /></Field>
          <div className="flex gap-2 mt-5"><button className={btnPrimary + ' flex-1'} onClick={addWeek}>إضافة</button><button className={btnGhost} onClick={closeModal}>إلغاء</button></div>
        </Modal>
      )}

      {(modal === 'addParticipant' || modal === 'editParticipant') && (
        <Modal title={modal === 'addParticipant' ? (isGrouped ? 'إضافة مشترك' : 'إضافة مشارك') : 'تعديل المشارك'} onClose={closeModal}>
          <Field label="الاسم"><input className={inputCls} value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="طريقة الدفع / التصنيف">
            <select className={inputCls} value={form.accountId || data.faidAccounts[0]?.id || ''}
              onChange={(e) => setForm({ ...form, accountId: e.target.value, ...(e.target.value === 'unpaid' ? { amount: 0 } : {}) })}>
              {data.faidAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              <option value="unpaid">ما دفع</option>
            </select>
          </Field>
          {form.accountId !== 'unpaid' && (
            <Field label={isGrouped ? 'مبلغ الاشتراك الكامل (ر.س)' : 'المبلغ (ر.س)'}
              hint={isGrouped ? 'هذا مبلغ الاشتراك لكل أيام البرنامج، يُحتسب مرة وحدة.' : undefined}>
              <input type="number" className={inputCls} value={form.amount ?? ''} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </Field>
          )}
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
          <div className="bg-violet-50 rounded-xl px-4 py-3 mb-4 text-sm text-violet-800">
            المبلغ المُرحّل: <b>{fmt(L.faid(activeLedger))} ر.س</b>
            <div className="text-xs text-violet-600 mt-1">راح تُسجَّل عملية «إيراد» في فيض، ويقدر ترجع عنها بإلغاء الترحيل.</div>
          </div>

          <div className="flex items-center gap-2 mb-4">
            <button type="button" onClick={() => setForm({ ...form, splitMode: !form.splitMode, splitRows: [{}, {}], error: '' })}
              className={`text-xs px-3 py-1.5 rounded-lg border ${form.splitMode ? 'bg-violet-600 text-white border-violet-600' : 'border-slate-200 text-slate-600'}`}>
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
                <button type="button" onClick={addSplitRow} className="text-xs text-violet-600 flex items-center gap-1"><Plus size={14} /> إضافة حساب</button>
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
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border ${(form.type || 'إيراد') === t ? 'bg-violet-600 text-white border-violet-600' : 'border-slate-200 text-slate-600'}`}>{t}</button>
              ))}
            </div>
          </Field>

          <div className="flex items-center gap-2 mb-4">
            <button type="button" onClick={() => setForm({ ...form, splitMode: !form.splitMode, splitRows: [{}, {}] })}
              className={`text-xs px-3 py-1.5 rounded-lg border ${form.splitMode ? 'bg-violet-600 text-white border-violet-600' : 'border-slate-200 text-slate-600'}`}>
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
                <button type="button" onClick={addSplitRow} className="text-xs text-violet-600 flex items-center gap-1"><Plus size={14} /> إضافة حساب</button>
                <div className="text-xs text-slate-400 pt-1">الإجمالي: {fmt(sumAmt(form.splitRows))} ر.س</div>
              </div>
            </Field>
          )}

          <Field label="البيان"><input className={inputCls} value={form.note || ''} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="مثال: دعم من عضو" /></Field>
          <Field label="التاريخ (هـ)"><input className={inputCls} value={form.date || ''} onChange={(e) => setForm({ ...form, date: e.target.value })} placeholder="1447/02/01" /></Field>
          <div className="flex gap-2 mt-5"><button className={btnPrimary + ' flex-1'} onClick={addFaidAdjustment}>إضافة</button><button className={btnGhost} onClick={closeModal}>إلغاء</button></div>
        </Modal>
      )}

      {modal === 'addFaidAccount' && (
        <Modal title="حساب فيض جديد" onClose={closeModal}>
          <Field label="اسم الحساب"><input className={inputCls} value={form.value || ''} onChange={(e) => setForm({ ...form, value: e.target.value })} placeholder="مثال: أبو فارس" /></Field>
          <div className="flex gap-2 mt-5"><button className={btnPrimary + ' flex-1'} onClick={addFaidAccount}>إضافة</button><button className={btnGhost} onClick={closeModal}>إلغاء</button></div>
        </Modal>
      )}

      {modal === 'addUser' && (
        <Modal title="مستخدم جديد" onClose={closeModal} wide>
          <Field label="الاسم"><input className={inputCls} value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="رمز الدخول"><input className={inputCls} value={form.code || ''} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="مثال: 1234" /></Field>
          <Field label="الدور">
            <select className={inputCls} value={form.role || ROLES[0]} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </Field>
          <Field label="الصلاحيات (الأقسام التي يقدر يشوفها)" hint="دور «مدير» يملك كل الصلاحيات تلقائيًا.">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {PERMS.map((p) => (
                <button key={p} type="button" onClick={() => togglePerm(p)}
                  className={`text-xs px-3 py-2 rounded-lg border text-right ${(form.permissions || []).includes(p) ? 'bg-violet-600 text-white border-violet-600' : 'border-slate-200 text-slate-600'}`}>{p}</button>
              ))}
            </div>
          </Field>
          <Field label="نطاق الوصول للأيام">
            <div className="flex gap-2 mb-2">
              {[{ v: 'all', l: 'كل الأيام' }, { v: 'limited', l: 'أيام محددة فقط' }].map((o) => (
                <button key={o.v} type="button" onClick={() => setForm({ ...form, accessScope: o.v })}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border ${(form.accessScope || 'all') === o.v ? 'bg-violet-600 text-white border-violet-600' : 'border-slate-200 text-slate-600'}`}>{o.l}</button>
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
          <div className="flex gap-2 mt-5"><button className={btnPrimary + ' flex-1'} onClick={addUser}>إضافة</button><button className={btnGhost} onClick={closeModal}>إلغاء</button></div>
        </Modal>
      )}

      {modal === 'addCompetition' && (
        <Modal title="مسابقة جديدة" onClose={closeModal}>
          <Field label="اسم المسابقة"><input className={inputCls} value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="مثال: مسابقة حفظ القرآن" /></Field>
          <Field label="المرحلة">
            <div className="flex gap-2">
              {LEVELS.map((lv) => (
                <button key={lv} type="button" onClick={() => setForm({ ...form, level: lv })}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border ${(form.level || LEVELS[0]) === lv ? 'bg-violet-600 text-white border-violet-600' : 'border-slate-200 text-slate-600'}`}>{lv}</button>
              ))}
            </div>
          </Field>
          <Field label="تاريخ التنفيذ (هـ)"><input className={inputCls} value={form.date || ''} onChange={(e) => setForm({ ...form, date: e.target.value })} placeholder="1447/02/10" /></Field>
          <Field label="عدد المشاركين"><input type="number" className={inputCls} value={form.participants || ''} onChange={(e) => setForm({ ...form, participants: e.target.value })} /></Field>
          <div className="flex gap-2 mt-5"><button className={btnPrimary + ' flex-1'} onClick={addCompetition}>إضافة</button><button className={btnGhost} onClick={closeModal}>إلغاء</button></div>
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

      {confirm && (
        <Modal title="تأكيد" onClose={() => setConfirm(null)}>
          <div className="text-sm text-slate-600 mb-5">{confirm.text}</div>
          <div className="flex gap-2">
            <button className={btnDanger + ' flex-1'} onClick={() => { confirm.onYes(); setConfirm(null); }}>نعم، احذف</button>
            <button className={btnGhost} onClick={() => setConfirm(null)}>إلغاء</button>
          </div>
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
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="الإيراد" value={fmt(L.revenue(ledger)) + ' ر.س'} icon={TrendingUp} tone="green" />
        <StatCard label="المصروفات" value={fmt(L.expenses(ledger)) + ' ر.س'} icon={TrendingDown} tone="red" />
        <StatCard label="الصافي" value={fmt(L.net(ledger)) + ' ر.س'} icon={Wallet} tone={L.net(ledger) >= 0 ? 'violet' : 'red'} />
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

function ParticipantsTable({ participants, accounts, showAttendance, statusOf, onSetAttendance, onEdit, onRemove, locked }) {
  if (!participants.length) {
    return <div className={emptyCls}>ما فيه نتائج.</div>;
  }
  return (
    <div className="bg-white rounded-2xl border border-slate-100 overflow-x-auto">
      <table className="w-full text-sm min-w-[560px]">
        <thead className="bg-slate-50 text-slate-500 text-xs"><tr>
          <th className="text-right px-4 py-3 font-medium">الاسم</th>
          <th className="text-right px-4 py-3 font-medium">المبلغ</th>
          <th className="text-right px-4 py-3 font-medium">التصنيف</th>
          {showAttendance && <th className="text-right px-4 py-3 font-medium">الحضور</th>}
          <th className="text-right px-4 py-3 font-medium"></th>
        </tr></thead>
        <tbody>
          {participants.map((p) => (
            <tr key={p.id} className="border-t border-slate-50">
              <td className="px-4 py-3 font-semibold text-slate-800">{p.name}</td>
              <td className="px-4 py-3 text-slate-600">{p.accountId === 'unpaid' ? '-' : fmt(p.amount) + ' ر.س'}</td>
              <td className="px-4 py-3">
                {p.accountId === 'unpaid'
                  ? <Badge tone="amber">ما دفع</Badge>
                  : <span className="text-slate-600">{accounts.find((a) => a.id === p.accountId)?.name || '-'}</span>}
              </td>
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
                <button onClick={() => onEdit(p)} disabled={locked} className="text-slate-300 hover:text-violet-600 disabled:opacity-30"><Pencil size={14} /></button>
                <button onClick={() => onRemove(p)} disabled={locked} className="text-slate-300 hover:text-red-500 mr-2 disabled:opacity-30"><Trash2 size={14} /></button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** جدول حضور يوم واحد في البرنامج المجمّع. */
function AttendanceTable({ participants, statusOf, onSet, locked }) {
  if (!participants.length) return <div className={emptyCls}>ما فيه نتائج.</div>;
  return (
    <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden divide-y divide-slate-50">
      {participants.map((p) => {
        const st = statusOf(p);
        return (
          <div key={p.id} className="flex items-center justify-between px-4 py-3 gap-3">
            <span className="font-semibold text-slate-800 text-sm truncate">{p.name}</span>
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
        <StatCard label="الصافي" value={fmt(t.net) + ' ر.س'} icon={Wallet} tone="violet" />
        <StatCard label="نصيب المدرسة" value={fmt(t.school) + ' ر.س'} icon={Layers} tone="blue" />
        <StatCard label="نصيب فيض" value={fmt(t.faid) + ' ر.س'} icon={ShieldCheck} tone="violet" />
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
    p: a.p + w.participants.length,
    present: a.present + w.participants.filter((x) => x.attendance === 'حاضر').length,
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
                <td className="px-4 py-3 text-slate-600">{w.participants.filter((x) => x.attendance === 'حاضر').length} / {w.participants.length}</td>
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
      {canMoney && (
        <div className={cardCls}>
          <div className="text-sm font-semibold text-slate-700 mb-4">توزيع المشاركين حسب طريقة الدفع (كل الأيام)</div>
          <PaymentPie participants={rows.flatMap((w) => w.participants)} accounts={accounts} />
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
          <StatCard label="الصافي" value={fmt(L.net(program)) + ' ر.س'} icon={Wallet} tone="violet" />
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
              const present = days.filter((d) => st(p.id, d.id) === 'حاضر').length;
              return (
                <tr key={p.id} className="border-t border-slate-50">
                  <td className="px-4 py-2.5 font-semibold text-slate-800 sticky right-0 bg-white whitespace-nowrap">{p.name}</td>
                  {days.map((d) => {
                    const s = st(p.id, d.id);
                    return (
                      <td key={d.id} className="px-3 py-2.5 text-center">
                        <span className={`inline-flex w-6 h-6 rounded-full items-center justify-center text-xs font-bold ${
                          s === 'حاضر' ? 'bg-green-100 text-green-700' : s === 'غائب' ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-400'
                        }`}>{s === 'حاضر' ? '✓' : s === 'غائب' ? '✕' : '–'}</span>
                      </td>
                    );
                  })}
                  <td className="px-3 py-2.5 text-center font-bold text-slate-700">{present}/{days.length}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
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

function WeekReport({ week, accounts, canMoney }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="الحاضرون" value={`${week.participants.filter((p) => p.attendance === 'حاضر').length} / ${week.participants.length}`} icon={Check} tone="green" />
        {canMoney && <>
          <StatCard label="الإيراد" value={fmt(L.revenue(week)) + ' ر.س'} icon={TrendingUp} tone="violet" />
          <StatCard label="المصروفات" value={fmt(L.expenses(week)) + ' ر.س'} icon={TrendingDown} tone="red" />
          <StatCard label="الصافي" value={fmt(L.net(week)) + ' ر.س'} icon={Wallet} tone="violet" />
          <StatCard label="نصيب المدرسة" value={fmt(L.school(week)) + ' ر.س'} icon={Layers} tone="blue" />
          <StatCard label="نصيب فيض" value={fmt(L.faid(week)) + ' ر.س'} icon={ShieldCheck} tone="green" />
        </>}
      </div>
      {canMoney && (
        <div className={cardCls}>
          <div className="text-sm font-semibold text-slate-700 mb-4">توزيع التحصيل حسب طريقة الدفع</div>
          <PaymentPie participants={week.participants} accounts={accounts} />
        </div>
      )}
    </div>
  );
}
