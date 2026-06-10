import { useState, useEffect } from 'react';
import { X, AlertCircle, Zap, Check } from 'lucide-react';
import { toast } from 'sonner';
import { CREDIT_CONFIG } from '../config';

/**
 * CreditRequestModal
 * User-facing modal to request more monthly credits from the admin.
 * All values in credits — no USD amounts shown to users.
 */
const CreditRequestModal = ({
  isOpen,
  onClose,
  userEmail,
  estimatedCredits,
  creditsRemaining,
  currentLimitCredits,
  onSubmit,
  isLoading,
}) => {
  const defaultRequest = Math.max(
    estimatedCredits || CREDIT_CONFIG.DEFAULT_USER_CREDITS,
    CREDIT_CONFIG.DEFAULT_USER_CREDITS
  );
  const [requestedAmount, setRequestedAmount] = useState(defaultRequest);
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (isOpen && estimatedCredits) {
      setRequestedAmount(Math.max(estimatedCredits, CREDIT_CONFIG.DEFAULT_USER_CREDITS));
    }
  }, [isOpen, estimatedCredits]);

  const handleSubmit = async () => {
    if (!requestedAmount || requestedAmount <= 0) {
      toast.error('Please enter a valid credit amount');
      return;
    }
    if (requestedAmount > 50000) {
      toast.error('Maximum request is 50,000 credits. Contact support for more.');
      return;
    }
    await onSubmit({
      requestedAmountCredits: requestedAmount,
      requestedAmountUsd:     0,   // legacy field — kept for Cloud Function compat
      reason: reason || 'Insufficient credits for search',
    });
  };

  if (!isOpen) return null;

  const newTotalLimit   = (currentLimitCredits || 0) + (typeof requestedAmount === 'number' ? requestedAmount : 0);
  const isSufficient    = estimatedCredits ? requestedAmount >= estimatedCredits : true;
  const citySearchesGained = Math.floor(requestedAmount / (32 * CREDIT_CONFIG.CREDITS_PER_TIER.enterprise));

  return (
    <>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40" onClick={onClose} />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md">
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-white" />
              <h2 className="text-xl font-bold text-white">Request More Credits</h2>
            </div>
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
            {/* Current Status */}
            <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
              <div className="space-y-2.5">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-600 dark:text-gray-400">Current monthly limit</span>
                  <span className="text-sm font-semibold text-slate-900 dark:text-white">
                    {(currentLimitCredits || 0).toLocaleString()} credits
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-600 dark:text-gray-400">Currently remaining</span>
                  <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                    {Math.max(0, creditsRemaining || 0).toLocaleString()} credits
                  </span>
                </div>
                <div className="h-px bg-slate-200 dark:bg-slate-700 my-2" />
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-600 dark:text-gray-400">After approval</span>
                  <span className="text-sm font-semibold text-indigo-600 dark:text-indigo-400">
                    {newTotalLimit.toLocaleString()} credits
                  </span>
                </div>
              </div>
            </div>

            {/* Estimated cost alert */}
            {estimatedCredits > 0 && (
              <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-lg p-3 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-none mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
                    This search needs ~{estimatedCredits.toLocaleString()} credits
                  </p>
                  <p className="text-xs text-amber-800 dark:text-amber-300 mt-1">
                    Request at least this amount to proceed
                  </p>
                </div>
              </div>
            )}

            {/* Amount input */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-gray-300 mb-2">
                Credits to request
              </label>
              <div className="relative">
                <Zap className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-gray-500" />
                <input
                  type="number"
                  min="0"
                  max="50000"
                  step="100"
                  value={requestedAmount === '' ? '' : requestedAmount}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '') { setRequestedAmount(''); return; }
                    const num = parseInt(val, 10);
                    if (!isNaN(num)) setRequestedAmount(Math.min(Math.max(num, 0), 50000));
                  }}
                  disabled={isLoading}
                  className="w-full pl-9 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 transition-all"
                />
              </div>
              {requestedAmount > 0 && (
                <p className="text-xs text-slate-500 dark:text-gray-500 mt-1.5">
                  {isSufficient
                    ? `✓ Enough for ~${citySearchesGained} additional city searches`
                    : `⚠ Below estimated need of ${estimatedCredits?.toLocaleString()} credits`}
                </p>
              )}
            </div>

            {/* Reason */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-gray-300 mb-2">
                Additional details (optional)
              </label>
              <textarea
                maxLength="200"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={isLoading}
                placeholder="e.g. running a city-wide market analysis for a client..."
                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 resize-none h-20 transition-all"
              />
              <p className="text-xs text-slate-500 dark:text-gray-500 mt-1.5">{reason.length}/200</p>
            </div>

            <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 rounded-lg p-3 text-xs text-blue-900 dark:text-blue-200">
              Admin will review your request and update your account within 24 hours.
            </div>
          </div>

          {/* Footer */}
          <div className="bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-700 px-6 py-4 flex gap-3">
            <button
              onClick={onClose}
              disabled={isLoading}
              className="flex-1 px-4 py-2.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-900 dark:text-white font-semibold rounded-lg transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={isLoading || !requestedAmount}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white font-semibold rounded-lg transition-all disabled:opacity-50 active:scale-[0.98]"
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
