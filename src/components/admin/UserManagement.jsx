import { useState, useEffect } from 'react';
import { 
  Search, 
  Filter, 
  MoreVertical,
  Eye,
  Edit,
  Ban,
  CheckCircle,
  XCircle,
  Download,
  Mail,
  Calendar,
  Activity,
  DollarSign,
  History,
  UserCheck
} from 'lucide-react';
import { collection, getDocs, doc, updateDoc, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAdminAuth } from '../../contexts/AdminAuthContext';
import UserDetailsModal from './UserDetailsModal';
import CreditManagementModal from './CreditManagementModal';
import UserSearchHistory from './UserSearchHistory';

const UserManagement = () => {
  const { adminUser } = useAdminAuth();
  const [users, setUsers] = useState([]);
  const [filteredUsers, setFilteredUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterRole, setFilterRole] = useState('all');
  const [selectedUser, setSelectedUser] = useState(null);
  const [showUserModal, setShowUserModal] = useState(false);
  const [showCreditModal, setShowCreditModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [usersPerPage] = useState(50); // Show 50 users per page
  const [totalUsers, setTotalUsers] = useState(0);

  useEffect(() => {
    const unsubscribers = [];
    
    // Set up real-time listener for user credits (more efficient)
    const creditsMap = {};
    const creditsUnsubscribe = onSnapshot(collection(db, 'userCredits'), (snapshot) => {
      snapshot.forEach(doc => {
        const data = doc.data();
        creditsMap[doc.id] = {
          creditsUsed: data.creditsUsed || 0,
          totalApiCalls: data.totalApiCalls || 0,
          lastUsed: data.lastUsed
        };
      });
    });
    unsubscribers.push(creditsUnsubscribe);
    
    // Set up real-time listener for users
    const usersUnsubscribe = onSnapshot(
      query(collection(db, 'users'), orderBy('createdAt', 'desc')),
      (usersSnapshot) => {
        try {
          const usersData = usersSnapshot.docs.map(userDoc => {
            const userData = userDoc.data();
            const creditData = creditsMap[userDoc.id] || {};
            
            return {
              id: userDoc.id,
              email: userData.email || 'N/A',
              displayName: userData.displayName || userData.email?.split('@')[0] || 'N/A',
              createdAt: userData.createdAt?.toDate() || new Date(),
              lastActive: userData.lastActive?.toDate() || new Date(),
              creditsUsed: creditData.creditsUsed || 0,
              creditLimit: userData.creditLimit || null,
              status: userData.accountStatus || 'active',
              emailVerified: userData.emailVerified || false,
              role: userData.role || 'user'
            };
          });

          setUsers(usersData);
          setTotalUsers(usersData.length);
          setLoading(false);
        } catch (error) {
          console.error('Error processing users:', error);
          setLoading(false);
        }
      }
    );
    unsubscribers.push(usersUnsubscribe);

    // Cleanup listeners on unmount
    return () => unsubscribers.forEach(unsub => unsub());
  }, []);

  useEffect(() => {
    filterUsers();
    setCurrentPage(1); // Reset to first page when filters change
  }, [searchTerm, filterStatus, filterRole, users]);

  const filterUsers = () => {
    let filtered = users;

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(user =>
        user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.id.includes(searchTerm)
      );
    }

    // Status filter
    if (filterStatus !== 'all') {
      filtered = filtered.filter(user => user.status === filterStatus);
    }

    // Role filter
    if (filterRole !== 'all') {
      filtered = filtered.filter(user => user.role === filterRole);
    }

    setFilteredUsers(filtered);
  };

  const handleViewUser = (user) => {
    setSelectedUser(user);
    setShowUserModal(true);
  };

  const handleSuspendUser = async (userId) => {
    if (window.confirm('Are you sure you want to suspend this user?')) {
      try {
        const userRef = doc(db, 'users', userId);
        await updateDoc(userRef, {
          accountStatus: 'suspended',
          suspendedAt: new Date()
        });
        // Real-time listener will update the UI automatically
      } catch (error) {
        console.error('Error suspending user:', error);
        alert('Failed to suspend user');
      }
    }
  };

  const handleActivateUser = async (userId) => {
    try {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        accountStatus: 'active',
        suspendedAt: null
      });
      // Real-time listener will update the UI automatically
    } catch (error) {
      console.error('Error activating user:', error);
      alert('Failed to activate user');
    }
  };

  const handleLoginAsUser = (user) => {
    if (window.confirm(`Login as ${user.email}? You will see the application from their perspective.\n\nTo return to admin view, click "Exit Admin Mode" in the header.`)) {
      // Store current admin session
      sessionStorage.setItem('adminImpersonation', JSON.stringify({
        adminUid: adminUser?.uid,
        adminEmail: adminUser?.email,
        targetUserId: user.id,
        targetUserEmail: user.email,
        timestamp: new Date().toISOString()
      }));
      
      // Redirect to main app with impersonation flag
      window.location.href = `/?impersonate=${user.id}`;
    }
  };

  const exportToCSV = () => {
    const csvData = filteredUsers.map(user => ({
      'User ID': user.id,
      'Email': user.email,
      'Display Name': user.displayName,
      'Credits Used': user.creditsUsed,
      'Credit Limit': user.creditLimit || 'Unlimited',
      'Status': user.status,
      'Email Verified': user.emailVerified ? 'Yes' : 'No'
    }));

    const headers = Object.keys(csvData[0]);
    const csvContent = [
      headers.join(','),
      ...csvData.map(row => headers.map(header => row[header]).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `users-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  const getStatusBadge = (status) => {
    const styles = {
      active: 'bg-green-500/20 text-green-400 border-green-500/50',
      suspended: 'bg-red-500/20 text-red-400 border-red-500/50',
      pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50'
    };

    const icons = {
      active: <CheckCircle className="w-4 h-4" />,
      suspended: <Ban className="w-4 h-4" />,
      pending: <Activity className="w-4 h-4" />
    };

    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${styles[status]}`}>
        {icons[status]}
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  const getRoleBadge = (role) => {
    const styles = {
      user: 'bg-blue-500/20 text-blue-400 border-blue-500/50',
      admin: 'bg-purple-500/20 text-purple-400 border-purple-500/50',
      super_admin: 'bg-orange-500/20 text-orange-400 border-orange-500/50'
    };

    const labels = {
      user: 'User',
      admin: 'Admin',
      super_admin: 'Super Admin'
    };

    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${styles[role || 'user']}`}>
        {labels[role || 'user']}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-400">Loading users...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">User Management</h1>
          <p className="text-gray-400">
            Showing {Math.min((currentPage - 1) * usersPerPage + 1, filteredUsers.length)}-
            {Math.min(currentPage * usersPerPage, filteredUsers.length)} of {filteredUsers.length} users
            {totalUsers !== filteredUsers.length && ` (filtered from ${totalUsers} total)`}
          </p>
        </div>
        <button
          onClick={exportToCSV}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
        >
          <Download className="w-5 h-5" />
          Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-xl p-4">
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Search */}
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by email, name, or ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-gray-300 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-gray-400" />
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="pending">Pending</option>
            </select>
          </div>

          {/* Role Filter */}
          <div className="flex items-center gap-2">
            <select
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value)}
              className="px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Roles</option>
              <option value="user">Users</option>
              <option value="admin">Admins</option>
              <option value="super_admin">Super Admins</option>
            </select>
          </div>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-900/50">
              <tr className="border-b border-slate-700">
                <th className="text-left px-6 py-4 text-sm font-semibold text-gray-300">User</th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-gray-300">Role</th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-gray-300">Credits</th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-gray-300">Limit</th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-gray-300">Status</th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-gray-300">Last Active</th>
                <th className="text-right px-6 py-4 text-sm font-semibold text-gray-300">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {filteredUsers
                .slice((currentPage - 1) * usersPerPage, currentPage * usersPerPage)
                .map((user) => (
                <tr key={user.id} className="hover:bg-slate-900/30 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                        <span className="text-white font-semibold text-sm">
                          {user.email[0].toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <p className="text-white font-medium">{user.displayName}</p>
                        <p className="text-gray-400 text-sm">{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {getRoleBadge(user.role)}
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-white font-medium">{user.creditsUsed}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-gray-300">
                      {user.creditLimit || 'Unlimited'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {getStatusBadge(user.status)}
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-gray-400 text-sm">
                      {new Date(user.lastActive).toLocaleDateString()}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleViewUser(user)}
                        className="p-2 text-blue-400 hover:bg-blue-500/20 rounded-lg transition-colors"
                        title="View Details"
                      >
                        <Eye className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => {
                          setSelectedUser(user);
                          setShowCreditModal(true);
                        }}
                        className="p-2 text-green-400 hover:bg-green-500/20 rounded-lg transition-colors"
                        title="Manage Credits"
                      >
                        <DollarSign className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => {
                          setSelectedUser(user);
                          setShowHistoryModal(true);
                        }}
                        className="p-2 text-purple-400 hover:bg-purple-500/20 rounded-lg transition-colors"
                        title="View Search History"
                      >
                        <History className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => handleLoginAsUser(user)}
                        className="p-2 text-yellow-400 hover:bg-yellow-500/20 rounded-lg transition-colors"
                        title="Login As User"
                      >
                        <UserCheck className="w-5 h-5" />
                      </button>
                      {user.status === 'active' ? (
                        <button
                          onClick={() => handleSuspendUser(user.id)}
                          className="p-2 text-red-400 hover:bg-red-500/20 rounded-lg transition-colors"
                          title="Suspend User"
                        >
                          <Ban className="w-5 h-5" />
                        </button>
                      ) : (
                        <button
                          onClick={() => handleActivateUser(user.id)}
                          className="p-2 text-green-400 hover:bg-green-500/20 rounded-lg transition-colors"
                          title="Activate User"
                        >
                          <CheckCircle className="w-5 h-5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination Controls */}
      {filteredUsers.length > usersPerPage && (
        <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-xl p-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-gray-400 text-sm">
              Page {currentPage} of {Math.ceil(filteredUsers.length / usersPerPage)}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-gray-300 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                First
              </button>
              <button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-gray-300 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Previous
              </button>
              
              {/* Page Numbers */}
              <div className="flex gap-1">
                {Array.from({ length: Math.min(5, Math.ceil(filteredUsers.length / usersPerPage)) }, (_, i) => {
                  const totalPages = Math.ceil(filteredUsers.length / usersPerPage);
                  let pageNum;
                  
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (currentPage <= 3) {
                    pageNum = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = currentPage - 2 + i;
                  }
                  
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setCurrentPage(pageNum)}
                      className={`px-3 py-2 rounded-lg transition-colors ${
                        currentPage === pageNum
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-900 border border-slate-700 text-gray-300 hover:bg-slate-800'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>
              
              <button
                onClick={() => setCurrentPage(prev => Math.min(Math.ceil(filteredUsers.length / usersPerPage), prev + 1))}
                disabled={currentPage === Math.ceil(filteredUsers.length / usersPerPage)}
                className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-gray-300 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Next
              </button>
              <button
                onClick={() => setCurrentPage(Math.ceil(filteredUsers.length / usersPerPage))}
                disabled={currentPage === Math.ceil(filteredUsers.length / usersPerPage)}
                className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-gray-300 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Last
              </button>
            </div>
            
            {/* Users per page selector */}
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <span>Show:</span>
              <select
                value={usersPerPage}
                onChange={(e) => {
                  setCurrentPage(1);
                  // Note: usersPerPage is const, so this won't work unless we make it state
                  // For now, it's fixed at 50. To make dynamic, change useState line.
                }}
                disabled
                className="px-3 py-1 bg-slate-900 border border-slate-700 rounded-lg text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="25">25</option>
                <option value="50">50</option>
                <option value="100">100</option>
              </select>
              <span>per page</span>
            </div>
          </div>
        </div>
      )}

      {/* User Details Modal */}
      {showUserModal && selectedUser && (
        <UserDetailsModal
          user={selectedUser}
          onClose={() => {
            setShowUserModal(false);
            setSelectedUser(null);
          }}
        />
      )}

      {/* Credit Management Modal */}
      {showCreditModal && selectedUser && (
        <CreditManagementModal
          user={selectedUser}
          adminUser={adminUser}
          onClose={() => {
            setShowCreditModal(false);
            setSelectedUser(null);
          }}
          onSuccess={() => {
            // Real-time listener will update automatically
          }}
        />
      )}

      {/* Search History Modal */}
      {showHistoryModal && selectedUser && (
        <UserSearchHistory
          user={selectedUser}
          onClose={() => {
            setShowHistoryModal(false);
            setSelectedUser(null);
          }}
        />
      )}
    </div>
  );
};

export default UserManagement;
