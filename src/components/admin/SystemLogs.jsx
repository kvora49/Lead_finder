import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, orderBy, limit, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { FileText, Download, Filter, Search, AlertCircle, User, Key, Database, Settings, Shield, Activity } from 'lucide-react';

/**
 * SystemLogs Component
 * Comprehensive audit trail and system activity monitoring
 * Features: Activity logs, filters, search, export
 */
const SystemLogs = () => {
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState([]);
  const [filteredLogs, setFilteredLogs] = useState([]);
  const [filters, setFilters] = useState({
    type: 'all',
    severity: 'all',
    search: ''
  });
  const [stats, setStats] = useState({
    total: 0,
    errors: 0,
    warnings: 0,
    info: 0
  });

  useEffect(() => {
    fetchLogs();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [filters, logs]);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      
      // Mock logs - replace with actual Firestore query
      const mockLogs = [
        {
          id: '1',
          timestamp: new Date(Date.now() - 300000),
          type: 'auth',
          severity: 'info',
          action: 'User Login',
          user: 'john.doe@example.com',
          details: 'Successful login from IP: 192.168.1.100',
          ip: '192.168.1.100',
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0'
        },
        {
          id: '2',
          timestamp: new Date(Date.now() - 600000),
          type: 'search',
          severity: 'info',
          action: 'Search Performed',
          user: 'jane.smith@example.com',
          details: 'Search query: "software engineer, New York" - 127 results',
          creditsUsed: 5
        },
        {
          id: '3',
          timestamp: new Date(Date.now() - 900000),
          type: 'admin',
          severity: 'warning',
          action: 'User Suspended',
          user: 'admin@company.com',
          details: 'Suspended user: suspicious@example.com - Reason: Unusual activity',
          targetUser: 'suspicious@example.com'
        },
        {
          id: '4',
          timestamp: new Date(Date.now() - 1200000),
          type: 'credit',
          severity: 'warning',
          action: 'Credit Limit Reached',
          user: 'heavy.user@example.com',
          details: 'User reached 100% of credit limit (1000/1000)'
        },
        {
          id: '5',
          timestamp: new Date(Date.now() - 1500000),
          type: 'system',
          severity: 'error',
          action: 'API Error',
          user: 'system',
          details: 'RapidAPI request failed: Rate limit exceeded',
          errorCode: 'RATE_LIMIT_EXCEEDED'
        },
        {
          id: '6',
          timestamp: new Date(Date.now() - 1800000),
          type: 'export',
          severity: 'info',
          action: 'Data Export',
          user: 'analyst@example.com',
          details: 'Exported 250 records to CSV',
          recordCount: 250
        },
        {
          id: '7',
          timestamp: new Date(Date.now() - 2100000),
          type: 'auth',
          severity: 'error',
          action: 'Failed Login',
          user: 'attacker@malicious.com',
          details: 'Failed login attempt - Invalid credentials',
          ip: '123.45.67.89',
          attempts: 5
        },
        {
          id: '8',
          timestamp: new Date(Date.now() - 2400000),
          type: 'database',
          severity: 'info',
          action: 'Database Backup',
          user: 'system',
          details: 'Automated backup completed successfully',
          size: '2.4 GB'
        },
        {
          id: '9',
          timestamp: new Date(Date.now() - 2700000),
          type: 'config',
          severity: 'warning',
          action: 'Settings Changed',
          user: 'admin@company.com',
          details: 'Updated API rate limit: 100 -> 150 requests/min'
        },
        {
          id: '10',
          timestamp: new Date(Date.now() - 3000000),
          type: 'security',
          severity: 'error',
          action: 'Security Alert',
          user: 'system',
          details: 'Detected potential SQL injection attempt from IP: 45.67.89.12',
          ip: '45.67.89.12',
          blocked: true
        }
      ];

      setLogs(mockLogs);
      setFilteredLogs(mockLogs);

      // Calculate stats
      setStats({
        total: mockLogs.length,
        errors: mockLogs.filter(l => l.severity === 'error').length,
        warnings: mockLogs.filter(l => l.severity === 'warning').length,
        info: mockLogs.filter(l => l.severity === 'info').length
      });

      setLoading(false);
    } catch (error) {
      console.error('Error fetching logs:', error);
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...logs];

    // Type filter
    if (filters.type !== 'all') {
      filtered = filtered.filter(log => log.type === filters.type);
    }

    // Severity filter
    if (filters.severity !== 'all') {
      filtered = filtered.filter(log => log.severity === filters.severity);
    }

    // Search filter
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      filtered = filtered.filter(log =>
        log.action.toLowerCase().includes(searchLower) ||
        log.user.toLowerCase().includes(searchLower) ||
        log.details.toLowerCase().includes(searchLower)
      );
    }

    setFilteredLogs(filtered);
  };

  const exportLogs = () => {
    const csvData = [
      ['Timestamp', 'Type', 'Severity', 'Action', 'User', 'Details'],
      ...filteredLogs.map(log => [
        log.timestamp.toISOString(),
        log.type,
        log.severity,
        log.action,
        log.user,
        log.details.replace(/"/g, '""') // Escape quotes
      ])
    ].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');

    const blob = new Blob([csvData], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `system-logs-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const getTypeIcon = (type) => {
    switch (type) {
      case 'auth': return <User className="w-4 h-4" />;
      case 'search': return <Search className="w-4 h-4" />;
      case 'admin': return <Shield className="w-4 h-4" />;
      case 'credit': return <Key className="w-4 h-4" />;
      case 'system': return <Settings className="w-4 h-4" />;
      case 'export': return <Download className="w-4 h-4" />;
      case 'database': return <Database className="w-4 h-4" />;
      case 'config': return <Settings className="w-4 h-4" />;
      case 'security': return <Shield className="w-4 h-4" />;
      default: return <Activity className="w-4 h-4" />;
    }
  };

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'error': return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'warning': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      case 'info': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      default: return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
    }
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
          <h1 className="text-2xl font-bold text-white">System Logs</h1>
          <p className="text-slate-400 mt-1">Comprehensive audit trail and activity monitoring</p>
        </div>
        <button 
          onClick={exportLogs}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-2"
        >
          <Download className="w-4 h-4" />
          Export Logs
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-400 text-sm">Total Logs</p>
              <p className="text-2xl font-bold text-white mt-1">{stats.total}</p>
            </div>
            <div className="p-3 bg-blue-500/10 rounded-lg">
              <FileText className="w-6 h-6 text-blue-400" />
            </div>
          </div>
        </div>

        <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-400 text-sm">Errors</p>
              <p className="text-2xl font-bold text-white mt-1">{stats.errors}</p>
            </div>
            <div className="p-3 bg-red-500/10 rounded-lg">
              <AlertCircle className="w-6 h-6 text-red-400" />
            </div>
          </div>
        </div>

        <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-400 text-sm">Warnings</p>
              <p className="text-2xl font-bold text-white mt-1">{stats.warnings}</p>
            </div>
            <div className="p-3 bg-yellow-500/10 rounded-lg">
              <AlertCircle className="w-6 h-6 text-yellow-400" />
            </div>
          </div>
        </div>

        <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-400 text-sm">Info</p>
              <p className="text-2xl font-bold text-white mt-1">{stats.info}</p>
            </div>
            <div className="p-3 bg-green-500/10 rounded-lg">
              <Activity className="w-6 h-6 text-green-400" />
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="text-slate-400 text-sm mb-2 block">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                placeholder="Search logs..."
                className="w-full pl-10 pr-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="text-slate-400 text-sm mb-2 block">Type</label>
            <select
              value={filters.type}
              onChange={(e) => setFilters({ ...filters, type: e.target.value })}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Types</option>
              <option value="auth">Authentication</option>
              <option value="search">Search</option>
              <option value="admin">Admin Actions</option>
              <option value="credit">Credits</option>
              <option value="system">System</option>
              <option value="export">Export</option>
              <option value="database">Database</option>
              <option value="config">Configuration</option>
              <option value="security">Security</option>
            </select>
          </div>

          <div>
            <label className="text-slate-400 text-sm mb-2 block">Severity</label>
            <select
              value={filters.severity}
              onChange={(e) => setFilters({ ...filters, severity: e.target.value })}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Severities</option>
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="error">Error</option>
            </select>
          </div>

          <div className="flex items-end">
            <button
              onClick={() => setFilters({ type: 'all', severity: 'all', search: '' })}
              className="w-full px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <Filter className="w-4 h-4" />
              Clear Filters
            </button>
          </div>
        </div>

        <div className="mt-4 text-sm text-slate-400">
          Showing {filteredLogs.length} of {logs.length} logs
        </div>
      </div>

      {/* Logs List */}
      <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6">
        <div className="space-y-3">
          {filteredLogs.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No logs found matching your filters</p>
            </div>
          ) : (
            filteredLogs.map(log => (
              <div
                key={log.id}
                className={`
                  p-4 rounded-lg border
                  ${log.severity === 'error' ? 'bg-red-500/5 border-red-500/20' :
                    log.severity === 'warning' ? 'bg-yellow-500/5 border-yellow-500/20' :
                    'bg-slate-900/50 border-slate-700/50'}
                  hover:border-slate-600 transition-colors
                `}
              >
                <div className="flex items-start gap-4">
                  <div className={`
                    p-2 rounded-lg
                    ${log.severity === 'error' ? 'bg-red-500/20 text-red-400' :
                      log.severity === 'warning' ? 'bg-yellow-500/20 text-yellow-400' :
                      'bg-blue-500/20 text-blue-400'}
                  `}>
                    {getTypeIcon(log.type)}
                  </div>

                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-white font-medium">{log.action}</span>
                      <span className={`px-2 py-0.5 rounded text-xs border ${getSeverityColor(log.severity)}`}>
                        {log.severity.toUpperCase()}
                      </span>
                      <span className="px-2 py-0.5 bg-slate-700/50 text-slate-300 rounded text-xs">
                        {log.type}
                      </span>
                    </div>
                    
                    <p className="text-slate-300 text-sm mb-2">{log.details}</p>
                    
                    <div className="flex items-center gap-4 text-xs text-slate-500">
                      <span className="flex items-center gap-1">
                        <User className="w-3 h-3" />
                        {log.user}
                      </span>
                      <span className="flex items-center gap-1">
                        <Activity className="w-3 h-3" />
                        {log.timestamp.toLocaleString()}
                      </span>
                      {log.ip && (
                        <span>IP: {log.ip}</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default SystemLogs;
