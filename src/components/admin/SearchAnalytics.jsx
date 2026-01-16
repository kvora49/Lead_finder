import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, orderBy, limit, onSnapshot, where, Timestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Search, TrendingUp, Globe, MapPin, Tag, Clock, Download, Filter } from 'lucide-react';

/**
 * SearchAnalytics Component
 * Provides real-time insights into search patterns, popular keywords, locations, and success rates
 */
const SearchAnalytics = () => {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalSearches: 0,
    successRate: 0,
    avgSearchTime: 0,
    uniqueKeywords: 0
  });
  const [topKeywords, setTopKeywords] = useState([]);
  const [topLocations, setTopLocations] = useState([]);
  const [searchTrends, setSearchTrends] = useState([]);
  const [timeRange, setTimeRange] = useState('7days');

  useEffect(() => {
    // Set up real-time listener for search logs
    const unsubscribe = onSnapshot(
      query(collection(db, 'searchLogs'), orderBy('timestamp', 'desc'), limit(1000)),
      () => {
        fetchSearchAnalytics();
      }
    );
    
    fetchSearchAnalytics();
    
    return () => unsubscribe();
  }, [timeRange]);

  const fetchSearchAnalytics = async () => {
    try {
      setLoading(true);
      
      // Fetch search logs from Firestore
      const daysBack = timeRange === '7days' ? 7 : timeRange === '30days' ? 30 : 90;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - daysBack);
      
      const searchQuery = query(
        collection(db, 'searchLogs'),
        where('timestamp', '>=', Timestamp.fromDate(startDate)),
        orderBy('timestamp', 'desc')
      );
      
      const searchSnapshot = await getDocs(searchQuery);
      const searchData = searchSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp?.toDate()
      }));
      
      // Calculate trends
      const trends = calculateSearchTrends(searchData, daysBack);
      setSearchTrends(trends);
      
      // Aggregate keywords
      const keywordMap = {};
      const locationMap = {};
      let totalTime = 0;
      let successCount = 0;
      
      searchData.forEach(search => {
        // Keywords
        const keyword = search.keyword || search.searchQuery || 'Unknown';
        if (!keywordMap[keyword]) {
          keywordMap[keyword] = { count: 0, success: 0 };
        }
        keywordMap[keyword].count++;
        if (search.resultCount > 0) {
          keywordMap[keyword].success++;
          successCount++;
        }
        
        // Locations
        const location = search.location || 'Unknown';
        if (!locationMap[location]) {
          locationMap[location] = { count: 0, totalResults: 0 };
        }
        locationMap[location].count++;
        locationMap[location].totalResults += search.resultCount || 0;
        
        // Response time
        if (search.responseTime) {
          totalTime += search.responseTime;
        }
      });
      
      // Top keywords
      const keywords = Object.entries(keywordMap)
        .map(([keyword, data]) => ({
          keyword,
          count: data.count,
          successRate: data.count > 0 ? ((data.success / data.count) * 100).toFixed(0) : 0
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
      setTopKeywords(keywords);
      
      // Top locations
      const locations = Object.entries(locationMap)
        .map(([location, data]) => ({
          location,
          count: data.count,
          avgResults: data.count > 0 ? Math.round(data.totalResults / data.count) : 0
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
      setTopLocations(locations);
      
      // Calculate stats
      const totalSearches = searchData.length;
      const avgSuccessRate = totalSearches > 0 ? ((successCount / totalSearches) * 100).toFixed(1) : 0;
      const avgSearchTime = searchData.length > 0 ? (totalTime / searchData.length / 1000).toFixed(1) : 0;
      
      setStats({
        totalSearches,
        successRate: avgSuccessRate,
        avgSearchTime: parseFloat(avgSearchTime),
        uniqueKeywords: Object.keys(keywordMap).length
      });
      
      setLoading(false);
    } catch (error) {
      console.error('Error fetching search analytics:', error);
      setLoading(false);
    }
  };
  
  const calculateSearchTrends = (searchData, daysBack) => {
    const trendMap = {};
    const now = new Date();
    
    // Initialize all days
    for (let i = daysBack; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dateKey = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      trendMap[dateKey] = { searches: 0, successful: 0, failed: 0 };
    }
    
    // Aggregate search data
    searchData.forEach(search => {
      if (search.timestamp) {
        const dateKey = search.timestamp.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        if (trendMap[dateKey]) {
          trendMap[dateKey].searches++;
          if (search.resultCount > 0) {
            trendMap[dateKey].successful++;
          } else {
            trendMap[dateKey].failed++;
          }
        }
      }
    });
    
    return Object.entries(trendMap).map(([date, data]) => ({
      date,
      ...data
    }));
  };

  const exportData = () => {
    // Export analytics data as CSV
    const csvData = [
      ['Keyword', 'Count', 'Success Rate'],
      ...topKeywords.map(k => [k.keyword, k.count, `${k.successRate}%`])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvData], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `search-analytics-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
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
          <h1 className="text-2xl font-bold text-white">Search Analytics</h1>
          <p className="text-slate-400 mt-1">Analyze search patterns and user behavior</p>
        </div>
        <div className="flex items-center gap-3">
          <select 
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            className="px-4 py-2 bg-slate-800 border border-slate-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="7days">Last 7 Days</option>
            <option value="30days">Last 30 Days</option>
            <option value="90days">Last 90 Days</option>
          </select>
          <button 
            onClick={exportData}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-400 text-sm">Total Searches</p>
              <p className="text-2xl font-bold text-white mt-1">{stats.totalSearches.toLocaleString()}</p>
              <div className="flex items-center gap-1 mt-2">
                <TrendingUp className="w-4 h-4 text-green-400" />
                <span className="text-sm text-green-400">12% increase</span>
              </div>
            </div>
            <div className="p-3 bg-blue-500/10 rounded-lg">
              <Search className="w-6 h-6 text-blue-400" />
            </div>
          </div>
        </div>

        <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-400 text-sm">Success Rate</p>
              <p className="text-2xl font-bold text-white mt-1">{stats.successRate}%</p>
              <p className="text-sm text-slate-400 mt-2">Avg across all searches</p>
            </div>
            <div className="p-3 bg-green-500/10 rounded-lg">
              <TrendingUp className="w-6 h-6 text-green-400" />
            </div>
          </div>
        </div>

        <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-400 text-sm">Avg Search Time</p>
              <p className="text-2xl font-bold text-white mt-1">{stats.avgSearchTime}s</p>
              <p className="text-sm text-slate-400 mt-2">Response time</p>
            </div>
            <div className="p-3 bg-purple-500/10 rounded-lg">
              <Clock className="w-6 h-6 text-purple-400" />
            </div>
          </div>
        </div>

        <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-400 text-sm">Unique Keywords</p>
              <p className="text-2xl font-bold text-white mt-1">{stats.uniqueKeywords}</p>
              <p className="text-sm text-slate-400 mt-2">Distinct searches</p>
            </div>
            <div className="p-3 bg-orange-500/10 rounded-lg">
              <Tag className="w-6 h-6 text-orange-400" />
            </div>
          </div>
        </div>
      </div>

      {/* Search Trends Chart */}
      <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-blue-400" />
          Search Trends
        </h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={searchTrends}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="date" stroke="#94a3b8" />
            <YAxis stroke="#94a3b8" />
            <Tooltip 
              contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
              labelStyle={{ color: '#e2e8f0' }}
            />
            <Legend />
            <Line type="monotone" dataKey="searches" stroke="#3b82f6" strokeWidth={2} name="Total Searches" />
            <Line type="monotone" dataKey="successful" stroke="#10b981" strokeWidth={2} name="Successful" />
            <Line type="monotone" dataKey="failed" stroke="#ef4444" strokeWidth={2} name="Failed" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Top Keywords and Locations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Keywords */}
        <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Tag className="w-5 h-5 text-orange-400" />
            Top Keywords
          </h3>
          <div className="space-y-3">
            {topKeywords.map((keyword, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg hover:bg-slate-900/70 transition-colors">
                <div className="flex items-center gap-3 flex-1">
                  <div className="w-8 h-8 rounded-full bg-orange-500/20 text-orange-400 flex items-center justify-center text-sm font-bold">
                    {index + 1}
                  </div>
                  <div className="flex-1">
                    <p className="text-white font-medium">{keyword.keyword}</p>
                    <div className="flex items-center gap-4 mt-1">
                      <span className="text-slate-400 text-sm">{keyword.count} searches</span>
                      <span className={`text-sm ${keyword.successRate >= 85 ? 'text-green-400' : keyword.successRate >= 75 ? 'text-yellow-400' : 'text-red-400'}`}>
                        {keyword.successRate}% success
                      </span>
                    </div>
                  </div>
                </div>
                <div className="w-24 h-2 bg-slate-700 rounded-full overflow-hidden">
                  <div 
                    className={`h-full ${keyword.successRate >= 85 ? 'bg-green-500' : keyword.successRate >= 75 ? 'bg-yellow-500' : 'bg-red-500'}`}
                    style={{ width: `${keyword.successRate}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top Locations */}
        <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <MapPin className="w-5 h-5 text-blue-400" />
            Top Locations
          </h3>
          <div className="space-y-3">
            {topLocations.map((location, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg hover:bg-slate-900/70 transition-colors">
                <div className="flex items-center gap-3 flex-1">
                  <div className="w-8 h-8 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-sm font-bold">
                    {index + 1}
                  </div>
                  <div className="flex-1">
                    <p className="text-white font-medium">{location.location}</p>
                    <div className="flex items-center gap-4 mt-1">
                      <span className="text-slate-400 text-sm">{location.count} searches</span>
                      <span className="text-slate-400 text-sm">~{location.avgResults} results/search</span>
                    </div>
                  </div>
                </div>
                <ResponsiveContainer width={80} height={40}>
                  <BarChart data={[{ value: location.count }]}>
                    <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SearchAnalytics;
