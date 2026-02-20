// Platform Usage Page — dedicated page for API credit tracking
import { useAuth }   from '../contexts/AuthContext';
import { useCredit } from '../contexts/CreditContext';
import { Database, Zap, Search, ShieldCheck, Activity, TrendingUp } from 'lucide-react';

const PlatformUsagePage = () => {
  const { userProfile } = useAuth();
  const {
    totalApiCalls,
    remainingCalls,
    monthlyApiCost,
    monthlyCapUsd,
    platformPctUsed,
    mySearchCount,
  } = useCredit();

  const pct     = platformPctUsed ?? 0;
  const barColor = pct >= 97 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-emerald-500';
  const textColor = pct >= 80 ? 'text-amber-600' : 'text-slate-500';

  const stats = [
    {
      icon:  <Zap className="w-5 h-5 text-indigo-400" />,
      label: 'API calls this month',
      value: (totalApiCalls ?? 0).toLocaleString(),
      color: 'text-indigo-700',
      bg:    'bg-indigo-50 border-indigo-100',
    },
    {
      icon:  <Database className="w-5 h-5 text-emerald-400" />,
      label: 'Calls remaining',
      value: (remainingCalls ?? 0).toLocaleString(),
      color: remainingCalls < 500 ? 'text-amber-600' : 'text-emerald-700',
      bg:    remainingCalls < 500 ? 'bg-amber-50 border-amber-100' : 'bg-emerald-50 border-emerald-100',
    },
    {
      icon:  <Search className="w-5 h-5 text-violet-400" />,
      label: 'My searches',
      value: (mySearchCount ?? 0).toLocaleString(),
      color: 'text-violet-700',
      bg:    'bg-violet-50 border-violet-100',
    },
    {
      icon:  <ShieldCheck className="w-5 h-5 text-slate-400" />,
      label: 'Account role',
      value: userProfile?.role ?? 'user',
      color: 'text-slate-700',
      bg:    'bg-slate-50 border-slate-100',
    },
  ];

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

      {/* ── Page header ── */}
      <div className="mb-8 flex items-center gap-3">
        <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600
          flex items-center justify-center shadow-md flex-none">
          <Activity className="w-5 h-5 text-white" />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-slate-800 leading-tight">Platform Usage</h1>
          <p className="text-sm text-slate-500 mt-0.5">Real-time API consumption and budget tracking</p>
        </div>
      </div>

      {/* ── Monthly budget card ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-4 h-4 text-slate-400" />
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Monthly Budget
          </span>
        </div>

        <div className="flex justify-between items-end mb-3">
          <div>
            <p className="text-3xl font-bold text-slate-800">
              ${(monthlyApiCost ?? 0).toFixed(2)}
            </p>
            <p className="text-sm text-slate-500 mt-0.5">spent of ${monthlyCapUsd} cap</p>
          </div>
          <span className={`text-2xl font-bold ${
            pct >= 80 ? 'text-amber-600' : 'text-emerald-600'
          }`}>
            {pct.toFixed(1)}%
          </span>
        </div>

        {/* Thick progress bar */}
        <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
          <div
            className={`h-3 rounded-full transition-all duration-500 ${barColor}`}
            style={{ width: `${Math.max(pct, 1)}%` }}
          />
        </div>

        {pct >= 97 && (
          <p className="mt-2 text-sm text-red-600 font-medium">
            ⚠ Platform budget almost exhausted — contact admin.
          </p>
        )}
        {pct >= 80 && pct < 97 && (
          <p className="mt-2 text-sm text-amber-600 font-medium">
            Budget usage is high. Search usage is being monitored.
          </p>
        )}
      </div>

      {/* ── Stats grid ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {stats.map(({ icon, label, value, color, bg }) => (
          <div
            key={label}
            className={`flex items-center gap-4 rounded-2xl border p-5 ${bg}`}
          >
            <span className="flex-none">{icon}</span>
            <div className="min-w-0">
              <p className="text-xs text-slate-500 mb-0.5">{label}</p>
              <p className={`text-xl font-bold truncate capitalize ${color}`}>{value}</p>
            </div>
          </div>
        ))}
      </div>

      {remainingCalls < 500 && (
        <div className="mt-6 rounded-xl bg-amber-50 border border-amber-200 p-4 flex items-start gap-3">
          <Zap className="w-5 h-5 text-amber-500 flex-none mt-0.5" />
          <p className="text-sm text-amber-700">
            <strong>Less than 500 API calls remaining.</strong> Searches may be limited. Please contact
            your administrator to increase the platform budget.
          </p>
        </div>
      )}
    </div>
  );
};

export default PlatformUsagePage;
