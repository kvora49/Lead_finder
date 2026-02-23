/**
 * AdminGatekeeper — Enterprise Step-Up Authentication
 *
 * 100% frontend OTP using EmailJS + Firebase Firestore.
 * No backend / Node.js server required.
 *
 * Flow:
 *   loading              → skeleton
 *   not logged in        → /login
 *   canAccessAdmin       → /admin/dashboard  (straight through)
 *   pending already      → "Request Pending" screen
 *   normal user          → Step 1: send OTP  →  Step 2: 6-box verify  →  Step 3: pending
 */
import { useState, useRef, useEffect } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import emailjs from '@emailjs/browser';
import {
  doc, setDoc, getDoc, deleteDoc, updateDoc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { useAdminAuth } from '../../contexts/AdminAuthContext';
import { useAuth } from '../../contexts/AuthContext';
import {
  ShieldCheck, Mail, Lock, Clock,
  CheckCircle2, XCircle, Loader2, RefreshCw,
} from 'lucide-react';

/* ─── EmailJS config ────────────────────────────────────────────────────── */
const EJS_SERVICE_ID  = import.meta.env.VITE_EMAILJS_SERVICE_ID  || 'YOUR_SERVICE_ID';
const EJS_TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID || 'YOUR_TEMPLATE_ID';
const EJS_PUBLIC_KEY  = import.meta.env.VITE_EMAILJS_PUBLIC_KEY  || 'YOUR_PUBLIC_KEY';

/* ─── OTP generator ─────────────────────────────────────────────────────── */
const genOtp = () => Math.floor(100000 + Math.random() * 900000).toString();

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

/* ─── 6-Box OTP Input ────────────────────────────────────────────────────── */
const OtpBoxes = ({ value, onChange, disabled, firstRef }) => {
  const refs = useRef([]);

  const setRef = (el, i) => {
    refs.current[i] = el;
    if (i === 0 && firstRef) firstRef.current = el;
  };

  const handleKeyDown = (e, idx) => {
    if (e.key === 'Backspace') {
      if (value[idx]) {
        const arr = value.split('');
        arr[idx] = '';
        onChange(arr.join(''));
      } else if (idx > 0) {
        refs.current[idx - 1]?.focus();
      }
      return;
    }
    if (!/^\d$/.test(e.key)) return;
    const arr = (value + '      ').slice(0, 6).split('');
    arr[idx] = e.key;
    onChange(arr.join('').replace(/ /g, ''));
    if (idx < 5) setTimeout(() => refs.current[idx + 1]?.focus(), 0);
  };

  const handlePaste = (e) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted) {
      onChange(pasted);
      setTimeout(() => refs.current[Math.min(pasted.length, 5)]?.focus(), 0);
    }
    e.preventDefault();
  };

  return (
    <div className="flex gap-2.5 justify-center">
      {Array.from({ length: 6 }).map((_, i) => (
        <input
          key={i}
          ref={el => setRef(el, i)}
          type="text"
          inputMode="numeric"
          maxLength={1}
          disabled={disabled}
          value={value[i] || ''}
          onChange={() => {}}
          onKeyDown={e => handleKeyDown(e, i)}
          onPaste={handlePaste}
          onFocus={e => e.target.select()}
          className={`
            w-11 h-14 text-center text-xl font-bold rounded-xl outline-none caret-transparent
            bg-white/5 border-2 transition-all duration-150 text-white
            ${value[i] ? 'border-indigo-400 bg-indigo-900/30' : 'border-white/15'}
            focus:border-indigo-400 focus:bg-indigo-900/20
            disabled:opacity-40 disabled:cursor-not-allowed
          `}
        />
      ))}
    </div>
  );
};

/* ══════════════════════════════════════════════════════════════════════════
   Main Component
══════════════════════════════════════════════════════════════════════════ */
const AdminGatekeeper = () => {
  const { canAccessAdmin, loading: authLoading, adminRequestStatus } = useAdminAuth();
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  // 'email' | 'otp' | 'pending'
  const [step,      setStep]    = useState('email');
  const [otp,       setOtp]     = useState('');
  const [sending,   setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [toast,     setToast]   = useState({ msg: '', type: 'info' });
  const [timer,     setTimer]   = useState(0);
  const firstBox = useRef(null);

  /* countdown */
  useEffect(() => {
    if (timer <= 0) return;
    const id = setInterval(() => setTimer(t => t - 1), 1000);
    return () => clearInterval(id);
  }, [timer]);

  /* auto-verify on 6th digit */
  useEffect(() => {
    if (otp.length === 6 && step === 'otp' && !verifying) handleVerify(otp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otp]);

  /* focus first box when OTP step mounts */
  useEffect(() => {
    if (step === 'otp') setTimeout(() => firstBox.current?.focus(), 100);
  }, [step]);

  /* ── Routing ──────────────────────────────────────────────────────────── */
  if (authLoading) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
    </div>
  );
  if (!currentUser)   return <Navigate to="/login" replace />;
  if (canAccessAdmin) return <Navigate to="/admin/dashboard" replace />;

  const isPending = adminRequestStatus === 'pending' || step === 'pending';

  /* ── Helpers ──────────────────────────────────────────────────────────── */
  const showToast = (msg, type = 'info', ms = 4000) => {
    setToast({ msg, type });
    if (ms) setTimeout(() => setToast({ msg: '', type: 'info' }), ms);
  };

  /* ── Send OTP ─────────────────────────────────────────────────────────── */
  const handleSendCode = async () => {
    setToast({ msg: '', type: 'info' });
    setSending(true);
    try {
      const code = genOtp();

      // 1. Store in Firestore
      await setDoc(doc(db, 'otp_codes', currentUser.email), {
        code,
        createdAt: serverTimestamp(),
      });

      // 2. Send via EmailJS
      await emailjs.send(
        EJS_SERVICE_ID,
        EJS_TEMPLATE_ID,
        {
          to_email: currentUser.email,
          to_name:  currentUser.displayName || currentUser.email,
          otp_code: code,
          app_name: 'Lead Finder',
        },
        EJS_PUBLIC_KEY,
      );

      setStep('otp');
      setOtp('');
      setTimer(60);
      showToast('Code sent! Check your inbox.', 'success');
    } catch (err) {
      console.error(err);
      showToast(err?.text || err?.message || 'Failed to send code. Try again.', 'error');
    } finally {
      setSending(false);
    }
  };

  /* ── Verify OTP ───────────────────────────────────────────────────────── */
  const handleVerify = async (code) => {
    setVerifying(true);
    setToast({ msg: '', type: 'info' });
    try {
      const snap = await getDoc(doc(db, 'otp_codes', currentUser.email));
      if (!snap.exists()) throw new Error('Code expired. Please resend.');
      if (snap.data().code !== code) throw new Error('Incorrect code. Please try again.');

      // Valid — clean up + mark pending
      await deleteDoc(doc(db, 'otp_codes', currentUser.email));
      await updateDoc(doc(db, 'users', currentUser.uid), {
        admin_request_status: 'pending',
      });

      showToast('Verified! Request submitted.', 'success');
      setStep('pending');
    } catch (err) {
      showToast(err.message, 'error');
      setOtp('');
      setTimeout(() => firstBox.current?.focus(), 50);
    } finally {
      setVerifying(false);
    }
  };

  /* ── UI ───────────────────────────────────────────────────────────────── */
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
            <p className="text-slate-500 text-sm mt-0.5">Lead Finder — Secure Gatekeeper</p>
          </div>
        </div>

        <GlassCard className="p-8 space-y-6">

          {/* ═══ PENDING ═══════════════════════════════════════════════ */}
          {isPending && (
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

          {/* ═══ STEP 1: EMAIL ═════════════════════════════════════════ */}
          {!isPending && step === 'email' && (
            <>
              <div>
                <h2 className="text-xl font-bold text-white mb-1">Identity Verification</h2>
                <p className="text-slate-400 text-sm leading-relaxed">
                  We'll send a one-time code to confirm your identity before processing your admin access request.
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
                <Btn onClick={handleSendCode} loading={sending}>
                  <Mail className="w-4 h-4" />
                  Send Verification Code
                </Btn>
                <Btn variant="ghost" onClick={() => navigate('/app')}>Cancel</Btn>
              </div>
            </>
          )}

          {/* ═══ STEP 2: OTP ═══════════════════════════════════════════ */}
          {!isPending && step === 'otp' && (
            <>
              <div className="text-center">
                <div className="w-12 h-12 rounded-full bg-indigo-500/15 border border-indigo-500/25 flex items-center justify-center mx-auto mb-3">
                  <Lock className="w-5 h-5 text-indigo-400" />
                </div>
                <h2 className="text-xl font-bold text-white mb-1">Enter Your Code</h2>
                <p className="text-slate-400 text-sm">
                  6-digit code sent to{' '}
                  <span className="text-slate-200 font-medium">{currentUser?.email}</span>
                </p>
              </div>

              <OtpBoxes value={otp} onChange={setOtp} disabled={verifying} firstRef={firstBox} />

              {verifying && (
                <div className="flex items-center justify-center gap-2 text-indigo-400 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" /> Verifying…
                </div>
              )}

              <Toast msg={toast.msg} type={toast.type} />

              <div className="text-center">
                {timer > 0 ? (
                  <span className="text-xs text-slate-600">Resend available in {timer}s</span>
                ) : (
                  <button
                    onClick={handleSendCode}
                    disabled={sending}
                    className="inline-flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className="w-3 h-3" />
                    {sending ? 'Sending…' : 'Resend code'}
                  </button>
                )}
              </div>

              <Btn variant="ghost" onClick={() => { setStep('email'); setOtp(''); setToast({ msg: '', type: 'info' }); }}>
                ← Back
              </Btn>
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
