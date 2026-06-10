import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { Zap, Settings } from 'lucide-react';
import { logAdminAction } from '../../services/analyticsService';
import { CREDIT_CONFIG } from '../../config';

/**
 * CreditSettingsModal
 * Admin tool to set the default monthly credit limit for all users.
 * No global/individual mode toggle — all users are equal.
 */
const CreditSettingsModal = ({ adminUser, onClose, onUpdate }) => {
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [defaultCredits, setDefaultCredits] = useState(CREDIT_CONFIG.DEFAULT_USER_CREDITS);

  useEffect(() => {
    const fetch = async () => {
      try {
        const snap = await getDoc(doc(db, 'systemConfig', 'creditSettings'));
        if (snap.exists()) {
          const d = snap.data();
          if (d.defaultUserCredits) setDefaultCredits(d.defaultUserCredits);
        }
      } catch (err) {
        console.error('Error fetching credit settings:', err);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, 'systemConfig', 'creditSettings'), {
        defaultUserCredits: defaultCredits,
        lastModified:       serverTimestamp(),
        lastModifiedBy:     adminUser?.email || 'admin',
      }, { merge: true });

      await logAdminAction(
        adminUser?.uid,
        adminUser?.email,
        'Credit Settings Updated',
        null,
        `Default user credit limit changed to ${defaultCredits} credits/month`
      );

      onUpdate?.();
      onClose();
    } catch (err) {
      console.error('Error saving settings:', err);
      alert('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // Estimated searches based on credit amount (Enterprise tier = 10 credits/call)
  const citySearches  = Math.floor(defaultCredits / (32 * 10));
  const nbhdSearches  = Math.floor(defaultCredits / (24 * 10));
  const specSearches  = Math.floor(defaultCredits / (9  * 10));

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
        <div className="bg-slate-800 rounded-xl p-8 border border-slate-700">
          <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-gray-400 text-center mt-4">Loading settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-xl max-w-lg w-full border border-slate-700 shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-3 p-6 border-b border-slate-700">
          <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-full flex items-center justify-center">
            <Settings className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Credit Settings</h2>
            <p className="text-sm text-gray-400">Monthly credit allocation per user</p>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {/* Platform info */}
          <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700 text-sm space-y-2">
            <p className="text-gray-300 font-medium flex items-center gap-2">
              <Zap className="w-4 h-4 text-cyan-400" />
              SKU Credit System — India Region
            </p>
            <div className="text-gray-400 space-y-1">
              <div className="flex justify-between">
                <span>Enterprise free cap (per key/month)</span>
                <span className="text-white">7,000 calls</span>
              </div>
              <div className="flex justify-between">
                <span>Credits per Enterprise call</span>
                <span className="text-white">10 credits</span>
              </div>
              <div className="flex justify-between">
                <span>Total platform credits</span>
                <span className="text-white">{CREDIT_CONFIG.PLATFORM_CREDITS_POOL.toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* Default credits input */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Default Monthly Credits Per User
            </label>
            <input
              type="number"
              value={defaultCredits}
              onChange={(e) => setDefaultCredits(Math.max(0, parseInt(e.target.value) || 0))}
              min="0"
              step="100"
              className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <p className="text-xs text-gray-500 mt-1">
              Applied to new users and as default when no override is set.
            </p>
          </div>

          {/* Search estimates */}
          <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-lg p-4 text-sm space-y-2">
            <p className="text-indigo-300 font-medium">
              With {defaultCredits.toLocaleString()} credits, users get approximately:
            </p>
            <div className="text-gray-300 space-y-1">
              <div className="flex justify-between">
                <span>City searches (32 calls × 10)</span>
                <span className="font-medium">{citySearches} / month</span>
              </div>
              <div className="flex justify-between">
                <span>Neighbourhood searches (24 calls × 10)</span>
                <span className="font-medium">{nbhdSearches} / month</span>
              </div>
              <div className="flex justify-between">
                <span>Specific searches (≤9 calls × 10)</span>
                <span className="font-medium">{specSearches} / month</span>
              </div>
            </div>
          </div>

          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-xs text-amber-300">
            Note: Changing this default does not automatically update existing users' individual limits.
            Use User Management to adjust per-user limits.
          </div>
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
            className="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreditSettingsModal;
