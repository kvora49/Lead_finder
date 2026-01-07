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
import { collection, getDocs, query, where, Timestamp } from 'firebase/firestore';
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
  const [creditUsagePercent, setCreditUsagePercent] = useState(78);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      // Fetch total users
      const usersSnapshot = await getDocs(collection(db, 'users'));
      const totalUsers = usersSnapshot.size;

      // Fetch active users (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const activeUsersQuery = query(
        collection(db, 'userProfiles'),
        where('lastActive', '>=', Timestamp.fromDate(thirtyDaysAgo))
      );
      const activeUsersSnapshot = await getDocs(activeUsersQuery);
      const activeUsers = activeUsersSnapshot.size;

      // Fetch total API calls
      const creditsSnapshot = await getDocs(collection(db, 'userCredits'));
      let totalApiCalls = 0;
      creditsSnapshot.forEach(doc => {
        totalApiCalls += doc.data().totalApiCalls || 0;
      });

      // Calculate current cost
      const currentCost = (totalApiCalls * 0.032).toFixed(2);

      // Mock cost trend data (last 6 months)
      const mockCostTrend = [
        { month: 'Aug', cost: 85 },
        { month: 'Sep', cost: 92 },
        { month: 'Oct', cost: 110 },
        { month: 'Nov', cost: 135 },
        { month: 'Dec', cost: 165 },
        { month: 'Jan', cost: 180.50 }
      ];

      setStats({
        totalUsers,
        activeUsers,
        totalApiCalls,
        currentCost: parseFloat(currentCost),
        userGrowth: 12
      });
      setCostTrendData(mockCostTrend);
      
      // Calculate credit usage percentage
      const creditLimit = 200000; // 200k free tier limit
      const usagePercent = Math.min(100, ((totalApiCalls / creditLimit) * 100).toFixed(1));
      setCreditUsagePercent(usagePercent);

      setLoading(false);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      setLoading(false);
    }
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
          {[
            { user: 'john@example.com', action: 'Searched for "Kurti Wholesaler" in Mumbai', time: '2 mins ago' },
            { user: 'jane@example.com', action: 'Exported 45 leads', time: '15 mins ago' },
            { user: 'mike@example.com', action: 'Registered new account', time: '1 hour ago' },
            { user: 'sarah@example.com', action: 'Used 5 API credits', time: '2 hours ago' },
          ].map((activity, index) => (
            <div key={index} className="flex items-center justify-between py-3 border-b border-slate-700/50 last:border-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-blue-500/20 rounded-full flex items-center justify-center">
                  <span className="text-blue-400 text-sm font-semibold">
                    {activity.user[0].toUpperCase()}
                  </span>
                </div>
                <div>
                  <p className="text-gray-300 text-sm">{activity.action}</p>
                  <p className="text-gray-500 text-xs">{activity.user}</p>
                </div>
              </div>
              <span className="text-gray-500 text-xs">{activity.time}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
