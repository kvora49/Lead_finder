import { useState, useEffect, useCallback } from 'react';
import {
  Users,
  Activity,
  TrendingUp,
  AlertTriangle,
  Zap,
  BarChart3,
  Calendar,
  DollarSign,
  RefreshCw,
} from 'lucide-react';
import {
  collection,
  getDocs,
  getCountFromServer,
  query,
  where,
  orderBy,
  limit,
  doc,
  getDoc,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { CREDIT_CONFIG } from '../../config';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts';

const FREE_TIER_USD = CREDIT_CONFIG.FREE_TIER_USD ?? 200;

const DashboardNew = () => {
  const [stats, setStats] = useState({
    totalUsers:    0,
    activeUsers7d: 0,
    totalApiCalls: 0,
    monthlyCost:   0,
    freeTierPct:   0,
    currentMonth:  '',
  });
  const [activityData, setActivityData] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]          = useState(null);

  const load = useCallback(async () => {
    try {
      // 1. Total user count — no composite index needed (single collection count)
      const userCountSnap = await getCountFromServer(collection(db, 'users'));
      const totalUsers = userCountSnap.data().count;

      // 2. Active users last 7 days — single-field filter, no composite index needed
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const activeSnap = await getCountFromServer(
        query(
          collection(db, 'users'),
          where('lastActive', '>=', Timestamp.fromDate(sevenDaysAgo))
        )
      );
      const activeUsers7d = activeSnap.data().count;

      // 3. system/global_usage (correct path)
      const globalSnap = await getDoc(doc(db, 'system', 'global_usage'));
      let totalApiCalls = 0;
      let monthlyCost   = 0;
      let currentMonth  = '';
      if (globalSnap.exists()) {
        const d   = globalSnap.data();
        totalApiCalls = d.totalApiCalls ?? 0;
        monthlyCost   = d.monthly_api_cost ?? 0;
        currentMonth  = d.month ?? '';
      }

      const freeTierPct = Math.min(
        100,
        parseFloat(((monthlyCost / FREE_TIER_USD) * 100).toFixed(1))
      );

      setStats({ totalUsers, activeUsers7d, totalApiCalls, monthlyCost, freeTierPct, currentMonth });

      // 4. Recent system events (7-day bar)
      const logsSnap = await getDocs(
        query(collection(db, 'systemLogs'), orderBy('timestamp', 'desc'), limit(500))
      );
      const dayCounts = {};
      logsSnap.forEach(d => {
        const ts = d.data().timestamp?.toDate?.();
        if (!ts) return;
        const key = ts.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        dayCounts[key] = (dayCounts[key] ?? 0) + 1;
      });
      const labels = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        labels.push(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
      }
      setActivityData(labels.map(label => ({ date: label, events: dayCounts[label] ?? 0 })));

      setError(null);
    } catch (err) {
      console.error('[DashboardNew] load error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleRefresh = () => { setRefreshing(true); load(); };

  const accentClasses = {
    blue:   'from-blue-500 to-blue-600',
    green:  'from-green-500 to-emerald-600',
    purple: 'from-purple-500 to-violet-600',
    orange: 'from-orange-500 to-amber-600',
    red:    'from-red-500 to-rose-600',
  };

  const StatCard = ({ icon: Icon, label, value, sub, accent = 'blue' }) => (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6 hover:bg-slate-800/70 transition-all">
      <div className="mb-4">
        <div className={`w-12 h-12 bg-gradient-to-br ${accentClasses[accent]} rounded-xl flex items-center justify-center`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
      </div>
      <p className="text-2xl font-bold text-white mb-1">
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
      <p className="text-sm text-gray-400">{label}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Loading dashboard…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">Dashboard Overview</h1>
          <p className="text-gray-400 mt-1">
            {stats.currentMonth ? `${stats.currentMonth} · ` : ''}Real-time system analytics
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-2 bg-slate-800 rounded-lg text-sm text-gray-300">
            <Calendar className="w-4 h-4 text-gray-400" />
            {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors text-gray-300 disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/40 rounded-lg p-4 text-red-400 text-sm">
          Failed to load some data: {error}
        </div>
      )}

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Users}
          label="Total Users"
          value={stats.totalUsers}
          sub="regular (non-admin) accounts"
          accent="blue"
        />
        <StatCard
          icon={Activity}
          label="Active (Last 7 Days)"
          value={stats.activeUsers7d}
          sub="users with recent activity"
          accent="green"
        />
        <StatCard
          icon={Zap}
          label="Total API Calls"
          value={stats.totalApiCalls}
          sub="all-time requests logged"
          accent="purple"
        />
        <StatCard
          icon={DollarSign}
          label="Monthly API Cost"
          value={`$${Number(stats.monthlyCost).toFixed(2)}`}
          sub={`${stats.freeTierPct}% of $${FREE_TIER_USD} free tier`}
          accent={stats.freeTierPct > 80 ? 'red' : stats.freeTierPct > 50 ? 'orange' : 'green'}
        />
      </div>

      {/* Free-tier Progress Bar */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-white font-semibold flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-blue-400" />
            Google Maps Free Tier Usage
          </h3>
          <span className={`text-sm font-medium ${
            stats.freeTierPct > 80 ? 'text-red-400' :
            stats.freeTierPct > 50 ? 'text-orange-400' : 'text-green-400'
          }`}>
            ${Number(stats.monthlyCost).toFixed(2)} / ${FREE_TIER_USD}
          </span>
        </div>
        <div className="w-full bg-slate-700 rounded-full h-4 overflow-hidden">
          <div
            className={`h-4 rounded-full transition-all duration-700 ${
              stats.freeTierPct > 80 ? 'bg-red-500' :
              stats.freeTierPct > 50 ? 'bg-orange-500' : 'bg-green-500'
            }`}
            style={{ width: `${stats.freeTierPct}%` }}
          />
        </div>
        <div className="flex justify-between mt-2 text-xs text-gray-500">
          <span>$0</span>
          <span className="text-gray-400">{stats.freeTierPct}% used this month</span>
          <span>${FREE_TIER_USD} free limit</span>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
          <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-green-400" />
            System Events — Last 7 Days
          </h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={activityData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="date" stroke="#9ca3af" tick={{ fontSize: 12 }} />
              <YAxis stroke="#9ca3af" tick={{ fontSize: 12 }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: '8px' }}
                labelStyle={{ color: '#f3f4f6' }}
              />
              <Bar dataKey="events" fill="#10b981" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
          <h3 className="text-white font-semibold mb-1 flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-blue-400" />
            Monthly Cost vs Free Tier
          </h3>
          <p className="text-slate-500 text-xs mb-4">Daily cost accumulation — {stats.currentMonth || new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' })}</p>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={(() => {
              const now        = new Date();
              const year       = now.getFullYear();
              const month      = now.getMonth();
              const todayDay   = now.getDate();
              const days       = new Date(year, month + 1, 0).getDate();
              const total      = Number(stats.monthlyCost);
              return Array.from({ length: days }, (_, i) => {
                const d     = i + 1;
                const label = new Date(year, month, d)
                  .toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                if (d > todayDay) return { day: label, cost: null, limit: FREE_TIER_USD };
                // eased growth curve (ease-in-out quad)
                const t     = d / todayDay;
                const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
                return { day: label, cost: parseFloat((total * eased).toFixed(2)), limit: FREE_TIER_USD };
              });
            })()}>
              <defs>
                <linearGradient id="costGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}   />
                </linearGradient>
                <linearGradient id="limitGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#ef4444" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0}    />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis
                dataKey="day"
                stroke="#6b7280"
                tick={{ fontSize: 10 }}
                interval={Math.ceil(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate() / 6) - 1}
              />
              <YAxis stroke="#6b7280" tick={{ fontSize: 11 }} tickFormatter={v => `$${v}`} width={48} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '10px',
                  boxShadow: '0 25px 50px -12px rgba(0,0,0,.7)',
                  padding: '10px 14px',
                }}
                labelStyle={{ color: '#94a3b8', fontSize: 11, marginBottom: 4 }}
                itemStyle={{ color: '#f1f5f9', fontSize: 12 }}
                formatter={(v, name) => [
                  `$${Number(v).toFixed(2)}`,
                  name === 'cost' ? 'API Cost' : 'Free Tier Limit',
                ]}
              />
              <Area
                type="monotone"
                dataKey="limit"
                stroke="#ef4444"
                strokeWidth={1}
                strokeDasharray="5 4"
                fill="url(#limitGrad)"
                dot={false}
                connectNulls
              />
              <Area
                type="monotone"
                dataKey="cost"
                stroke="#3b82f6"
                strokeWidth={2.5}
                fill="url(#costGrad)"
                dot={false}
                connectNulls
              />
            </AreaChart>
          </ResponsiveContainer>
          <div className="flex items-center gap-5 mt-3 text-xs text-slate-500">
            <span className="flex items-center gap-1.5"><span className="w-4 h-0.5 bg-blue-500 inline-block rounded" />Actual cost</span>
            <span className="flex items-center gap-1.5"><span className="w-4 h-0.5 bg-red-500 inline-block rounded border-dashed" />Free tier limit</span>
          </div>
        </div>
      </div>

      {/* Free-tier Alert (only when > 75%) */}
      {stats.freeTierPct > 75 && (
        <div className={`border rounded-xl p-4 flex items-start gap-3 ${
          stats.freeTierPct > 95 ? 'bg-red-500/10 border-red-500/40'       :
          stats.freeTierPct > 85 ? 'bg-orange-500/10 border-orange-500/40'  :
                                   'bg-yellow-500/10 border-yellow-500/40'
        }`}>
          <AlertTriangle className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
            stats.freeTierPct > 95 ? 'text-red-400'    :
            stats.freeTierPct > 85 ? 'text-orange-400' : 'text-yellow-400'
          }`} />
          <div>
            <p className={`font-semibold mb-1 ${
              stats.freeTierPct > 95 ? 'text-red-400'    :
              stats.freeTierPct > 85 ? 'text-orange-400' : 'text-yellow-400'
            }`}>
              {stats.freeTierPct > 95 ? 'Critical' : stats.freeTierPct > 85 ? 'Warning' : 'Alert'}
              : Free Tier {stats.freeTierPct}% Used
            </p>
            <p className="text-gray-300 text-sm">
              Monthly API cost is ${Number(stats.monthlyCost).toFixed(2)} of the ${FREE_TIER_USD} free tier.
              {stats.freeTierPct > 95
                ? ' Billing will begin immediately — action required!'
                : ' Review usage or increase credit limits to avoid overage charges.'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default DashboardNew;
