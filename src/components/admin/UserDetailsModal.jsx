import { useState, useEffect } from 'react';
import { X, Mail, Calendar, Activity, CreditCard, Save, RotateCcw } from 'lucide-react';
import { doc, updateDoc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';

const UserDetailsModal = ({ user, onClose }) => {
  const [creditLimit, setCreditLimit] = useState(user.creditLimit || null);
  const [limitType, setLimitType] = useState(
    user.creditLimit === 0 ? 'suspended' :
    user.creditLimit ? 'custom' : 'unlimited'
  );
  const [customLimit, setCustomLimit] = useState(user.creditLimit || 200);
  const [saving, setSaving] = useState(false);
  const [userStats, setUserStats] = useState({
    totalSearches: 0,
    totalExports: 0,
    loginCount: 0
  });

  useEffect(() => {
    fetchUserStats();
  }, [user.id]);

  const fetchUserStats = async () => {
    try {
      // Fetch search analytics
      const searchQuery = query(
        collection(db, 'searchAnalytics'),
        where('userId', '==', user.id)
      );
      const searchSnapshot = await getDocs(searchQuery);
      
      setUserStats({
        totalSearches: searchSnapshot.size,
        totalExports: searchSnapshot.docs.filter(doc => doc.data().exported).length,
        loginCount: user.metadata?.loginCount || 0
      });
    } catch (error) {
      console.error('Error fetching user stats:', error);
    }
  };

  const handleSaveChanges = async () => {
    setSaving(true);
    try {
      let newLimit = null;
      
      if (limitType === 'custom') {
        newLimit = parseInt(customLimit);
      } else if (limitType === 'suspended') {
        newLimit = 0;
      }

      const userRef = doc(db, 'users', user.id);
      await updateDoc(userRef, {
        creditLimit: newLimit,
        accountStatus: limitType === 'suspended' ? 'suspended' : 'active'
      });

      alert('User settings updated successfully!');
      onClose();
    } catch (error) {
      console.error('Error updating user:', error);
      alert('Failed to update user settings');
    } finally {
      setSaving(false);
    }
  };

  const handleResetCredits = async () => {
    if (window.confirm('Are you sure you want to reset this user\'s credits to 0?')) {
      try {
        const creditsRef = doc(db, 'userCredits', user.id);
        await updateDoc(creditsRef, {
          totalApiCalls: 0
        });
        alert('Credits reset successfully!');
        onClose();
      } catch (error) {
        console.error('Error resetting credits:', error);
        alert('Failed to reset credits');
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-slate-800 border-b border-slate-700 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white">User Details</h2>
            <p className="text-gray-400 text-sm">{user.email}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Profile Section */}
          <div className="bg-slate-900/50 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Mail className="w-5 h-5 text-blue-400" />
              Profile Information
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-gray-400 text-sm">Display Name</p>
                <p className="text-white font-medium mt-1">{user.displayName}</p>
              </div>
              <div>
                <p className="text-gray-400 text-sm">Email</p>
                <p className="text-white font-medium mt-1">{user.email}</p>
              </div>
              <div>
                <p className="text-gray-400 text-sm">User ID</p>
                <p className="text-white font-mono text-sm mt-1">{user.id}</p>
              </div>
              <div>
                <p className="text-gray-400 text-sm">Email Verified</p>
                <p className={`font-medium mt-1 ${user.emailVerified ? 'text-green-400' : 'text-red-400'}`}>
                  {user.emailVerified ? 'Yes' : 'No'}
                </p>
              </div>
              <div>
                <p className="text-gray-400 text-sm">Registration Date</p>
                <p className="text-white font-medium mt-1">
                  {new Date(user.createdAt).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}
                </p>
              </div>
              <div>
                <p className="text-gray-400 text-sm">Last Active</p>
                <p className="text-white font-medium mt-1">
                  {new Date(user.lastActive).toLocaleDateString()}
                </p>
              </div>
            </div>
          </div>

          {/* Usage Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4">
              <p className="text-blue-400 text-sm font-medium">Total Searches</p>
              <p className="text-3xl font-bold text-white mt-2">{userStats.totalSearches}</p>
            </div>
            <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-4">
              <p className="text-purple-400 text-sm font-medium">Files Exported</p>
              <p className="text-3xl font-bold text-white mt-2">{userStats.totalExports}</p>
            </div>
            <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4">
              <p className="text-green-400 text-sm font-medium">Login Count</p>
              <p className="text-3xl font-bold text-white mt-2">{userStats.loginCount}</p>
            </div>
          </div>

          {/* Credit Management */}
          <div className="bg-slate-900/50 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-orange-400" />
              Credit Management
            </h3>
            
            {/* Current Usage */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-gray-400 text-sm">Current Usage</span>
                <span className="text-white font-semibold">
                  {user.creditsUsed} / {user.creditLimit || '∞'} credits
                </span>
              </div>
              <div className="w-full bg-slate-700 rounded-full h-3 overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 ${
                    user.creditLimit && (user.creditsUsed / user.creditLimit) >= 0.9
                      ? 'bg-red-500'
                      : user.creditLimit && (user.creditsUsed / user.creditLimit) >= 0.7
                      ? 'bg-orange-500'
                      : 'bg-green-500'
                  }`}
                  style={{
                    width: user.creditLimit
                      ? `${Math.min(100, (user.creditsUsed / user.creditLimit) * 100)}%`
                      : '0%'
                  }}
                />
              </div>
            </div>

            {/* Credit Limit Options */}
            <div className="space-y-4">
              <p className="text-gray-400 text-sm font-medium">Set Credit Limit:</p>
              
              <label className="flex items-center gap-3 p-4 bg-slate-800 rounded-lg cursor-pointer hover:bg-slate-700/50 transition-colors">
                <input
                  type="radio"
                  name="limitType"
                  value="unlimited"
                  checked={limitType === 'unlimited'}
                  onChange={(e) => setLimitType(e.target.value)}
                  className="w-4 h-4 text-blue-600 border-gray-600 focus:ring-blue-500"
                />
                <div className="flex-1">
                  <p className="text-white font-medium">Unlimited (Default)</p>
                  <p className="text-gray-400 text-sm">User can use unlimited credits</p>
                </div>
              </label>

              <label className="flex items-start gap-3 p-4 bg-slate-800 rounded-lg cursor-pointer hover:bg-slate-700/50 transition-colors">
                <input
                  type="radio"
                  name="limitType"
                  value="custom"
                  checked={limitType === 'custom'}
                  onChange={(e) => setLimitType(e.target.value)}
                  className="w-4 h-4 text-blue-600 border-gray-600 focus:ring-blue-500 mt-1"
                />
                <div className="flex-1">
                  <p className="text-white font-medium">Custom Limit</p>
                  <p className="text-gray-400 text-sm mb-3">Set a specific credit limit for this user</p>
                  {limitType === 'custom' && (
                    <input
                      type="number"
                      value={customLimit}
                      onChange={(e) => setCustomLimit(e.target.value)}
                      min="1"
                      className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Enter credit limit"
                    />
                  )}
                </div>
              </label>

              <label className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-lg cursor-pointer hover:bg-red-500/20 transition-colors">
                <input
                  type="radio"
                  name="limitType"
                  value="suspended"
                  checked={limitType === 'suspended'}
                  onChange={(e) => setLimitType(e.target.value)}
                  className="w-4 h-4 text-red-600 border-gray-600 focus:ring-red-500"
                />
                <div className="flex-1">
                  <p className="text-red-400 font-medium">Suspended (0 credits)</p>
                  <p className="text-red-400/70 text-sm">User cannot use any credits</p>
                </div>
              </label>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={handleSaveChanges}
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
            >
              <Save className="w-5 h-5" />
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
            <button
              onClick={handleResetCredits}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-medium transition-colors"
            >
              <RotateCcw className="w-5 h-5" />
              Reset Credits
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserDetailsModal;
