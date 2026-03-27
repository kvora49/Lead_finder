// Platform Usage Page — dedicated page for API credit tracking
import { useAuth }   from '../contexts/AuthContext';
import { useCredit } from '../contexts/CreditContext';
import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { createCreditRequest } from '../services/analyticsService';
import { triggerSystemEmail } from '../services/notificationService';
import CreditRequestModal from '../components/CreditRequestModal';
import { toast } from 'sonner';
import { Database, Zap, Search, ShieldCheck, Activity, TrendingUp, Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react';

const RequestStatusBadge = ({ status }) => {
  const configs = {
    pending: { icon: Clock, bg: 'bg-blue-100', text: 'text-blue-700', label: 'Pending Review' },
    approved: { icon: CheckCircle, bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Approved' },
    rejected: { icon: XCircle, bg: 'bg-red-100', text: 'text-red-700', label: 'Rejected' },
  };

  const config = configs[status] || configs.pending;
  const Icon = config.icon;

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${config.bg} ${config.text}`}>
      <Icon className="w-3.5 h-3.5" />
      {config.label}
    </span>
  );
};

const PlatformUsagePage = () => {
  const { userProfile, currentUser } = useAuth();
  const {
    myMonthlyUsdUsed,
    myMonthlyLimitUsd,
    myCreditRemainingUsd,
    myCreditPctUsed,
    myCreditIsUnlimited,
    myCallsUsed,
  } = useCredit();

  const [creditRequests, setCreditRequests] = useState([]);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [monthlySearches, setMonthlySearches] = useState(0);
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);
  const [alertThresholdPct, setAlertThresholdPct] = useState(80);
  const [alertsEnabled, setAlertsEnabled] = useState(true);

  useEffect(() => {
    if (!currentUser?.uid) return;

    const q = query(
      collection(db, 'credit_requests'),
      where('userId', '==', currentUser.uid)
    );

    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
        createdAt: d.data().createdAt?.toDate?.() || new Date(),
        approvedAt: d.data().approvedAt?.toDate?.(),
        rejectedAt: d.data().rejectedAt?.toDate?.(),
      }));
      setCreditRequests(data.sort((a, b) => b.createdAt - a.createdAt));
      setLoadingRequests(false);
    });

    return () => unsub();
  }, [currentUser?.uid]);

  useEffect(() => {
    if (!currentUser?.uid) {
      setMonthlySearches(0);
      return;
    }

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const q = query(
      collection(db, 'searchLogs'),
      where('userId', '==', currentUser.uid),
      where('timestamp', '>=', monthStart)
    );

    const unsub = onSnapshot(q, (snap) => {
      setMonthlySearches(snap.size);
    });

    return () => unsub();
  }, [currentUser?.uid]);

  useEffect(() => {
    let cancelled = false;

    const loadAlertSettings = async () => {
      try {
        const snap = await getDoc(doc(db, 'systemConfig', 'globalSettings'));
        if (!snap.exists() || cancelled) return;

        const data = snap.data() || {};
        const parsedThreshold = Number.parseInt(data.creditAlertThreshold, 10);

        setAlertThresholdPct(Number.isFinite(parsedThreshold) ? Math.min(Math.max(parsedThreshold, 1), 100) : 80);
        setAlertsEnabled((data.emailNotificationsEnabled ?? true) && (data.sendCreditAlerts ?? true));
      } catch {
        if (!cancelled) {
          setAlertThresholdPct(80);
          setAlertsEnabled(true);
        }
      }
    };

    loadAlertSettings();
    return () => {
      cancelled = true;
    };
  }, [currentUser?.uid]);

  const pct     = myCreditIsUnlimited ? 0 : (myCreditPctUsed ?? 0);
  const REQUEST_CTA_THRESHOLD = 80;
  const requestEligible = !myCreditIsUnlimited && pct >= REQUEST_CTA_THRESHOLD;
  const hasPendingRequest = creditRequests.some((req) => req.status === 'pending');
  const suggestedRequestAmount = Math.max(25, Math.ceil((myMonthlyLimitUsd * 0.4) / 5) * 5);
  const barColor = pct >= 97 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-emerald-500';
  const budgetLabel = myCreditIsUnlimited ? 'Unlimited' : `$${(myMonthlyLimitUsd ?? 0).toFixed(2)}`;
  const remainingLabel = myCreditIsUnlimited
    ? 'Unlimited'
    : `$${(myCreditRemainingUsd ?? 0).toFixed(2)}`;

  useEffect(() => {
    if (!currentUser?.uid || !currentUser?.email) return;
    if (myCreditIsUnlimited || !alertsEnabled) return;
    if (pct < alertThresholdPct) return;

    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const dedupeKey = `credit-alert-email:${currentUser.uid}:${monthKey}`;
    if (window.localStorage.getItem(dedupeKey) === 'sent') return;

    triggerSystemEmail('credit_alert', {
      userEmail: currentUser.email,
      usagePct: pct,
      remainingUsd: Number((myCreditRemainingUsd ?? 0).toFixed(2)),
      requestedAmountUsd: 0,
      reason: `Usage crossed configured threshold (${alertThresholdPct}%)`,
    }).then((result) => {
      if (result?.ok) {
        window.localStorage.setItem(dedupeKey, 'sent');
      }
    });
  }, [
    currentUser?.uid,
    currentUser?.email,
    pct,
    myCreditIsUnlimited,
    alertsEnabled,
    alertThresholdPct,
    myCreditRemainingUsd,
  ]);

  const stats = [
    {
      icon:  <Zap className="w-5 h-5 text-indigo-400" />,
      label: 'Monthly allocation',
      value: budgetLabel,
      color: 'text-indigo-700',
      bg:    'bg-indigo-50 border-indigo-100',
    },
    {
      icon:  <Database className="w-5 h-5 text-emerald-400" />,
      label: 'Remaining this month',
      value: remainingLabel,
      color: !myCreditIsUnlimited && (myCreditRemainingUsd ?? 0) < 5 ? 'text-amber-600' : 'text-emerald-700',
      bg:    !myCreditIsUnlimited && (myCreditRemainingUsd ?? 0) < 5 ? 'bg-amber-50 border-amber-100' : 'bg-emerald-50 border-emerald-100',
    },
    {
      icon:  <Search className="w-5 h-5 text-violet-400" />,
      label: 'My searches (this month)',
      value: (monthlySearches ?? 0).toLocaleString(),
      color: 'text-violet-700',
      bg:    'bg-violet-50 border-violet-100',
    },
    {
      icon:  <Database className="w-5 h-5 text-cyan-400" />,
      label: 'My API calls used',
      value: (myCallsUsed ?? 0).toLocaleString(),
      color: 'text-cyan-700',
      bg:    'bg-cyan-50 border-cyan-100',
    },
    {
      icon:  <ShieldCheck className="w-5 h-5 text-slate-400" />,
      label: 'Account role',
      value: userProfile?.role ?? 'user',
      color: 'text-slate-700',
      bg:    'bg-slate-50 border-slate-100',
    },
  ];

  const handleSubmitCreditRequest = async ({ requestedAmountUsd, reason }) => {
    if (!currentUser?.uid || !currentUser?.email) {
      toast.error('You must be logged in to submit a request.');
      return;
    }

    if (hasPendingRequest) {
      toast.info('You already have a pending request. Please wait for admin review.');
      return;
    }

    setIsSubmittingRequest(true);
    try {
      const res = await createCreditRequest({
        userId: currentUser.uid,
        userEmail: currentUser.email,
        keyword: 'Monthly budget top-up',
        location: 'Platform Usage',
        scope: 'monthly_budget',
        estimatedCostUsd: Number((myMonthlyLimitUsd * 0.4).toFixed(2)),
        remainingUsd: Number((myCreditRemainingUsd ?? 0).toFixed(2)),
        requestedAmountUsd: Number(requestedAmountUsd || suggestedRequestAmount),
        reason: reason || `Automatic request from My Usage at ${pct.toFixed(1)}% monthly usage`,
      });

      if (!res?.ok) throw new Error(res?.error || 'Failed to submit request');

      toast.success('Credit request submitted successfully. Admin will review it shortly.');
      setIsRequestModalOpen(false);
    } catch (err) {
      toast.error(err.message || 'Could not submit credit request. Please try again.');
    } finally {
      setIsSubmittingRequest(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

      {/* ── Page header ── */}
      <div className="mb-8 flex items-center gap-3">
        <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600
          flex items-center justify-center shadow-md flex-none">
          <Activity className="w-5 h-5 text-white" />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-slate-800 leading-tight">My Usage</h1>
          <p className="text-sm text-slate-500 mt-0.5">My monthly allocation and API usage</p>
        </div>
      </div>

      {/* ── Monthly budget card ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-4 h-4 text-slate-400" />
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            My Monthly Credit Usage
          </span>
        </div>

        <div className="flex justify-between items-end mb-3">
          <div>
            <p className="text-3xl font-bold text-slate-800">
              ${(myMonthlyUsdUsed ?? 0).toFixed(2)}
            </p>
            <p className="text-sm text-slate-500 mt-0.5">
              spent of {myCreditIsUnlimited ? 'unlimited allocation' : `${budgetLabel} allocated`}
            </p>
          </div>
          {!myCreditIsUnlimited && (
            <span className={`text-2xl font-bold ${
              pct >= 80 ? 'text-amber-600' : 'text-emerald-600'
            }`}>
              {pct.toFixed(1)}%
            </span>
          )}
        </div>

        {!myCreditIsUnlimited && (
          <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
            <div
              className={`h-3 rounded-full transition-all duration-500 ${barColor}`}
              style={{ width: `${Math.max(pct, 1)}%` }}
            />
          </div>
        )}

        {!myCreditIsUnlimited && pct >= 97 && (
          <p className="mt-2 text-sm text-red-600 font-medium">
            Credit allocation almost exhausted. Request additional credits below.
          </p>
        )}
        {!myCreditIsUnlimited && pct >= 80 && pct < 97 && (
          <p className="mt-2 text-sm text-amber-600 font-medium">
            You are close to your monthly limit. Plan searches carefully.
          </p>
        )}
      </div>

      {/* ── Stats grid ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
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

      {!myCreditIsUnlimited && (myCreditRemainingUsd ?? 0) < 5 && (
        <div className="mb-6 rounded-xl bg-amber-50 border border-amber-200 p-4 flex items-start gap-3">
          <Zap className="w-5 h-5 text-amber-500 flex-none mt-0.5" />
          <p className="text-sm text-amber-700 flex-1">
            <strong>Low remaining credits.</strong> Searches may be blocked when your allocation is exhausted.
            Use the request button below to ask for more monthly budget.
          </p>
        </div>
      )}

      {!myCreditIsUnlimited && (
        <div className="mb-6 rounded-2xl bg-white border border-slate-200 shadow-sm p-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-800">Need more credits?</p>
              <p className="text-xs text-slate-500 mt-1">Current usage: {pct.toFixed(1)}%</p>
              {hasPendingRequest && (
                <p className="text-xs text-blue-600 mt-1.5 font-medium">
                  You already have a pending credit request.
                </p>
              )}
            </div>
            <button
              onClick={() => setIsRequestModalOpen(true)}
              disabled={!requestEligible || hasPendingRequest}
              className="px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
              title={!requestEligible ? 'This option becomes available after higher usage.' : undefined}
            >
              Request More Credits
            </button>
          </div>
        </div>
      )}

      {/* Credit Requests Section */}
      {!loadingRequests && creditRequests.length > 0 && (
        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-6">
          <div className="mb-6 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-indigo-600" />
            <h2 className="text-xl font-bold text-slate-900">Your Credit Requests</h2>
          </div>

          <div className="space-y-3">
            {creditRequests.map((req) => (
              <div key={req.id} className="border border-slate-200 rounded-lg p-4 hover:bg-slate-50 transition-colors">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-semibold text-slate-900">
                      ${req.requestedAmountUsd?.toFixed(2) || '0.00'} requested
                    </p>
                    <p className="text-sm text-slate-600 mt-1">
                      {req.keyword} • {req.location} • {req.scope} search
                    </p>
                  </div>
                  <RequestStatusBadge status={req.status} />
                </div>

                {req.reason && (
                  <p className="text-sm text-slate-600 italic mb-2">"{req.reason}"</p>
                )}

                <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-xs text-slate-500">
                  <span>{req.createdAt?.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                  {req.status === 'approved' && req.approvedAmountUsd && (
                    <span className="text-emerald-600 font-medium">
                      Approved: ${req.approvedAmountUsd.toFixed(2)}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <CreditRequestModal
        isOpen={isRequestModalOpen}
        onClose={() => setIsRequestModalOpen(false)}
        userEmail={currentUser?.email || ''}
        estimatedCostUsd={Math.max(25, myMonthlyLimitUsd * 0.4)}
        remainingUsd={myCreditRemainingUsd ?? 0}
        currentLimitUsd={myMonthlyLimitUsd ?? 0}
        onSubmit={handleSubmitCreditRequest}
        isLoading={isSubmittingRequest}
      />
    </div>
  );
};

export default PlatformUsagePage;
