import { useState, useEffect } from 'react';
import { 
  Shield, 
  Users, 
  CheckCircle, 
  XCircle, 
  Clock,
  Mail,
  Ban,
  UserCheck,
  Search,
  Filter
} from 'lucide-react';
import { collection, getDocs, doc, updateDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAdminAuth } from '../../contexts/AdminAuthContext';
import { logAdminAction } from '../../services/analyticsService';

const AccessControlNew = () => {
  const { adminUser } = useAdminAuth();
  const [pendingUsers, setPendingUsers] = useState([]);
  const [recentApprovals, setRecentApprovals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState('pending');

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'users'), (snapshot) => {
      const pending = [];
      const recent = [];
      
      snapshot.forEach(doc => {
        const data = doc.data();
        const user = {
          id: doc.id,
          email: data.email,
          displayName: data.displayName || data.email?.split('@')[0],
          status: data.accountStatus || 'active',
          createdAt: data.createdAt?.toDate() || new Date(),
          role: data.role || 'user'
        };
        
        if (user.role === 'user') {
          if (user.status === 'pending') {
            pending.push(user);
          } else if (user.status === 'active' || user.status === 'suspended') {
            recent.push(user);
          }
        }
      });
      
      setPendingUsers(pending.sort((a, b) => b.createdAt - a.createdAt));
      setRecentApprovals(recent.sort((a, b) => b.createdAt - a.createdAt).slice(0, 10));
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleApprove = async (userId, email) => {
    try {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        accountStatus: 'active',
        approvedAt: new Date(),
        approvedBy: adminUser?.email
      });

      await logAdminAction(
        adminUser?.uid,
        adminUser?.email,
        'User Approved',
        userId,
        `Approved user: ${email}`
      );

      alert('User approved successfully!');
    } catch (error) {
      console.error('Error approving user:', error);
      alert('Failed to approve user');
    }
  };

  const handleReject = async (userId, email) => {
    if (!window.confirm(`Are you sure you want to reject ${email}?`)) return;

    try {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        accountStatus: 'rejected',
        rejectedAt: new Date(),
        rejectedBy: adminUser?.email
      });

      await logAdminAction(
        adminUser?.uid,
        adminUser?.email,
        'User Rejected',
        userId,
        `Rejected user: ${email}`
      );

      alert('User rejected successfully!');
    } catch (error) {
      console.error('Error rejecting user:', error);
      alert('Failed to reject user');
    }
  };

  const handleSuspend = async (userId, email) => {
    if (!window.confirm(`Are you sure you want to suspend ${email}?`)) return;

    try {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        accountStatus: 'suspended',
        suspendedAt: new Date(),
        suspendedBy: adminUser?.email
      });

      await logAdminAction(
        adminUser?.uid,
        adminUser?.email,
        'User Suspended',
        userId,
        `Suspended user: ${email}`
      );

      alert('User suspended successfully!');
    } catch (error) {
      console.error('Error suspending user:', error);
      alert('Failed to suspend user');
    }
  };

  const filteredPending = pendingUsers.filter(user =>
    user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.displayName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-400">Loading access control...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Access Control & Permissions</h1>
        <p className="text-gray-400">Approve, deny, or manage user access</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-5">
          <div className="flex items-center justify-between mb-2">
            <Clock className="w-5 h-5 text-yellow-400" />
            <span className="text-2xl font-bold text-white">{pendingUsers.length}</span>
          </div>
          <p className="text-sm text-gray-400">Pending Approval</p>
        </div>
        
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-5">
          <div className="flex items-center justify-between mb-2">
            <CheckCircle className="w-5 h-5 text-green-400" />
            <span className="text-2xl font-bold text-white">{recentApprovals.filter(u => u.status === 'active').length}</span>
          </div>
          <p className="text-sm text-gray-400">Active Users</p>
        </div>
        
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-5">
          <div className="flex items-center justify-between mb-2">
            <Ban className="w-5 h-5 text-red-400" />
            <span className="text-2xl font-bold text-white">{recentApprovals.filter(u => u.status === 'suspended').length}</span>
          </div>
          <p className="text-sm text-gray-400">Suspended</p>
        </div>
      </div>

      {/* Pending Users */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
        <div className="p-6 border-b border-slate-700">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Shield className="w-6 h-6 text-yellow-400" />
              Pending User Approvals
            </h2>
          </div>
          
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search pending users..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-gray-300 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {filteredPending.length === 0 ? (
          <div className="p-12 text-center">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4 opacity-50" />
            <p className="text-gray-400 text-lg">No pending approvals</p>
            <p className="text-gray-500 text-sm mt-2">All users have been reviewed</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-700">
            {filteredPending.map((user) => (
              <div key={user.id} className="p-6 hover:bg-slate-800/30 transition-colors">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                      <span className="text-white font-semibold">
                        {user.displayName[0]?.toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <h3 className="text-white font-medium">{user.displayName}</h3>
                      <p className="text-sm text-gray-400">{user.email}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        Registered: {user.createdAt.toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleApprove(user.id, user.email)}
                      className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
                    >
                      <CheckCircle className="w-4 h-4" />
                      Approve
                    </button>
                    <button
                      onClick={() => handleReject(user.id, user.email)}
                      className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                    >
                      <XCircle className="w-4 h-4" />
                      Reject
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Actions */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
        <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <UserCheck className="w-6 h-6 text-blue-400" />
          Recent Access Changes
        </h2>
        <div className="space-y-3">
          {recentApprovals.slice(0, 5).map((user) => (
            <div key={user.id} className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg">
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  user.status === 'active' ? 'bg-green-500/20' : 'bg-red-500/20'
                }`}>
                  {user.status === 'active' ? (
                    <CheckCircle className="w-4 h-4 text-green-400" />
                  ) : (
                    <Ban className="w-4 h-4 text-red-400" />
                  )}
                </div>
                <div>
                  <p className="text-white text-sm font-medium">{user.displayName}</p>
                  <p className="text-gray-400 text-xs">{user.email}</p>
                </div>
              </div>
              <span className={`text-xs px-2 py-1 rounded-full ${
                user.status === 'active' 
                  ? 'bg-green-500/20 text-green-400' 
                  : 'bg-red-500/20 text-red-400'
              }`}>
                {user.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AccessControlNew;
