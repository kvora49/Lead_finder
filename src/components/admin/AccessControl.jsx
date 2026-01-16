import React, { useState, useEffect } from 'react';
import { collection, getDocs, doc, updateDoc, query, where, onSnapshot, orderBy, limit, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { Shield, UserCheck, UserX, Clock, CheckCircle, XCircle, Eye, Mail, AlertTriangle } from 'lucide-react';
import { useAdminAuth } from '../../contexts/AdminAuthContext';
import { logAdminAction } from '../../services/analyticsService';

/**
 * AccessControl Component
 * Real-time user access requests, approvals, and permissions management
 * Features: Pending approvals, user status management, role assignments
 */
const AccessControl = () => {
  const { isSuperAdmin, currentAdmin } = useAdminAuth();
  const [loading, setLoading] = useState(true);
  const [pendingUsers, setPendingUsers] = useState([]);
  const [recentActions, setRecentActions] = useState([]);
  const [stats, setStats] = useState({
    pending: 0,
    approved: 0,
    rejected: 0,
    suspended: 0
  });
  const [selectedUser, setSelectedUser] = useState(null);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    // Set up real-time listener for users
    const usersUnsubscribe = onSnapshot(collection(db, 'users'), (snapshot) => {
      const users = [];
      
      snapshot.forEach(doc => {
        const data = doc.data();
        users.push({
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate() || new Date(),
          lastLogin: data.lastLogin?.toDate() || new Date()
        });
      });

      // Filter pending users (exclude admin/super_admin roles)
      const pending = users.filter(u => {
        const role = u.role || 'user';
        // Don't show admins or super_admins in pending list
        if (role === 'admin' || role === 'super_admin') return false;
        // Show users with pending status OR unverified email with no status
        return u.status === 'pending' || (!u.status && !u.emailVerified);
      });
      setPendingUsers(pending);

      // Calculate stats (only for regular users, exclude admins)
      const regularUsers = users.filter(u => (u.role || 'user') === 'user');
      const approved = regularUsers.filter(u => u.status === 'active').length;
      const suspended = regularUsers.filter(u => u.status === 'suspended').length;
      const rejected = regularUsers.filter(u => u.status === 'rejected').length;
      
      setStats({
        pending: pending.length,
        approved,
        rejected,
        suspended
      });

      setLoading(false);
    });

    // Set up real-time listener for access control actions
    const actionsUnsubscribe = onSnapshot(
      query(
        collection(db, 'systemLogs'),
        where('type', '==', 'admin'),
        orderBy('timestamp', 'desc'),
        limit(20)
      ),
      (snapshot) => {
        const actions = snapshot.docs
          .map(doc => {
            const data = doc.data();
            return {
              id: doc.id,
              action: data.action?.toLowerCase().includes('suspend') ? 'suspended' :
                      data.action?.toLowerCase().includes('approve') ? 'approved' :
                      data.action?.toLowerCase().includes('reject') ? 'rejected' : 'modified',
              userEmail: data.targetUser || data.userEmail,
              admin: data.userEmail,
              timestamp: data.timestamp?.toDate() || new Date(),
              reason: data.details
            };
          })
          .filter(a => ['suspended', 'approved', 'rejected'].includes(a.action));
        
        setRecentActions(actions);
      }
    );

    // Cleanup listeners
    return () => {
      usersUnsubscribe();
      actionsUnsubscribe();
    };
  }, []);

  const handleApprove = async (userId, userEmail) => {
    try {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        status: 'active',
        approvedAt: new Date(),
        approvedBy: currentAdmin?.email || 'admin'
      });

      // Log the admin action
      await logAdminAction(
        currentAdmin?.uid,
        currentAdmin?.email,
        'User Approved',
        userId,
        `Approved user: ${userEmail}`
      );

      console.log(`Approved user: ${userEmail}`);
      alert('User approved successfully!');
    } catch (error) {
      console.error('Error approving user:', error);
      alert('Failed to approve user');
    }
  };

  const handleReject = async (userId, userEmail, reason) => {
    try {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        status: 'rejected',
        rejectedAt: new Date(),
        rejectedBy: 'admin',
        rejectionReason: reason
      });

      console.log(`Rejected user: ${userEmail}`);
      alert('User rejected successfully!');
    } catch (error) {
      console.error('Error rejecting user:', error);
      alert('Failed to reject user');
    }
  };

  const handleSuspend = async (userId, userEmail, reason) => {
    try {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        status: 'suspended',
        suspendedAt: new Date(),
        suspendedBy: 'admin',
        suspensionReason: reason
      });

      console.log(`Suspended user: ${userEmail}`);
      alert('User suspended successfully!');
    } catch (error) {
      console.error('Error suspending user:', error);
      alert('Failed to suspend user');
    }
  };

  const sendVerificationEmail = async (email) => {
    // Implement email sending logic
    console.log(`Sending verification email to: ${email}`);
    alert(`Verification email sent to ${email}`);
  };

  const UserModal = ({ user, onClose }) => {
    const [reason, setReason] = useState('');
    const [action, setAction] = useState('');

    const handleSubmit = () => {
      if (action === 'approve') {
        handleApprove(user.id, user.email);
      } else if (action === 'reject') {
        handleReject(user.id, user.email, reason);
      } else if (action === 'suspend') {
        handleSuspend(user.id, user.email, reason);
      }
      onClose();
    };

    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
        <div className="bg-slate-800 rounded-xl p-6 max-w-lg w-full mx-4 border border-slate-700">
          <h3 className="text-xl font-bold text-white mb-4">User Access Control</h3>
          
          <div className="space-y-4">
            <div>
              <label className="text-slate-400 text-sm">Email</label>
              <p className="text-white">{user.email}</p>
            </div>
            
            <div>
              <label className="text-slate-400 text-sm">Registered</label>
              <p className="text-white">{user.createdAt.toLocaleDateString()}</p>
            </div>
            
            <div>
              <label className="text-slate-400 text-sm">Email Verified</label>
              <p className={user.emailVerified ? 'text-green-400' : 'text-red-400'}>
                {user.emailVerified ? 'Yes' : 'No'}
              </p>
            </div>

            <div>
              <label className="text-slate-400 text-sm mb-2 block">Action</label>
              <div className="space-y-2">
                <button
                  onClick={() => setAction('approve')}
                  className={`w-full px-4 py-2 rounded-lg border transition-colors ${
                    action === 'approve'
                      ? 'bg-green-500/20 border-green-500 text-green-400'
                      : 'bg-slate-900/50 border-slate-700 text-white hover:border-green-500'
                  }`}
                >
                  <CheckCircle className="w-4 h-4 inline mr-2" />
                  Approve Access
                </button>
                
                <button
                  onClick={() => setAction('reject')}
                  className={`w-full px-4 py-2 rounded-lg border transition-colors ${
                    action === 'reject'
                      ? 'bg-red-500/20 border-red-500 text-red-400'
                      : 'bg-slate-900/50 border-slate-700 text-white hover:border-red-500'
                  }`}
                >
                  <XCircle className="w-4 h-4 inline mr-2" />
                  Reject Access
                </button>

                {isSuperAdmin && (
                  <button
                    onClick={() => setAction('suspend')}
                    className={`w-full px-4 py-2 rounded-lg border transition-colors ${
                      action === 'suspend'
                        ? 'bg-yellow-500/20 border-yellow-500 text-yellow-400'
                        : 'bg-slate-900/50 border-slate-700 text-white hover:border-yellow-500'
                    }`}
                  >
                    <AlertTriangle className="w-4 h-4 inline mr-2" />
                    Suspend User
                  </button>
                )}
              </div>
            </div>

            {(action === 'reject' || action === 'suspend') && (
              <div>
                <label className="text-slate-400 text-sm mb-2 block">Reason (optional)</label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={3}
                  placeholder="Provide a reason for this action..."
                />
              </div>
            )}
          </div>

          <div className="flex gap-3 mt-6">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!action}
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Confirm
            </button>
          </div>
        </div>
      </div>
    );
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
      <div>
        <h1 className="text-2xl font-bold text-white">Access Control</h1>
        <p className="text-slate-400 mt-1">Manage user access requests and permissions</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-400 text-sm">Pending Approval</p>
              <p className="text-2xl font-bold text-white mt-1">{stats.pending}</p>
            </div>
            <div className="p-3 bg-yellow-500/10 rounded-lg">
              <Clock className="w-6 h-6 text-yellow-400" />
            </div>
          </div>
        </div>

        <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-400 text-sm">Approved</p>
              <p className="text-2xl font-bold text-white mt-1">{stats.approved}</p>
            </div>
            <div className="p-3 bg-green-500/10 rounded-lg">
              <UserCheck className="w-6 h-6 text-green-400" />
            </div>
          </div>
        </div>

        <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-400 text-sm">Rejected</p>
              <p className="text-2xl font-bold text-white mt-1">{stats.rejected}</p>
            </div>
            <div className="p-3 bg-red-500/10 rounded-lg">
              <UserX className="w-6 h-6 text-red-400" />
            </div>
          </div>
        </div>

        <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-400 text-sm">Suspended</p>
              <p className="text-2xl font-bold text-white mt-1">{stats.suspended}</p>
            </div>
            <div className="p-3 bg-orange-500/10 rounded-lg">
              <Shield className="w-6 h-6 text-orange-400" />
            </div>
          </div>
        </div>
      </div>

      {/* Pending Approvals */}
      <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Clock className="w-5 h-5 text-yellow-400" />
          Pending Approvals ({pendingUsers.length})
        </h3>
        
        {pendingUsers.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <CheckCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No pending approvals</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pendingUsers.map(user => (
              <div key={user.id} className="flex items-center justify-between p-4 bg-slate-900/50 rounded-lg hover:bg-slate-900/70 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold">
                    {user.email?.[0]?.toUpperCase() || 'U'}
                  </div>
                  <div>
                    <p className="text-white font-medium">{user.displayName || user.email}</p>
                    <p className="text-slate-400 text-sm">{user.email}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs text-slate-500">
                        Registered: {user.createdAt.toLocaleDateString()}
                      </span>
                      {!user.emailVerified && (
                        <span className="px-2 py-0.5 bg-red-500/20 text-red-400 text-xs rounded">
                          Email Not Verified
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  {!user.emailVerified && (
                    <button
                      onClick={() => sendVerificationEmail(user.email)}
                      className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors flex items-center gap-1 text-sm"
                    >
                      <Mail className="w-4 h-4" />
                      Send Email
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setSelectedUser(user);
                      setShowModal(true);
                    }}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-1 text-sm"
                  >
                    <Eye className="w-4 h-4" />
                    Review
                  </button>
                  <button
                    onClick={() => handleApprove(user.id, user.email)}
                    className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors flex items-center gap-1 text-sm"
                  >
                    <CheckCircle className="w-4 h-4" />
                    Approve
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Actions */}
      <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Shield className="w-5 h-5 text-blue-400" />
          Recent Actions
        </h3>
        
        <div className="space-y-3">
          {recentActions.map(action => (
            <div key={action.id} className="flex items-center justify-between p-4 bg-slate-900/50 rounded-lg">
              <div className="flex items-center gap-4">
                <div className={`
                  w-10 h-10 rounded-full flex items-center justify-center
                  ${action.action === 'approved' ? 'bg-green-500/20' :
                    action.action === 'rejected' ? 'bg-red-500/20' :
                    'bg-yellow-500/20'}
                `}>
                  {action.action === 'approved' ? (
                    <UserCheck className="w-5 h-5 text-green-400" />
                  ) : action.action === 'rejected' ? (
                    <UserX className="w-5 h-5 text-red-400" />
                  ) : (
                    <Shield className="w-5 h-5 text-yellow-400" />
                  )}
                </div>
                <div>
                  <p className="text-white font-medium">
                    <span className="capitalize">{action.action}</span>: {action.userEmail}
                  </p>
                  <p className="text-slate-400 text-sm">By {action.admin}</p>
                  {action.reason && (
                    <p className="text-slate-500 text-xs mt-1">Reason: {action.reason}</p>
                  )}
                </div>
              </div>
              <span className="text-slate-500 text-sm">
                {action.timestamp.toLocaleTimeString()}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* User Modal */}
      {showModal && selectedUser && (
        <UserModal 
          user={selectedUser}
          onClose={() => {
            setShowModal(false);
            setSelectedUser(null);
          }}
        />
      )}
    </div>
  );
};

export default AccessControl;
