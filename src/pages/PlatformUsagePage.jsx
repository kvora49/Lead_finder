// Platform Usage Page — SKU-based credit tracking for users
import { useAuth }   from '../contexts/AuthContext';
import { useCredit } from '../contexts/CreditContext';
import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { CREDIT_CONFIG } from '../config';
import { toast } from 'sonner';
import {
  Database, Zap, Search, Activity, TrendingUp,
  Clock, CheckCircle, XCircle, AlertCircle,
} from 'lucide-react';

const RequestStatusBadge = ({ status }) => {
  const configs = {
    pending:  { icon: Clock,         bg: 'bg-blue-100',    text: 'text-blue-700',    label: 'Pending Review' },
    approved: { icon: CheckCircle,   bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Approved'       },
    rejected: { icon: XCircle,       bg: 'bg-red-100',     text: 'text-red-700',     label: 'Rejected'       },
  };
  const config = configs[status] || configs.pending;
  const Icon   = config.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${config.bg} ${config.text}`}>
      <Icon className="w-3.5 h-3.5" />
      {config.label}
    </span>
  );
};

const PlatformUsagePage = () => {
  const { currentUser } = useAuth();
  const {
    myCreditsUsed,
    myCreditsLimit,
    myCreditsRemaining,
    myCreditPctUsed,
    myCreditIsUnlimited,
    myApiCallsUsed,
    mySearchCount,
  } = useCredit();

  const [monthlySearches, setMonthlySearches] = useState(0);

  useEffect(() => {
    if (!currentUser?.uid) { setMonthlySearches(0); return; }
    const now        = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const q = query(
      collection(db, 'searchLogs'),
      where('userId', '==', currentUser.uid),
      where('timestamp', '>=', monthStart)
    );
    const unsub = onSnapshot(q, (snap) => setMonthlySearches(snap.size));
    return () => unsub();
  }, [currentUser?.uid]);

  const pct      = myCreditIsUnlimited ? 0 : (myCreditPctUsed ?? 0);
  const barColor = pct >= 95 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-emerald-500';

  const creditsLabel    = myCreditIsUnlimited ? 'Unlimited' : (myCreditsLimit ?? 0).toLocaleString();
  const remainingLabel  = myCreditIsUnlimited ? 'Unlimited' : (myCreditsRemaining ?? 0).toLocaleString();
  const usedLabel       = myCreditIsUnlimited ? '—' : (myCreditsUsed ?? 0).toLocaleString();

  // Estimated searches remaining
  const enterpriseCostPerCity = 32 * CREDIT_CONFIG.CREDITS_PER_TIER.enterprise; // 320
  const citySearchesLeft = myCreditIsUnlimited
    ? '∞'
    : Math.floor((myCreditsRemaining ?? 0) / enterpriseCostPerCity);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0f0f0f]">
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">My Usage</h1>
          <p className="text-slate-500 dark:text-gray-400 mt-1">
            Your monthly search credits — resets on the 1st of each month
          </p>
        </div>

        {/* Credit Summary Card */}
        <div className="bg-white dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-xl flex items-center justify-center">
                <Zap className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="font-semibold text-slate-900 dark:text-white">Monthly Credits</p>
                <p className="text-xs text-slate-500 dark:text-gray-400">
                  {myCreditIsUnlimited ? 'Unlimited access' : `${pct.toFixed(1)}% used this month`}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{remainingLabel}</p>
              <p className="text-xs text-slate-500 dark:text-gray-400">remaining</p>
            </div>
          </div>

          {!myCreditIsUnlimited && (
            <>
              <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2 overflow-hidden">
                <div
                  className={`h-2 rounded-full transition-all duration-700 ${barColor}`}
                  style={{ width: `${Math.max(pct, 1)}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-slate-500 dark:text-gray-400">
                <span>{usedLabel} used</span>
                <span>{creditsLabel} total</span>
              </div>
            </>
          )}

          {pct >= 80 && !myCreditIsUnlimited && (
            <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-lg p-3">
              <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-none mt-0.5" />
              <p className="text-sm text-amber-900 dark:text-amber-200">
                You've used {pct.toFixed(1)}% of your monthly credits.
                {pct >= 95
                  ? ' Searches are blocked until the 1st of next month.'
                  : ' You have limited credits remaining.'}
              </p>
            </div>
          )}
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-4">
          <StatCard icon={Search} label="Searches This Month" value={(mySearchCount ?? monthlySearches).toLocaleString()} />
          <StatCard icon={Database} label="API Calls Used" value={(myApiCallsUsed ?? 0).toLocaleString()} />
          <StatCard icon={Activity} label="Credits Used" value={usedLabel} />
          <StatCard icon={TrendingUp} label="City Searches Left" value={String(citySearchesLeft)} />
        </div>

        {/* Credit Info */}
        <div className="bg-white dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 space-y-3">
          <h2 className="font-semibold text-slate-900 dark:text-white">How Credits Work</h2>
          <div className="space-y-2 text-sm text-slate-600 dark:text-gray-400">
            <div className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-700">
              <span>City search (full city)</span>
              <span className="font-medium text-slate-900 dark:text-white">320 credits</span>
            </div>
            <div className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-700">
              <span>Neighbourhood search</span>
              <span className="font-medium text-slate-900 dark:text-white">240 credits</span>
            </div>
            <div className="flex justify-between py-2">
              <span>Specific area search</span>
              <span className="font-medium text-slate-900 dark:text-white">up to 90 credits</span>
            </div>
          </div>
          <p className="text-xs text-slate-400 dark:text-gray-500">
            Credits reset to {(CREDIT_CONFIG.DEFAULT_USER_CREDITS).toLocaleString()} on the 1st of every month.
            Cached results use 0 credits.
          </p>
        </div>

      </div>
    </div>
  );
};

const StatCard = ({ icon: Icon, label, value }) => (
  <div className="bg-white dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
    <Icon className="w-4 h-4 text-indigo-500 mb-2" />
    <p className="text-xl font-bold text-slate-900 dark:text-white">{value}</p>
    <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">{label}</p>
  </div>
);

export default PlatformUsagePage;
