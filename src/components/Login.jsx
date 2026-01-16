import { useState } from 'react';
import { signInWithEmailAndPassword, signInWithPopup, signInWithRedirect, getRedirectResult, GoogleAuthProvider } from 'firebase/auth';
import { auth, db } from '../firebase';
import { doc, setDoc, updateDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import { Link, useNavigate } from 'react-router-dom';
import { Search, Mail, Lock, AlertCircle, Loader2, Eye, EyeOff } from 'lucide-react';
import { useEffect } from 'react';
import { logAuthEvent } from '../services/analyticsService';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // Check for redirect result on component mount
  useEffect(() => {
    const checkRedirectResult = async () => {
      try {
        const result = await getRedirectResult(auth);
        if (result) {
          // Check if user is an admin
          const adminDocRef = doc(db, 'adminUsers', result.user.email);
          const adminDocSnap = await getDoc(adminDocRef);
          const isAdmin = adminDocSnap.exists();
          const adminRole = isAdmin ? adminDocSnap.data().role : 'user';

          // Update user document with correct role
          try {
            await setDoc(doc(db, 'users', result.user.uid), {
              uid: result.user.uid,
              email: result.user.email,
              role: adminRole,
              lastActive: serverTimestamp()
            }, { merge: true });
          } catch (docError) {
            console.error('Error updating user document:', docError);
          }

          await logAuthEvent(result.user.uid, result.user.email, 'User Login', {
            method: 'Google Redirect',
            role: adminRole
          });
          navigate('/');
        }
      } catch (error) {
        if (error.code !== 'auth/popup-closed-by-user') {
          setError(error.message.replace('Firebase: ', ''));
        }
      }
    };
    checkRedirectResult();
  }, [navigate]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      
      // Check if user is an admin
      const adminDocRef = doc(db, 'adminUsers', userCredential.user.email);
      const adminDocSnap = await getDoc(adminDocRef);
      const isAdmin = adminDocSnap.exists();
      const adminRole = isAdmin ? adminDocSnap.data().role : 'user';
      
      // Update user document with correct role
      try {
        await setDoc(doc(db, 'users', userCredential.user.uid), {
          uid: userCredential.user.uid,
          email: userCredential.user.email,
          role: adminRole,
          lastActive: serverTimestamp()
        }, { merge: true });
      } catch (docError) {
        console.error('Error updating user document:', docError);
      }

      await logAuthEvent(userCredential.user.uid, userCredential.user.email, 'User Login', {
        method: 'Email/Password',
        role: adminRole
      });
      navigate('/');
    } catch (error) {
      // Better error messages
      let errorMessage = error.message.replace('Firebase: ', '').replace('Error ', '');
      let isUserNotFound = false;
      
      if (error.code === 'auth/user-not-found') {
        errorMessage = 'No account found with this email address.';
        isUserNotFound = true;
      } else if (error.code === 'auth/wrong-password') {
        errorMessage = 'Invalid password. Please check your password and try again.';
      } else if (error.code === 'auth/invalid-credential') {
        // This is the catch-all for both user not found and wrong password in newer Firebase versions
        errorMessage = 'No account found with this email address. Please sign up first.';
        isUserNotFound = true;
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'Invalid email address format.';
      } else if (error.code === 'auth/too-many-requests') {
        errorMessage = 'Too many failed login attempts. Please try again later or reset your password.';
      }
      
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    setLoading(true);
    const provider = new GoogleAuthProvider();

    try {
      // Try popup method first
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      // Check if user is an admin
      const adminDocRef = doc(db, 'adminUsers', user.email);
      const adminDocSnap = await getDoc(adminDocRef);
      const isAdmin = adminDocSnap.exists();
      const adminRole = isAdmin ? adminDocSnap.data().role : 'user';

      // Create or update user document in Firestore
      const userDocRef = doc(db, 'users', user.uid);
      const userCreditsRef = doc(db, 'userCredits', user.uid);
      
      try {
        // Create/update user document
        await setDoc(userDocRef, {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          photoURL: user.photoURL,
          role: adminRole,
          status: 'active',
          provider: 'google',
          lastActive: serverTimestamp()
        }, { merge: true });

        // Initialize user credits if not exists (only for regular users)
        if (adminRole === 'user') {
          await setDoc(userCreditsRef, {
            userId: user.uid,
            userEmail: user.email,
            creditsUsed: 0,
            totalApiCalls: 0
          }, { merge: true });
        }

        // Log authentication event
        await logAuthEvent(user.uid, user.email, 'User Login', {
          method: 'Google',
          provider: 'google',
          role: adminRole
        });
      } catch (firestoreError) {
        console.error('Error updating user document:', firestoreError);
      }

      navigate('/');
    } catch (error) {
      // If popup is blocked or closed, use redirect method
      if (error.code === 'auth/popup-blocked' || error.code === 'auth/popup-closed-by-user' || error.code === 'auth/cancelled-popup-request') {
        try {
          // Use redirect method as fallback
          await signInWithRedirect(auth, provider);
          // Navigation will happen in useEffect after redirect completes
        } catch (redirectError) {
          setError(redirectError.message.replace('Firebase: ', ''));
          setLoading(false);
        }
      } else {
        setError(error.message.replace('Firebase: ', ''));
        setLoading(false);
      }
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center p-4">
      {/* Background Pattern */}
      <div className="absolute inset-0 bg-grid-pattern opacity-5"></div>
      
      <div className="relative w-full max-w-md">
        {/* Logo & Title */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-600 to-purple-600 rounded-2xl mb-4 shadow-lg">
            <Search className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-800 mb-2">Welcome Back!</h1>
          <p className="text-gray-600">Sign in to continue to Lead Finder</p>
        </div>

        {/* Login Card */}
        <div className="glass-panel bg-white/80 backdrop-blur-xl rounded-2xl shadow-2xl p-8 border border-white/20">
          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-start gap-3 mb-2">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-800">{error}</p>
              </div>
              {error.includes('No account found') && (
                <div className="ml-8 mt-2">
                  <p className="text-sm text-gray-700">
                    Don't have an account?{' '}
                    <Link to="/register" className="text-blue-600 hover:text-blue-700 font-semibold underline">
                      Sign up for free
                    </Link>
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleLogin} className="space-y-5">
            {/* Email Field */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                  placeholder="you@example.com"
                  required
                  disabled={loading}
                />
              </div>
            </div>

            {/* Password Field */}
            <div className="relative">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-11 pr-12 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all [&::-ms-reveal]:hidden [&::-ms-clear]:hidden"
                  placeholder="••••••••"
                  required
                  disabled={loading}
                  autoComplete="current-password"
                />
                {password && (
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700 z-20"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                )}
              </div>
            </div>

            {/* Forgot Password */}
            <div className="flex items-center justify-end">
              <Link to="/forgot-password" className="text-sm text-blue-600 hover:text-blue-700 font-medium">
                Forgot password?
              </Link>
            </div>

            {/* Login Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white py-3 rounded-lg font-semibold hover:from-blue-700 hover:to-purple-700 transition-all duration-200 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Signing in...
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-white text-gray-500">Or continue with</span>
            </div>
          </div>

          {/* Google Login */}
          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full bg-white border-2 border-gray-300 text-gray-700 py-3 rounded-lg font-semibold hover:bg-gray-50 hover:border-gray-400 transition-all duration-200 flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </button>

          {/* Sign Up Link */}
          <p className="text-center text-sm text-gray-600 mt-6">
            Don't have an account?{' '}
            <Link to="/register" className="text-blue-600 hover:text-blue-700 font-semibold">
              Sign up for free
            </Link>
          </p>
        </div>

        {/* Footer */}
        <p className="text-center text-sm text-gray-500 mt-6">
          © 2025 Lead Finder. All rights reserved.
        </p>
      </div>
    </div>
  );
};

export default Login;
