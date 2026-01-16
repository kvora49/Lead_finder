import { useState, useEffect } from 'react';
import { collection, query, orderBy, getDocs, doc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { BookmarkCheck, Download, Trash2, Search, Calendar, MapPin, ChevronRight, FileSpreadsheet, Loader2 } from 'lucide-react';
import ExcelJS from 'exceljs';
import { useNavigate } from 'react-router-dom';

/**
 * MyLists Component
 * View and manage all saved lead lists
 */
const MyLists = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [lists, setLists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedList, setSelectedList] = useState(null);
  const [exporting, setExporting] = useState(null);

  useEffect(() => {
    if (currentUser) {
      fetchLists();
    }
  }, [currentUser]);

  const fetchLists = async () => {
    try {
      const listsRef = collection(db, 'savedLists', currentUser.uid, 'lists');
      const q = query(listsRef, orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      
      const listsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate() || new Date()
      }));
      
      setLists(listsData);
    } catch (error) {
      console.error('Error fetching lists:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (listId) => {
    if (window.confirm('Are you sure you want to delete this list?')) {
      try {
        await deleteDoc(doc(db, 'savedLists', currentUser.uid, 'lists', listId));
        setLists(lists.filter(l => l.id !== listId));
        if (selectedList?.id === listId) {
          setSelectedList(null);
        }
      } catch (error) {
        console.error('Error deleting list:', error);
        alert('Failed to delete list');
      }
    }
  };

  const exportToExcel = async (list) => {
    setExporting(list.id);
    
    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Leads');

      // Define columns
      worksheet.columns = [
        { header: 'Business Name', key: 'name', width: 30 },
        { header: 'Address', key: 'address', width: 40 },
        { header: 'Phone', key: 'phone', width: 15 },
        { header: 'Rating', key: 'rating', width: 10 },
        { header: 'Total Ratings', key: 'totalRatings', width: 12 },
        { header: 'Website', key: 'website', width: 30 },
        { header: 'Status', key: 'status', width: 15 },
        { header: 'Place ID', key: 'placeId', width: 30 }
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
      list.leads.forEach((lead, index) => {
        const row = worksheet.addRow({
          name: lead.name || 'N/A',
          address: lead.formatted_address || 'N/A',
          phone: lead.formatted_phone_number || 'N/A',
          rating: lead.rating || 'N/A',
          totalRatings: lead.user_ratings_total || 0,
          website: lead.website || 'N/A',
          status: lead.business_status || 'N/A',
          placeId: lead.place_id || ''
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
      link.download = `${list.name.replace(/[^a-z0-9]/gi, '-')}-${new Date().toISOString().slice(0, 10)}.xlsx`;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      alert('Failed to export list');
    } finally {
      setExporting(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading your lists...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold text-gray-900 mb-2">
                My Lists
              </h1>
              <p className="text-gray-600 text-lg">
                {lists.length} saved {lists.length === 1 ? 'list' : 'lists'}
              </p>
            </div>
            <button
              onClick={() => navigate('/')}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              Back to Search
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {lists.length === 0 ? (
          <div className="bg-white rounded-xl shadow-lg p-12 text-center">
            <BookmarkCheck className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-800 mb-2">No saved lists yet</h2>
            <p className="text-gray-600 mb-6">
              Start searching for leads and save them to create your first list
            </p>
            <button
              onClick={() => navigate('/')}
              className="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white rounded-lg transition-colors"
            >
              Start Searching
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
            {lists.map((list) => (
              <div
                key={list.id}
                className="bg-white rounded-xl shadow-lg hover:shadow-xl transition-shadow p-6 cursor-pointer"
                onClick={() => setSelectedList(list)}
              >
                {/* List Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="text-xl font-bold text-gray-800 mb-2">
                      {list.name}
                    </h3>
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <Calendar className="w-4 h-4" />
                      {list.createdAt.toLocaleDateString()}
                    </div>
                  </div>
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                    <BookmarkCheck className="w-6 h-6 text-white" />
                  </div>
                </div>

                {/* List Details */}
                <div className="space-y-2 mb-4">
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Search className="w-4 h-4" />
                    <span>{list.searchQuery.keyword}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <MapPin className="w-4 h-4" />
                    <span>{list.searchQuery.location}</span>
                  </div>
                </div>

                {/* Stats */}
                <div className="bg-gray-50 rounded-lg p-3 mb-4">
                  <p className="text-center">
                    <span className="text-2xl font-bold text-blue-600">{list.totalLeads}</span>
                    <span className="text-gray-600 text-sm ml-2">leads</span>
                  </p>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      exportToExcel(list);
                    }}
                    disabled={exporting === list.id}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors disabled:opacity-50"
                  >
                    {exporting === list.id ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Exporting...
                      </>
                    ) : (
                      <>
                        <FileSpreadsheet className="w-4 h-4" />
                        Export
                      </>
                    )}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(list.id);
                    }}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* List Viewer Modal */}
      {selectedList && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-6xl w-full max-h-[90vh] overflow-hidden shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <div>
                <h2 className="text-2xl font-bold text-gray-800">{selectedList.name}</h2>
                <p className="text-gray-600">{selectedList.totalLeads} leads</p>
              </div>
              <button
                onClick={() => setSelectedList(null)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {selectedList.leads.map((lead, index) => (
                  <div key={index} className="bg-gray-50 rounded-lg p-4 hover:bg-gray-100 transition-colors">
                    <h4 className="font-bold text-gray-800 mb-2">{lead.name}</h4>
                    <p className="text-sm text-gray-600 mb-2">{lead.formatted_address}</p>
                    {lead.formatted_phone_number && (
                      <p className="text-sm text-blue-600">{lead.formatted_phone_number}</p>
                    )}
                    {lead.rating && (
                      <p className="text-sm text-gray-600 mt-2">
                        ⭐ {lead.rating} ({lead.user_ratings_total} reviews)
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex gap-3 p-6 border-t border-gray-200">
              <button
                onClick={() => setSelectedList(null)}
                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg transition-colors"
              >
                Close
              </button>
              <button
                onClick={() => exportToExcel(selectedList)}
                disabled={exporting === selectedList.id}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {exporting === selectedList.id ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Exporting...
                  </>
                ) : (
                  <>
                    <FileSpreadsheet className="w-4 h-4" />
                    Export to Excel
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MyLists;
