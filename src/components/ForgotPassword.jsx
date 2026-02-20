import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ArrowLeft, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const ForgotPassword = () => {
  const { resetPassword } = useAuth();
  const [email,   setEmail]   = useState('');
  const [error,   setError]   = useState('');
  const [sent,    setSent]    = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await resetPassword(email);
      setSent(true);
      setEmail('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-10">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center shadow-sm">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <span className="text-lg font-bold text-slate-900">Lead Finder</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-8">
          <h2 className="text-2xl font-bold text-slate-900 mb-1">Reset password</h2>
          <p className="text-sm text-slate-500 mb-6">
            We&apos;ll send a reset link straight to your inbox.
          </p>

          {/* Success state */}
          {sent && (
            <div className="mb-5 flex items-start gap-3 bg-emerald-50 border border-emerald-200 rounded-xl p-4">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-none mt-0.5" />
              <div>
                <p className="text-sm font-medium text-emerald-800">Reset link sent!</p>
                <p className="text-xs text-emerald-700 mt-0.5">
                  Check your inbox and spam folder for the password reset email.
                </p>
              </div>
            </div>
          )}

          {/* Error state */}
          {error && (
            <div className="mb-5 flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
              <AlertCircle className="w-4 h-4 text-red-500 flex-none mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {!sent && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Email address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="email" value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com" required disabled={loading}
                    className="w-full pl-10 pr-4 py-2.5 text-sm border border-slate-300 rounded-lg bg-white
                      focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500
                      disabled:opacity-60 transition"
                  />
                </div>
              </div>

              <button type="submit" disabled={loading}
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white
                  font-semibold py-2.5 rounded-lg text-sm transition shadow-sm hover:shadow-md
                  flex items-center justify-center gap-2">
                {loading
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending&hellip;</>
                  : 'Send reset link'}
              </button>
            </form>
          )}

          {sent && (
            <button onClick={() => { setSent(false); setEmail(''); }}
              className="w-full py-2.5 text-sm font-medium text-slate-600 hover:text-slate-900
                border border-slate-200 rounded-lg hover:bg-slate-50 transition">
              Try a different email
            </button>
          )}

          <Link to="/login"
            className="mt-5 flex items-center justify-center gap-2 text-sm text-slate-500
              hover:text-slate-800 font-medium transition">
            <ArrowLeft className="w-4 h-4" /> Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;
