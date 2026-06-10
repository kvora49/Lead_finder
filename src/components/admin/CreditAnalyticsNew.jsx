import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Download, Zap, Users, Activity, Target } from 'lucide-react';
import { collection, doc, getDocs, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { CREDIT_CONFIG } from '../../config';
import { getEffectiveUserMonthMetrics } from '../../services/creditService';
import {
  ResponsiveContainer, AreaChart, Area, CartesianGrid,
  XAxis, YAxis, Tooltip, PieChart, Pie, Cell, BarChart, Bar,
} from 'recharts';

const currentMonthStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const ENTERPRISE_CAP   = CREDIT_CONFIG.SKU_FREE_CAPS.enterprise;      // 7,000
const ENTERPRISE_KILL  = CREDIT_CONFIG.SKU_KILL_SWITCH.enterprise;    // 6,650
const ENTERPRISE_ALERT = CREDIT_CONFIG.SKU_ADMIN_ALERT.enterprise;    // 5,600
const PLATFORM_POOL    = CREDIT_CONFIG.PLATFORM_CREDITS_POOL;         // 70,000

const getSkuStatus = (used, cap) => {
  const pct = (used / cap) * 100;
  if (pct >= 95) return { color: 'text-red-400',    bar: 'bg-red-500',    label: 'BLOCKED'  };
  if (pct >= 80) return { color: 'text-orange-400', bar: 'bg-orange-500', label: 'WARNING'  };
  if (pct >= 50) return { color: 'text-yellow-400', bar: 'bg-yellow-500', label: 'MODERATE' };
  return           { color: 'text-emerald-400', bar: 'bg-emerald-500', label: 'HEALTHY'  };
};

const CreditAnalyticsNew = () => {
  const navigate = useNavigate();
  const [loading,              setLoading]              = useState(true);
  const [enterpriseCalls,      setEnterpriseCalls]      = useState(0);
  const [totalApiCalls,        setTotalApiCalls]        = useState(0);
  const [totalCreditsUsed,     setTotalCreditsUsed]     = useState(0);
  const [usersData,            setUsersData]            = useState([]);
  const [dailyUsage,           setDailyUsage]           = useState([]);
  const [monthlyTrend,         setMonthlyTrend]         = useState([]);

  // Real-time global_usage listener
  useEffect(() => {
    const globalRef = doc(db, 'system', 'global_usage');
    const unsub = onSnapshot(globalRef, (snap) => {
      if (!snap.exists()) { setEnterpriseCalls(0); setTotalApiCalls(0); setTotalCreditsUsed(0); return; }
      const data = snap.data();
      if (data.month !== currentMonthStr()) { setEnterpriseCalls(0); setTotalApiCalls(0); setTotalCreditsUsed(0); return; }
      setEnterpriseCalls(data.sku_enterprise_calls ?? 0);
      setTotalApiCalls(data.totalApiCalls          ?? 0);
      setTotalCreditsUsed(data.totalCreditsUsed    ?? 0);
    });
    return () => unsub();
  }, []);

  // Load per-user and log analytics
  useEffect(() => {
    const load = async () => {
      try {
        const month         = currentMonthStr();
        const usersSnapshot = await getDocs(collection(db, 'users'));

        const users = usersSnapshot.docs.map((d) => {
          const u       = { id: d.id, ...d.data() };
          const metrics = getEffectiveUserMonthMetrics(u, month);
          const limit   = u.creditLimit === 'unlimited'
            ? 'unlimited'
            : (typeof u.creditLimit === 'number' ? u.creditLimit : CREDIT_CONFIG.DEFAULT_USER_CREDITS);
          const pctUsed = limit === 'unlimited'
            ? 0
            : Math.min((metrics.monthlyCreditsUsed / Math.max(limit, 1)) * 100, 100);
          return {
            id:           u.id,
            email:        u.email || 'unknown',
            displayName:  u.displayName || (u.email ? u.email.split('@')[0] : 'Unknown'),
            creditLimit:  limit,
            creditsUsed:  metrics.monthlyCreditsUsed,
            apiCallsUsed: metrics.monthlyApiCalls,
            pctUsed,
          };
        });

        setUsersData([...users].sort((a, b) => b.creditsUsed - a.creditsUsed).slice(0, 10));

        // Build daily chart from credit_logs
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const logSnaps = await Promise.all(
          usersSnapshot.docs.map((u) => getDocs(collection(db, 'users', u.id, 'credit_logs')))
        );
        const allLogs = [];
        logSnaps.forEach((s) => s.forEach((d) => allLogs.push(d.data())));

        const dayMap = new Map();
        allLogs.forEach((entry) => {
          const date = entry.createdAt?.toDate?.();
          if (!date || date < thirtyDaysAgo) return;
          const key  = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          const prev = dayMap.get(key) || { credits: 0, calls: 0 };
          dayMap.set(key, {
            credits: prev.credits + (entry.creditsDeducted || 0),
            calls:   prev.calls   + (entry.apiCalls        || 0),
          });
        });

        const daily = [];
        for (let i = 29; i >= 0; i--) {
          const dt  = new Date();
          dt.setDate(dt.getDate() - i);
          const key = dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          const val = dayMap.get(key) || { credits: 0, calls: 0 };
          daily.push({ date: key, credits: val.credits, calls: val.calls });
        }
        setDailyUsage(daily);

        const monthly = [];
        for (let i = 5; i >= 0; i--) {
          const dt = new Date();
          dt.setMonth(dt.getMonth() - i);
          const ym = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
          const credits = allLogs
            .filter((e) => e.month === ym)
            .reduce((sum, e) => sum + (e.creditsDeducted || 0), 0);
          monthly.push({
            month: dt.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
            credits,
          });
        }
        setMonthlyTrend(monthly);
      } catch (err) {
        console.error('Error loading credit analytics:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const enterprisePct   = Math.min(+((enterpriseCalls / ENTERPRISE_CAP) * 100).toFixed(1), 100);
  const creditPoolPct   = Math.min(+((totalCreditsUsed / PLATFORM_POOL) * 100).toFixed(1), 100);
  const enterpriseStatus = getSkuStatus(enterpriseCalls, ENTERPRISE_CAP);

  const alerts = useMemo(() =>
    usersData.filter((u) => u.creditLimit !== 'unlimited' && u.pctUsed >= 80)
      .sort((a, b) => b.pctUsed - a.pctUsed)
      .slice(0, 5),
    [usersData]
  );

  const distribution = useMemo(() => {
    const unlimited  = usersData.filter((u) => u.creditLimit === 'unlimited').length;
    const active     = usersData.filter((u) => typeof u.creditLimit === 'number' && u.creditLimit > 0).length;
    const suspended  = usersData.filter((u) => u.creditLimit === 0).length;
    return [
      { name: 'Unlimited', value: unlimited, color: '#a78bfa' },
      { name: 'Active',    value: active,    color: '#60a5fa' },
      { name: 'Suspended', value: suspended, color: '#f87171' },
    ];
  }, [usersData]);

  const exportReport = () => {
    const csv = [
      ['Credit Analytics (SKU)', `Generated: ${new Date().toLocaleString()}`].join(','),
      [],
      ['Enterprise API calls this month', enterpriseCalls].join(','),
      ['Enterprise free cap (India)',     ENTERPRISE_CAP].join(','),
      ['Enterprise usage %',              `${enterprisePct}%`].join(','),
      ['Enterprise kill switch at',       ENTERPRISE_KILL].join(','),
      ['Total credits used',              totalCreditsUsed].join(','),
      ['Total credits pool',              PLATFORM_POOL].join(','),
      [],
      ['Top users by credits used'].join(','),
      ['Rank','Email','Display Name','Credits Used','Credit Limit','API Calls','% Used'].join(','),
      ...usersData.map((u, idx) => [
        idx + 1, u.email, u.displayName,
        u.creditsUsed,
        u.creditLimit === 'unlimited' ? 'unlimited' : u.creditLimit,
        u.apiCallsUsed,
        `${u.pctUsed.toFixed(1)}%`,
      ].join(',')),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = window.URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `credit-analytics-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Loading analytics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Platform Usage</h1>
          <p className="text-gray-400">SKU credit tracking — Enterprise cap is the primary constraint</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => navigate('/admin/users')}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors"
          >
            Manage User Credits
          </button>
          <button
            onClick={exportReport}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
          >
            <Download className="w-4 h-4" />
            Export Report
          </button>
        </div>
      </div>

      {/* SKU Status Banner */}
      <div className={`rounded-xl border p-4 ${
        enterprisePct >= 95 ? 'bg-red-500/10 border-red-500/50'
        : enterprisePct >= 80 ? 'bg-orange-500/10 border-orange-500/50'
        : 'bg-slate-800/50 border-slate-700/50'
      }`}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-cyan-400" />
            <span className="font-semibold text-white">Enterprise SKU — Primary Bottleneck</span>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${enterpriseStatus.bar} text-white`}>
              {enterpriseStatus.label}
            </span>
          </div>
          <span className={`text-lg font-bold ${enterpriseStatus.color}`}>{enterprisePct}%</span>
        </div>
        <div className="w-full bg-slate-700 rounded-full h-2 mb-2">
          <div
            className={`h-2 rounded-full transition-all ${enterpriseStatus.bar}`}
            style={{ width: `${Math.max(enterprisePct, 1)}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-gray-400">
          <span>{enterpriseCalls.toLocaleString()} / {ENTERPRISE_CAP.toLocaleString()} calls</span>
          <span>Alert at {ENTERPRISE_ALERT.toLocaleString()} · Kill at {ENTERPRISE_KILL.toLocaleString()}</span>
        </div>
        <p className="text-xs text-gray-500 mt-1">
          Includes: phone numbers, websites, ratings, reviews (Contact + Atmosphere Data)
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
        <StatCard icon={Zap}      label="Enterprise Calls"   value={enterpriseCalls.toLocaleString()}   subtitle={`Cap ${ENTERPRISE_CAP.toLocaleString()}`} />
        <StatCard icon={Target}   label="Enterprise Usage"   value={`${enterprisePct}%`} />
        <StatCard icon={Activity} label="Total Credits Used" value={totalCreditsUsed.toLocaleString()}  subtitle={`Pool ${PLATFORM_POOL.toLocaleString()}`} />
        <StatCard icon={Users}    label="Tracked Users"      value={usersData.length} />
      </div>

      {/* User Alerts */}
      {alerts.length > 0 && (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-orange-400" />
            User Credit Alerts (≥ 80% used)
          </h3>
          <div className="space-y-3">
            {alerts.map((a) => (
              <div
                key={a.id}
                className={`p-4 rounded-lg border-l-4 ${
                  a.pctUsed >= 95 ? 'bg-red-500/10 border-red-500' : 'bg-yellow-500/10 border-yellow-500'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className={`font-medium ${a.pctUsed >= 95 ? 'text-red-400' : 'text-yellow-400'}`}>
                      {a.displayName} — {a.pctUsed.toFixed(1)}% of allocation used
                    </p>
                    <p className="text-sm text-gray-400 mt-0.5">
                      {a.creditsUsed.toLocaleString()} / {
                        a.creditLimit === 'unlimited' ? 'unlimited' : a.creditLimit.toLocaleString()
                      } credits · {a.email}
                    </p>
                  </div>
                  <span className={`text-lg font-bold ${a.pctUsed >= 95 ? 'text-red-400' : 'text-yellow-400'}`}>
                    {a.pctUsed.toFixed(1)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Daily Credits Used (Last 30 Days)</h3>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={dailyUsage}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="date" stroke="#9ca3af" />
              <YAxis stroke="#9ca3af" />
              <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: '8px' }} />
              <Area type="monotone" dataKey="credits" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.2} name="Credits" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Monthly Credits Trend (6 Months)</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={monthlyTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="month" stroke="#9ca3af" />
              <YAxis stroke="#9ca3af" />
              <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: '8px' }} />
              <Bar dataKey="credits" fill="#22c55e" radius={[8, 8, 0, 0]} name="Credits" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top Users + Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Top Users by Credits Used</h3>
          <div className="space-y-3">
            {usersData.map((u, idx) => (
              <div key={u.id} className="flex items-center justify-between p-4 bg-slate-900/50 rounded-lg">
                <div>
                  <p className="text-white font-medium">{idx + 1}. {u.displayName}</p>
                  <p className="text-sm text-gray-400">{u.email}</p>
                </div>
                <div className="text-right">
                  <p className="text-white font-bold">{u.creditsUsed.toLocaleString()} credits</p>
                  <p className="text-xs text-gray-400">
                    limit: {u.creditLimit === 'unlimited' ? 'unlimited' : u.creditLimit.toLocaleString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Allocation Types</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={distribution} cx="50%" cy="50%" innerRadius={45} outerRadius={75} dataKey="value">
                {distribution.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
              </Pie>
              <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: '8px' }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-2">
            {distribution.map((d) => (
              <div key={d.name} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: d.color }} />
                  <span className="text-gray-300">{d.name}</span>
                </div>
                <span className="text-white font-medium">{d.value}</span>
              </div>
            ))}
          </div>

          {/* SKU breakdown */}
          <div className="mt-4 pt-4 border-t border-slate-700 space-y-2 text-xs text-gray-400">
            <p className="font-semibold text-gray-300">SKU Caps (India, per key)</p>
            <div className="flex justify-between"><span>Enterprise</span><span className="text-white">7,000 / month</span></div>
            <div className="flex justify-between"><span>Pro</span><span className="text-white">35,000 / month</span></div>
            <div className="flex justify-between"><span>Essentials</span><span className="text-white">70,000 / month</span></div>
            <p className="text-gray-500 mt-1">Enterprise is always the bottleneck</p>
          </div>
        </div>
      </div>
    </div>
  );
};

const StatCard = ({ icon: Icon, label, value, subtitle }) => (
  <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
    <div className="flex items-center justify-between mb-3">
      <Icon className="w-5 h-5 text-cyan-400" />
    </div>
    <p className="text-2xl font-bold text-white mb-1">{value}</p>
    <p className="text-sm text-gray-400">{label}</p>
    {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
  </div>
);

export default CreditAnalyticsNew;
