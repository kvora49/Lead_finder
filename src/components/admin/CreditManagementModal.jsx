import { useState } from 'react';
import { doc, updateDoc, increment, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { DollarSign, Plus, Minus, X } from 'lucide-react';
import { logAdminAction } from '../../services/analyticsService';

/**
 * CreditManagementModal Component
 * Allows admins to manually adjust user credits
 */
const CreditManagementModal = ({ user, adminUser, onClose, onSuccess }) => {
  const [amount, setAmount] = useState('');
  const [action, setAction] = useState('add'); // 'add' or 'remove'
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const creditAmount = parseInt(amount);
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
      const userCreditsRef = doc(db, 'userCredits', user.id);
      const adjustmentAmount = action === 'add' ? creditAmount : -creditAmount;

      // Update user credits
      await updateDoc(userCreditsRef, {
        creditsUsed: increment(-adjustmentAmount), // Negative because creditsUsed tracks usage
        lastModified: serverTimestamp(),
        lastModifiedBy: adminUser?.email || 'admin'
      });

      // Log the admin action
      await logAdminAction(
        adminUser?.uid,
        adminUser?.email,
        `Credit Adjustment - ${action === 'add' ? 'Added' : 'Removed'} ${creditAmount} credits`,
        user.id,
        `${action === 'add' ? 'Granted' : 'Removed'} ${creditAmount} credits for ${user.email}. Reason: ${reason}`
      );

      onSuccess?.();
      onClose();
    } catch (err) {
      console.error('Error adjusting credits:', err);
      setError('Failed to adjust credits. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-xl max-w-md w-full border border-slate-700 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Credit Management</h2>
              <p className="text-sm text-gray-400">{user.email}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Current Balance */}
          <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700">
            <p className="text-sm text-gray-400 mb-1">Current Credits Used</p>
            <p className="text-2xl font-bold text-white">{user.creditsUsed.toLocaleString()}</p>
            <p className="text-xs text-gray-500 mt-1">
              Lower usage = More available credits
            </p>
          </div>

          {/* Action Type */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Action
            </label>
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
                Grant Credits
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
                Remove Credits
              </button>
            </div>
          </div>

          {/* Amount */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Credit Amount
            </label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Enter amount"
              min="1"
              required
              className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Reason */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Reason for Adjustment
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="E.g., Bonus credits for feedback, Refund for API issues, etc."
              rows="3"
              required
              className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {/* Preview */}
          {amount && (
            <div className="bg-blue-500/10 border border-blue-500/50 rounded-lg p-3">
              <p className="text-blue-400 text-sm">
                {action === 'add' ? '✓' : '⚠'} This will {action === 'add' ? 'decrease' : 'increase'} credits used by {amount}, 
                effectively {action === 'add' ? 'giving' : 'removing'} {amount} credits {action === 'add' ? 'to' : 'from'} the user.
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
                action === 'add'
                  ? 'bg-green-600 hover:bg-green-700'
                  : 'bg-red-600 hover:bg-red-700'
              }`}
            >
              {loading ? 'Processing...' : `${action === 'add' ? 'Grant' : 'Remove'} Credits`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreditManagementModal;
