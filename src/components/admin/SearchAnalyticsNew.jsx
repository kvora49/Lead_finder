import { useState, useEffect } from 'react';
import { 
  Search, 
  MapPin, 
  Tag, 
  Calendar,
  BarChart3,
  Download,
  CheckCircle
} from 'lucide-react';
import { collection, getDocs, query, orderBy, limit, where, Timestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import {
  BarChart,
  Bar,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';

const CATEGORY_PAGE_SIZE = 12;
const UNCATEGORIZED_PAGE_SIZE = 8;
const CATEGORY_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#84cc16', '#f97316', '#22c55e'];

const CATEGORY_ALIASES = {
  'real estate': 'Real Estate',
  realtor: 'Real Estate',
  restaurant: 'Restaurant',
  restaurants: 'Restaurant',
  hospital: 'Hospital',
  hospitals: 'Hospital',
  school: 'School',
  schools: 'School',
  gym: 'Gym',
  gyms: 'Gym',
  hotel: 'Hotel',
  hotels: 'Hotel',
  salon: 'Salon',
  salons: 'Salon',
  ecommerce: 'E-Commerce',
  'e commerce': 'E-Commerce',
  manufacturing: 'Manufacturing',
  retail: 'Retail',
  wholesale: 'Wholesale',
};

const normalizeCategory = (rawValue) => {
  const raw = String(rawValue || '').trim();
  if (!raw) return 'Uncategorized';

  const canonical = raw.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!canonical) return 'Uncategorized';
  if (CATEGORY_ALIASES[canonical]) return CATEGORY_ALIASES[canonical];

  return canonical
    .split(' ')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

const toValidDate = (value) => {
  const fromTimestamp = value?.toDate?.();
  if (fromTimestamp instanceof Date && !Number.isNaN(fromTimestamp.getTime())) return fromTimestamp;

  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;

  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  return null;
};

const toCleanString = (...values) => {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    const cleaned = String(value).trim();
    if (cleaned) return cleaned;
  }
  return '';
};

const toSafeNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const DATE_FIELDS = ['timestamp', 'createdAt', 'searchedAt'];

const CategoryBarTooltip = ({ active, payload }) => {
  if (!active || !payload || !payload.length) return null;

  const row = payload[0]?.payload;
  if (!row) return null;

  return (
    <div className="rounded-xl border border-slate-600 bg-slate-900/95 px-3 py-2 shadow-2xl backdrop-blur">
      <p className="text-slate-100 font-semibold text-sm">{row.name}</p>
      <p className="text-blue-300 text-xs mt-1">Searches: <span className="font-bold text-blue-200">{row.value}</span></p>
    </div>
  );
};

const SearchAnalyticsNew = () => {
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState('thisMonth');
  const [topKeywords, setTopKeywords] = useState([]);
  const [topLocations, setTopLocations] = useState([]);
  const [categoryDistribution, setCategoryDistribution] = useState([]);
  const [categoryTableRows, setCategoryTableRows] = useState([]);
  const [categorySearch, setCategorySearch] = useState('');
  const [categoryPage, setCategoryPage] = useState(1);
  const [uncategorizedRows, setUncategorizedRows] = useState([]);
  const [uncategorizedSearch, setUncategorizedSearch] = useState('');
  const [uncategorizedPage, setUncategorizedPage] = useState(1);
  const [searchTrends, setSearchTrends] = useState([]);
  const [peakHours, setPeakHours] = useState([]);
  const [searchStats, setSearchStats] = useState({
    totalSearches: 0,
    successRate: 0,
    avgResultsPerSearch: 0,
    uniqueUsers: 0
  });

  const getExplicitCategory = (search) => (
    search?.filters?.type ||
    search?.metadata?.category ||
    search?.businessType ||
    search?.filterType ||
    ''
  );

  useEffect(() => {
    loadSearchAnalytics();
  }, [dateRange]);

  useEffect(() => {
    setCategoryPage(1);
  }, [categorySearch]);

  useEffect(() => {
    setUncategorizedPage(1);
  }, [uncategorizedSearch]);

  const loadSearchAnalytics = async () => {
    setLoading(true);
    try {
      // Calculate date range
      const now = new Date();
      let startDate = new Date();
      
      switch(dateRange) {
        case 'all':
          startDate = null;
          break;
        case 'thisMonth':
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
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

      // Fetch search history across possible date fields to avoid missing legacy/mixed-schema docs.
      const searchHistoryRef = collection(db, 'searchLogs');
      const allSnaps = await Promise.all(
        DATE_FIELDS.map(async (field) => {
          const constraints = [orderBy(field, 'desc'), limit(5000)];
          if (startDate) {
            constraints.unshift(where(field, '>=', Timestamp.fromDate(startDate)));
          }

          try {
            return await getDocs(query(searchHistoryRef, ...constraints));
          } catch (err) {
            // Some datasets may not have a needed index for every field; continue with available fields.
            console.warn(`[SearchAnalytics] Failed to query by ${field}:`, err?.message || err);
            return null;
          }
        })
      );

      const mergedById = new Map();
      allSnaps.forEach((snap) => {
        if (!snap) return;
        snap.docs.forEach((doc) => {
          const raw = doc.data() || {};
          const timestamp = toValidDate(raw.timestamp || raw.createdAt || raw.searchedAt || raw.updatedAt);

          if (!timestamp) return;
          if (startDate && timestamp < startDate) return;

          const normalized = {
            id: doc.id,
            ...raw,
            keyword: toCleanString(raw.keyword, raw.query, raw.searchTerm),
            location: toCleanString(raw.location, raw.city, raw.area, raw.place),
            userId: toCleanString(raw.userId, raw.uid),
            userEmail: toCleanString(raw.userEmail, raw.email),
            resultCount: toSafeNumber(raw.resultCount, 0),
            timestamp,
          };

          if (!normalized.keyword) return;

          const existing = mergedById.get(doc.id);
          if (!existing || normalized.timestamp > existing.timestamp) {
            mergedById.set(doc.id, normalized);
          }
        });
      });

      const searches = Array.from(mergedById.values())
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
        .slice(0, 5000);

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
    let validSearches = 0;
    let invalidRecords = 0;
    const uncategorized = [];

    searches.forEach(search => {
      // Validate critical fields exist
      const hasValidKeyword = toCleanString(search.keyword);
      const hasValidLocation = toCleanString(search.location);
      const hasValidUserId = toCleanString(search.userId);

      if (!hasValidKeyword) {
        invalidRecords++;
        return;
      }

      // Only count searches with valid keyword
      if (hasValidKeyword) {
        validSearches++;

        // Keywords - only count valid non-empty keywords
        const keyword = toCleanString(search.keyword);
        keywordCount[keyword] = (keywordCount[keyword] || 0) + 1;

        // Locations - only count valid locations
        if (hasValidLocation) {
          const location = toCleanString(search.location);
          locationCount[location] = (locationCount[location] || 0) + 1;
        }

        // Categories - use explicit selected type only; unknown values stay uncategorized.
        const explicitCategory = getExplicitCategory(search);
        const category = normalizeCategory(explicitCategory);
        categoryCount[category] = (categoryCount[category] || 0) + 1;

        if (category === 'Uncategorized') {
          uncategorized.push({
            id: search.id,
            keyword,
            location: hasValidLocation ? toCleanString(search.location) : 'Unknown',
            resultCount: toSafeNumber(search.resultCount, 0),
            userEmail: toCleanString(search.userEmail) || 'Unknown',
            timestamp: search.timestamp,
          });
        }

        // Peak hours
        const hour = search.timestamp instanceof Date ? search.timestamp.getHours() : 0;
        hourCount[hour]++;

        // Stats - using 'resultCount' and 'success' fields from searchLogs
        if (toSafeNumber(search.resultCount, 0) > 0) {
          successfulSearches++;
          totalResults += toSafeNumber(search.resultCount, 0);
        }
        
        // Track unique users - only if userId is present and valid
        if (hasValidUserId) {
          uniqueUsersSet.add(toCleanString(search.userId));
        } else {
          const emailIdentity = toCleanString(search.userEmail);
          if (emailIdentity) uniqueUsersSet.add(emailIdentity.toLowerCase());
        }
      }
    });

    // Top Keywords - exclude "Empty" or whitespace-only entries
    const topKW = Object.entries(keywordCount)
      .filter(([keyword]) => keyword && keyword.trim())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([keyword, count]) => ({ keyword, count }));
    setTopKeywords(topKW);

    // Top Locations - exclude "Unknown" or empty entries
    const topLoc = Object.entries(locationCount)
      .filter(([location]) => location && location.trim())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([location, count]) => ({ location, count }));
    setTopLocations(topLoc);

    // Category Distribution (Top-N + Other)
    const allCategories = Object.entries(categoryCount)
      .filter(([name]) => name && name.trim())
      .sort((a, b) => b[1] - a[1])
      .map(([name, value], idx) => ({
        name,
        value,
        color: CATEGORY_COLORS[idx % CATEGORY_COLORS.length]
      }));

    const topCategories = allCategories.slice(0, 10);
    const otherTotal = allCategories.slice(10).reduce((sum, item) => sum + item.value, 0);
    const mergedCategories = otherTotal > 0
      ? [
          ...topCategories,
          { name: 'Other', value: otherTotal, color: '#64748b' },
        ]
      : topCategories;

    setCategoryDistribution(mergedCategories);
    setCategoryTableRows(allCategories);
    setUncategorizedRows(
      uncategorized
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
        .slice(0, 500)
    );

    // Peak Hours
    const peakData = hourCount.map((count, hour) => ({
      hour: `${hour}:00`,
      searches: count
    }));
    setPeakHours(peakData);

    // Search Trends (daily) - FIXED: Sort dates chronologically
    const dailyCount = {};
    searches.forEach(search => {
      const dateKey = search.timestamp.toISOString().slice(0, 10);
      if (!dailyCount[dateKey]) {
        dailyCount[dateKey] = {
          label: search.timestamp.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          count: 0,
        };
      }
      dailyCount[dateKey].count += 1;
    });
    
    // Sort by ISO key to preserve true chronology and avoid locale/date parsing issues.
    const trendData = Object.entries(dailyCount)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-30)
      .map(([, value]) => ({ date: value.label, searches: value.count }));
    setSearchTrends(trendData);

    // Top cards all use searchLogs for consistency with trends and quality metrics.
    setSearchStats({
      totalSearches: validSearches,
      successRate: validSearches > 0 ? ((successfulSearches / validSearches) * 100).toFixed(1) : 0,
      avgResultsPerSearch: validSearches > 0 ? Math.round(totalResults / validSearches) : 0,
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

  const filteredCategoryRows = categoryTableRows.filter((row) =>
    row.name.toLowerCase().includes(categorySearch.trim().toLowerCase())
  );
  const categoryTotalPages = Math.max(1, Math.ceil(filteredCategoryRows.length / CATEGORY_PAGE_SIZE));
  const safeCategoryPage = Math.min(categoryPage, categoryTotalPages);
  const categoryPageRows = filteredCategoryRows.slice(
    (safeCategoryPage - 1) * CATEGORY_PAGE_SIZE,
    safeCategoryPage * CATEGORY_PAGE_SIZE
  );

  const filteredUncategorized = uncategorizedRows.filter((row) => {
    const q = uncategorizedSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      row.keyword.toLowerCase().includes(q) ||
      row.location.toLowerCase().includes(q) ||
      String(row.userEmail).toLowerCase().includes(q)
    );
  });
  const uncategorizedTotalPages = Math.max(1, Math.ceil(filteredUncategorized.length / UNCATEGORIZED_PAGE_SIZE));
  const safeUncategorizedPage = Math.min(uncategorizedPage, uncategorizedTotalPages);
  const uncategorizedPageRows = filteredUncategorized.slice(
    (safeUncategorizedPage - 1) * UNCATEGORIZED_PAGE_SIZE,
    safeUncategorizedPage * UNCATEGORIZED_PAGE_SIZE
  );

  const totalCategorySearches = categoryTableRows.reduce((sum, row) => sum + row.value, 0);
  const uncategorizedTotal = categoryTableRows.find((row) => row.name === 'Uncategorized')?.value || 0;
  const longTailTotal = categoryTableRows.slice(10).reduce((sum, row) => sum + row.value, 0);

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
            <option value="thisMonth">This Month</option>
            <option value="7days">Last 7 Days</option>
            <option value="30days">Last 30 Days</option>
            <option value="90days">Last 90 Days</option>
            <option value="all">All Time</option>
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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

      </div>

      {/* Business Categories */}
      <div className="bg-gradient-to-b from-slate-800/60 to-slate-900/60 border border-slate-700/60 rounded-2xl p-6 space-y-5 shadow-lg">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Tag className="w-5 h-5 text-purple-400" />
            Business Categories (Top 10 + Other)
          </h3>
          <div className="text-sm text-slate-400">
            {categoryTableRows.length.toLocaleString()} unique categories
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-xl border border-slate-700/80 bg-slate-900/60 px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-slate-400">Categorized Searches</p>
            <p className="text-xl font-semibold text-slate-100 mt-1">{totalCategorySearches.toLocaleString()}</p>
          </div>
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-amber-200/80">Uncategorized</p>
            <p className="text-xl font-semibold text-amber-100 mt-1">{uncategorizedTotal.toLocaleString()}</p>
          </div>
          <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-sky-200/80">Long Tail (11+)</p>
            <p className="text-xl font-semibold text-sky-100 mt-1">{longTailTotal.toLocaleString()}</p>
          </div>
        </div>

        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={categoryDistribution} layout="vertical" margin={{ left: 8, right: 20, top: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis type="number" stroke="#9ca3af" />
            <YAxis
              type="category"
              dataKey="name"
              width={180}
              stroke="#cbd5e1"
              tickFormatter={(value) => (value.length > 24 ? `${value.slice(0, 24)}...` : value)}
            />
            <Tooltip
              content={<CategoryBarTooltip />}
              cursor={{ fill: 'rgba(59, 130, 246, 0.08)' }}
            />
            <Bar dataKey="value" radius={[0, 8, 8, 0]}>
              {categoryDistribution.map((entry, index) => (
                <Cell key={`cat-cell-${index}`} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>

        <div className="space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={categorySearch}
              onChange={(e) => setCategorySearch(e.target.value)}
              placeholder="Search category name"
              className="w-full md:w-80 pl-9 pr-3 py-2 bg-slate-900/70 border border-slate-700 rounded-lg text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-700/70 bg-slate-900/40">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-900/80 text-slate-300">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Category</th>
                  <th className="px-4 py-2 text-right font-medium">Searches</th>
                </tr>
              </thead>
              <tbody>
                {categoryPageRows.map((row) => (
                  <tr key={row.name} className="border-t border-slate-700/60 text-slate-200 hover:bg-slate-800/60 transition-colors">
                    <td className="px-4 py-2">{row.name}</td>
                    <td className="px-4 py-2 text-right font-semibold">{row.value}</td>
                  </tr>
                ))}
                {categoryPageRows.length === 0 && (
                  <tr>
                    <td colSpan={2} className="px-4 py-6 text-center text-slate-400">No category matches this search.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between text-sm text-slate-400">
            <span>Page {safeCategoryPage} of {categoryTotalPages}</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setCategoryPage((p) => Math.max(1, p - 1))}
                disabled={safeCategoryPage <= 1}
                className="px-3 py-1.5 rounded-md border border-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-700/60"
              >
                Prev
              </button>
              <button
                type="button"
                onClick={() => setCategoryPage((p) => Math.min(categoryTotalPages, p + 1))}
                disabled={safeCategoryPage >= categoryTotalPages}
                className="px-3 py-1.5 rounded-md border border-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-700/60"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Uncategorized Explorer */}
      <div className="bg-gradient-to-b from-slate-800/60 to-slate-900/60 border border-slate-700/60 rounded-2xl p-6 space-y-4 shadow-lg">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <h3 className="text-lg font-semibold text-white">Uncategorized Explorer</h3>
          <div className="text-sm text-slate-400">
            {filteredUncategorized.length.toLocaleString()} uncategorized searches
          </div>
        </div>

        <div className="relative">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={uncategorizedSearch}
            onChange={(e) => setUncategorizedSearch(e.target.value)}
            placeholder="Search by keyword, location, or email"
            className="w-full md:w-[420px] pl-9 pr-3 py-2 bg-slate-900/70 border border-slate-700 rounded-lg text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-700/70 bg-slate-900/40">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-900/80 text-slate-300">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Keyword</th>
                <th className="px-4 py-2 text-left font-medium">Location</th>
                <th className="px-4 py-2 text-right font-medium">Results</th>
                <th className="px-4 py-2 text-left font-medium">User</th>
                <th className="px-4 py-2 text-left font-medium">Time</th>
              </tr>
            </thead>
            <tbody>
              {uncategorizedPageRows.map((row) => (
                <tr key={row.id} className="border-t border-slate-700/60 text-slate-200 hover:bg-slate-800/60 transition-colors">
                  <td className="px-4 py-2">{row.keyword}</td>
                  <td className="px-4 py-2">{row.location}</td>
                  <td className="px-4 py-2 text-right">{row.resultCount}</td>
                  <td className="px-4 py-2">{row.userEmail}</td>
                  <td className="px-4 py-2 text-slate-400 whitespace-nowrap">{row.timestamp.toLocaleString()}</td>
                </tr>
              ))}
              {uncategorizedPageRows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-slate-400">No uncategorized searches found for this filter.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between text-sm text-slate-400">
          <span>Page {safeUncategorizedPage} of {uncategorizedTotalPages}</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setUncategorizedPage((p) => Math.max(1, p - 1))}
              disabled={safeUncategorizedPage <= 1}
              className="px-3 py-1.5 rounded-md border border-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-700/60"
            >
              Prev
            </button>
            <button
              type="button"
              onClick={() => setUncategorizedPage((p) => Math.min(uncategorizedTotalPages, p + 1))}
              disabled={safeUncategorizedPage >= uncategorizedTotalPages}
              className="px-3 py-1.5 rounded-md border border-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-700/60"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SearchAnalyticsNew;
