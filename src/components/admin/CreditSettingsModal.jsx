import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { DollarSign, Settings, Users, Globe } from 'lucide-react';
import { logAdminAction } from '../../services/analyticsService';

/**
 * CreditSettingsModal Component
 * Allows super admins to toggle between global and individual credit modes
 */
const CreditSettingsModal = ({ adminUser, onClose, onUpdate }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState({
    creditMode: 'global', // 'global' or 'individual'
    globalCreditLimit: 10000,
    defaultUserCreditLimit: 1000,
    lastModified: null,
    lastModifiedBy: null
  });

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const settingsRef = doc(db, 'systemConfig', 'creditSettings');
      const settingsDoc = await getDoc(settingsRef);
      
      if (settingsDoc.exists()) {
        setSettings({
          ...settings,
          ...settingsDoc.data()
        });
      }
    } catch (error) {
      console.error('Error fetching credit settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const settingsRef = doc(db, 'systemConfig', 'creditSettings');
      
      const updatedSettings = {
        ...settings,
        lastModified: serverTimestamp(),
        lastModifiedBy: adminUser?.email || 'admin'
      };

      await setDoc(settingsRef, updatedSettings, { merge: true });

      // Log the change
      await logAdminAction(
        adminUser?.uid,
        adminUser?.email,
        'Credit Settings Updated',
        null,
        `Changed credit mode to ${settings.creditMode}. Global limit: ${settings.globalCreditLimit}, Default user limit: ${settings.defaultUserCreditLimit}`
      );

      onUpdate?.();
      onClose();
    } catch (error) {
      console.error('Error saving settings:', error);
      alert('Failed to save settings. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
        <div className="bg-slate-800 rounded-xl p-8 border border-slate-700">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-gray-400 text-center mt-4">Loading settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-xl max-w-2xl w-full border border-slate-700 shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-3 p-6 border-b border-slate-700">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
            <Settings className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Credit System Settings</h2>
            <p className="text-sm text-gray-400">Configure global or individual credit limits</p>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">
          {/* Credit Mode Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-3">
              Credit System Mode
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Global Mode */}
              <button
                onClick={() => setSettings({ ...settings, creditMode: 'global' })}
                className={`p-4 rounded-lg border-2 transition-all ${
                  settings.creditMode === 'global'
                    ? 'bg-blue-500/20 border-blue-500'
                    : 'bg-slate-900 border-slate-700 hover:border-blue-500/50'
                }`}
              >
                <div className="flex items-center gap-3 mb-2">
                  <Globe className={`w-6 h-6 ${settings.creditMode === 'global' ? 'text-blue-400' : 'text-gray-400'}`} />
                  <span className={`font-semibold ${settings.creditMode === 'global' ? 'text-white' : 'text-gray-300'}`}>
                    Global Shared Credits
                  </span>
                </div>
                <p className="text-sm text-gray-400">
                  All users share a common credit pool. Best for managed teams.
                </p>
              </button>

              {/* Individual Mode */}
              <button
                onClick={() => setSettings({ ...settings, creditMode: 'individual' })}
                className={`p-4 rounded-lg border-2 transition-all ${
                  settings.creditMode === 'individual'
                    ? 'bg-green-500/20 border-green-500'
                    : 'bg-slate-900 border-slate-700 hover:border-green-500/50'
                }`}
              >
                <div className="flex items-center gap-3 mb-2">
                  <Users className={`w-6 h-6 ${settings.creditMode === 'individual' ? 'text-green-400' : 'text-gray-400'}`} />
                  <span className={`font-semibold ${settings.creditMode === 'individual' ? 'text-white' : 'text-gray-300'}`}>
                    Individual User Limits
                  </span>
                </div>
                <p className="text-sm text-gray-400">
                  Each user has their own credit limit. Best for public platforms.
                </p>
              </button>
            </div>
          </div>

          {/* Global Credit Limit */}
          {settings.creditMode === 'global' && (
            <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Global Credit Pool
              </label>
              <div className="flex items-center gap-3">
                <DollarSign className="w-5 h-5 text-blue-400" />
                <input
                  type="number"
                  value={settings.globalCreditLimit}
                  onChange={(e) => setSettings({ ...settings, globalCreditLimit: parseInt(e.target.value) || 0 })}
                  min="0"
                  step="1000"
                  className="flex-1 px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-gray-400">credits</span>
              </div>
              <p className="text-sm text-gray-500 mt-2">
                Total credits available for all users to share
              </p>
            </div>
          )}

          {/* Default Individual Limit */}
          {settings.creditMode === 'individual' && (
            <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Default User Credit Limit
              </label>
              <div className="flex items-center gap-3">
                <DollarSign className="w-5 h-5 text-green-400" />
                <input
                  type="number"
                  value={settings.defaultUserCreditLimit}
                  onChange={(e) => setSettings({ ...settings, defaultUserCreditLimit: parseInt(e.target.value) || 0 })}
                  min="0"
                  step="100"
                  className="flex-1 px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                />
                <span className="text-gray-400">credits</span>
              </div>
              <p className="text-sm text-gray-500 mt-2">
                Default credit limit assigned to new users (can be customized per user)
              </p>
            </div>
          )}

          {/* Info Box */}
          <div className="bg-blue-500/10 border border-blue-500/50 rounded-lg p-4">
            <p className="text-blue-400 text-sm">
              <strong>Note:</strong> Changing modes will not affect existing user credit balances. 
              You may need to manually adjust individual user limits after switching modes.
            </p>
          </div>

          {/* Last Modified */}
          {settings.lastModified && (
            <div className="text-sm text-gray-500">
              Last modified by {settings.lastModifiedBy} on {new Date(settings.lastModified).toLocaleString()}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-6 border-t border-slate-700">
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreditSettingsModal;
