import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, orderBy, limit, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown, DollarSign, Users, AlertCircle, Award, Activity, Calendar } from 'lucide-react';

/**
 * CreditAnalytics Component
 * Provides comprehensive credit usage analytics and monitoring with real-time updates
 * Features: Cost trends, user rankings, alerts, credit distribution
 */
const CreditAnalytics = () => {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalCost: 0,
    avgCostPerUser: 0,
    topSpenders: [],
    monthlyTrend: 0
  });
  const [costData, setCostData] = useState([]);
  const [topUsers, setTopUsers] = useState([]);
  const [creditDistribution, setCreditDistribution] = useState([]);
  const [alerts, setAlerts] = useState([]);

  useEffect(() => {
    // Set up real-time listener for user credits
    const unsubscribe = onSnapshot(collection(db, 'userCredits'), async () => {
      await fetchAnalytics();
    });
    
    fetchAnalytics();
    
    return () => unsubscribe();
  }, []);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      
      // Fetch user credits data
      const creditsSnapshot = await getDocs(collection(db, 'userCredits'));
      const creditsData = [];
      let totalCost = 0;
      
      creditsSnapshot.forEach(doc => {
        const data = doc.data();
        const cost = (data.creditsUsed || 0) * 0.002; // Example: $0.002 per credit
        totalCost += cost;
        creditsData.push({
          id: doc.id,
          ...data,
          cost
        });
      });

      // Fetch user profiles for names
      const usersSnapshot = await getDocs(collection(db, 'users'));
      const usersMap = {};
      usersSnapshot.forEach(doc => {
        const data = doc.data();
        usersMap[doc.id] = {
          email: data.email,
          name: data.displayName || data.email?.split('@')[0]
        };
      });

      // Calculate top users by credit usage
      const sortedUsers = creditsData
        .map(credit => ({
          ...credit,
          ...usersMap[credit.id]
        }))
        .sort((a, b) => (b.creditsUsed || 0) - (a.creditsUsed || 0))
        .slice(0, 10);

      setTopUsers(sortedUsers);

      // Generate cost trend data (last 6 months)
      const monthlyData = generateMonthlyData(creditsData);
      setCostData(monthlyData);

      // Calculate credit distribution
      const distribution = calculateDistribution(creditsData);
      setCreditDistribution(distribution);

      // Generate alerts
      const generatedAlerts = generateAlerts(creditsData, usersMap);
      setAlerts(generatedAlerts);

      // Calculate stats
      const avgCost = creditsData.length > 0 ? totalCost / creditsData.length : 0;
      const monthlyTrend = calculateMonthlyTrend(monthlyData);

      setStats({
        totalCost,
        avgCostPerUser: avgCost,
        topSpenders: sortedUsers.slice(0, 3),
        monthlyTrend
      });

      setLoading(false);
    } catch (error) {
      console.error('Error fetching analytics:', error);
      setLoading(false);
    }
  };

  const generateMonthlyData = (creditsData) => {
    const months = ['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const data = months.map((month, index) => ({
      month,
      cost: Math.random() * 500 + 200, // Mock data - replace with real data
      users: Math.floor(Math.random() * 50) + 20,
      searches: Math.floor(Math.random() * 500) + 200
    }));
    return data;
  };

  const calculateDistribution = (creditsData) => {
    const ranges = [
      { name: '0-100', min: 0, max: 100, value: 0, color: '#10b981' },
      { name: '101-500', min: 101, max: 500, value: 0, color: '#3b82f6' },
      { name: '501-1000', min: 501, max: 1000, value: 0, color: '#f59e0b' },
      { name: '1000+', min: 1001, max: Infinity, value: 0, color: '#ef4444' }
    ];

    creditsData.forEach(credit => {
      const used = credit.creditsUsed || 0;
      const range = ranges.find(r => used >= r.min && used <= r.max);
      if (range) range.value++;
    });

    return ranges.filter(r => r.value > 0);
  };

  const calculateMonthlyTrend = (monthlyData) => {
    if (monthlyData.length < 2) return 0;
    const lastMonth = monthlyData[monthlyData.length - 1].cost;
    const prevMonth = monthlyData[monthlyData.length - 2].cost;
    return ((lastMonth - prevMonth) / prevMonth * 100).toFixed(1);
  };

  const generateAlerts = (creditsData, usersMap) => {
    const alerts = [];
    
    // High usage alerts (>80% of limit)
    creditsData.forEach(credit => {
      if (credit.creditLimit && credit.creditsUsed) {
        const percentage = (credit.creditsUsed / credit.creditLimit) * 100;
        if (percentage > 80 && percentage < 100) {
          alerts.push({
            type: 'warning',
            user: usersMap[credit.id]?.name || credit.id,
            message: `User approaching credit limit (${percentage.toFixed(0)}%)`,
            timestamp: new Date()
          });
        } else if (percentage >= 100) {
          alerts.push({
            type: 'critical',
            user: usersMap[credit.id]?.name || credit.id,
            message: 'User exceeded credit limit',
            timestamp: new Date()
          });
        }
      }
    });

    // Sort by severity and limit to 5
    return alerts
      .sort((a, b) => {
        if (a.type === 'critical' && b.type !== 'critical') return -1;
        if (a.type !== 'critical' && b.type === 'critical') return 1;
        return 0;
      })
      .slice(0, 5);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Credit Analytics</h1>
          <p className="text-slate-400 mt-1">Monitor credit usage and costs across all users</p>
        </div>
        <button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-2">
          <Calendar className="w-4 h-4" />
          Export Report
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-400 text-sm">Total Cost</p>
              <p className="text-2xl font-bold text-white mt-1">${stats.totalCost.toFixed(2)}</p>
              <div className="flex items-center gap-1 mt-2">
                {stats.monthlyTrend > 0 ? (
                  <TrendingUp className="w-4 h-4 text-red-400" />
                ) : (
                  <TrendingDown className="w-4 h-4 text-green-400" />
                )}
                <span className={`text-sm ${stats.monthlyTrend > 0 ? 'text-red-400' : 'text-green-400'}`}>
                  {Math.abs(stats.monthlyTrend)}% from last month
                </span>
              </div>
            </div>
            <div className="p-3 bg-blue-500/10 rounded-lg">
              <DollarSign className="w-6 h-6 text-blue-400" />
            </div>
          </div>
        </div>

        <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-400 text-sm">Avg Cost/User</p>
              <p className="text-2xl font-bold text-white mt-1">${stats.avgCostPerUser.toFixed(2)}</p>
              <p className="text-sm text-slate-400 mt-2">Per user average</p>
            </div>
            <div className="p-3 bg-purple-500/10 rounded-lg">
              <Users className="w-6 h-6 text-purple-400" />
            </div>
          </div>
        </div>

        <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-400 text-sm">Active Alerts</p>
              <p className="text-2xl font-bold text-white mt-1">{alerts.length}</p>
              <p className="text-sm text-red-400 mt-2">
                {alerts.filter(a => a.type === 'critical').length} critical
              </p>
            </div>
            <div className="p-3 bg-red-500/10 rounded-lg">
              <AlertCircle className="w-6 h-6 text-red-400" />
            </div>
          </div>
        </div>

        <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-400 text-sm">Top Spender</p>
              <p className="text-lg font-bold text-white mt-1 truncate">
                {stats.topSpenders[0]?.name || 'N/A'}
              </p>
              <p className="text-sm text-slate-400 mt-2">
                {stats.topSpenders[0]?.creditsUsed || 0} credits used
              </p>
            </div>
            <div className="p-3 bg-yellow-500/10 rounded-lg">
              <Award className="w-6 h-6 text-yellow-400" />
            </div>
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Cost Trends */}
        <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Activity className="w-5 h-5 text-blue-400" />
            Cost Trends (Last 6 Months)
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={costData}>
              <defs>
                <linearGradient id="colorCost" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="month" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" />
              <Tooltip 
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                labelStyle={{ color: '#e2e8f0' }}
              />
              <Area 
                type="monotone" 
                dataKey="cost" 
                stroke="#3b82f6" 
                fill="url(#colorCost)" 
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Credit Distribution */}
        <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Credit Distribution by Range</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={creditDistribution}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, value }) => `${name}: ${value}`}
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
              >
                {creditDistribution.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip 
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top Users and Alerts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Users by Credit Usage */}
        <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Award className="w-5 h-5 text-yellow-400" />
            Top 10 Users by Credit Usage
          </h3>
          <div className="space-y-3">
            {topUsers.map((user, index) => (
              <div key={user.id} className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg hover:bg-slate-900/70 transition-colors">
                <div className="flex items-center gap-3">
                  <div className={`
                    w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold
                    ${index === 0 ? 'bg-yellow-500/20 text-yellow-400' : 
                      index === 1 ? 'bg-slate-500/20 text-slate-400' :
                      index === 2 ? 'bg-orange-500/20 text-orange-400' :
                      'bg-slate-700/50 text-slate-400'}
                  `}>
                    {index + 1}
                  </div>
                  <div>
                    <p className="text-white font-medium">{user.name}</p>
                    <p className="text-slate-400 text-sm">{user.email}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-white font-semibold">{user.creditsUsed || 0}</p>
                  <p className="text-slate-400 text-sm">${(user.cost || 0).toFixed(2)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Alerts */}
        <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-400" />
            Credit Alerts
          </h3>
          <div className="space-y-3">
            {alerts.length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                <AlertCircle className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No active alerts</p>
              </div>
            ) : (
              alerts.map((alert, index) => (
                <div 
                  key={index}
                  className={`
                    p-4 rounded-lg border
                    ${alert.type === 'critical' 
                      ? 'bg-red-500/10 border-red-500/30' 
                      : 'bg-yellow-500/10 border-yellow-500/30'}
                  `}
                >
                  <div className="flex items-start gap-3">
                    <AlertCircle className={`
                      w-5 h-5 mt-0.5 flex-shrink-0
                      ${alert.type === 'critical' ? 'text-red-400' : 'text-yellow-400'}
                    `} />
                    <div className="flex-1">
                      <p className="text-white font-medium">{alert.user}</p>
                      <p className="text-slate-300 text-sm mt-1">{alert.message}</p>
                      <p className="text-slate-500 text-xs mt-2">
                        {alert.timestamp.toLocaleTimeString()}
                      </p>
                    </div>
                    <button className="px-3 py-1 text-xs bg-slate-700 hover:bg-slate-600 text-white rounded transition-colors">
                      View
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreditAnalytics;
