import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../../firebase';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Search, TrendingUp, Globe, MapPin, Tag, Clock, Download, Filter } from 'lucide-react';

/**
 * SearchAnalytics Component
 * Provides insights into search patterns, popular keywords, locations, and success rates
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
    fetchSearchAnalytics();
  }, [timeRange]);

  const fetchSearchAnalytics = async () => {
    try {
      setLoading(true);
      
      // Mock data - replace with actual Firestore queries
      // In production, fetch from searchAnalytics collection
      
      // Generate search trends (last 7 days)
      const trends = generateSearchTrends(timeRange);
      setSearchTrends(trends);

      // Top keywords
      const keywords = [
        { keyword: 'software engineer', count: 245, successRate: 87 },
        { keyword: 'marketing manager', count: 198, successRate: 92 },
        { keyword: 'data scientist', count: 176, successRate: 85 },
        { keyword: 'sales director', count: 154, successRate: 78 },
        { keyword: 'product manager', count: 142, successRate: 88 },
        { keyword: 'business analyst', count: 128, successRate: 81 },
        { keyword: 'hr manager', count: 115, successRate: 90 },
        { keyword: 'finance director', count: 98, successRate: 86 },
        { keyword: 'operations manager', count: 87, successRate: 79 },
        { keyword: 'ceo', count: 76, successRate: 74 }
      ];
      setTopKeywords(keywords);

      // Top locations
      const locations = [
        { location: 'New York', count: 456, avgResults: 127 },
        { location: 'San Francisco', count: 389, avgResults: 98 },
        { location: 'London', count: 312, avgResults: 145 },
        { location: 'Los Angeles', count: 287, avgResults: 112 },
        { location: 'Chicago', count: 245, avgResults: 89 },
        { location: 'Boston', count: 223, avgResults: 95 },
        { location: 'Seattle', count: 198, avgResults: 78 },
        { location: 'Austin', count: 176, avgResults: 82 },
        { location: 'Toronto', count: 154, avgResults: 91 },
        { location: 'Singapore', count: 142, avgResults: 103 }
      ];
      setTopLocations(locations);

      // Calculate stats
      const totalSearches = keywords.reduce((sum, k) => sum + k.count, 0);
      const avgSuccessRate = keywords.reduce((sum, k) => sum + k.successRate, 0) / keywords.length;
      
      setStats({
        totalSearches,
        successRate: avgSuccessRate.toFixed(1),
        avgSearchTime: 2.4, // seconds
        uniqueKeywords: keywords.length
      });

      setLoading(false);
    } catch (error) {
      console.error('Error fetching search analytics:', error);
      setLoading(false);
    }
  };

  const generateSearchTrends = (range) => {
    const days = range === '7days' ? 7 : range === '30days' ? 30 : 90;
    const data = [];
    
    for (let i = days; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      data.push({
        date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        searches: Math.floor(Math.random() * 100) + 50,
        successful: Math.floor(Math.random() * 80) + 40,
        failed: Math.floor(Math.random() * 20) + 5
      });
    }
    
    return data;
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
