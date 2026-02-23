/**
 * AdminGatekeeper — Step-Up Authentication portal
 *
 * Routing logic:
 *   loading              → skeleton
 *   not logged in         → /login
 *   canAccessAdmin        → /admin/dashboard  (straight through)
 *   role=user, pending    → "Your request is pending" UI
 *   role=user, no request → Submit admin request (Firebase Auth = identity already verified)
 */
import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAdminAuth } from '../../contexts/AdminAuthContext';
import { useAuth } from '../../contexts/AuthContext';
import { ShieldCheck, ArrowRight, Clock, XCircle, Loader2, UserCheck } from 'lucide-react';

/* ─── tiny helpers ──────────────────────────────────────────────────────── */
const GlassCard = ({ children, className = '' }) => (
  <div className={`relative bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl shadow-2xl ${className}`}>
    {children}
  </div>
);

const Btn = ({ children, onClick, disabled, loading: spin, variant = 'primary', className = '' }) => {
  const base = 'flex items-center justify-center gap-2 w-full py-3 px-6 rounded-xl font-semibold text-sm transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.97]';
  const variants = {
    primary: 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-900/40',
    ghost:   'bg-white/10 hover:bg-white/20 text-white border border-white/20',
  };
  return (
    <button onClick={onClick} disabled={disabled || spin} className={`${base} ${variants[variant]} ${className}`}>
      {spin ? <Loader2 className="w-4 h-4 animate-spin" /> : children}
    </button>
  );
};

/* ─── Main component ────────────────────────────────────────────────────── */
const AdminGatekeeper = () => {
  const { canAccessAdmin, loading: authLoading, adminRequestStatus } = useAdminAuth();
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState('');
  const [done,       setDone]       = useState(false);

  // ── Routing decisions after auth loads ──────────────────────────────────
  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
      </div>
    );
  }
  if (!currentUser)   return <Navigate to="/login" replace />;
  if (canAccessAdmin) return <Navigate to="/admin/dashboard" replace />;

  const isPending = adminRequestStatus === 'pending' || done;

  const handleSubmitRequest = async () => {
    setError('');
    setSubmitting(true);
    try {
      await updateDoc(doc(db, 'users', currentUser.uid), {
        admin_request_status: 'pending',
      });
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  /* ─── UI ──────────────────────────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Ambient blobs */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-0 w-80 h-80 bg-violet-700/20 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-blue-800/10 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8 gap-3">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-xl shadow-indigo-900/50">
            <ShieldCheck className="w-7 h-7 text-white" strokeWidth={1.8} />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-white tracking-tight">Admin Portal</h1>
            <p className="text-slate-400 text-sm mt-1">Lead Finder — Secure Gatekeeper</p>
          </div>
        </div>

        <GlassCard className="p-8">

          {/* ── PENDING ──────────────────────────────────────────────── */}
          {isPending && (
            <div className="text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center mx-auto">
                <Clock className="w-8 h-8 text-amber-400" />
              </div>
              <h2 className="text-xl font-bold text-white">Request Pending</h2>
              <p className="text-slate-300 text-sm leading-relaxed">
                Your admin access request has been submitted and is awaiting review. The owner will approve or reject your request.
              </p>
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 text-xs text-amber-300 text-left space-y-1">
                <p><span className="font-semibold">Email:</span> {currentUser?.email}</p>
                <p><span className="font-semibold">Status:</span> Under review</p>
                <p><span className="font-semibold">Typical wait:</span> 24 – 48 hours</p>
              </div>
              <Btn variant="ghost" onClick={() => navigate('/app')}>
                Return to App
              </Btn>
            </div>
          )}

          {/* ── REQUEST FORM ─────────────────────────────────────────── */}
          {!isPending && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="w-12 h-12 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center mx-auto mb-3">
                  <UserCheck className="w-5 h-5 text-indigo-400" />
                </div>
                <h2 className="text-xl font-bold text-white mb-1">Request Admin Access</h2>
                <p className="text-slate-400 text-sm">
                  Logged in as <span className="text-white font-medium">{currentUser?.email}</span>
                </p>
              </div>

              <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-4 space-y-2 text-sm text-slate-300">
                <p className="font-semibold text-white text-xs uppercase tracking-wider mb-1">What happens next?</p>
                <p className="flex items-start gap-2"><span className="text-indigo-400 mt-0.5">✓</span> Your request is added to the admin review queue</p>
                <p className="flex items-start gap-2"><span className="text-indigo-400 mt-0.5">✓</span> The owner will review and approve your access</p>
                <p className="flex items-start gap-2"><span className="text-indigo-400 mt-0.5">✓</span> Once approved, visit this page again to enter</p>
              </div>

              {error && (
                <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-red-400 text-sm">
                  <XCircle className="w-4 h-4 flex-shrink-0" />
                  {error}
                </div>
              )}

              <Btn onClick={handleSubmitRequest} loading={submitting}>
                <ArrowRight className="w-4 h-4" />
                Submit Admin Request
              </Btn>
              <Btn variant="ghost" onClick={() => navigate('/app')}>
                Cancel
              </Btn>
            </div>
          )}

        </GlassCard>

        {/* Footer */}
        <p className="text-center text-xs text-slate-600 mt-6">
          Lead Finder Admin Portal · Unauthorized access is prohibited
        </p>
      </div>
    </div>
  );
};

export default AdminGatekeeper;
