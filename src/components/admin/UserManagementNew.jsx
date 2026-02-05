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
  History,
  UserCheck,
  UserX,
  Clock,
  TrendingUp,
  Shield,
  Plus,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  BarChart3
} from 'lucide-react';
import { collection, getDocs, doc, updateDoc, query, orderBy, onSnapshot, setDoc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAdminAuth } from '../../contexts/AdminAuthContext';
import { logAdminAction } from '../../services/analyticsService';

const UserManagementNew = () => {
  const { adminUser } = useAdminAuth();
  const [users, setUsers] = useState([]);
  const [filteredUsers, setFilteredUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterRole, setFilterRole] = useState('all');
  const [selectedUser, setSelectedUser] = useState(null);
  const [showUserDetails, setShowUserDetails] = useState(false);
  const [showCreditControl, setShowCreditControl] = useState(false);
  const [bulkSelected, setBulkSelected] = useState([]);
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [usersPerPage] = useState(20);

  // Stats
  const [userStats, setUserStats] = useState({
    total: 0,
    active: 0,
    pending: 0,
    suspended: 0,
    unlimited: 0,
    limited: 0
  });

  useEffect(() => {
    if (!adminUser) {
      console.warn('Admin user not authenticated');
      setError('Not authenticated as admin');
      setLoading(false);
      return;
    }

    console.log('Starting user data load...');
    const unsubscribers = [];
    
    let creditsMap = {}; // Shared state
    
    // First, get all credit data
    const creditsUnsubscribe = onSnapshot(
      collection(db, 'userCredits'),
      (snapshot) => {
        console.log('Credits update received:', snapshot.docs.length, 'records');
        creditsMap = {}; // Reset map
        snapshot.forEach(doc => {
          creditsMap[doc.id] = {
            creditsUsed: doc.data().creditsUsed || 0,
            totalApiCalls: doc.data().totalApiCalls || 0,
            lastUsed: doc.data().lastUsed,
            creditLimit: doc.data().creditLimit || 'unlimited'
          };
        });
        console.log('CreditsMap updated:', Object.keys(creditsMap).length, 'users with credit data');
      },
      (error) => {
        console.error('Credits listener error:', error);
        // Don't fail - just continue with empty credits
      }
    );
    unsubscribers.push(creditsUnsubscribe);
    
    // Users listener - will use creditsMap
    const usersUnsubscribe = onSnapshot(
      query(collection(db, 'users'), orderBy('createdAt', 'desc')),
      (usersSnapshot) => {
        try {
          console.log('Users update received:', usersSnapshot.docs.length, 'total docs');
          
          const usersData = usersSnapshot.docs
            .filter(userDoc => {
              const userData = userDoc.data();
              const role = userData.role || 'user';
              return role === 'user'; // Only include regular users, not admins
            })
            .map(userDoc => {
              try {
                const userData = userDoc.data();
                const creditData = creditsMap[userDoc.id] || { creditsUsed: 0, totalApiCalls: 0, creditLimit: 'unlimited' };
                
                return {
                  id: userDoc.id,
                  email: userData.email || 'N/A',
                  displayName: userData.displayName || userData.email?.split('@')[0] || 'N/A',
                  createdAt: userData.createdAt?.toDate ? userData.createdAt.toDate() : new Date(),
                  lastActive: userData.lastActive?.toDate ? userData.lastActive.toDate() : new Date(),
                  creditsUsed: creditData.creditsUsed || 0,
                  totalApiCalls: creditData.totalApiCalls || 0,
                  creditLimit: creditData.creditLimit || userData.creditLimit || 'unlimited',
                  status: userData.accountStatus || 'active',
                  emailVerified: userData.emailVerified || false,
                  role: userData.role || 'user',
                  loginHistory: userData.loginHistory || [],
                  searchCount: userData.searchCount || 0
                };
              } catch (docError) {
                console.error('Error processing user doc:', userDoc.id, docError);
                return null;
              }
            })
            .filter(u => u !== null); // Remove failed entries
          
          console.log('Processed users:', usersData.length, 'regular users with credit data');

          setUsers(usersData);
          calculateStats(usersData);
          setError(null);
          setLoading(false);
        } catch (error) {
          console.error('Error processing users:', error);
          setError(error.message || 'Error loading users');
          setLoading(false);
        }
      },
      (error) => {
        console.error('Users listener error:', error);
        setError(error.message || 'Error loading users from database');
        setLoading(false);
      }
    );
    unsubscribers.push(usersUnsubscribe);

    return () => {
      console.log('Cleaning up listeners...');
      unsubscribers.forEach(unsub => unsub());
    };
  }, [adminUser]);

  useEffect(() => {
    filterUsers();
  }, [users, searchTerm, filterStatus, filterRole]);

  const calculateStats = (usersData) => {
    // usersData is already filtered to only contain 'user' role from the effect
    const stats = {
      total: usersData.length,
      active: usersData.filter(u => u.status === 'active').length,
      pending: usersData.filter(u => u.status === 'pending').length,
      suspended: usersData.filter(u => u.status === 'suspended').length,
      unlimited: usersData.filter(u => u.creditLimit === 'unlimited').length,
      limited: usersData.filter(u => typeof u.creditLimit === 'number').length
    };
    setUserStats(stats);
  };

  const filterUsers = () => {
    let filtered = users; // already filtered to only 'user' role

    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(user => 
        user.email.toLowerCase().includes(term) ||
        user.displayName.toLowerCase().includes(term) ||
        user.id.toLowerCase().includes(term)
      );
    }

    // Status filter
    if (filterStatus !== 'all') {
      filtered = filtered.filter(user => user.status === filterStatus);
    }

    // Credit limit filter
    if (filterRole !== 'all') {
      if (filterRole === 'unlimited') {
        filtered = filtered.filter(user => user.creditLimit === 'unlimited');
      } else if (filterRole === 'limited') {
        filtered = filtered.filter(user => typeof user.creditLimit === 'number');
      } else if (filterRole === 'suspended') {
        filtered = filtered.filter(user => user.creditLimit === 0);
      }
    }

    setFilteredUsers(filtered);
    setCurrentPage(1);
  };

  const handleStatusChange = async (userId, newStatus) => {
    try {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        accountStatus: newStatus,
        lastModified: new Date()
      });

      await logAdminAction(
        adminUser?.uid,
        adminUser?.email,
        `User Status Changed`,
        userId,
        `Changed status to ${newStatus}`
      );

      alert(`User status updated to ${newStatus}`);
    } catch (error) {
      console.error('Error updating user status:', error);
      alert('Failed to update user status');
    }
  };

  const handleCreditLimitChange = async (userId, newLimit) => {
    try {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        creditLimit: newLimit,
        lastModified: new Date()
      });

      await logAdminAction(
        adminUser?.uid,
        adminUser?.email,
        `Credit Limit Changed`,
        userId,
        `Set credit limit to ${newLimit === 'unlimited' ? 'unlimited' : newLimit + ' credits'}`
      );

      alert('Credit limit updated successfully');
    } catch (error) {
      console.error('Error updating credit limit:', error);
      alert('Failed to update credit limit');
    }
  };

  const handleBulkAction = async (action) => {
    if (bulkSelected.length === 0) {
      alert('Please select users first');
      return;
    }

    if (!window.confirm(`Are you sure you want to ${action} ${bulkSelected.length} user(s)?`)) {
      return;
    }

    try {
      for (const userId of bulkSelected) {
        const userRef = doc(db, 'users', userId);
        
        if (action === 'approve') {
          await updateDoc(userRef, { accountStatus: 'active' });
        } else if (action === 'suspend') {
          await updateDoc(userRef, { accountStatus: 'suspended' });
        } else if (action === 'delete') {
          await updateDoc(userRef, { accountStatus: 'deleted' });
        }
      }

      await logAdminAction(
        adminUser?.uid,
        adminUser?.email,
        `Bulk Action: ${action}`,
        null,
        `Performed ${action} on ${bulkSelected.length} users`
      );

      setBulkSelected([]);
      alert(`Successfully ${action}ed ${bulkSelected.length} user(s)`);
    } catch (error) {
      console.error('Error performing bulk action:', error);
      alert('Failed to perform bulk action');
    }
  };

  const exportUsers = () => {
    const csvContent = [
      ['User ID', 'Email', 'Display Name', 'Registration Date', 'Last Active', 'Credits Used', 'Credit Limit', 'Status', 'Email Verified'].join(','),
      ...filteredUsers.map(user => [
        user.id,
        user.email,
        user.displayName,
        user.createdAt.toLocaleDateString(),
        user.lastActive.toLocaleDateString(),
        user.creditsUsed,
        user.creditLimit === 'unlimited' ? 'Unlimited' : user.creditLimit,
        user.status,
        user.emailVerified ? 'Yes' : 'No'
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `users-export-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  // Pagination
  const indexOfLastUser = currentPage * usersPerPage;
  const indexOfFirstUser = indexOfLastUser - usersPerPage;
  const currentUsers = filteredUsers.slice(indexOfFirstUser, indexOfLastUser);
  const totalPages = Math.ceil(filteredUsers.length / usersPerPage);

  const StatBox = ({ icon: Icon, label, value, color = 'blue' }) => (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4 hover:bg-slate-800/70 transition-all">
      <div className="flex items-center justify-between mb-2">
        <Icon className={`w-5 h-5 text-${color}-400`} />
        <span className={`text-2xl font-bold text-white`}>{value}</span>
      </div>
      <p className="text-sm text-gray-400">{label}</p>
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-900">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-400 text-lg">Loading users...</p>
          <p className="text-gray-500 text-sm mt-2">Fetching data from Firebase</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-900">
        <div className="text-center max-w-md">
          <div className="mb-4 text-red-500">
            <XCircle className="w-16 h-16 mx-auto" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Error Loading Users</h2>
          <p className="text-gray-400 mb-4">{error}</p>
          <button
            onClick={() => {
              setError(null);
              setLoading(true);
              window.location.reload();
            }}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6 min-h-screen bg-slate-900">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">User Management</h1>
          <p className="text-gray-400">Complete user control and credit management</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={exportUsers}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatBox icon={Users} label="Total Users" value={userStats.total} color="blue" />
        <StatBox icon={CheckCircle} label="Active" value={userStats.active} color="green" />
        <StatBox icon={Clock} label="Pending" value={userStats.pending} color="yellow" />
        <StatBox icon={Ban} label="Suspended" value={userStats.suspended} color="red" />
        <StatBox icon={TrendingUp} label="Unlimited" value={userStats.unlimited} color="purple" />
        <StatBox icon={Shield} label="Limited" value={userStats.limited} color="orange" />
      </div>

      {/* Filters & Search */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Search */}
          <div className="md:col-span-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by email, name, or user ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-gray-300 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="pending">Pending</option>
              <option value="suspended">Suspended</option>
            </select>
          </div>

          {/* Credit Filter */}
          <div>
            <select
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Credit Types</option>
              <option value="unlimited">Unlimited</option>
              <option value="limited">Custom Limit</option>
              <option value="suspended">Suspended (0)</option>
            </select>
          </div>
        </div>

        {/* Bulk Actions */}
        {bulkSelected.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-3 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
            <span className="text-sm text-blue-400 font-medium">{bulkSelected.length} selected</span>
            <div className="flex gap-2">
              <button
                onClick={() => handleBulkAction('approve')}
                className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg transition-colors"
              >
                Approve
              </button>
              <button
                onClick={() => handleBulkAction('suspend')}
                className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg transition-colors"
              >
                Suspend
              </button>
              <button
                onClick={() => setBulkSelected([])}
                className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded-lg transition-colors"
              >
                Clear
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Users Table */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-900/50 border-b border-slate-700">
              <tr>
                <th className="px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    onChange={(e) => {
                      if (e.target.checked) {
                        setBulkSelected(currentUsers.map(u => u.id));
                      } else {
                        setBulkSelected([]);
                      }
                    }}
                    checked={bulkSelected.length === currentUsers.length && currentUsers.length > 0}
                    className="w-4 h-4 rounded border-slate-600 text-blue-600 focus:ring-blue-500"
                  />
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">User</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Registration</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Last Active</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Credits Used</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Credit Limit</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {currentUsers && currentUsers.length > 0 ? currentUsers.map((user) => {
                try {
                  return (
                    <tr key={user.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-4">
                        <input
                          type="checkbox"
                          checked={bulkSelected.includes(user.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setBulkSelected([...bulkSelected, user.id]);
                            } else {
                              setBulkSelected(bulkSelected.filter(id => id !== user.id));
                            }
                          }}
                          className="w-4 h-4 rounded border-slate-600 text-blue-600 focus:ring-blue-500"
                        />
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                            <span className="text-white text-sm font-semibold">
                              {user.displayName && user.displayName[0]?.toUpperCase()}
                            </span>
                          </div>
                          <div>
                            <p className="text-white font-medium">{user.displayName || 'N/A'}</p>
                            <p className="text-sm text-gray-400">{user.email || 'N/A'}</p>
                            <p className="text-xs text-gray-500">ID: {user.id ? user.id.substring(0, 8) : 'N/A'}...</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-gray-400" />
                          <span className="text-sm text-gray-300">
                            {user.createdAt ? user.createdAt.toLocaleDateString() : 'N/A'}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <Activity className="w-4 h-4 text-gray-400" />
                          <span className="text-sm text-gray-300">
                            {user.lastActive ? user.lastActive.toLocaleDateString() : 'N/A'}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <BarChart3 className="w-4 h-4 text-blue-400" />
                          <span className="text-sm text-white font-medium">
                            {typeof user.creditsUsed === 'number' ? user.creditsUsed.toLocaleString() : 0}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <CreditLimitBadge limit={user.creditLimit} creditsUsed={user.creditsUsed} />
                      </td>
                      <td className="px-4 py-4">
                        <StatusBadge status={user.status} />
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              setSelectedUser(user);
                              setShowUserDetails(true);
                            }}
                            className="p-2 hover:bg-slate-700 rounded-lg transition-colors text-gray-400 hover:text-blue-400"
                            title="View Details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              setSelectedUser(user);
                              setShowCreditControl(true);
                            }}
                            className="p-2 hover:bg-slate-700 rounded-lg transition-colors text-gray-400 hover:text-green-400"
                            title="Manage Credits"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <div className="relative group">
                            <button className="p-2 hover:bg-slate-700 rounded-lg transition-colors text-gray-400 hover:text-white">
                              <MoreVertical className="w-4 h-4" />
                            </button>
                            <div className="absolute right-0 mt-2 w-48 bg-slate-800 border border-slate-700 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
                              <button
                                onClick={() => handleStatusChange(user.id, 'active')}
                                className="w-full px-4 py-2 text-left text-sm text-green-400 hover:bg-slate-700 flex items-center gap-2"
                              >
                                <CheckCircle className="w-4 h-4" />
                                Activate
                              </button>
                              <button
                                onClick={() => handleStatusChange(user.id, 'suspended')}
                                className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-slate-700 flex items-center gap-2"
                              >
                                <Ban className="w-4 h-4" />
                                Suspend
                              </button>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                } catch (rowError) {
                  console.error('Error rendering row for user:', user.id, rowError);
                  return null;
                }
              }) : (
                <tr>
                  <td colSpan="8" className="px-4 py-8 text-center text-gray-400">
                    <p className="text-lg font-medium">No users found</p>
                    <p className="text-sm">Try adjusting your search or filters</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {filteredUsers && filteredUsers.length > 0 && totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-slate-700">
            <div className="text-sm text-gray-400">
              Showing {indexOfFirstUser + 1} to {Math.min(indexOfLastUser, filteredUsers.length)} of {filteredUsers.length} users
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

      {/* User Details Modal */}
      {showUserDetails && selectedUser && (
        <UserDetailsModalNew 
          user={selectedUser} 
          onClose={() => {
            setShowUserDetails(false);
            setSelectedUser(null);
          }} 
        />
      )}

      {/* Credit Control Modal */}
      {showCreditControl && selectedUser && (
        <CreditControlModalNew 
          user={selectedUser} 
          onClose={() => {
            setShowCreditControl(false);
            setSelectedUser(null);
          }}
          onUpdate={handleCreditLimitChange}
        />
      )}
    </div>
  );
};

// Status Badge Component
const StatusBadge = ({ status }) => {
  const colors = {
    active: 'bg-green-500/20 text-green-400 border-green-500/30',
    pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    suspended: 'bg-red-500/20 text-red-400 border-red-500/30'
  };

  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${colors[status] || colors.active}`}>
      {status === 'active' && <CheckCircle className="w-3 h-3" />}
      {status === 'pending' && <Clock className="w-3 h-3" />}
      {status === 'suspended' && <Ban className="w-3 h-3" />}
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
};

// Credit Limit Badge Component
const CreditLimitBadge = ({ limit, creditsUsed }) => {
  if (limit === 'unlimited') {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-purple-500/20 text-purple-400 border border-purple-500/30 rounded-full text-xs font-medium">
        <TrendingUp className="w-3 h-3" />
        Unlimited
      </span>
    );
  }

  if (limit === 0) {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-red-500/20 text-red-400 border border-red-500/30 rounded-full text-xs font-medium">
        <Ban className="w-3 h-3" />
        Suspended
      </span>
    );
  }

  const percentage = (creditsUsed / limit) * 100;
  
  let bgColor, textColor, borderColor, barColor;
  if (percentage >= 90) {
    bgColor = 'bg-red-500/20';
    textColor = 'text-red-400';
    borderColor = 'border-red-500/30';
    barColor = 'bg-red-500';
  } else if (percentage >= 70) {
    bgColor = 'bg-yellow-500/20';
    textColor = 'text-yellow-400';
    borderColor = 'border-yellow-500/30';
    barColor = 'bg-yellow-500';
  } else {
    bgColor = 'bg-green-500/20';
    textColor = 'text-green-400';
    borderColor = 'border-green-500/30';
    barColor = 'bg-green-500';
  }

  return (
    <div className="space-y-1">
      <span className={`inline-flex items-center gap-1.5 px-3 py-1 ${bgColor} ${textColor} border ${borderColor} rounded-full text-xs font-medium`}>
        {limit.toLocaleString()} credits
      </span>
      <div className="w-full bg-slate-700 rounded-full h-1">
        <div 
          className={`h-1 rounded-full ${barColor}`}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        ></div>
      </div>
    </div>
  );
};

// User Details Modal (placeholder - will create full version next)
const UserDetailsModalNew = ({ user, onClose }) => {
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-xl max-w-4xl w-full border border-slate-700 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-slate-800 border-b border-slate-700 p-6 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-white">User Details</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <XCircle className="w-6 h-6" />
          </button>
        </div>
        <div className="p-6">
          <div className="space-y-4">
            <div><span className="text-gray-400">Email:</span> <span className="text-white">{user.email}</span></div>
            <div><span className="text-gray-400">Display Name:</span> <span className="text-white">{user.displayName}</span></div>
            <div><span className="text-gray-400">Credits Used:</span> <span className="text-white">{user.creditsUsed.toLocaleString()}</span></div>
            <div><span className="text-gray-400">Credit Limit:</span> <span className="text-white">{user.creditLimit === 'unlimited' ? 'Unlimited' : user.creditLimit.toLocaleString()}</span></div>
            <div><span className="text-gray-400">Status:</span> <StatusBadge status={user.status} /></div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Credit Control Modal (placeholder - will create full version next)
const CreditControlModalNew = ({ user, onClose, onUpdate }) => {
  const [creditLimit, setCreditLimit] = useState(user.creditLimit);
  const [limitType, setLimitType] = useState(
    user.creditLimit === 'unlimited' ? 'unlimited' : 
    user.creditLimit === 0 ? 'suspended' : 'custom'
  );

  const handleSave = () => {
    let finalLimit;
    
    if (limitType === 'unlimited') {
      finalLimit = 'unlimited';
    } else if (limitType === 'suspended') {
      finalLimit = 0;
    } else {
      finalLimit = parseInt(creditLimit) || 0;
    }

    onUpdate(user.id, finalLimit);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-xl max-w-md w-full border border-slate-700 shadow-2xl">
        <div className="border-b border-slate-700 p-6">
          <h2 className="text-xl font-bold text-white">Manage Credit Limit</h2>
          <p className="text-sm text-gray-400 mt-1">{user.email}</p>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Credit Limit Type</label>
            <div className="space-y-2">
              <button
                onClick={() => setLimitType('unlimited')}
                className={`w-full px-4 py-3 rounded-lg border-2 text-left transition-all ${
                  limitType === 'unlimited' 
                    ? 'bg-purple-500/20 border-purple-500 text-white' 
                    : 'bg-slate-900 border-slate-700 text-gray-400 hover:border-purple-500/50'
                }`}
              >
                <div className="font-medium">Unlimited</div>
                <div className="text-xs text-gray-500">No credit restrictions</div>
              </button>
              <button
                onClick={() => setLimitType('custom')}
                className={`w-full px-4 py-3 rounded-lg border-2 text-left transition-all ${
                  limitType === 'custom' 
                    ? 'bg-blue-500/20 border-blue-500 text-white' 
                    : 'bg-slate-900 border-slate-700 text-gray-400 hover:border-blue-500/50'
                }`}
              >
                <div className="font-medium">Custom Limit</div>
                <div className="text-xs text-gray-500">Set specific credit amount</div>
              </button>
              <button
                onClick={() => setLimitType('suspended')}
                className={`w-full px-4 py-3 rounded-lg border-2 text-left transition-all ${
                  limitType === 'suspended' 
                    ? 'bg-red-500/20 border-red-500 text-white' 
                    : 'bg-slate-900 border-slate-700 text-gray-400 hover:border-red-500/50'
                }`}
              >
                <div className="font-medium">Suspended (0 credits)</div>
                <div className="text-xs text-gray-500">Block all credit usage</div>
              </button>
            </div>
          </div>

          {limitType === 'custom' && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Credit Amount</label>
              <input
                type="number"
                value={creditLimit === 'unlimited' ? '' : creditLimit}
                onChange={(e) => setCreditLimit(e.target.value)}
                placeholder="e.g., 200"
                className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}

          <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-4">
            <div className="text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-gray-400">Current Usage:</span>
                <span className="text-white font-medium">{user.creditsUsed.toLocaleString()} credits</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Current Limit:</span>
                <span className="text-white font-medium">
                  {user.creditLimit === 'unlimited' ? 'Unlimited' : user.creditLimit.toLocaleString() + ' credits'}
                </span>
              </div>
            </div>
          </div>
        </div>
        <div className="border-t border-slate-700 p-6 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
};

export default UserManagementNew;
