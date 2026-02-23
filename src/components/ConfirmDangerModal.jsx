/**
 * ConfirmDangerModal — Reusable safe-delete confirmation
 *
 * Props:
 *   isOpen    {boolean}   — controls visibility
 *   onClose   {function}  — called on Cancel or backdrop click
 *   onConfirm {function}  — called on Confirm button
 *   title     {string}    — modal headline
 *   message   {string}    — body text
 *   confirmLabel {string} — button label (default "Delete")
 *   loading   {boolean}   — shows spinner on confirm button while async op runs
 */
import { useEffect } from 'react';
import { AlertTriangle, X, Loader2 } from 'lucide-react';

const ConfirmDangerModal = ({
  isOpen,
  onClose,
  onConfirm,
  title       = 'Are you sure?',
  message     = 'This action cannot be undone.',
  confirmLabel = 'Delete',
  loading     = false,
}) => {
  /* Close on Escape */
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cdm-title"
    >
      {/* Blur overlay */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative w-full max-w-sm bg-slate-900 border border-red-500/20 rounded-2xl shadow-2xl shadow-black/60 overflow-hidden">

        {/* Red top accent stripe */}
        <div className="h-1 w-full bg-gradient-to-r from-red-600 via-rose-500 to-orange-500" />

        <div className="p-6 space-y-5">

          {/* Close × */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Icon + Title */}
          <div className="flex items-start gap-4">
            <div className="flex-none w-11 h-11 rounded-xl bg-red-500/15 border border-red-500/25 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-red-400" strokeWidth={1.8} />
            </div>
            <div className="pt-0.5">
              <h3 id="cdm-title" className="text-base font-bold text-white leading-snug">
                {title}
              </h3>
              <p className="text-slate-400 text-sm mt-1 leading-relaxed">{message}</p>
            </div>
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-1">
            <button
              onClick={onClose}
              disabled={loading}
              className="flex-1 py-2.5 px-4 rounded-xl text-sm font-semibold
                bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white
                border border-slate-700 transition-all active:scale-[0.97]
                disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl
                text-sm font-semibold bg-red-600 hover:bg-red-500 text-white
                shadow-lg shadow-red-900/40 transition-all active:scale-[0.97]
                disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : confirmLabel
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDangerModal;
