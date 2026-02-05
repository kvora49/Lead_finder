import { useState, useEffect } from 'react';
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
import { collection, getDocs, query, orderBy, limit, where, Timestamp } from 'firebase/firestore';
import { db } from '../../firebase';

const SystemLogsNew = () => {
  const [logs, setLogs] = useState([]);
  const [filteredLogs, setFilteredLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState('all');
  const [filterSeverity, setFilterSeverity] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [dateRange, setDateRange] = useState('7days');
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [logsPerPage] = useState(50);

  const [stats, setStats] = useState({
    total: 0,
    info: 0,
    success: 0,
    warning: 0,
    error: 0
  });

  useEffect(() => {
    loadSystemLogs();
  }, [dateRange]);

  useEffect(() => {
    filterLogs();
  }, [logs, filterType, filterSeverity, searchTerm]);

  const loadSystemLogs = async () => {
    setLoading(true);
    try {
      // Calculate date range
      const now = new Date();
      let startDate = new Date();
      
      switch(dateRange) {
        case '24hours':
          startDate.setHours(now.getHours() - 24);
          break;
        case '7days':
          startDate.setDate(now.getDate() - 7);
          break;
        case '30days':
          startDate.setDate(now.getDate() - 30);
          break;
        default:
          startDate.setDate(now.getDate() - 7);
      }

      // Fetch admin activity logs
      const adminLogsRef = collection(db, 'adminActivityLogs');
      const q = query(
        adminLogsRef,
        where('timestamp', '>=', Timestamp.fromDate(startDate)),
        orderBy('timestamp', 'desc'),
        limit(500)
      );
      
      const snapshot = await getDocs(q);
      const logsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp?.toDate() || new Date(),
        type: determineLogType(doc.data().action),
        severity: determineSeverity(doc.data().action)
      }));

      setLogs(logsData);
      calculateStats(logsData);
      
      setLoading(false);
    } catch (error) {
      console.error('Error loading system logs:', error);
      setLoading(false);
    }
  };

  const determineLogType = (action) => {
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
    setCurrentPage(1);
  };

  const exportLogs = () => {
    const csvContent = [
      ['System Logs Report', `Generated: ${new Date().toLocaleString()}`].join(','),
      ['Date Range', dateRange].join(','),
      [],
      ['Timestamp', 'Admin', 'Action', 'Type', 'Severity', 'Details'].join(','),
      ...filteredLogs.map(log => [
        log.timestamp.toLocaleString(),
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

  // Pagination
  const indexOfLastLog = currentPage * logsPerPage;
  const indexOfFirstLog = indexOfLastLog - logsPerPage;
  const currentLogs = filteredLogs.slice(indexOfFirstLog, indexOfLastLog);
  const totalPages = Math.ceil(filteredLogs.length / logsPerPage);

  const StatCard = ({ icon: Icon, label, value, color }) => (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4 hover:bg-slate-800/70 transition-all">
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
    </div>
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
      credit: 'bg-green-500/20 text-green-400 border-green-500/30',
      user: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      api: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
      system: 'bg-gray-500/20 text-gray-400 border-gray-500/30'
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
        <StatCard icon={FileText} label="Total Logs" value={stats.total} color="blue" />
        <StatCard icon={Info} label="Info" value={stats.info} color="blue" />
        <StatCard icon={CheckCircle} label="Success" value={stats.success} color="green" />
        <StatCard icon={AlertTriangle} label="Warning" value={stats.warning} color="yellow" />
        <StatCard icon={XCircle} label="Error" value={stats.error} color="red" />
      </div>

      {/* Filters */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-900/50 border-b border-slate-700">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Timestamp</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Admin</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Action</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Severity</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {currentLogs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="px-4 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2 text-sm text-gray-300">
                      <Clock className="w-4 h-4 text-gray-400" />
                      <div>
                        <div>{log.timestamp.toLocaleDateString()}</div>
                        <div className="text-xs text-gray-500">{log.timestamp.toLocaleTimeString()}</div>
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
                    <p className="text-sm text-gray-400 max-w-md truncate">{log.details || 'No details'}</p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-slate-700">
            <div className="text-sm text-gray-400">
              Showing {indexOfFirstLog + 1} to {Math.min(indexOfLastLog, filteredLogs.length)} of {filteredLogs.length} logs
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="p-2 hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-gray-400 hover:text-white"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <span className="text-sm text-gray-300">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className="p-2 hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-gray-400 hover:text-white"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SystemLogsNew;
