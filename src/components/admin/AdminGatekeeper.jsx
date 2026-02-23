/**
 * AdminGatekeeper — premium Step-Up Authentication portal
 *
 * Routing logic:
 *   loading              → skeleton
 *   not logged in         → /login
 *   canAccessAdmin        → /admin/dashboard  (straight through)
 *   role=user, pending    → "Your request is pending" UI
 *   role=user, no request → 6-box OTP verification flow → submit admin request
 */
import { useState, useRef, useEffect } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAdminAuth } from '../../contexts/AdminAuthContext';
import { useAuth } from '../../contexts/AuthContext';
import { ShieldCheck, Mail, Lock, ArrowRight, Clock, CheckCircle2, XCircle, Loader2 } from 'lucide-react';

const SERVER = import.meta.env.VITE_SERVER_URL || 'http://localhost:3002';

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

/* ─── OTP input box array ──────────────────────────────────────────────── */
const OtpBoxes = ({ value, onChange, disabled }) => {
  const refs = useRef([]);

  const handleKey = (e, idx) => {
    if (e.key === 'Backspace') {
      if (value[idx]) {
        const next = value.split('');
        next[idx] = '';
        onChange(next.join(''));
      } else if (idx > 0) {
        refs.current[idx - 1]?.focus();
      }
      return;
    }
    if (!/^\d$/.test(e.key)) return;
    const next = value.split('').concat(Array(6).fill(''));
    next[idx] = e.key;
    const joined = next.slice(0, 6).join('');
    onChange(joined);
    if (idx < 5) refs.current[idx + 1]?.focus();
  };

  return (
    <div className="flex gap-2 justify-center">
      {Array.from({ length: 6 }).map((_, i) => (
        <input
          key={i}
          ref={el => (refs.current[i] = el)}
          type="text"
          inputMode="numeric"
          maxLength={1}
          disabled={disabled}
          value={value[i] || ''}
          onChange={() => {}}
          onKeyDown={e => handleKey(e, i)}
          onFocus={e => e.target.select()}
          className={`
            w-11 h-14 text-center text-xl font-bold rounded-xl
            bg-white/10 border-2 transition-all duration-150 text-white outline-none
            ${value[i] ? 'border-indigo-400 bg-indigo-900/30' : 'border-white/20'}
            focus:border-indigo-400 focus:bg-indigo-900/20
            disabled:opacity-40
          `}
        />
      ))}
    </div>
  );
};

/* ─── Main component ────────────────────────────────────────────────────── */
const AdminGatekeeper = () => {
  const { canAccessAdmin, loading: authLoading, adminRequestStatus } = useAdminAuth();
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  // Step: 'email' | 'otp' | 'request' | 'pending'
  const [step,      setStep]      = useState('email');
  const [otp,       setOtp]       = useState('');
  const [sending,   setSending]   = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error,     setError]     = useState('');
  const [success,   setSuccess]   = useState('');
  const [timer,     setTimer]     = useState(0);

  // Countdown for resend button
  useEffect(() => {
    if (timer <= 0) return;
    const id = setInterval(() => setTimer(t => t - 1), 1000);
    return () => clearInterval(id);
  }, [timer]);

  // Auto-verify when all 6 digits entered
  useEffect(() => {
    if (otp.length === 6 && step === 'otp') handleVerify(otp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otp]);

  // ── Routing decisions after auth loads ──────────────────────────────────
  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
      </div>
    );
  }
  if (!currentUser)       return <Navigate to="/login" replace />;
  if (canAccessAdmin)     return <Navigate to="/admin/dashboard" replace />;
  if (adminRequestStatus === 'pending' && step !== 'pending') {
    // sync component step with Firestore state
  }

  // ── Step handlers ────────────────────────────────────────────────────────
  const handleSendCode = async () => {
    setError('');
    setSending(true);
    try {
      const res  = await fetch(`${SERVER}/api/send-verification`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email: currentUser.email, name: currentUser.displayName || '' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send code');
      setStep('otp');
      setTimer(60);
      setSuccess('Code sent! Check your inbox.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  const handleVerify = async (code) => {
    setError('');
    setVerifying(true);
    try {
      const res  = await fetch(`${SERVER}/api/verify-code`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email: currentUser.email, code: code || otp }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Invalid code');
      setStep('request');
      setSuccess('');
    } catch (err) {
      setError(err.message);
      setOtp('');
    } finally {
      setVerifying(false);
    }
  };

  const handleSubmitRequest = async () => {
    setError('');
    setSubmitting(true);
    try {
      await updateDoc(doc(db, 'users', currentUser.uid), {
        admin_request_status: 'pending',
      });
      setStep('pending');
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const isPending = adminRequestStatus === 'pending' || step === 'pending';

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
                Your admin access request has been submitted and is awaiting review. You'll receive an email once approved.
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

          {/* ── STEP 1: Email confirmation ────────────────────────── */}
          {!isPending && step === 'email' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold text-white mb-1">Identity Verification</h2>
                <p className="text-slate-400 text-sm">We'll send a one-time code to confirm your identity before processing your admin access request.</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-2 uppercase tracking-wider">Your Email</label>
                <div className="flex items-center gap-3 bg-white/5 border border-white/15 rounded-xl px-4 py-3">
                  <Mail className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  <span className="text-white text-sm truncate">{currentUser?.email}</span>
                  <span className="ml-auto text-xs text-slate-500 flex-shrink-0">verified</span>
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-red-400 text-sm">
                  <XCircle className="w-4 h-4 flex-shrink-0" />
                  {error}
                </div>
              )}

              <Btn onClick={handleSendCode} loading={sending}>
                <Mail className="w-4 h-4" />
                Send Verification Code
              </Btn>
              <Btn variant="ghost" onClick={() => navigate('/app')}>
                Cancel
              </Btn>
            </div>
          )}

          {/* ── STEP 2: OTP boxes ────────────────────────────────── */}
          {!isPending && step === 'otp' && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="w-12 h-12 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center mx-auto mb-3">
                  <Lock className="w-5 h-5 text-indigo-400" />
                </div>
                <h2 className="text-xl font-bold text-white mb-1">Enter Your Code</h2>
                <p className="text-slate-400 text-sm">
                  A 6-digit code was sent to <span className="text-white font-medium">{currentUser?.email}</span>
                </p>
              </div>

              <OtpBoxes value={otp} onChange={setOtp} disabled={verifying} />

              {verifying && (
                <div className="flex items-center justify-center gap-2 text-indigo-400 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Verifying…
                </div>
              )}

              {success && (
                <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/30 rounded-xl p-3 text-green-400 text-sm">
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  {success}
                </div>
              )}

              {error && (
                <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-red-400 text-sm">
                  <XCircle className="w-4 h-4 flex-shrink-0" />
                  {error}
                </div>
              )}

              <div className="text-center">
                {timer > 0 ? (
                  <span className="text-xs text-slate-500">Resend in {timer}s</span>
                ) : (
                  <button
                    onClick={handleSendCode}
                    disabled={sending}
                    className="text-xs text-indigo-400 hover:text-indigo-300 underline transition-colors"
                  >
                    {sending ? 'Sending…' : 'Resend code'}
                  </button>
                )}
              </div>

              <Btn variant="ghost" onClick={() => { setStep('email'); setOtp(''); setError(''); }}>
                ← Back
              </Btn>
            </div>
          )}

          {/* ── STEP 3: Submit admin request ─────────────────────── */}
          {!isPending && step === 'request' && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="w-12 h-12 rounded-full bg-green-500/20 border border-green-500/30 flex items-center justify-center mx-auto mb-3">
                  <CheckCircle2 className="w-5 h-5 text-green-400" />
                </div>
                <h2 className="text-xl font-bold text-white mb-1">Identity Confirmed</h2>
                <p className="text-slate-400 text-sm">Your email has been verified. You can now submit a request for admin access.</p>
              </div>

              <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-4 space-y-2 text-sm text-slate-300">
                <p className="font-semibold text-white text-xs uppercase tracking-wider mb-1">What happens next?</p>
                <p className="flex items-start gap-2"><span className="text-indigo-400 mt-0.5">✓</span> Your request is added to the admin review queue</p>
                <p className="flex items-start gap-2"><span className="text-indigo-400 mt-0.5">✓</span> A super admin will review and approve your access</p>
                <p className="flex items-start gap-2"><span className="text-indigo-400 mt-0.5">✓</span> You'll receive an email notification on decision</p>
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
                Not now
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
