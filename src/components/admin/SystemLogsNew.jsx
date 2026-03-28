import { useState, useEffect, useRef } from 'react';
import { 
  FileText, 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  Info,
  Download,
  Filter,
  Search,
  Calendar,
  User,
  Shield,
  Activity,
  Clock,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { collection, getDocs, query, orderBy, limit, startAfter, where, Timestamp } from 'firebase/firestore';
import { db } from '../../firebase';

/**
 * Format a Date object as DD/MM/YYYY, HH:MM
 * @param {Date} date
 * @returns {string}
 */
const formatDate = (date) => {
  if (!date || !(date instanceof Date) || isNaN(date)) return '—';
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy}, ${hh}:${min}`;
};

const SystemLogsNew = () => {
  const [logs, setLogs] = useState([]);
  const [filteredLogs, setFilteredLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState('all');
  const [filterSeverity, setFilterSeverity] = useState('all');
  const [filterUserEmail, setFilterUserEmail] = useState('all');  // Filter by actor email
  const [searchTerm, setSearchTerm] = useState('');
  const [dateRange, setDateRange] = useState('7days');
  const [uniqueUsers, setUniqueUsers] = useState([]);  // Track unique users
  
  // ── Cursor-based server pagination ────────────────────────────────────────
  // Saves ~90% Firestore read costs vs. the old limit(500) approach:
  //   Before: every page load reads up to 500 documents
  //   After:  each page load reads exactly 200 documents via startAfter cursor
  const PAGE_SIZE = 200;
  const sysCursorRef = useRef([null]);
  const searchCursorRef = useRef([null]);
  const [pageIndex,   setPageIndex]   = useState(0);
  const [pageLoading, setPageLoading] = useState(false);
  const [hasNextPage, setHasNextPage] = useState(false);

  const [stats, setStats] = useState({
    total: 0,
    info: 0,
    success: 0,
    warning: 0,
    error: 0
  });

  useEffect(() => {
    // Reset cursor history whenever the date range changes, then fetch page 0
    sysCursorRef.current = [null];
    searchCursorRef.current = [null];
    setPageIndex(0);
    loadSystemLogs(null, 0);
  }, [dateRange]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadAllUsers();
  }, []);

  useEffect(() => {
    filterLogs();
  }, [logs, filterType, filterSeverity, searchTerm, filterUserEmail]);

  /**
   * loadSystemLogs(cursor, pIdx)
   *
   * cursor — Firestore DocumentSnapshot to use as startAfter (null = first page)
   * pIdx   — 0-based index of the page being loaded (for cursor bookkeeping)
   *
   * Cost model: reads exactly PAGE_SIZE (50) docs per call instead of 500.
   */
  const loadSystemLogs = async (cursor = null, pIdx = 0) => {
    if (pIdx === 0 && cursor === null) setLoading(true);
    else setPageLoading(true);

    try {
      const now = new Date();
      let startDate = new Date();
      switch (dateRange) {
        case 'all':     startDate = null;                        break;
        case '24hours': startDate.setHours(now.getHours() - 24); break;
        case '7days':   startDate.setDate(now.getDate() - 7);    break;
        case '30days':  startDate.setDate(now.getDate() - 30);   break;
        default:        startDate.setDate(now.getDate() - 7);
      }

      const tsStart = startDate ? Timestamp.fromDate(startDate) : null;
      const cursorState = cursor || { sys: null, search: null };

      const sysConstraints = [];
      if (tsStart) sysConstraints.push(where('timestamp', '>=', tsStart));
      sysConstraints.push(orderBy('timestamp', 'desc'));
      if (cursorState.sys) sysConstraints.push(startAfter(cursorState.sys));
      sysConstraints.push(limit(PAGE_SIZE));
      const sysQuery = query(collection(db, 'systemLogs'), ...sysConstraints);

      const searchConstraints = [];
      if (tsStart) searchConstraints.push(where('timestamp', '>=', tsStart));
      searchConstraints.push(orderBy('timestamp', 'desc'));
      if (cursorState.search) searchConstraints.push(startAfter(cursorState.search));
      searchConstraints.push(limit(PAGE_SIZE));
      const searchQuery = query(collection(db, 'searchLogs'), ...searchConstraints);

      const [sysSnap, searchSnap] = await Promise.all([
        getDocs(sysQuery),
        getDocs(searchQuery),
      ]);

      // Normalise systemLogs entries
      const sysLogs = sysSnap.docs.map(d => {
        const data = d.data();
        const targetInfo = data.targetUserEmail ? ` → ${data.targetUserEmail}` : '';
        return {
          id: d.id,
          ...data,
          timestamp: data.timestamp?.toDate() || new Date(),
          type: determineLogType(data.action),
          severity: determineSeverity(data.action),
          adminEmail: data.adminEmail || data.userEmail || data.user || 'System',
          targetUserEmail: data.targetUserEmail || '',
          action: data.action || 'System Event',
          // Include target user in admin actions
          details: `${data.details || ''}${targetInfo}`.trim(),
        };
      });

      // logSearch writes both searchLogs and a mirrored systemLogs entry.
      // We keep the richer searchLogs row and drop mirrored systemLogs rows
      // so one search appears once in this combined table.
      const filteredSysLogs = sysLogs.filter((log) => {
        if (log.type !== 'search') return true;
        const action = String(log.action || '').toLowerCase();
        return action !== 'search performed' && action !== 'search failed';
      });

      // Normalise searchLogs entries into the same shape
      const searchLogs = searchSnap.docs.map(d => {
        const data = d.data();
        const resultCount = Number(data.resultCount ?? 0);
        const isFailure = data.success === false || !!data.errorMessage;
        const severity = isFailure ? 'error' : (resultCount === 0 ? 'warning' : 'info');
        const action = isFailure ? 'Search Failed' : 'Search Performed';

        return {
          id: `search_${d.id}`,
          timestamp: data.timestamp?.toDate() || new Date(),
          type: 'search',
          severity,
          adminEmail: data.userEmail || data.user || 'User',
          action,
          details: isFailure
            ? `"${data.keyword || data.searchQuery || '—'}" in ${data.location || '—'} failed${data.errorMessage ? ` — ${data.errorMessage}` : ''}`
            : `"${data.keyword || data.searchQuery || '—'}" in ${data.location || '—'} — ${resultCount} results${data.cached ? ' (cached)' : ''}`,
        };
      });

      // Merge and sort by timestamp descending
      const allLogs = [...filteredSysLogs, ...searchLogs].sort((a, b) => b.timestamp - a.timestamp);

      setLogs(allLogs);
      calculateStats(allLogs);

      const nextSysCursor = sysSnap.docs.length ? sysSnap.docs[sysSnap.docs.length - 1] : null;
      const nextSearchCursor = searchSnap.docs.length ? searchSnap.docs[searchSnap.docs.length - 1] : null;
      sysCursorRef.current[pIdx + 1] = nextSysCursor;
      searchCursorRef.current[pIdx + 1] = nextSearchCursor;

      setHasNextPage(sysSnap.docs.length === PAGE_SIZE || searchSnap.docs.length === PAGE_SIZE);
    } catch (error) {
      console.error('Error loading system logs:', error);
    } finally {
      setLoading(false);
      setPageLoading(false);
    }
  };

  const loadAllUsers = async () => {
    try {
      const usersSnap = await getDocs(collection(db, 'users'));
      const emails = usersSnap.docs
        .map((docSnap) => docSnap.data()?.email)
        .filter((email) => typeof email === 'string' && email.trim().length > 0);
      setUniqueUsers((prev) => {
        const merged = new Set([...prev, ...emails]);
        return Array.from(merged).sort();
      });
    } catch (error) {
      console.error('Error loading user emails for logs filter:', error);
    }
  };

  const determineLogType = (action) => {
    if (action?.toLowerCase().includes('search')) return 'search';
    if (action?.toLowerCase().includes('login') || action?.toLowerCase().includes('logout')) return 'auth';
    if (action?.toLowerCase().includes('credit')) return 'credit';
    if (action?.toLowerCase().includes('user')) return 'user';
    if (action?.toLowerCase().includes('api')) return 'api';
    return 'system';
  };

  const determineSeverity = (action) => {
    if (action?.toLowerCase().includes('error') || action?.toLowerCase().includes('failed')) return 'error';
    if (action?.toLowerCase().includes('warning') || action?.toLowerCase().includes('suspend')) return 'warning';
    if (action?.toLowerCase().includes('success') || action?.toLowerCase().includes('approved')) return 'success';
    return 'info';
  };

  const calculateStats = (logsData) => {
    const stats = {
      total: logsData.length,
      info: logsData.filter(l => l.severity === 'info').length,
      success: logsData.filter(l => l.severity === 'success').length,
      warning: logsData.filter(l => l.severity === 'warning').length,
      error: logsData.filter(l => l.severity === 'error').length
    };
    setStats(stats);
     // Collect unique user emails (both admins and target users)
     const users = new Set();
     logsData.forEach(log => {
       if (log.adminEmail) users.add(log.adminEmail);
       if (log.targetUserEmail) users.add(log.targetUserEmail);
     });
     setUniqueUsers((prev) => {
       const merged = new Set([...prev, ...Array.from(users)]);
       return Array.from(merged).sort();
     });
  };

  const filterLogs = () => {
    let filtered = [...logs];

    // Type filter
    if (filterType !== 'all') {
      filtered = filtered.filter(log => log.type === filterType);
    }

    // Severity filter
    if (filterSeverity !== 'all') {
      filtered = filtered.filter(log => log.severity === filterSeverity);
    }

    // User email filter - show logs by actor only
    if (filterUserEmail !== 'all') {
      filtered = filtered.filter(log => log.adminEmail === filterUserEmail);
    }

    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(log => 
        log.action?.toLowerCase().includes(term) ||
        log.adminEmail?.toLowerCase().includes(term) ||
        log.details?.toLowerCase().includes(term)
      );
    }

    setFilteredLogs(filtered);
  };

  const exportLogs = () => {
    const csvContent = [
      ['System Logs Report', `Generated: ${formatDate(new Date())}`].join(','),
      ['Date Range', dateRange].join(','),
      [],
      ['Timestamp', 'Admin', 'Action', 'Type', 'Severity', 'Details'].join(','),
      ...filteredLogs.map(log => [
        formatDate(log.timestamp),
        log.adminEmail || 'System',
        log.action || 'N/A',
        log.type,
        log.severity,
        (log.details || '').replace(/,/g, ';')
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `system-logs-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  // With cursor pagination each page IS already the right slice (≤ PAGE_SIZE docs)
  const currentLogs = filteredLogs;

  const goNextPage = () => {
    const nextIdx = pageIndex + 1;
    setPageIndex(nextIdx);
    loadSystemLogs({ sys: sysCursorRef.current[nextIdx], search: searchCursorRef.current[nextIdx] }, nextIdx);
  };

  const goPrevPage = () => {
    const prevIdx = pageIndex - 1;
    setPageIndex(prevIdx);
    loadSystemLogs({ sys: sysCursorRef.current[prevIdx], search: searchCursorRef.current[prevIdx] }, prevIdx);
  };

  const handleSeverityCardClick = (severity) => {
    if (severity === 'all') {
      setFilterSeverity('all');
      return;
    }
    setFilterSeverity((prev) => (prev === severity ? 'all' : severity));
  };

  const StatCard = ({ icon: Icon, label, value, color, active = false, onClick }) => (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left bg-slate-800/50 border rounded-lg p-4 transition-all ${
        active
          ? 'border-blue-500/60 ring-2 ring-blue-500/25'
          : 'border-slate-700/50 hover:bg-slate-800/70'
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 bg-${color}-500/20 rounded-lg flex items-center justify-center`}>
            <Icon className={`w-5 h-5 text-${color}-400`} />
          </div>
          <div>
            <p className="text-2xl font-bold text-white">{value}</p>
            <p className="text-sm text-gray-400">{label}</p>
          </div>
        </div>
      </div>
    </button>
  );

  const getSeverityBadge = (severity) => {
    const configs = {
      info: { icon: Info, color: 'blue', bg: 'bg-blue-500/20', border: 'border-blue-500/30', text: 'text-blue-400' },
      success: { icon: CheckCircle, color: 'green', bg: 'bg-green-500/20', border: 'border-green-500/30', text: 'text-green-400' },
      warning: { icon: AlertTriangle, color: 'yellow', bg: 'bg-yellow-500/20', border: 'border-yellow-500/30', text: 'text-yellow-400' },
      error: { icon: XCircle, color: 'red', bg: 'bg-red-500/20', border: 'border-red-500/30', text: 'text-red-400' }
    };
    
    const config = configs[severity] || configs.info;
    const Icon = config.icon;
    
    return (
      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${config.bg} ${config.border} ${config.text}`}>
        <Icon className="w-3 h-3" />
        {severity.charAt(0).toUpperCase() + severity.slice(1)}
      </span>
    );
  };

  const getTypeBadge = (type) => {
    const colors = {
      auth: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
      credit: 'bg-green-500/20  text-green-400  border-green-500/30',
      user: 'bg-blue-500/20   text-blue-400   border-blue-500/30',
      api: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
      system: 'bg-gray-500/20   text-gray-400   border-gray-500/30',
      search: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
    };
    
    return (
      <span className={`inline-flex px-2 py-1 rounded text-xs font-medium border ${colors[type] || colors.system}`}>
        {type.toUpperCase()}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-400">Loading system logs...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">System Logs & Audit Trail</h1>
          <p className="text-gray-400">Complete activity monitoring and compliance tracking</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="24hours">Last 24 Hours</option>
            <option value="7days">Last 7 Days</option>
            <option value="30days">Last 30 Days</option>
            <option value="all">All Time</option>
          </select>
          <button
            onClick={exportLogs}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
          >
            <Download className="w-4 h-4" />
            Export Logs
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <StatCard
          icon={FileText}
          label="Total (this page)"
          value={stats.total}
          color="blue"
          active={filterSeverity === 'all'}
          onClick={() => handleSeverityCardClick('all')}
        />
        <StatCard
          icon={Info}
          label="Info"
          value={stats.info}
          color="blue"
          active={filterSeverity === 'info'}
          onClick={() => handleSeverityCardClick('info')}
        />
        <StatCard
          icon={CheckCircle}
          label="Success"
          value={stats.success}
          color="green"
          active={filterSeverity === 'success'}
          onClick={() => handleSeverityCardClick('success')}
        />
        <StatCard
          icon={AlertTriangle}
          label="Warning"
          value={stats.warning}
          color="yellow"
          active={filterSeverity === 'warning'}
          onClick={() => handleSeverityCardClick('warning')}
        />
        <StatCard
          icon={XCircle}
          label="Error"
          value={stats.error}
          color="red"
          active={filterSeverity === 'error'}
          onClick={() => handleSeverityCardClick('error')}
        />
      </div>

      {/* Filters */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search logs..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-gray-300 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Type Filter */}
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Types</option>
            <option value="auth">Authentication</option>
            <option value="credit">Credit</option>
            <option value="user">User</option>
            <option value="api">API</option>
            <option value="system">System</option>
            <option value="search">Search</option>
          </select>

          {/* Severity Filter */}
          <select
            value={filterSeverity}
            onChange={(e) => setFilterSeverity(e.target.value)}
            className="px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Severities</option>
            <option value="info">Info</option>
            <option value="success">Success</option>
            <option value="warning">Warning</option>
            <option value="error">Error</option>
          </select>

          {/* User Filter (actor only) */}
          <select
            value={filterUserEmail}
            onChange={(e) => setFilterUserEmail(e.target.value)}
            className="px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Actors</option>
            {uniqueUsers.map((email) => (
              <option key={email} value={email}>{email}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-900/50 border-b border-slate-700">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Timestamp</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">User</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Action</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Severity</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {pageLoading
                ? Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      {[75, 55, 65, 35, 40, 80].map((w, j) => (
                        <td key={j} className="px-4 py-4">
                          <div className="h-4 bg-slate-700/60 rounded" style={{ width: `${w}%` }} />
                        </td>
                      ))}
                    </tr>
                  ))
                : currentLogs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="px-4 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2 text-sm text-gray-300">
                      <Clock className="w-4 h-4 text-gray-400" />
                      <div>
                        <div>{formatDate(log.timestamp).split(', ')[0]}</div>
                        <div className="text-xs text-gray-500">{formatDate(log.timestamp).split(', ')[1]}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-gray-400" />
                      <span className="text-sm text-white">{log.adminEmail || 'System'}</span>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <span className="text-sm text-white font-medium">{log.action || 'N/A'}</span>
                  </td>
                  <td className="px-4 py-4">{getTypeBadge(log.type)}</td>
                  <td className="px-4 py-4">{getSeverityBadge(log.severity)}</td>
                  <td className="px-4 py-4">
                    <div className="text-sm text-gray-300 max-w-2xl">
                      {/* Show target user if present */}
                      {log.targetUserEmail && (
                        <p className="font-medium text-blue-300 mb-1">
                          Target: <span className="text-yellow-400">{log.targetUserEmail}</span>
                        </p>
                      )}
                      {/* Show details with word break for long text */}
                      <p className="break-words whitespace-pre-wrap">{log.details || 'No details'}</p>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Cursor-based Pagination — reads up to 200 docs per collection per page */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-700">
          <p className="text-sm text-gray-400">
            Page&nbsp;{pageIndex + 1}&nbsp;·&nbsp;
            Showing {currentLogs.length}&nbsp;log{currentLogs.length !== 1 ? 's' : ''}
            &nbsp;(max 400 per page — use Next to see more)
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={goPrevPage}
              disabled={pageIndex === 0 || pageLoading}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-sm text-gray-300 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" /> Previous
            </button>
            <span className="text-sm text-gray-500 px-1">Page {pageIndex + 1}</span>
            <button
              onClick={goNextPage}
              disabled={!hasNextPage || pageLoading}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-sm text-gray-300 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SystemLogsNew;
