import { useState } from 'react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { Zap, Plus, Minus, X } from 'lucide-react';
import { logAdminAction } from '../../services/analyticsService';
import { CREDIT_CONFIG } from '../../config';

/**
 * CreditManagementModal
 * Admin tool to manually adjust a user's monthly credit limit.
 * Works with integer credits — no USD amounts.
 */
const CreditManagementModal = ({ user, adminUser, onClose, onSuccess }) => {
  const [amount,  setAmount]  = useState('');
  const [action,  setAction]  = useState('add');
  const [reason,  setReason]  = useState('');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const currentLimit = user.creditLimit === 'unlimited'
    ? 'unlimited'
    : (typeof user.creditLimit === 'number' ? user.creditLimit : CREDIT_CONFIG.DEFAULT_USER_CREDITS);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const creditAmount = parseInt(amount, 10);
    if (isNaN(creditAmount) || creditAmount <= 0) {
      setError('Please enter a valid positive number');
      return;
    }
    if (!reason.trim()) {
      setError('Please provide a reason for this adjustment');
      return;
    }

    setLoading(true);
    try {
      const userRef    = doc(db, 'users', user.id);
      const baseLimt   = currentLimit === 'unlimited' ? CREDIT_CONFIG.DEFAULT_USER_CREDITS : currentLimit;
      const newLimit   = action === 'add'
        ? baseLimt + creditAmount
        : Math.max(0, baseLimt - creditAmount);

      await updateDoc(userRef, {
        creditLimit: newLimit,
        updatedAt:   serverTimestamp(),
      });

      try {
        await logAdminAction(
          adminUser?.uid,
          adminUser?.email,
          `Credit Limit ${action === 'add' ? 'Increased' : 'Decreased'} by ${creditAmount} credits`,
          user.id,
          `${action === 'add' ? 'Increased' : 'Decreased'} credit limit by ${creditAmount} for ${user.email}. New limit: ${newLimit}. Reason: ${reason}`
        );
      } catch (logErr) {
        console.warn('logAdminAction failed (non-critical):', logErr);
      }

      onSuccess?.();
      onClose();
    } catch (err) {
      console.error('Error adjusting credit limit:', err);
      setError('Failed to adjust credits. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const previewNewLimit = () => {
    const amt = parseInt(amount, 10);
    if (isNaN(amt) || amt <= 0) return null;
    const base = currentLimit === 'unlimited' ? CREDIT_CONFIG.DEFAULT_USER_CREDITS : currentLimit;
    return action === 'add' ? base + amt : Math.max(0, base - amt);
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-xl max-w-md w-full border border-slate-700 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-full flex items-center justify-center">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Credit Limit Adjustment</h2>
              <p className="text-sm text-gray-400">{user.email}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Current Limit */}
          <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700">
            <p className="text-sm text-gray-400 mb-1">Current Monthly Credit Limit</p>
            <p className="text-2xl font-bold text-white">
              {currentLimit === 'unlimited' ? 'Unlimited' : currentLimit.toLocaleString()}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Default: {CREDIT_CONFIG.DEFAULT_USER_CREDITS.toLocaleString()} credits/month
            </p>
          </div>

          {/* Action */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Action</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setAction('add')}
                className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg border transition-colors ${
                  action === 'add'
                    ? 'bg-green-500/20 border-green-500 text-green-400'
                    : 'bg-slate-900 border-slate-700 text-gray-300 hover:border-green-500'
                }`}
              >
                <Plus className="w-4 h-4" />
                Increase Limit
              </button>
              <button
                type="button"
                onClick={() => setAction('remove')}
                className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg border transition-colors ${
                  action === 'remove'
                    ? 'bg-red-500/20 border-red-500 text-red-400'
                    : 'bg-slate-900 border-slate-700 text-gray-300 hover:border-red-500'
                }`}
              >
                <Minus className="w-4 h-4" />
                Decrease Limit
              </button>
            </div>
          </div>

          {/* Amount */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Credits to {action === 'add' ? 'Add' : 'Remove'}
            </label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={`e.g. ${CREDIT_CONFIG.DEFAULT_USER_CREDITS}`}
              min="1"
              required
              className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Reason */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Reason</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Extra credits for feedback, reduced due to misuse..."
              rows="2"
              required
              className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {/* Preview */}
          {previewNewLimit() !== null && (
            <div className="bg-indigo-500/10 border border-indigo-500/50 rounded-lg p-3">
              <p className="text-indigo-400 text-sm">
                New monthly limit: <strong>{previewNewLimit()?.toLocaleString()} credits</strong>
                {' '}({action === 'add' ? '+' : '-'}{amount} from current)
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !amount || !reason.trim()}
              className={`flex-1 px-4 py-2 rounded-lg text-white transition-colors disabled:opacity-50 ${
                action === 'add' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'
              }`}
            >
              {loading ? 'Saving...' : `${action === 'add' ? 'Increase' : 'Decrease'} Limit`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreditManagementModal;
