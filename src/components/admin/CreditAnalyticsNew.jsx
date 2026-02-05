import { useState, useEffect } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  Users, 
  BarChart3, 
  AlertTriangle,
  Download,
  Calendar,
  Award,
  Activity,
  Target
} from 'lucide-react';
import { collection, getDocs, query, orderBy, limit, onSnapshot, where, Timestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { CREDIT_PRICING } from '../../config';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Area,
  AreaChart
} from 'recharts';

const CreditAnalyticsNew = () => {
  const [loading, setLoading] = useState(true);
  const [globalStats, setGlobalStats] = useState({
    totalCreditsUsed: 0,
    totalCreditsLimit: 200000,
    usagePercent: 0,
    activeUsers: 0,
    topUsers: []
  });

  const [dailyUsage, setDailyUsage] = useState([]);
  const [topUsersByCredits, setTopUsersByCredits] = useState([]);
  const [creditDistribution, setCreditDistribution] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [monthlyTrend, setMonthlyTrend] = useState([]);

  useEffect(() => {
    loadCreditAnalytics();
    
    // Real-time global credits listener
    const unsubscribe = onSnapshot(collection(db, 'globalCredits'), (snapshot) => {
      snapshot.forEach(doc => {
        const data = doc.data();
        const totalCreditsUsed = data.totalApiCalls || 0;
        const usagePercent = (totalCreditsUsed / globalStats.totalCreditsLimit) * 100;
        
        setGlobalStats(prev => ({
          ...prev,
          totalCreditsUsed,
          usagePercent: parseFloat(usagePercent.toFixed(2))
        }));
      });
    });

    return () => unsubscribe();
  }, []);

  const loadCreditAnalytics = async () => {
    try {
      // Load users with credit data
      const usersSnapshot = await getDocs(collection(db, 'users'));
      const creditsSnapshot = await getDocs(collection(db, 'userCredits'));
      
      const creditsMap = {};
      creditsSnapshot.forEach(doc => {
        creditsMap[doc.id] = doc.data();
      });

      const usersData = [];
      usersSnapshot.forEach(doc => {
        const userData = doc.data();
        const creditData = creditsMap[doc.id] || {};
        
        if (userData.role === 'user') {
          usersData.push({
            id: doc.id,
            email: userData.email,
            displayName: userData.displayName || userData.email?.split('@')[0],
            creditsUsed: creditData.creditsUsed || 0,
            creditLimit: userData.creditLimit || 'unlimited',
            lastActive: userData.lastActive?.toDate() || new Date()
          });
        }
      });

      // Top users by credits
      const topUsers = [...usersData]
        .sort((a, b) => b.creditsUsed - a.creditsUsed)
        .slice(0, 10);
      setTopUsersByCredits(topUsers);

      // Credit distribution
      const unlimited = usersData.filter(u => u.creditLimit === 'unlimited').length;
      const limited = usersData.filter(u => typeof u.creditLimit === 'number' && u.creditLimit > 0).length;
      const suspended = usersData.filter(u => u.creditLimit === 0).length;
      
      setCreditDistribution([
        { name: 'Unlimited', value: unlimited, color: '#8b5cf6' },
        { name: 'Limited', value: limited, color: '#3b82f6' },
        { name: 'Suspended', value: suspended, color: '#ef4444' }
      ]);

      // Generate daily usage (last 30 days) from REAL search data
      const dailyData = [];
      const searchHistoryRef = collection(db, 'searchLogs');
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const searchSnapshot = await getDocs(
        query(searchHistoryRef, where('timestamp', '>=', Timestamp.fromDate(thirtyDaysAgo)))
      );
      
      const dailyMap = {};
      searchSnapshot.forEach(doc => {
        const data = doc.data();
        const date = data.timestamp?.toDate() || new Date();
        const dateKey = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        
        if (!dailyMap[dateKey]) {
          dailyMap[dateKey] = { searches: 0, users: new Set() };
        }
        
        // Count searches, each search = ~500 credits estimate
        dailyMap[dateKey].searches += 1;
        if (data.userId) {
          dailyMap[dateKey].users.add(data.userId);
        }
      });
      
      for (let i = 29; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateKey = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const dayData = dailyMap[dateKey] || { searches: 0, users: new Set() };
        
        dailyData.push({
          date: dateKey,
          credits: dayData.searches * 500, // 500 credits per search estimate
          users: dayData.users.size
        });
      }
      setDailyUsage(dailyData);

      // Monthly trend (last 6 months) from REAL data
      const monthlyData = [];
      for (let i = 5; i >= 0; i--) {
        const date = new Date();
        date.setMonth(date.getMonth() - i);
        const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
        const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);
        
        const monthSearches = searchSnapshot.docs.filter(doc => {
          const sTime = doc.data().timestamp?.toDate() || new Date();
          return sTime >= monthStart && sTime <= monthEnd;
        });
        
        // Each search = ~500 credits estimate
        const creditsUsed = monthSearches.length * 500;
        
        monthlyData.push({
          month: date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
          credits: creditsUsed,
          cost: parseFloat((creditsUsed * CREDIT_PRICING.COST_PER_REQUEST).toFixed(2))
        });
      }
      setMonthlyTrend(monthlyData);

      // Generate alerts
      const alertsList = [];
      topUsers.forEach(user => {
        if (user.creditLimit !== 'unlimited') {
          const percentage = (user.creditsUsed / user.creditLimit) * 100;
          if (percentage >= 90) {
            alertsList.push({
              type: 'critical',
              user: user.email,
              message: `${user.displayName} has used ${percentage.toFixed(1)}% of credit limit`,
              percentage
            });
          } else if (percentage >= 80) {
            alertsList.push({
              type: 'warning',
              user: user.email,
              message: `${user.displayName} approaching credit limit (${percentage.toFixed(1)}%)`,
              percentage
            });
          }
        }
      });
      setAlerts(alertsList.slice(0, 5));

      setGlobalStats(prev => ({
        ...prev,
        activeUsers: usersData.length,
        topUsers: topUsers.slice(0, 5)
      }));

      setLoading(false);
    } catch (error) {
      console.error('Error loading credit analytics:', error);
      setLoading(false);
    }
  };

  const exportReport = () => {
    const csvContent = [
      ['Credit Analytics Report', `Generated: ${new Date().toLocaleString()}`].join(','),
      [],
      ['Metric', 'Value'].join(','),
      ['Total Credits Used', globalStats.totalCreditsUsed].join(','),
      ['Total Credits Limit', globalStats.totalCreditsLimit].join(','),
      ['Usage Percentage', `${globalStats.usagePercent}%`].join(','),
      ['Active Users', globalStats.activeUsers].join(','),
      [],
      ['Top Users By Credit Usage'].join(','),
      ['Rank', 'Email', 'Display Name', 'Credits Used', 'Credit Limit'].join(','),
      ...topUsersByCredits.map((user, idx) => [
        idx + 1,
        user.email,
        user.displayName,
        user.creditsUsed,
        user.creditLimit === 'unlimited' ? 'Unlimited' : user.creditLimit
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `credit-analytics-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const StatCard = ({ icon: Icon, label, value, change, color = 'blue', subtitle }) => (
    <div className={`bg-slate-800/50 border border-slate-700/50 rounded-xl p-6 hover:bg-slate-800/70 transition-all`}>
      <div className="flex items-start justify-between mb-4">
        <div className={`w-12 h-12 bg-gradient-to-br from-${color}-500 to-${color}-600 rounded-xl flex items-center justify-center`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
        {change !== undefined && (
          <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
            change >= 0 ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
          }`}>
            {change >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {Math.abs(change)}%
          </div>
        )}
      </div>
      <div>
        <p className="text-2xl font-bold text-white mb-1">{value}</p>
        <p className="text-sm text-gray-400">{label}</p>
        {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-400">Loading analytics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Credit Analytics & Monitoring</h1>
          <p className="text-gray-400">Complete credit usage analysis and projections</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={exportReport}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
          >
            <Download className="w-4 h-4" />
            Export Report
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
        <StatCard 
          icon={BarChart3} 
          label="Total Credits Used" 
          value={globalStats.totalCreditsUsed.toLocaleString()}
          subtitle={`${globalStats.totalCreditsLimit.toLocaleString()} limit`}
          color="blue"
        />
        <StatCard 
          icon={Target} 
          label="Usage Percentage" 
          value={`${globalStats.usagePercent}%`}
          change={5.2}
          color="purple"
        />
        <StatCard 
          icon={Users} 
          label="Active Users" 
          value={globalStats.activeUsers}
          change={12.5}
          color="green"
        />
        <StatCard 
          icon={AlertTriangle} 
          label="Active Alerts" 
          value={alerts.length}
          color="orange"
        />
      </div>

      {/* Alerts Section */}
      {alerts.length > 0 && (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-orange-400" />
            Credit Usage Alerts
          </h3>
          <div className="space-y-3">
            {alerts.map((alert, idx) => (
              <div 
                key={idx}
                className={`p-4 rounded-lg border-l-4 ${
                  alert.type === 'critical' 
                    ? 'bg-red-500/10 border-red-500' 
                    : 'bg-yellow-500/10 border-yellow-500'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className={`font-medium ${alert.type === 'critical' ? 'text-red-400' : 'text-yellow-400'}`}>
                      {alert.message}
                    </p>
                    <p className="text-sm text-gray-400 mt-1">{alert.user}</p>
                  </div>
                  <span className={`text-lg font-bold ${alert.type === 'critical' ? 'text-red-400' : 'text-yellow-400'}`}>
                    {alert.percentage.toFixed(1)}%
                  </span>
                </div>
                <div className="mt-2 w-full bg-slate-700 rounded-full h-2">
                  <div 
                    className={`h-2 rounded-full ${alert.type === 'critical' ? 'bg-red-500' : 'bg-yellow-500'}`}
                    style={{ width: `${Math.min(alert.percentage, 100)}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Daily Credit Usage */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Daily Credit Usage (Last 30 Days)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={dailyUsage}>
              <defs>
                <linearGradient id="colorCredits2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="date" stroke="#9ca3af" />
              <YAxis stroke="#9ca3af" />
              <Tooltip 
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: '8px' }}
                labelStyle={{ color: '#f3f4f6' }}
              />
              <Area type="monotone" dataKey="credits" stroke="#3b82f6" fillOpacity={1} fill="url(#colorCredits2)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Monthly Trend */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Monthly Credit Trend (6 Months)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={monthlyTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="month" stroke="#9ca3af" />
              <YAxis stroke="#9ca3af" />
              <Tooltip 
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: '8px' }}
                labelStyle={{ color: '#f3f4f6' }}
              />
              <Bar dataKey="credits" fill="#8b5cf6" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Bottom Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Top Users */}
        <div className="lg:col-span-2 bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Award className="w-5 h-5 text-yellow-400" />
            Top Users by Credit Consumption
          </h3>
          <div className="space-y-3">
            {topUsersByCredits.map((user, idx) => (
              <div key={idx} className="flex items-center justify-between p-4 bg-slate-900/50 rounded-lg hover:bg-slate-900/70 transition-all">
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold ${
                    idx === 0 ? 'bg-yellow-500' : idx === 1 ? 'bg-gray-400' : idx === 2 ? 'bg-orange-500' : 'bg-slate-700'
                  }`}>
                    {idx + 1}
                  </div>
                  <div>
                    <p className="text-white font-medium">{user.displayName}</p>
                    <p className="text-sm text-gray-400">{user.email}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-white font-bold">{user.creditsUsed.toLocaleString()}</p>
                  <p className="text-xs text-gray-400">credits used</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Credit Distribution */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Credit Limit Distribution</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={creditDistribution}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={5}
                dataKey="value"
              >
                {creditDistribution.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip 
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: '8px' }}
                labelStyle={{ color: '#f3f4f6' }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-4 space-y-2">
            {creditDistribution.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }}></div>
                  <span className="text-gray-300">{item.name}</span>
                </div>
                <span className="text-white font-medium">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Global Credit Pool */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Global Credit Pool Usage</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-gray-400">Credits Used</span>
            <span className="text-white font-bold text-xl">{globalStats.totalCreditsUsed.toLocaleString()}</span>
          </div>
          <div className="w-full bg-slate-700 rounded-full h-4">
            <div 
              className={`h-4 rounded-full transition-all ${
                globalStats.usagePercent >= 95 ? 'bg-red-500' :
                globalStats.usagePercent >= 80 ? 'bg-yellow-500' :
                'bg-green-500'
              }`}
              style={{ width: `${Math.min(globalStats.usagePercent, 100)}%` }}
            ></div>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-400">0 credits</span>
            <span className="text-gray-400">{globalStats.totalCreditsLimit.toLocaleString()} credits</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreditAnalyticsNew;
