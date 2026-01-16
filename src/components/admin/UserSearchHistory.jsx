import { useState, useEffect } from 'react';
import { collection, query, where, orderBy, getDocs, limit } from 'firebase/firestore';
import { db } from '../../firebase';
import { Search, Download, Calendar, MapPin, TrendingUp, X, FileSpreadsheet } from 'lucide-react';
import ExcelJS from 'exceljs';

/**
 * UserSearchHistory Component
 * Shows complete search history and allows exporting leads
 */
const UserSearchHistory = ({ user, onClose }) => {
  const [searches, setSearches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // 'all', 'today', 'week', 'month'

  useEffect(() => {
    fetchSearchHistory();
  }, [user.id, filter]);

  const fetchSearchHistory = async () => {
    try {
      setLoading(true);
      
      // Calculate date filter
      let dateFilter = null;
      const now = new Date();
      if (filter === 'today') {
        dateFilter = new Date(now.setHours(0, 0, 0, 0));
      } else if (filter === 'week') {
        dateFilter = new Date(now.setDate(now.getDate() - 7));
      } else if (filter === 'month') {
        dateFilter = new Date(now.setDate(now.getDate() - 30));
      }

      // Build query
      let q = query(
        collection(db, 'searchLogs'),
        where('userId', '==', user.id),
        orderBy('timestamp', 'desc'),
        limit(100)
      );

      const snapshot = await getDocs(q);
      const searchData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp?.toDate() || new Date()
      }));

      // Apply client-side date filter if needed
      const filtered = dateFilter
        ? searchData.filter(s => s.timestamp >= dateFilter)
        : searchData;

      setSearches(filtered);
    } catch (error) {
      console.error('Error fetching search history:', error);
    } finally {
      setLoading(false);
    }
  };

  const exportToExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Search History');

    // Define columns
    worksheet.columns = [
      { header: 'Date & Time', key: 'timestamp', width: 20 },
      { header: 'Keywords', key: 'keyword', width: 30 },
      { header: 'Location', key: 'location', width: 25 },
      { header: 'Results', key: 'resultCount', width: 12 },
      { header: 'Credits Used', key: 'creditsUsed', width: 15 },
      { header: 'Response Time (ms)', key: 'responseTime', width: 18 },
      { header: 'Success', key: 'success', width: 12 }
    ];

    // Style header
    worksheet.getRow(1).font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' }
    };
    worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

    // Add data
    searches.forEach((search, index) => {
      const row = worksheet.addRow({
        timestamp: search.timestamp.toLocaleString(),
        keyword: search.keyword || 'N/A',
        location: search.location || 'N/A',
        resultCount: search.resultCount || 0,
        creditsUsed: search.creditsUsed || 0,
        responseTime: search.responseTime || 0,
        success: search.success ? 'Yes' : 'No'
      });

      // Alternate row colors
      if (index % 2 === 0) {
        row.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF2F2F2' }
        };
      }

      // Add borders
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFD3D3D3' } },
          left: { style: 'thin', color: { argb: 'FFD3D3D3' } },
          bottom: { style: 'thin', color: { argb: 'FFD3D3D3' } },
          right: { style: 'thin', color: { argb: 'FFD3D3D3' } }
        };
      });
    });

    // Generate file
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `search-history-${user.email}-${new Date().toISOString().slice(0, 10)}.xlsx`;
    link.click();
    window.URL.revokeObjectURL(url);
  };

  const totalCreditsUsed = searches.reduce((sum, s) => sum + (s.creditsUsed || 0), 0);
  const totalResults = searches.reduce((sum, s) => sum + (s.resultCount || 0), 0);
  const successRate = searches.length > 0
    ? ((searches.filter(s => s.success).length / searches.length) * 100).toFixed(1)
    : 0;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-xl max-w-6xl w-full max-h-[90vh] border border-slate-700 shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-600 rounded-full flex items-center justify-center">
              <Search className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Search History</h2>
              <p className="text-sm text-gray-400">{user.email}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Stats */}
        <div className="p-6 border-b border-slate-700">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="bg-slate-900/50 rounded-lg p-4">
              <p className="text-sm text-gray-400 mb-1">Total Searches</p>
              <p className="text-2xl font-bold text-white">{searches.length}</p>
            </div>
            <div className="bg-slate-900/50 rounded-lg p-4">
              <p className="text-sm text-gray-400 mb-1">Total Results</p>
              <p className="text-2xl font-bold text-white">{totalResults.toLocaleString()}</p>
            </div>
            <div className="bg-slate-900/50 rounded-lg p-4">
              <p className="text-sm text-gray-400 mb-1">Credits Used</p>
              <p className="text-2xl font-bold text-white">{totalCreditsUsed}</p>
            </div>
            <div className="bg-slate-900/50 rounded-lg p-4">
              <p className="text-sm text-gray-400 mb-1">Success Rate</p>
              <p className="text-2xl font-bold text-white">{successRate}%</p>
            </div>
          </div>
        </div>

        {/* Filters and Export */}
        <div className="p-6 border-b border-slate-700 flex flex-wrap gap-4 items-center justify-between">
          <div className="flex gap-2">
            {['all', 'today', 'week', 'month'].map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  filter === f
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-900 text-gray-300 hover:bg-slate-700'
                }`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
          <button
            onClick={exportToExcel}
            disabled={searches.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Export to Excel
          </button>
        </div>

        {/* Search List */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                <p className="text-gray-400">Loading search history...</p>
              </div>
            </div>
          ) : searches.length === 0 ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <Search className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                <p className="text-gray-400">No search history found</p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {searches.map((search) => (
                <div
                  key={search.id}
                  className="bg-slate-900/50 rounded-lg p-4 border border-slate-700 hover:border-slate-600 transition-colors"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-white font-medium truncate">
                          {search.keyword || 'Unknown keyword'}
                        </span>
                        {search.success ? (
                          <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-xs rounded-full border border-green-500/50">
                            Success
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-red-500/20 text-red-400 text-xs rounded-full border border-red-500/50">
                            Failed
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-4 text-sm text-gray-400">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          {search.timestamp.toLocaleString()}
                        </span>
                        <span className="flex items-center gap-1">
                          <MapPin className="w-4 h-4" />
                          {search.location || 'No location'}
                        </span>
                        <span className="flex items-center gap-1">
                          <TrendingUp className="w-4 h-4" />
                          {search.resultCount || 0} results
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-400">Credits</p>
                      <p className="text-lg font-bold text-white">{search.creditsUsed || 0}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default UserSearchHistory;
