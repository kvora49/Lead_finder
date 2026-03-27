import { useState, useEffect } from 'react';
import { X, AlertCircle, DollarSign, Check } from 'lucide-react';
import { toast } from 'sonner';

const CreditRequestModal = ({ isOpen, onClose, userEmail, estimatedCostUsd, remainingUsd, currentLimitUsd, onSubmit, isLoading }) => {
  const [requestedAmount, setRequestedAmount] = useState(estimatedCostUsd || 25);
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (isOpen && estimatedCostUsd) {
      setRequestedAmount(Math.max(estimatedCostUsd, 25));
    }
  }, [isOpen, estimatedCostUsd]);

  const handleSubmit = async () => {
    if (!requestedAmount || requestedAmount <= 0) {
      toast.error('Please enter a valid credit amount');
      return;
    }
    if (requestedAmount > 1000) {
      toast.error('Maximum request is $1000. Contact support for larger amounts.');
      return;
    }
    await onSubmit({
      requestedAmountUsd: requestedAmount,
      reason: reason || 'Insufficient credits for search',
    });
  };

  if (!isOpen) return null;

  const newTotalLimit = currentLimitUsd + (typeof requestedAmount === 'number' ? requestedAmount : 0);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md">
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-4 flex items-center justify-between">
            <h2 className="text-xl font-bold text-white">Request Credit Top-up</h2>
            <button
              onClick={onClose}
              disabled={isLoading}
              className="text-white/80 hover:text-white transition-colors disabled:opacity-50"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="p-6 space-y-5">
            {/* Current Status Summary */}
            <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
              <div className="space-y-2.5">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-600 dark:text-gray-400">Current monthly limit</span>
                  <span className="text-sm font-semibold text-slate-900 dark:text-white">${currentLimitUsd.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-600 dark:text-gray-400">Currently remaining</span>
                  <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">${Math.max(0, remainingUsd).toFixed(2)}</span>
                </div>
                <div className="h-px bg-slate-200 dark:bg-slate-700 my-2" />
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-600 dark:text-gray-400">After approval</span>
                  <span className="text-sm font-semibold text-indigo-600 dark:text-indigo-400">${newTotalLimit.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Estimated Cost Alert */}
            {estimatedCostUsd && (
              <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-lg p-3 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-none mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
                    Estimated search cost: ${estimatedCostUsd.toFixed(2)}
                  </p>
                  <p className="text-xs text-amber-800 dark:text-amber-300 mt-1">
                    Request at least this amount to proceed with your search
                  </p>
                </div>
              </div>
            )}

            {/* Amount Input */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-gray-300 mb-2">
                Requested amount (USD)
              </label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-gray-500" />
                <input
                  type="number"
                  min="0"
                  max="1000"
                  step="5"
                  value={requestedAmount === '' ? '' : requestedAmount}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '') {
                      setRequestedAmount('');
                    } else {
                      const num = parseFloat(val);
                      if (!isNaN(num)) {
                        setRequestedAmount(Math.min(Math.max(num, 0), 1000));
                      }
                    }
                  }}
                  disabled={isLoading}
                  className="w-full pl-9 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                />
              </div>
              <p className="text-xs text-slate-500 dark:text-gray-500 mt-1.5">
                {requestedAmount === '' ? '' : requestedAmount < estimatedCostUsd
                  ? `ℹ️ Request is below estimated cost of $${estimatedCostUsd.toFixed(2)}`
                  : `✓ Sufficient for your search`}
              </p>
            </div>

            {/* Reason Input */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-gray-300 mb-2">
                Additional details (optional)
              </label>
              <textarea
                maxLength="200"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={isLoading}
                placeholder="e.g., running a comprehensive market analysis..."
                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed resize-none h-20 transition-all"
              />
              <p className="text-xs text-slate-500 dark:text-gray-500 mt-1.5">{reason.length}/200</p>
            </div>

            {/* Info Box */}
            <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 rounded-lg p-3 text-xs text-blue-900 dark:text-blue-200">
              Admin will review your request and update your account within 24 hours. You'll receive a notification once it's approved.
            </div>
          </div>

          {/* Footer */}
          <div className="bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-700 px-6 py-4 flex gap-3">
            <button
              onClick={onClose}
              disabled={isLoading}
              className="flex-1 px-4 py-2.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-900 dark:text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={isLoading || !requestedAmount}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white font-semibold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  Submit Request
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default CreditRequestModal;
