/**
 * AdminGatekeeper — Invite-based admin access gate
 *
 * Flow A — Invite link (/admin?token=xxx):
 *   - Not logged in  → show "Log in first to accept" screen
 *   - Logged in      → auto-call acceptAdminInvite CF → elevate role → dashboard
 *
 * Flow B — No token:
 *   - canAccessAdmin   → /admin/dashboard (straight through)
 *   - isPending        → "Request Pending" screen
 *   - Normal user      → "Request Admin Access" button (simple Firestore write)
 */
import { useState, useEffect } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '../../firebase';
import { useAdminAuth } from '../../contexts/AdminAuthContext';
import { useAuth } from '../../contexts/AuthContext';
import {
  ShieldCheck, Mail, Clock,
  CheckCircle2, XCircle, Loader2, ArrowRight,
} from 'lucide-react';

/* ─── Toast ─────────────────────────────────────────────────────────────── */
const Toast = ({ msg, type }) => {
  if (!msg) return null;
  const styles = {
    error:   'bg-red-500/15 border-red-500/40 text-red-300',
    success: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300',
    info:    'bg-indigo-500/15 border-indigo-500/40 text-indigo-300',
  };
  const Icon = type === 'success' ? CheckCircle2 : type === 'error' ? XCircle : Loader2;
  return (
    <div className={`flex items-center gap-2.5 border rounded-xl px-4 py-3 text-sm ${styles[type]}`}>
      <Icon className="w-4 h-4 flex-shrink-0" />
      <span>{msg}</span>
    </div>
  );
};

/* ─── GlassCard ─────────────────────────────────────────────────────────── */
const GlassCard = ({ children, className = '' }) => (
  <div className={`relative bg-white/8 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl shadow-black/40 ${className}`}>
    {children}
  </div>
);

/* ─── Button ────────────────────────────────────────────────────────────── */
const Btn = ({ children, onClick, disabled, loading: spin, variant = 'primary', className = '' }) => {
  const base = 'flex items-center justify-center gap-2 w-full py-3 px-6 rounded-xl font-semibold text-sm transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]';
  const variants = {
    primary: 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-900/50',
    ghost:   'bg-white/8 hover:bg-white/15 text-slate-300 border border-white/10 hover:border-white/20',
  };
  return (
    <button onClick={onClick} disabled={disabled || spin} className={`${base} ${variants[variant]} ${className}`}>
      {spin ? <Loader2 className="w-4 h-4 animate-spin" /> : children}
    </button>
  );
};

/* ══════════════════════════════════════════════════════════════════════════
   Main Component
══════════════════════════════════════════════════════════════════════════ */
const AdminGatekeeper = () => {
  const { canAccessAdmin, loading: authLoading, adminRequestStatus } = useAdminAuth();
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const token     = searchParams.get('token');
  const isPending = adminRequestStatus === 'pending';

  // 'idle' | 'accepting' | 'success' | 'error' | 'requesting' | 'requested'
  const [phase,    setPhase]   = useState('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [toast,    setToast]   = useState({ msg: '', type: 'info' });

  const showToast = (msg, type = 'info', ms = 4500) => {
    setToast({ msg, type });
    if (ms) setTimeout(() => setToast({ msg: '', type: 'info' }), ms);
  };

  /* ── Auto-accept invite on mount when token + user both present ───────── */
  useEffect(() => {
    if (!token || authLoading || !currentUser || canAccessAdmin) return;

    const accept = async () => {
      setPhase('accepting');
      try {
        const fns = getFunctions();
        const acceptInvite = httpsCallable(fns, 'acceptAdminInvite');
        await acceptInvite({ token });
        setPhase('success');
        // Full page reload so AdminAuthContext re-reads the updated role
        setTimeout(() => { window.location.href = '/admin/dashboard'; }, 2200);
      } catch (err) {
        setPhase('error');
        setErrorMsg(err?.message || 'Failed to accept invite. The link may have expired or already been used.');
      }
    };

    accept();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, authLoading, currentUser]);

  /* ── Request admin access — simple Firestore write, no OTP ───────────── */
  const handleRequestAccess = async () => {
    setPhase('requesting');
    try {
      await updateDoc(doc(db, 'users', currentUser.uid), {
        admin_request_status: 'pending',
        requestedAt: serverTimestamp(),
      });
      setPhase('requested');
    } catch (err) {
      setPhase('idle');
      showToast(err.message || 'Failed to submit request.', 'error');
    }
  };

  /* ── Guards ──────────────────────────────────────────────────────────── */
  if (authLoading) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
    </div>
  );
  // Redirect immediately if no token and not logged in
  if (!currentUser && !token) return <Navigate to="/login" replace />;
  // Redirect immediately if already has access (no token flow needed)
  if (canAccessAdmin && !token) return <Navigate to="/admin/dashboard" replace />;

  /* ── UI shell ───────────────────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 flex items-center justify-center p-4 relative overflow-hidden">

      {/* Ambient blobs */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-40 -left-40 w-[500px] h-[500px] bg-indigo-700/15 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-violet-700/15 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 bg-blue-800/10 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-[420px]">

        {/* Logo */}
        <div className="flex flex-col items-center mb-8 gap-3">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-xl shadow-indigo-950/60">
            <ShieldCheck className="w-7 h-7 text-white" strokeWidth={1.8} />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-white tracking-tight">Admin Portal</h1>
            <p className="text-slate-500 text-sm mt-0.5">Lead Finder — Secure Access</p>
          </div>
        </div>

        <GlassCard className="p-8 space-y-6">

          {/* ═══ NOT LOGGED IN — invite link present ══════════════════════ */}
          {!currentUser && token && (
            <div className="text-center space-y-5">
              <div className="w-16 h-16 rounded-full bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center mx-auto">
                <Mail className="w-8 h-8 text-indigo-400" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Admin Invitation</h2>
                <p className="text-slate-400 text-sm mt-1 leading-relaxed">
                  You've received an admin invite. Please log in first, then re-open the invite link from your email.
                </p>
              </div>
              <Btn onClick={() => navigate('/login')}>
                <ArrowRight className="w-4 h-4" />
                Log In
              </Btn>
              <Btn variant="ghost" onClick={() => navigate('/app')}>Back to App</Btn>
            </div>
          )}

          {/* ═══ ACCEPTING INVITE ══════════════════════════════════════════ */}
          {currentUser && token && phase === 'accepting' && (
            <div className="text-center space-y-5">
              <Loader2 className="w-12 h-12 text-indigo-400 animate-spin mx-auto" />
              <div>
                <h2 className="text-xl font-bold text-white">Accepting Invite…</h2>
                <p className="text-slate-400 text-sm mt-1">Verifying your invitation. Just a moment.</p>
              </div>
            </div>
          )}

          {/* ═══ INVITE ACCEPTED ═══════════════════════════════════════════ */}
          {currentUser && token && phase === 'success' && (
            <div className="text-center space-y-5">
              <div className="w-16 h-16 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8 text-emerald-400" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Welcome to the Team!</h2>
                <p className="text-slate-400 text-sm mt-1">Your admin access is active. Redirecting to dashboard…</p>
              </div>
              <div className="flex justify-center">
                <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
              </div>
            </div>
          )}

          {/* ═══ INVITE ERROR ══════════════════════════════════════════════ */}
          {currentUser && token && phase === 'error' && (
            <div className="text-center space-y-5">
              <div className="w-16 h-16 rounded-full bg-red-500/15 border border-red-500/30 flex items-center justify-center mx-auto">
                <XCircle className="w-8 h-8 text-red-400" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Invite Failed</h2>
                <p className="text-slate-400 text-sm mt-1 leading-relaxed">{errorMsg}</p>
              </div>
              <Btn variant="ghost" onClick={() => navigate('/app')}>Return to App</Btn>
            </div>
          )}

          {/* ═══ PENDING (no token, awaiting approval) ════════════════════ */}
          {currentUser && !token && (isPending || phase === 'requested') && (
            <div className="text-center space-y-5">
              <div className="w-16 h-16 rounded-full bg-amber-500/15 border border-amber-500/30 flex items-center justify-center mx-auto">
                <Clock className="w-8 h-8 text-amber-400" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Request Pending</h2>
                <p className="text-slate-400 text-sm mt-1 leading-relaxed">
                  Your admin access request is under review. The owner will approve or reject it shortly.
                </p>
              </div>
              <div className="bg-amber-500/8 border border-amber-500/20 rounded-xl p-4 text-xs text-amber-300/80 text-left space-y-1.5">
                <p><span className="font-semibold text-amber-200">Email:</span> {currentUser?.email}</p>
                <p><span className="font-semibold text-amber-200">Status:</span> Under review</p>
                <p><span className="font-semibold text-amber-200">Typical wait:</span> A few hours</p>
              </div>
              <Btn variant="ghost" onClick={() => navigate('/app')}>Return to App</Btn>
            </div>
          )}

          {/* ═══ DEFAULT: Request access ═══════════════════════════════════ */}
          {currentUser && !token && !isPending && phase !== 'requested' && (
            <>
              <div>
                <h2 className="text-xl font-bold text-white mb-1">Request Admin Access</h2>
                <p className="text-slate-400 text-sm leading-relaxed">
                  Submit a request to the platform owner. You'll gain access once approved — or use an invite link sent directly to your email.
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-500 mb-2 uppercase tracking-wider">Your Email</label>
                <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl px-4 py-3">
                  <Mail className="w-4 h-4 text-slate-500 flex-shrink-0" />
                  <span className="text-slate-200 text-sm truncate flex-1">{currentUser?.email}</span>
                  <span className="text-xs text-emerald-500 flex-shrink-0 font-medium">● verified</span>
                </div>
              </div>

              <Toast msg={toast.msg} type={toast.type} />

              <div className="space-y-3">
                <Btn onClick={handleRequestAccess} loading={phase === 'requesting'}>
                  <ShieldCheck className="w-4 h-4" />
                  Request Admin Access
                </Btn>
                <Btn variant="ghost" onClick={() => navigate('/app')}>Cancel</Btn>
              </div>
            </>
          )}

        </GlassCard>

        <p className="text-center text-xs text-slate-700 mt-5">
          Lead Finder Admin Portal · Unauthorized access is prohibited
        </p>
      </div>
    </div>
  );
};

export default AdminGatekeeper;
