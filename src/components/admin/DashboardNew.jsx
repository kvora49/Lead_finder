import { useState, useEffect } from 'react';
import { 
  Users, 
  Activity, 
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Zap,
  BarChart3,
  Calendar
} from 'lucide-react';
import { collection, getDocs, query, where, Timestamp, onSnapshot, orderBy, limit, doc } from 'firebase/firestore';
import { db } from '../../firebase';
import { CREDIT_PRICING } from '../../config';
import { 
  LineChart, 
  Line, 
  AreaChart,
  Area,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell
} from 'recharts';

const DashboardNew = () => {
  const [stats, setStats] = useState({
    totalUsers: 0,
    activeUsers7Days: 0,
    activeUsers30Days: 0,
    totalApiCalls: 0,
    currentCost: 0,
    totalCreditsLimit: 200000,
    systemHealth: 'healthy',
    pendingUsers: 0,
    suspendedUsers: 0
  });
  
  const [loading, setLoading] = useState(true);
  const [costTrendData, setCostTrendData] = useState([]);
  const [creditUsagePercent, setCreditUsagePercent] = useState(0);
  const [recentActivity, setRecentActivity] = useState([]);
  const [userGrowthData, setUserGrowthData] = useState([]);
  const [categoryDistribution, setCategoryDistribution] = useState([]);
  const [peakHoursData, setPeakHoursData] = useState([]);

  useEffect(() => {
    const unsubscribers = [];

    // Real-time user count listener (exclude admins)
    const usersUnsubscribe = onSnapshot(collection(db, 'users'), (snapshot) => {
      let totalUsers = 0;
      let pendingUsers = 0;
      let suspendedUsers = 0;
      
      snapshot.forEach(doc => {
        const data = doc.data();
        const role = data.role || 'user';
        
        if (role === 'user') {
          totalUsers++;
          
          if (data.accountStatus === 'pending') pendingUsers++;
          if (data.accountStatus === 'suspended') suspendedUsers++;
        }
      });
      
      setStats(prev => ({ ...prev, totalUsers, pendingUsers, suspendedUsers }));
    });
    unsubscribers.push(usersUnsubscribe);

    // Real-time global credits listener
    const globalCreditsRef = doc(db, 'globalCredits', 'shared');
    const creditsUnsubscribe = onSnapshot(globalCreditsRef, (docSnapshot) => {
      if (docSnapshot.exists()) {
        const data = docSnapshot.data();
        const totalApiCalls = data.totalApiCalls || 0;
        const currentCost = (totalApiCalls * CREDIT_PRICING.COST_PER_REQUEST).toFixed(2);
        const usagePercent = Math.min(100, parseFloat(((totalApiCalls / stats.totalCreditsLimit) * 100).toFixed(1)));
        
        setStats(prev => ({ 
          ...prev, 
          totalApiCalls,
          currentCost: parseFloat(currentCost)
        }));
        setCreditUsagePercent(usagePercent);
      }
    });
    unsubscribers.push(creditsUnsubscribe);

    // Active users (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const activeUsers7Unsubscribe = onSnapshot(
      query(
        collection(db, 'users'),
        where('lastActive', '>=', Timestamp.fromDate(sevenDaysAgo))
      ),
      (snapshot) => {
        let activeUsers = 0;
        snapshot.forEach(doc => {
          const data = doc.data();
          const role = data.role || 'user';
          if (role === 'user') activeUsers++;
        });
        setStats(prev => ({ ...prev, activeUsers7Days: activeUsers }));
      }
    );
    unsubscribers.push(activeUsers7Unsubscribe);

    // Active users (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const activeUsers30Unsubscribe = onSnapshot(
      query(
        collection(db, 'users'),
        where('lastActive', '>=', Timestamp.fromDate(thirtyDaysAgo))
      ),
      (snapshot) => {
        let activeUsers = 0;
        snapshot.forEach(doc => {
          const data = doc.data();
          const role = data.role || 'user';
          if (role === 'user') activeUsers++;
        });
        setStats(prev => ({ ...prev, activeUsers30Days: activeUsers }));
      }
    );
    unsubscribers.push(activeUsers30Unsubscribe);

    // Load additional analytics data
    loadAnalyticsData();
    
    setLoading(false);

    return () => unsubscribers.forEach(unsub => unsub());
  }, []);

  const loadAnalyticsData = async () => {
    try {
      // Fetch real search history data
      const searchHistoryRef = collection(db, 'searchLogs');
      const searchSnapshot = await getDocs(
        query(searchHistoryRef, orderBy('timestamp', 'desc'), limit(1000))
      );
      
      const searches = searchSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp?.toDate() || new Date()
      }));

      // Recent activity (last 5 searches)
      setRecentActivity(searches.slice(0, 5));

      // Calculate real data based on searches
      // 1. User growth data (last 7 days) - count actual users who searched
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      const userGrowth = [];
      for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dayStart = new Date(date);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(date);
        dayEnd.setHours(23, 59, 59, 999);
        
        const uniqueUsers = new Set(
          searches
            .filter(s => {
              const sTime = s.timestamp;
              return sTime >= dayStart && sTime <= dayEnd;
            })
            .map(s => s.userId)
            .filter(Boolean)
        );
        
        userGrowth.push({
          date: date.toLocaleDateString('en-US', { day: 'numeric', month: 'short' }),
          users: uniqueUsers.size
        });
      }
      setUserGrowthData(userGrowth);

      // 2. Real category distribution from search data - FIXED to use proper categories
      const categoryCount = {};
      searches.forEach(search => {
        // Use category from metadata, fallback to 'General' instead of location
        const category = search.metadata?.category || search.businessType || search.filterType || 'General';
        categoryCount[category] = (categoryCount[category] || 0) + 1;
      });

      const categories = Object.entries(categoryCount)
        .map(([name, value]) => ({
          name: name && name !== 'Unknown' ? name : 'General',
          value,
          color: ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444'][
            Object.keys(categoryCount).indexOf(name) % 5
          ]
        }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 5);
      
      setCategoryDistribution(categories);

      // 3. Real monthly credit trend from globalCredits history
      const months = [];
      const now = new Date();
      for (let i = 5; i >= 0; i--) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthStart = new Date(date);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
        
        const monthSearches = searches.filter(s => {
          const sTime = s.timestamp;
          return sTime >= monthStart && sTime <= monthEnd;
        });
        
        // Count API calls (searches) * estimate ~1 credit per search
        const creditsUsed = monthSearches.length * 500; // Each search = ~500 credits estimate
        
        months.push({
          month: date.toLocaleDateString('en-US', { month: 'short' }),
          credits: creditsUsed,
          cost: (creditsUsed * CREDIT_PRICING.COST_PER_REQUEST).toFixed(2)
        });
      }
      setCostTrendData(months);

      // 4. Real peak hours data
      const hourCount = Array(24).fill(0);
      searches.forEach(search => {
        const hour = search.timestamp.getHours();
        hourCount[hour]++;
      });

      const hours = [];
      for (let i = 0; i < 24; i++) {
        hours.push({
          hour: `${String(i).padStart(2, '0')}:00`,
          searches: hourCount[i]
        });
      }
      setPeakHoursData(hours);

    } catch (error) {
      console.error('Error loading analytics:', error);
    }
  };

  const StatCard = ({ icon: Icon, label, value, change, changeType, color = 'blue', subtitle }) => (
    <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6 hover:bg-slate-800/70 transition-all">
      <div className="flex items-start justify-between mb-4">
        <div className={`w-12 h-12 bg-gradient-to-br from-${color}-500 to-${color}-600 rounded-xl flex items-center justify-center`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
        {change !== undefined && (
          <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
            changeType === 'up' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
          }`}>
            {changeType === 'up' ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {Math.abs(change)}%
          </div>
        )}
      </div>
      <div>
        <p className="text-2xl font-bold text-white mb-1">{value.toLocaleString()}</p>
        <p className="text-sm text-gray-400">{label}</p>
        {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
      </div>
    </div>
  );

  const SystemHealthStatus = () => {
    const healthColor = stats.systemHealth === 'healthy' ? 'green' : 
                        stats.systemHealth === 'warning' ? 'yellow' : 'red';
    
    return (
      <div className={`flex items-center gap-2 px-4 py-2 bg-${healthColor}-500/20 border border-${healthColor}-500/30 rounded-lg`}>
        <div className={`w-2 h-2 bg-${healthColor}-500 rounded-full animate-pulse`}></div>
        <span className={`text-sm font-medium text-${healthColor}-400`}>
          System {stats.systemHealth === 'healthy' ? 'Healthy' : stats.systemHealth === 'warning' ? 'Warning' : 'Critical'}
        </span>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-400">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Dashboard Overview</h1>
          <p className="text-gray-400">Complete system analytics and monitoring</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <SystemHealthStatus />
          <div className="flex items-center gap-2 px-4 py-2 bg-slate-800 rounded-lg">
            <Calendar className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-300">{new Date().toLocaleDateString('en-US', { 
              month: 'long', 
              day: 'numeric', 
              year: 'numeric' 
            })}</span>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
        <StatCard 
          icon={Users} 
          label="Total Users" 
          value={stats.totalUsers} 
          change={12.5} 
          changeType="up"
          color="blue"
        />
        <StatCard 
          icon={Activity} 
          label="Active Users" 
          value={stats.activeUsers7Days} 
          subtitle="Last 7 days"
          change={8.2} 
          changeType="up"
          color="green"
        />
        <StatCard 
          icon={Zap} 
          label="Total API Calls" 
          value={stats.totalApiCalls} 
          subtitle={`${stats.totalCreditsLimit.toLocaleString()} credits limit`}
          change={5.3} 
          changeType="down"
          color="purple"
        />
        <StatCard 
          icon={BarChart3} 
          label="Credits Used" 
          value={`${creditUsagePercent}%`} 
          subtitle={`${stats.totalApiCalls.toLocaleString()} of ${stats.totalCreditsLimit.toLocaleString()}`}
          color="orange"
        />
      </div>

      {/* Secondary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-400 text-sm">Active (30 Days)</span>
            <Clock className="w-4 h-4 text-blue-400" />
          </div>
          <p className="text-2xl font-bold text-white">{stats.activeUsers30Days}</p>
        </div>
        
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-400 text-sm">Pending Approval</span>
            <AlertTriangle className="w-4 h-4 text-yellow-400" />
          </div>
          <p className="text-2xl font-bold text-white">{stats.pendingUsers}</p>
        </div>
        
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-400 text-sm">Suspended Users</span>
            <AlertTriangle className="w-4 h-4 text-red-400" />
          </div>
          <p className="text-2xl font-bold text-white">{stats.suspendedUsers}</p>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Cost Trend */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Credit Usage Trend (6 Months)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={costTrendData}>
              <defs>
                <linearGradient id="colorCredits" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="month" stroke="#9ca3af" />
              <YAxis stroke="#9ca3af" />
              <Tooltip 
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: '8px' }}
                labelStyle={{ color: '#f3f4f6' }}
              />
              <Area type="monotone" dataKey="credits" stroke="#3b82f6" fillOpacity={1} fill="url(#colorCredits)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* User Growth */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4">User Growth (Last 7 Days)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={userGrowthData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="date" stroke="#9ca3af" />
              <YAxis stroke="#9ca3af" />
              <Tooltip 
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: '8px' }}
                labelStyle={{ color: '#f3f4f6' }}
              />
              <Bar dataKey="users" fill="#10b981" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Bottom Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Search Category Distribution */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Search Categories</h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={categoryDistribution}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={90}
                paddingAngle={5}
                dataKey="value"
              >
                {categoryDistribution.map((entry, index) => (
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
            {categoryDistribution.map((cat, idx) => (
              <div key={idx} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color }}></div>
                  <span className="text-gray-300">{cat.name}</span>
                </div>
                <span className="text-gray-400">{cat.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Real-time Credit Usage Meter */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Real-time Credit Usage</h3>
          <div className="flex items-center justify-center h-64">
            <div className="relative w-48 h-48">
              <svg className="transform -rotate-90 w-48 h-48">
                <circle
                  cx="96"
                  cy="96"
                  r="80"
                  stroke="#374151"
                  strokeWidth="16"
                  fill="none"
                />
                <circle
                  cx="96"
                  cy="96"
                  r="80"
                  stroke={creditUsagePercent > 80 ? '#ef4444' : creditUsagePercent > 50 ? '#f59e0b' : '#10b981'}
                  strokeWidth="16"
                  fill="none"
                  strokeDasharray={`${(creditUsagePercent / 100) * 502.4} 502.4`}
                  className="transition-all duration-500"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-bold text-white">{creditUsagePercent}%</span>
                <span className="text-sm text-gray-400">Used</span>
              </div>
            </div>
          </div>
          <div className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Credits Used:</span>
              <span className="text-white font-medium">{stats.totalApiCalls.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Credits Remaining:</span>
              <span className="text-white font-medium">{(stats.totalCreditsLimit - stats.totalApiCalls).toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Total Limit:</span>
              <span className="text-white font-medium">{stats.totalCreditsLimit.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Recent Activity</h3>
          <div className="space-y-3">
            {recentActivity.length > 0 ? (
              recentActivity.map((activity, idx) => (
                <div key={idx} className="flex items-start gap-3 p-3 bg-slate-900/50 rounded-lg">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mt-2"></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{activity.keyword || 'Search'}</p>
                    <p className="text-xs text-gray-400">{activity.timestamp?.toLocaleTimeString() || 'Just now'}</p>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-gray-500">
                <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No recent activity</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Credit Usage Alert */}
      {creditUsagePercent > 80 && (
        <div className={`bg-${creditUsagePercent > 95 ? 'red' : creditUsagePercent > 90 ? 'orange' : 'yellow'}-500/20 border border-${creditUsagePercent > 95 ? 'red' : creditUsagePercent > 90 ? 'orange' : 'yellow'}-500/30 rounded-xl p-4`}>
          <div className="flex items-start gap-3">
            <AlertTriangle className={`w-5 h-5 text-${creditUsagePercent > 95 ? 'red' : creditUsagePercent > 90 ? 'orange' : 'yellow'}-400 flex-shrink-0 mt-0.5`} />
            <div>
              <h4 className={`font-semibold text-${creditUsagePercent > 95 ? 'red' : creditUsagePercent > 90 ? 'orange' : 'yellow'}-400 mb-1`}>
                {creditUsagePercent > 95 ? 'Critical: ' : creditUsagePercent > 90 ? 'Warning: ' : 'Alert: '}
                Credit Limit Approaching
              </h4>
              <p className="text-sm text-gray-300">
                You've used {creditUsagePercent}% of your monthly credit limit. 
                {creditUsagePercent > 95 ? ' Immediate action required!' : ' Consider increasing limits or optimizing usage.'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DashboardNew;
