import { useState, useEffect } from 'react';
import { 
  Users, 
  Activity, 
  DollarSign, 
  TrendingUp,
  TrendingDown,
  ArrowUp,
  ArrowDown
} from 'lucide-react';
import { collection, getDocs, query, where, Timestamp, onSnapshot, orderBy, limit, doc } from 'firebase/firestore';
import { db } from '../../firebase';
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
  PieChart,
  Pie,
  Cell
} from 'recharts';

const AdminDashboard = () => {
  const [stats, setStats] = useState({
    totalUsers: 0,
    activeUsers: 0,
    totalApiCalls: 0,
    currentCost: 0,
    userGrowth: 0
  });
  const [loading, setLoading] = useState(true);
  const [costTrendData, setCostTrendData] = useState([]);
  const [creditUsagePercent, setCreditUsagePercent] = useState(0);
  const [recentActivity, setRecentActivity] = useState([]);
  const [previousMonthApiCalls, setPreviousMonthApiCalls] = useState(0);

  useEffect(() => {
    // Set up real-time listeners
    const unsubscribers = [];

    // Real-time user count listener (exclude admins)
    const usersUnsubscribe = onSnapshot(collection(db, 'users'), (snapshot) => {
      // Filter out admin and super_admin users
      let totalUsers = 0;
      snapshot.forEach(doc => {
        const data = doc.data();
        const role = data.role || 'user';
        // Only count regular users, not admins/super_admins
        if (role === 'user') {
          totalUsers++;
        }
      });
      setStats(prev => ({ ...prev, totalUsers }));
    });
    unsubscribers.push(usersUnsubscribe);

    // Real-time global credits listener (matches Credit Tracker)
    const globalCreditsRef = doc(db, 'globalCredits', 'shared');
    const creditsUnsubscribe = onSnapshot(globalCreditsRef, (docSnapshot) => {
      if (docSnapshot.exists()) {
        const data = docSnapshot.data();
        const totalApiCalls = data.totalApiCalls || 0;
        
        // Calculate current cost ($32 per 1000 requests, same as Credit Tracker)
        const costPerRequest = 32; // $32 per 1000 requests
        const currentCost = parseFloat(((totalApiCalls * costPerRequest) / 1000).toFixed(2));
        
        // Calculate credit usage percentage
        const creditLimit = 200000; // 200k free tier limit
        const usagePercent = Math.min(100, parseFloat(((totalApiCalls / creditLimit) * 100).toFixed(1)));
        
        setStats(prev => ({ 
          ...prev, 
          totalApiCalls,
          currentCost
        }));
        setCreditUsagePercent(usagePercent);
      }
    });
    unsubscribers.push(creditsUnsubscribe);

    // Real-time active users listener (last 30 days, exclude admins)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const activeUsersUnsubscribe = onSnapshot(
      query(
        collection(db, 'users'),
        where('lastActive', '>=', Timestamp.fromDate(thirtyDaysAgo))
      ),
      (snapshot) => {
        // Filter out admin and super_admin users
        let activeUsers = 0;
        snapshot.forEach(doc => {
          const data = doc.data();
          const role = data.role || 'user';
          // Only count regular users, not admins/super_admins
          if (role === 'user') {
            activeUsers++;
          }
        });
        setStats(prev => ({ ...prev, activeUsers }));
      }
    );
    unsubscribers.push(activeUsersUnsubscribe);

    // Real-time activity feed listener
    const activityUnsubscribe = onSnapshot(
      query(
        collection(db, 'systemLogs'),
        orderBy('timestamp', 'desc'),
        limit(10)
      ),
      (snapshot) => {
        const activities = snapshot.docs.map(doc => {
          const data = doc.data();
          return {
            user: data.userEmail || data.user || 'system',
            action: data.action || data.details || 'Activity',
            time: formatTimeAgo(data.timestamp?.toDate() || new Date())
          };
        });
        setRecentActivity(activities.slice(0, 4));
      }
    );
    unsubscribers.push(activityUnsubscribe);

    // Fetch monthly trend data and growth calculation
    fetchMonthlyTrends();

    setLoading(false);

    // Cleanup listeners on unmount
    return () => {
      unsubscribers.forEach(unsubscribe => unsubscribe());
    };
  }, []);

  const fetchMonthlyTrends = async () => {
    try {
      // Fetch monthly analytics if available
      const analyticsSnapshot = await getDocs(
        query(
          collection(db, 'monthlyAnalytics'),
          orderBy('month', 'desc'),
          limit(6)
        )
      );

      if (!analyticsSnapshot.empty) {
        const monthlyData = analyticsSnapshot.docs
          .map(doc => {
            const data = doc.data();
            return {
              month: data.monthLabel || data.month,
              cost: data.totalCost || 0,
              apiCalls: data.totalApiCalls || 0
            };
          })
          .reverse();

        setCostTrendData(monthlyData);

        // Calculate growth from last month
        if (monthlyData.length >= 2) {
          const currentMonth = monthlyData[monthlyData.length - 1].apiCalls;
          const lastMonth = monthlyData[monthlyData.length - 2].apiCalls;
          const growth = lastMonth > 0 
            ? (((currentMonth - lastMonth) / lastMonth) * 100).toFixed(1)
            : 0;
          setStats(prev => ({ ...prev, userGrowth: parseFloat(growth) }));
        }
      } else {
        // Generate default trend from current data
        generateDefaultTrend();
      }
    } catch (error) {
      console.error('Error fetching monthly trends:', error);
      generateDefaultTrend();
    }
  };

  const generateDefaultTrend = () => {
    // Generate last 6 months data based on current stats
    const months = ['Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan'];
    const currentDate = new Date();
    const data = months.map((month, index) => ({
      month,
      cost: parseFloat((stats.currentCost * (0.5 + index * 0.1)).toFixed(2))
    }));
    setCostTrendData(data);
  };

  const formatTimeAgo = (date) => {
    const seconds = Math.floor((new Date() - date) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const StatCard = ({ title, value, change, icon: Icon, trend, color }) => (
    <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6 hover:border-slate-600 transition-all">
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="text-gray-400 text-sm font-medium">{title}</p>
          <h3 className="text-3xl font-bold text-white mt-2">{value}</h3>
        </div>
        <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
          color === 'green' ? 'bg-green-500/20' :
          color === 'blue' ? 'bg-blue-500/20' :
          color === 'purple' ? 'bg-purple-500/20' :
          'bg-orange-500/20'
        }`}>
          <Icon className={`w-6 h-6 ${
            color === 'green' ? 'text-green-400' :
            color === 'blue' ? 'text-blue-400' :
            color === 'purple' ? 'text-purple-400' :
            'text-orange-400'
          }`} />
        </div>
      </div>
      {change && (
        <div className="flex items-center gap-2">
          {trend === 'up' ? (
            <div className="flex items-center text-green-400 text-sm">
              <ArrowUp className="w-4 h-4" />
              <span className="font-medium">{change}%</span>
            </div>
          ) : (
            <div className="flex items-center text-red-400 text-sm">
              <ArrowDown className="w-4 h-4" />
              <span className="font-medium">{change}%</span>
            </div>
          )}
          <span className="text-gray-500 text-sm">vs last month</span>
        </div>
      )}
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-400">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Dashboard Overview</h1>
        <p className="text-gray-400">Monitor system performance and user activity</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        <StatCard
          title="Total Registered Users"
          value={stats.totalUsers.toLocaleString()}
          change={stats.userGrowth}
          trend="up"
          icon={Users}
          color="green"
        />
        <StatCard
          title="Active Users (30 Days)"
          value={stats.activeUsers.toLocaleString()}
          icon={Activity}
          color="blue"
        />
        <StatCard
          title="Global API Calls"
          value={`${(stats.totalApiCalls / 1000000).toFixed(1)}M`}
          icon={TrendingUp}
          color="purple"
        />
        <StatCard
          title="Current Month Cost"
          value={`$${stats.currentCost}`}
          icon={DollarSign}
          color="orange"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Cost Trend Graph */}
        <div className="lg:col-span-2 bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6">
          <h3 className="text-xl font-semibold text-white mb-6">Cost Trend Graph (Last 6 Months)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={costTrendData}>
              <defs>
                <linearGradient id="costGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="#3B82F6" stopOpacity={0.1}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis 
                dataKey="month" 
                stroke="#94A3B8"
                style={{ fontSize: '12px' }}
              />
              <YAxis 
                stroke="#94A3B8"
                style={{ fontSize: '12px' }}
                tickFormatter={(value) => `$${value}`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1E293B',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                  color: '#fff'
                }}
                formatter={(value) => [`$${value}`, 'Cost']}
              />
              <Area
                type="monotone"
                dataKey="cost"
                stroke="#3B82F6"
                strokeWidth={2}
                fill="url(#costGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Real-Time Global Credit Usage */}
        <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6">
          <h3 className="text-xl font-semibold text-white mb-6">Real-Time Global Credit Usage</h3>
          <div className="flex items-center justify-center h-64">
            <div className="relative">
              {/* Circular Progress */}
              <svg className="w-48 h-48 transform -rotate-90">
                <circle
                  cx="96"
                  cy="96"
                  r="80"
                  stroke="#334155"
                  strokeWidth="16"
                  fill="none"
                />
                <circle
                  cx="96"
                  cy="96"
                  r="80"
                  stroke="#F59E0B"
                  strokeWidth="16"
                  fill="none"
                  strokeDasharray={`${2 * Math.PI * 80}`}
                  strokeDashoffset={`${2 * Math.PI * 80 * (1 - creditUsagePercent / 100)}`}
                  strokeLinecap="round"
                  className="transition-all duration-1000"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <p className="text-5xl font-bold text-white">{creditUsagePercent}%</p>
                  <p className="text-gray-400 text-sm mt-2">Credits Used</p>
                </div>
              </div>
            </div>
          </div>
          <div className="text-center mt-4">
            <p className="text-gray-300 text-sm">
              {stats.totalApiCalls.toLocaleString()} / 200,000
            </p>
            <p className="text-gray-500 text-xs mt-1">Credits Used</p>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6">
        <h3 className="text-xl font-semibold text-white mb-4">Recent Activity</h3>
        <div className="space-y-3">
          {recentActivity.length > 0 ? (
            recentActivity.map((activity, index) => (
              <div key={index} className="flex items-center justify-between py-3 border-b border-slate-700/50 last:border-0">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-blue-500/20 rounded-full flex items-center justify-center">
                    <span className="text-blue-400 text-sm font-semibold">
                      {activity.user[0]?.toUpperCase() || 'S'}
                    </span>
                  </div>
                  <div>
                    <p className="text-gray-300 text-sm">{activity.action}</p>
                    <p className="text-gray-500 text-xs">{activity.user}</p>
                  </div>
                </div>
                <span className="text-gray-500 text-xs">{activity.time}</span>
              </div>
            ))
          ) : (
            <div className="text-center text-gray-500 py-8">
              <Activity className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>No recent activity</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
