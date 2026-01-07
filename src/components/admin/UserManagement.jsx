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
  Activity
} from 'lucide-react';
import { collection, getDocs, doc, updateDoc, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../../firebase';
import UserDetailsModal from './UserDetailsModal';

const UserManagement = () => {
  const [users, setUsers] = useState([]);
  const [filteredUsers, setFilteredUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [selectedUser, setSelectedUser] = useState(null);
  const [showUserModal, setShowUserModal] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    filterUsers();
  }, [searchTerm, filterStatus, users]);

  const fetchUsers = async () => {
    try {
      const usersSnapshot = await getDocs(collection(db, 'users'));
      const userCreditsSnapshot = await getDocs(collection(db, 'userCredits'));
      
      const usersData = [];
      
      for (const userDoc of usersSnapshot.docs) {
        const userData = userDoc.data();
        const creditDoc = userCreditsSnapshot.docs.find(doc => doc.id === userDoc.id);
        const creditData = creditDoc?.data() || {};
        
        usersData.push({
          id: userDoc.id,
          email: userData.email || 'N/A',
          displayName: userData.displayName || 'N/A',
          createdAt: userData.createdAt || new Date(),
          lastActive: userData.lastActive || new Date(),
          creditsUsed: creditData.totalApiCalls || 0,
          creditLimit: userData.creditLimit || null,
          status: userData.accountStatus || 'active',
          emailVerified: userData.emailVerified || false
        });
      }

      setUsers(usersData);
      setFilteredUsers(usersData);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching users:', error);
      setLoading(false);
    }
  };

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
          accountStatus: 'suspended'
        });
        fetchUsers();
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
        accountStatus: 'active'
      });
      fetchUsers();
    } catch (error) {
      console.error('Error activating user:', error);
      alert('Failed to activate user');
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
          <p className="text-gray-400">{filteredUsers.length} total users</p>
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
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-900/50">
              <tr className="border-b border-slate-700">
                <th className="text-left px-6 py-4 text-sm font-semibold text-gray-300">User</th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-gray-300">Credits</th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-gray-300">Limit</th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-gray-300">Status</th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-gray-300">Last Active</th>
                <th className="text-right px-6 py-4 text-sm font-semibold text-gray-300">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {filteredUsers.map((user) => (
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

      {/* User Details Modal */}
      {showUserModal && selectedUser && (
        <UserDetailsModal
          user={selectedUser}
          onClose={() => {
            setShowUserModal(false);
            setSelectedUser(null);
            fetchUsers();
          }}
        />
      )}
    </div>
  );
};

export default UserManagement;
