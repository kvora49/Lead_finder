import { useState, useEffect } from 'react';
import { 
  Search, 
  TrendingUp, 
  MapPin, 
  Tag, 
  Calendar,
  Clock,
  BarChart3,
  PieChart as PieChartIcon,
  Download,
  Filter,
  CheckCircle,
  XCircle
} from 'lucide-react';
import { collection, getDocs, query, orderBy, limit, where, Timestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';

const SearchAnalyticsNew = () => {
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState('30days');
  const [topKeywords, setTopKeywords] = useState([]);
  const [topLocations, setTopLocations] = useState([]);
  const [categoryDistribution, setCategoryDistribution] = useState([]);
  const [searchTrends, setSearchTrends] = useState([]);
  const [peakHours, setPeakHours] = useState([]);
  const [searchStats, setSearchStats] = useState({
    totalSearches: 0,
    successRate: 0,
    avgResultsPerSearch: 0,
    uniqueUsers: 0
  });

  useEffect(() => {
    loadSearchAnalytics();
  }, [dateRange]);

  const loadSearchAnalytics = async () => {
    setLoading(true);
    try {
      // Calculate date range
      const now = new Date();
      let startDate = new Date();
      
      switch(dateRange) {
        case '7days':
          startDate.setDate(now.getDate() - 7);
          break;
        case '30days':
          startDate.setDate(now.getDate() - 30);
          break;
        case '90days':
          startDate.setDate(now.getDate() - 90);
          break;
        default:
          startDate.setDate(now.getDate() - 30);
      }

      // Fetch search history
      const searchHistoryRef = collection(db, 'searchLogs');
      const q = query(
        searchHistoryRef,
        where('timestamp', '>=', Timestamp.fromDate(startDate)),
        orderBy('timestamp', 'desc'),
        limit(1000)
      );
      
      const snapshot = await getDocs(q);
      const searches = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp?.toDate() || new Date()
      }));

      // Process data
      processSearchData(searches);
      
      setLoading(false);
    } catch (error) {
      console.error('Error loading search analytics:', error);
      setLoading(false);
    }
  };

  const processSearchData = (searches) => {
    // Top Keywords
    const keywordCount = {};
    const locationCount = {};
    const categoryCount = {};
    const hourCount = Array(24).fill(0);
    let totalResults = 0;
    let successfulSearches = 0;
    const uniqueUsersSet = new Set();

    searches.forEach(search => {
      // Keywords - using 'keyword' field from searchLogs
      const keyword = search.keyword || 'Unknown';
      keywordCount[keyword] = (keywordCount[keyword] || 0) + 1;

      // Locations - using 'location' field from searchLogs
      const location = search.location || 'Unknown';
      locationCount[location] = (locationCount[location] || 0) + 1;

      // Categories - use metadata.category or business-related fields, avoid showing location
      const category = search.metadata?.category || search.businessType || search.filterType || 'General';
      categoryCount[category] = (categoryCount[category] || 0) + 1;

      // Peak hours
      const hour = search.timestamp.getHours();
      hourCount[hour]++;

      // Stats - using 'resultCount' and 'success' fields from searchLogs
      if (search.resultCount > 0) {
        successfulSearches++;
        totalResults += search.resultCount;
      }
      
      if (search.userId) {
        uniqueUsersSet.add(search.userId);
      }
    });

    // Top Keywords
    const topKW = Object.entries(keywordCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([keyword, count]) => ({ keyword, count }));
    setTopKeywords(topKW);

    // Top Locations
    const topLoc = Object.entries(locationCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([location, count]) => ({ location, count }));
    setTopLocations(topLoc);

    // Category Distribution
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899', '#84cc16'];
    const catDist = Object.entries(categoryCount)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value], idx) => ({
        name,
        value,
        color: colors[idx % colors.length]
      }));
    setCategoryDistribution(catDist);

    // Peak Hours
    const peakData = hourCount.map((count, hour) => ({
      hour: `${hour}:00`,
      searches: count
    }));
    setPeakHours(peakData);

    // Search Trends (daily) - FIXED: Sort dates chronologically
    const dailyCount = {};
    searches.forEach(search => {
      const date = search.timestamp.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      dailyCount[date] = (dailyCount[date] || 0) + 1;
    });
    
    // Sort dates chronologically (earliest to latest) instead of reverse
    const trendData = Object.entries(dailyCount)
      .sort((a, b) => {
        // Parse dates to compare them properly
        const dateA = new Date(a[0]);
        const dateB = new Date(b[0]);
        return dateA.getTime() - dateB.getTime();
      })
      .slice(-30)
      .map(([date, count]) => ({ date, searches: count }));
    setSearchTrends(trendData);

    // Stats
    setSearchStats({
      totalSearches: searches.length,
      successRate: searches.length > 0 ? ((successfulSearches / searches.length) * 100).toFixed(1) : 0,
      avgResultsPerSearch: successfulSearches > 0 ? Math.round(totalResults / successfulSearches) : 0,
      uniqueUsers: uniqueUsersSet.size
    });
  };

  const exportAnalytics = () => {
    const csvContent = [
      ['Search Analytics Report', `Generated: ${new Date().toLocaleString()}`].join(','),
      ['Date Range', dateRange].join(','),
      [],
      ['Overall Statistics'].join(','),
      ['Total Searches', searchStats.totalSearches].join(','),
      ['Success Rate', `${searchStats.successRate}%`].join(','),
      ['Average Results per Search', searchStats.avgResultsPerSearch].join(','),
      ['Unique Users', searchStats.uniqueUsers].join(','),
      [],
      ['Top Keywords'].join(','),
      ['Keyword', 'Count'].join(','),
      ...topKeywords.map(item => [item.keyword, item.count].join(',')),
      [],
      ['Top Locations'].join(','),
      ['Location', 'Count'].join(','),
      ...topLocations.map(item => [item.location, item.count].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `search-analytics-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const StatCard = ({ icon: Icon, label, value, color = 'blue' }) => (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-5 hover:bg-slate-800/70 transition-all">
      <div className="flex items-center justify-between mb-3">
        <Icon className={`w-6 h-6 text-${color}-400`} />
      </div>
      <p className="text-2xl font-bold text-white mb-1">{value}</p>
      <p className="text-sm text-gray-400">{label}</p>
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
          <h1 className="text-3xl font-bold text-white mb-2">Search Analytics</h1>
          <p className="text-gray-400">Comprehensive search behavior and trends analysis</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="7days">Last 7 Days</option>
            <option value="30days">Last 30 Days</option>
            <option value="90days">Last 90 Days</option>
          </select>
          <button
            onClick={exportAnalytics}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          icon={Search} 
          label="Total Searches" 
          value={searchStats.totalSearches.toLocaleString()}
          color="blue"
        />
        <StatCard 
          icon={CheckCircle} 
          label="Success Rate" 
          value={`${searchStats.successRate}%`}
          color="green"
        />
        <StatCard 
          icon={BarChart3} 
          label="Avg Results per Search" 
          value={searchStats.avgResultsPerSearch}
          color="purple"
        />
        <StatCard 
          icon={Calendar} 
          label="Unique Users" 
          value={searchStats.uniqueUsers}
          color="orange"
        />
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Search Trends */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Search Trends Over Time</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={searchTrends}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="date" stroke="#9ca3af" />
              <YAxis stroke="#9ca3af" />
              <Tooltip 
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: '8px' }}
                labelStyle={{ color: '#f3f4f6' }}
              />
              <Line type="monotone" dataKey="searches" stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#3b82f6' }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Peak Hours */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Peak Usage Hours</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={peakHours}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="hour" stroke="#9ca3af" />
              <YAxis stroke="#9ca3af" />
              <Tooltip 
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: '8px' }}
                labelStyle={{ color: '#f3f4f6' }}
              />
              <Bar dataKey="searches" fill="#10b981" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Top Keywords */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Search className="w-5 h-5 text-blue-400" />
            Top Search Keywords
          </h3>
          <div className="space-y-3">
            {topKeywords.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg hover:bg-slate-900/70 transition-all">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold ${
                    idx === 0 ? 'bg-yellow-500' : idx === 1 ? 'bg-gray-400' : idx === 2 ? 'bg-orange-500' : 'bg-slate-700'
                  }`}>
                    {idx + 1}
                  </div>
                  <span className="text-white font-medium">{item.keyword}</span>
                </div>
                <span className="text-blue-400 font-semibold">{item.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Top Locations */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <MapPin className="w-5 h-5 text-green-400" />
            Top Search Locations
          </h3>
          <div className="space-y-3">
            {topLocations.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg hover:bg-slate-900/70 transition-all">
                <div className="flex items-center gap-3">
                  <MapPin className="w-4 h-4 text-green-400" />
                  <span className="text-white font-medium truncate">{item.location}</span>
                </div>
                <span className="text-green-400 font-semibold">{item.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Category Distribution */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Tag className="w-5 h-5 text-purple-400" />
            Business Categories
          </h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={categoryDistribution}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
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
            {categoryDistribution.slice(0, 5).map((item, idx) => (
              <div key={idx} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }}></div>
                  <span className="text-gray-300 truncate">{item.name}</span>
                </div>
                <span className="text-white font-medium">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SearchAnalyticsNew;
