import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  sendPasswordResetEmail,
  updateProfile,
  signInWithPopup,
  GoogleAuthProvider,
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { CREDIT_CONFIG } from '../config';
import { triggerSystemEmail } from '../services/notificationService';

const AuthContext = createContext(null);

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
};

// ─── Friendly error messages ───────────────────────────────────────────────────
const FIREBASE_ERRORS = {
  'auth/user-not-found':       'No account found with this email. Please sign up first.',
  'auth/wrong-password':       'Incorrect password. Please try again.',
  'auth/invalid-credential':   'Invalid email or password. Please check your credentials.',
  'auth/email-already-in-use': 'An account with this email already exists. Please log in.',
  'auth/weak-password':        'Password must be at least 6 characters long.',
  'auth/invalid-email':        'Please enter a valid email address.',
  'auth/too-many-requests':    'Too many attempts. Please wait a moment and try again.',
  'auth/popup-closed-by-user': 'Sign-in was cancelled.',
  'auth/network-request-failed': 'Network error. Please check your connection.',
};

const friendlyError = (code) =>
  FIREBASE_ERRORS[code] || 'An unexpected error occurred. Please try again.';

const loadRuntimeAccessSettings = async () => {
  try {
    const snap = await getDoc(doc(db, 'systemConfig', 'globalSettings'));
    const data = snap.exists() ? snap.data() : {};

    const rawDefaultLimit = data.defaultUserCreditLimit;
    let defaultUserCreditLimit = CREDIT_CONFIG.DEFAULT_USER_BUDGET_USD;
    if (rawDefaultLimit === 'unlimited') {
      defaultUserCreditLimit = 'unlimited';
    } else {
      const parsedDefault = Number.parseFloat(rawDefaultLimit);
      if (Number.isFinite(parsedDefault) && parsedDefault >= 0) {
        defaultUserCreditLimit = parsedDefault;
      }
    }

    return {
      autoApproveUsers: data.autoApproveUsers ?? true,
      defaultUserCreditLimit,
    };
  } catch {
    return {
      autoApproveUsers: true,
      defaultUserCreditLimit: CREDIT_CONFIG.DEFAULT_USER_BUDGET_USD,
    };
  }
};

// ─── Create / merge Firestore user document ─────────────────────────────────
const syncUserDoc = async (user, extra = {}) => {
  const ref  = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    const accessSettings = await loadRuntimeAccessSettings();

    // Brand-new user — seed the document with safe defaults
    await setDoc(ref, {
      uid:         user.uid,
      email:       user.email,
      displayName: user.displayName || extra.displayName || '',
      photoURL:    user.photoURL   || null,
      role:        'user',               // NEVER elevated from the client
      isActive:    accessSettings.autoApproveUsers,
      credits:     CREDIT_CONFIG.DEFAULT_CREDITS,
      creditLimit: accessSettings.defaultUserCreditLimit,
      creditMonth: null,
      userMonthlyApiCost: 0,
      userMonthlyApiCalls: 0,
      creditsUsed: 0,
      searchCount: 0,
      approvalStatus: accessSettings.autoApproveUsers ? 'approved' : 'pending',
      provider:    extra.provider || 'email',
      lastActive:  serverTimestamp(),
      createdAt:   serverTimestamp(),
      updatedAt:   serverTimestamp(),
    });
  } else {
    // Returning user — refresh timestamps including lastActive for admin dashboard
    await setDoc(ref, {
      updatedAt:  serverTimestamp(),
      lastActive: serverTimestamp(),
    }, { merge: true });
  }

  const latest = await getDoc(ref);
  return latest.data();
};

// ─── Provider ────────────────────────────────────────────────────────────────────
export const AuthProvider = ({ children }) => {
  const [currentUser,  setCurrentUser]  = useState(null);
  const [userProfile,  setUserProfile]  = useState(null); // Firestore document
  const [loading,      setLoading]      = useState(true);

  // Sync Firebase Auth state → Firestore profile
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const snap = await getDoc(doc(db, 'users', user.uid));
          setUserProfile(snap.exists() ? snap.data() : null);
        } catch {
          setUserProfile(null);
        }
      } else {
        setUserProfile(null);
      }
      setCurrentUser(user);
      setLoading(false);
    });
    return unsub;
  }, []);

  // ── Register (email / password) ───────────────────────────────────────
  const register = useCallback(async (email, password, displayName) => {
    const { user } = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(user, { displayName });
    const profile = await syncUserDoc(user, { displayName, provider: 'email' });
    setUserProfile(profile);

    // Non-blocking welcome email trigger controlled by admin email settings.
    triggerSystemEmail('welcome', {
      userEmail: user.email,
      displayName: displayName || user.displayName || '',
    });

    return user;
  }, []);

  // ── Login (email / password) ────────────────────────────────────────
  const login = useCallback(async (email, password) => {
    try {
      const { user } = await signInWithEmailAndPassword(auth, email, password);
      const profile  = await syncUserDoc(user);
      setUserProfile(profile);
      if (profile?.isActive === false) {
        await firebaseSignOut(auth);
        throw new Error('Your account has been suspended. Please contact support.');
      }
      return user;
    } catch (err) {
      throw new Error(friendlyError(err.code) || err.message);
    }
  }, []);

  // ── Login with Google ────────────────────────────────────────────────
  const loginWithGoogle = useCallback(async () => {
    try {
      const { user } = await signInWithPopup(auth, new GoogleAuthProvider());
      const profile  = await syncUserDoc(user, { provider: 'google' });
      setUserProfile(profile);
      if (profile?.isActive === false) {
        await firebaseSignOut(auth);
        throw new Error('Your account has been suspended. Please contact support.');
      }
      return user;
    } catch (err) {
      if (
        err.code === 'auth/popup-closed-by-user' ||
        err.code === 'auth/cancelled-popup-request'
      ) return null;
      throw new Error(friendlyError(err.code) || err.message);
    }
  }, []);

  // ── Password reset ────────────────────────────────────────────────────
  const resetPassword = useCallback(async (email) => {
    try {
      await sendPasswordResetEmail(auth, email);
    } catch (err) {
      throw new Error(friendlyError(err.code) || err.message);
    }
  }, []);

  // ── Sign out ───────────────────────────────────────────────────────────
  const signOut = useCallback(async () => {
    await firebaseSignOut(auth);
    setUserProfile(null);
  }, []);

  const ADMIN_ROLES = ['owner', 'super_admin', 'admin'];

  const value = {
    currentUser,
    userProfile,
    loading,
    isAdmin:      ADMIN_ROLES.includes(userProfile?.role),
    isSuperAdmin: userProfile?.role === 'super_admin' || userProfile?.role === 'owner',
    register,
    login,
    loginWithGoogle,
    resetPassword,
    signOut,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
