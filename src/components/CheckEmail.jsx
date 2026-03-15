import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getAuth, sendEmailVerification, reload } from 'firebase/auth';
import { Mail, RefreshCw, ArrowLeft, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

const CheckEmail = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const email = location.state?.email || '';

  const [resending, setResending] = useState(false);
  const [checking, setChecking] = useState(false);
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
      if (auth.currentUser) {
        await sendEmailVerification(auth.currentUser);
        toast.success('Verification email resent!');
        startCountdown();
      } else {
        toast.error('Please log in again to resend.');
        navigate('/login');
      }
    } catch (err) {
      if (err.code === 'auth/too-many-requests') {
        toast.error('Too many requests. Please wait a few minutes.');
      } else {
        toast.error('Failed to resend. Please try again.');
      }
    } finally {
      setResending(false);
    }
  };

  const handleCheckVerified = async () => {
    setChecking(true);
    try {
      const auth = getAuth();
      if (!auth.currentUser) {
        navigate('/login');
        return;
      }
      await reload(auth.currentUser);
      if (auth.currentUser.emailVerified) {
        toast.success('Email verified! Welcome to Lead Finder.');
        navigate('/app', { replace: true });
      } else {
        toast.error("Email not verified yet. Check your inbox and click the link.");
      }
    } catch (err) {
      toast.error('Could not check verification status. Please try again.');
    } finally {
      setChecking(false);
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
          Check your email
        </h1>
        <p className="text-sm text-slate-500 dark:text-gray-400 mb-2 leading-relaxed">
          We sent a verification link to{' '}
          {email && (
            <span className="font-semibold text-slate-700 dark:text-gray-300">
              {email}
            </span>
          )}
        </p>
        <p className="text-sm text-slate-500 dark:text-gray-400 mb-8 leading-relaxed">
          Click the link in that email to verify your account, then come back here.
        </p>

        <button
          onClick={handleCheckVerified}
          disabled={checking}
          className="w-full flex items-center justify-center gap-2 py-3 mb-4
            rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white
            text-sm font-semibold hover:shadow-md transition-all
            disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.98]"
        >
          {checking ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" strokeWidth={1.5} />
              Checking...
            </>
          ) : (
            <>
              <CheckCircle className="w-4 h-4" strokeWidth={1.5} />
              I've verified my email
            </>
          )}
        </button>

        <p className="text-center text-sm text-slate-500 dark:text-gray-400">
          Didn't receive the email?{' '}
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
