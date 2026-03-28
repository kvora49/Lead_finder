import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getAuth } from 'firebase/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { Mail, RefreshCw, ArrowLeft, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { db } from '../firebase';
import { sendEmailOtp, verifyEmailOtp } from '../services/emailVerificationService';
import { triggerSystemEmail } from '../services/notificationService';

const CheckEmail = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const email = location.state?.email || '';

  const [resending, setResending] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [countdown, setCountdown] = useState(0);

  const startCountdown = () => {
    setCountdown(60);
    const timer = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(timer);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  };

  const handleResend = async () => {
    if (countdown > 0 || resending) return;
    setResending(true);
    try {
      const auth = getAuth();
      if (!auth.currentUser) {
        toast.error('Please log in again to resend.');
        navigate('/login');
        return;
      }

      const result = await sendEmailOtp();
      if (result?.ok) {
        toast.success('OTP sent to your email.');
      } else {
        toast.error('Could not send OTP right now. Please try again.');
        return;
      }

      startCountdown();
    } catch (err) {
      toast.error(err?.message || 'Failed to resend OTP. Please try again.');
    } finally {
      setResending(false);
    }
  };

  const handleVerifyOtp = async () => {
    const code = otpCode.trim();
    if (!/^\d{6}$/.test(code)) {
      toast.error('Please enter a valid 6-digit OTP.');
      return;
    }

    setVerifyingOtp(true);
    try {
      const auth = getAuth();
      if (!auth.currentUser) {
        navigate('/login');
        return;
      }

      const result = await verifyEmailOtp(code);
      if (!result?.ok) {
        toast.error('Invalid or expired OTP. Please try again.');
        return;
      }

      await setDoc(doc(db, 'users', auth.currentUser.uid), {
        emailVerified: true,
        emailVerifiedAt: serverTimestamp(),
      }, { merge: true });

      // Welcome email is sent only after OTP verification is successful.
      await triggerSystemEmail('welcome', {
        userEmail: auth.currentUser.email,
        displayName: auth.currentUser.displayName || '',
      });

      toast.success('Email verified successfully.');
      navigate('/app', { replace: true });
    } catch (err) {
      toast.error(err?.message || 'Could not verify OTP. Please try again.');
    } finally {
      setVerifyingOtp(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0A0A0A]
      flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <button
          onClick={() => navigate('/register')}
          className="flex items-center gap-1.5 text-sm text-slate-500
            dark:text-gray-400 hover:text-slate-700 dark:hover:text-white
            transition-colors mb-8"
        >
          <ArrowLeft className="w-4 h-4" strokeWidth={1.5} />
          Back to register
        </button>

        <div className="w-14 h-14 bg-indigo-100 dark:bg-indigo-500/20 rounded-2xl
          flex items-center justify-center mb-6">
          <Mail className="w-7 h-7 text-indigo-600 dark:text-indigo-400" strokeWidth={1.5} />
        </div>

        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
          Verify your email with OTP
        </h1>
        <p className="text-sm text-slate-500 dark:text-gray-400 mb-2 leading-relaxed">
          We sent a verification code to{' '}
          {email && (
            <span className="font-semibold text-slate-700 dark:text-gray-300">
              {email}
            </span>
          )}
        </p>
        <p className="text-sm text-slate-500 dark:text-gray-400 mb-8 leading-relaxed">
          Enter the 6-digit OTP sent to your email to complete account setup.
        </p>

        <div className="mb-4">
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={otpCode}
            onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="Enter 6-digit OTP"
            className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-white/10
              bg-white dark:bg-white/5 text-slate-900 dark:text-white text-center tracking-[0.35em]
              text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <button
          onClick={handleVerifyOtp}
          disabled={verifyingOtp}
          className="w-full flex items-center justify-center gap-2 py-3 mb-3
            rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white
            text-sm font-semibold hover:shadow-md transition-all
            disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.98]"
        >
          {verifyingOtp ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" strokeWidth={1.5} />
              Verifying OTP...
            </>
          ) : (
            <>
              <CheckCircle className="w-4 h-4" strokeWidth={1.5} />
              Verify OTP
            </>
          )}
        </button>

        <p className="text-center text-sm text-slate-500 dark:text-gray-400 mt-4">
          Didn't receive the OTP?{' '}
          <button
            onClick={handleResend}
            disabled={countdown > 0 || resending}
            className="font-semibold text-indigo-600 dark:text-indigo-400
              hover:text-indigo-700 dark:hover:text-indigo-300
              disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {resending
              ? 'Sending...'
              : countdown > 0
                ? `Resend in ${countdown}s`
                : 'Resend email'
            }
          </button>
        </p>

        <p className="text-center text-xs text-slate-400 dark:text-gray-600 mt-6">
          Check your spam folder if you don't see it in your inbox.
        </p>
      </div>
    </div>
  );
};

export default CheckEmail;
