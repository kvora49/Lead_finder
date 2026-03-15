import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Download,
  DollarSign,
  Users,
  Activity,
  Target,
} from 'lucide-react';
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { CREDIT_PRICING } from '../../config';
import { getEffectiveUserMonthMetrics } from '../../services/creditService';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from 'recharts';

const currentMonthStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const formatUsd = (n) => `$${Number(n || 0).toFixed(2)}`;
const PLATFORM_CAP_USD = CREDIT_PRICING.PLATFORM_CAP_USD || 195;

const CreditAnalyticsNew = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [globalUsageUsd, setGlobalUsageUsd] = useState(0);
  const [globalApiCalls, setGlobalApiCalls] = useState(0);
  const [usersData, setUsersData] = useState([]);
  const [dailyUsage, setDailyUsage] = useState([]);
  const [monthlyTrend, setMonthlyTrend] = useState([]);

  useEffect(() => {
    const globalRef = doc(db, 'system', 'global_usage');
    const unsub = onSnapshot(globalRef, (snap) => {
      if (!snap.exists()) {
        setGlobalUsageUsd(0);
        setGlobalApiCalls(0);
        return;
      }
      const data = snap.data();
      if (data.month !== currentMonthStr()) {
        setGlobalUsageUsd(0);
        setGlobalApiCalls(0);
        return;
      }
      setGlobalUsageUsd(data.monthly_api_cost ?? 0);
      setGlobalApiCalls(data.totalApiCalls ?? 0);
    });

    return () => unsub();
  }, []);

  useEffect(() => {
    const loadAnalytics = async () => {
      try {
        const month = currentMonthStr();

        const usersSnapshot = await getDocs(collection(db, 'users'));
        const users = usersSnapshot.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((u) => (u.role || 'user') === 'user')
          .map((u) => {
            const effectiveMetrics = getEffectiveUserMonthMetrics(u, month);
            return {
              id: u.id,
              email: u.email || 'unknown',
              displayName: u.displayName || (u.email ? u.email.split('@')[0] : 'Unknown'),
              creditLimit: u.creditLimit ?? 50,
              monthlyUsedUsd: effectiveMetrics.monthlyApiCost,
              apiCallsUsed: effectiveMetrics.monthlyApiCalls,
            };
          });

        const topUsers = [...users]
          .sort((a, b) => b.monthlyUsedUsd - a.monthlyUsedUsd)
          .slice(0, 10);
        setUsersData(topUsers);

        const logsThirtyDaysAgo = new Date();
        logsThirtyDaysAgo.setDate(logsThirtyDaysAgo.getDate() - 30);

        const userLogSnapshots = await Promise.all(
          usersSnapshot.docs.map((userDoc) =>
            getDocs(collection(db, 'users', userDoc.id, 'credit_logs'))
          )
        );

        const allLogs = [];
        userLogSnapshots.forEach((snap) => {
          snap.forEach((d) => allLogs.push(d.data()));
        });

        const dayMap = new Map();
        allLogs.forEach((data) => {
          const date = data.createdAt?.toDate?.();
          if (!date || date < logsThirtyDaysAgo) return;
          const key = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          const prev = dayMap.get(key) || { usd: 0, calls: 0 };
          dayMap.set(key, {
            usd: +(prev.usd + (data.costUsd || 0)).toFixed(4),
            calls: prev.calls + (data.apiCalls || 0),
          });
        });

        const daily = [];
        for (let i = 29; i >= 0; i -= 1) {
          const dt = new Date();
          dt.setDate(dt.getDate() - i);
          const key = dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          const val = dayMap.get(key) || { usd: 0, calls: 0 };
          daily.push({ date: key, usd: +val.usd.toFixed(2), calls: val.calls });
        }
        setDailyUsage(daily);

        const monthly = [];
        for (let i = 5; i >= 0; i -= 1) {
          const dt = new Date();
          dt.setMonth(dt.getMonth() - i);
          const ym = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
          const usd = allLogs
            .filter((entry) => entry.month === ym)
            .reduce((sum, entry) => sum + (entry.costUsd || 0), 0);
          monthly.push({
            month: dt.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
            usd: +usd.toFixed(2),
          });
        }
        setMonthlyTrend(monthly);
      } catch (error) {
        console.error('Error loading credit analytics:', error);
      } finally {
        setLoading(false);
      }
    };

    loadAnalytics();
  }, []);

  const usagePercent = Math.min(+((globalUsageUsd / PLATFORM_CAP_USD) * 100).toFixed(1), 100);

  const alerts = useMemo(() => {
    return usersData
      .filter((u) => u.creditLimit !== 'unlimited' && Number(u.creditLimit || 0) > 0)
      .map((u) => {
        const pct = (u.monthlyUsedUsd / Number(u.creditLimit || 1)) * 100;
        return {
          ...u,
          pct,
          type: pct >= 90 ? 'critical' : pct >= 80 ? 'warning' : 'ok',
        };
      })
      .filter((u) => u.type !== 'ok')
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 5);
  }, [usersData]);

  const distribution = useMemo(() => {
    const unlimited = usersData.filter((u) => u.creditLimit === 'unlimited').length;
    const limited = usersData.filter((u) => typeof u.creditLimit === 'number' && u.creditLimit > 0).length;
    const suspended = usersData.filter((u) => u.creditLimit === 0).length;
    return [
      { name: 'Unlimited', value: unlimited, color: '#a78bfa' },
      { name: 'Limited', value: limited, color: '#60a5fa' },
      { name: 'Suspended', value: suspended, color: '#f87171' },
    ];
  }, [usersData]);

  const exportReport = () => {
    const csv = [
      ['Credit Analytics', `Generated: ${new Date().toLocaleString()}`].join(','),
      [],
      ['Global monthly usage (USD)', globalUsageUsd.toFixed(2)].join(','),
      ['Global monthly cap (USD)', PLATFORM_CAP_USD.toFixed(2)].join(','),
      ['Global usage percent', `${usagePercent}%`].join(','),
      ['Global API calls this month', globalApiCalls].join(','),
      [],
      ['Top users by monthly spend (USD)'].join(','),
      ['Rank', 'Email', 'Display Name', 'Monthly Spend USD', 'Monthly Limit USD', 'API Calls'].join(','),
      ...usersData.map((u, idx) => [
        idx + 1,
        u.email,
        u.displayName,
        Number(u.monthlyUsedUsd || 0).toFixed(2),
        u.creditLimit === 'unlimited' ? 'unlimited' : Number(u.creditLimit || 0).toFixed(2),
        u.apiCallsUsed || 0,
      ].join(',')),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
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
          <p className="text-gray-400">Global budget tracking and per-user allocation monitoring</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => navigate('/admin/users')}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors"
          >
            Allocate User Credits
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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
        <StatCard icon={DollarSign} label="Global Spend" value={formatUsd(globalUsageUsd)} subtitle={`Cap ${formatUsd(PLATFORM_CAP_USD)}`} />
        <StatCard icon={Target} label="Global Usage" value={`${usagePercent}%`} />
        <StatCard icon={Activity} label="Global API Calls" value={(globalApiCalls || 0).toLocaleString()} />
        <StatCard icon={Users} label="Tracked Users" value={usersData.length} />
      </div>

      {alerts.length > 0 && (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-orange-400" />
            User Allocation Alerts
          </h3>
          <div className="space-y-3">
            {alerts.map((a) => (
              <div key={a.id} className={`p-4 rounded-lg border-l-4 ${a.type === 'critical' ? 'bg-red-500/10 border-red-500' : 'bg-yellow-500/10 border-yellow-500'}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className={`font-medium ${a.type === 'critical' ? 'text-red-400' : 'text-yellow-400'}`}>
                      {a.displayName} is at {a.pct.toFixed(1)}% of allocation
                    </p>
                    <p className="text-sm text-gray-400 mt-1">{a.email}</p>
                  </div>
                  <span className={`text-lg font-bold ${a.type === 'critical' ? 'text-red-400' : 'text-yellow-400'}`}>
                    {a.pct.toFixed(1)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Daily Spend (Last 30 Days)</h3>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={dailyUsage}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="date" stroke="#9ca3af" />
              <YAxis stroke="#9ca3af" />
              <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: '8px' }} />
              <Area type="monotone" dataKey="usd" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Monthly Spend Trend (6 Months)</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={monthlyTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="month" stroke="#9ca3af" />
              <YAxis stroke="#9ca3af" />
              <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: '8px' }} />
              <Bar dataKey="usd" fill="#22c55e" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Top Users by Monthly Spend</h3>
          <div className="space-y-3">
            {usersData.map((u, idx) => (
              <div key={u.id} className="flex items-center justify-between p-4 bg-slate-900/50 rounded-lg">
                <div>
                  <p className="text-white font-medium">{idx + 1}. {u.displayName}</p>
                  <p className="text-sm text-gray-400">{u.email}</p>
                </div>
                <div className="text-right">
                  <p className="text-white font-bold">{formatUsd(u.monthlyUsedUsd)}</p>
                  <p className="text-xs text-gray-400">limit {u.creditLimit === 'unlimited' ? 'unlimited' : formatUsd(u.creditLimit)}</p>
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
                {distribution.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
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
