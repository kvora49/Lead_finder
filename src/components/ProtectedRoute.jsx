import { Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';

// Skeleton loader shown while Firebase Auth resolves the session
const FullPageSkeleton = () => (
  <div className="min-h-screen bg-slate-50 dark:bg-[#0A0A0A] flex items-center justify-center">
    <div className="flex flex-col items-center gap-4">
      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 animate-pulse" />
      <div className="space-y-2">
        <div className="h-2.5 w-32 bg-slate-200 dark:bg-white/10 rounded-full animate-pulse" />
        <div className="h-2 w-24 bg-slate-100 dark:bg-white/5 rounded-full animate-pulse mx-auto" />
      </div>
    </div>
  </div>
);

const ProtectedRoute = ({ children }) => {
  const { currentUser, userProfile, loading } = useAuth();
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [requireEmailVerification, setRequireEmailVerification] = useState(true);
  const [maintenanceMessage, setMaintenanceMessage] = useState(
    'System under maintenance. Please check back later.'
  );
  const [settingsLoading, setSettingsLoading] = useState(true);

  useEffect(() => {
    // Subscribe to maintenance mode in real-time
    const unsub = onSnapshot(
      doc(db, 'systemConfig', 'globalSettings'),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setMaintenanceMode(data.maintenanceMode ?? false);
          setRequireEmailVerification(data.requireEmailVerification ?? true);
          setMaintenanceMessage(
            data.maintenanceMessage || 'System under maintenance. Please check back later.'
          );
        }
        setSettingsLoading(false);
      },
      () => {
        // If Firestore read fails (permission denied, offline), don't block the user
        setSettingsLoading(false);
      }
    );
    return () => unsub();
  }, []);

  if (loading || settingsLoading) return <FullPageSkeleton />;
  if (!currentUser) return <Navigate to="/login" replace />;

  if (userProfile?.isActive === false) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#0A0A0A] flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center">
          <div className="w-20 h-20 bg-amber-100 dark:bg-amber-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M12 9v3.75m0 3.75h.008v.008H12v-.008zm9-4.5a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-3">
            Account Pending Approval
          </h1>
          <p className="text-slate-500 dark:text-gray-400 text-sm leading-relaxed">
            Your account is waiting for admin approval. Please contact support or your administrator.
          </p>
        </div>
      </div>
    );
  }

  // Admins and super_admins bypass maintenance mode — they can always access the app
  const isAdmin = userProfile?.role === 'admin'
    || userProfile?.role === 'super_admin'
    || userProfile?.role === 'owner';

  if (maintenanceMode && !isAdmin) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#0A0A0A] flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center">
          <div className="w-20 h-20 bg-amber-100 dark:bg-amber-500/20 rounded-full
            flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-amber-600 dark:text-amber-400"
              fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-3">
            Under Maintenance
          </h1>
          <p className="text-slate-500 dark:text-gray-400 text-sm leading-relaxed">
            {maintenanceMessage}
          </p>
          <p className="text-xs text-slate-400 dark:text-gray-600 mt-6">
            Are you an admin?{' '}
            <a href="/admin" className="text-indigo-600 dark:text-indigo-400 font-medium hover:underline">
              Go to admin dashboard
            </a>
          </p>
        </div>
      </div>
    );
  }

  const isGoogleUser = currentUser.providerData?.some(
    (p) => p.providerId === 'google.com'
  );

  // Legacy users created before verification rollout are treated as verified.
  const createdAt = currentUser.metadata?.creationTime
    ? new Date(currentUser.metadata.creationTime).getTime()
    : Date.now();
  const verificationRolloutAt = new Date('2026-03-15T00:00:00Z').getTime();
  const isLegacyAccount = createdAt < verificationRolloutAt;

  if (requireEmailVerification && !currentUser.emailVerified && !isGoogleUser && !isLegacyAccount) {
    return (
      <Navigate
        to="/check-email"
        state={{ email: currentUser.email }}
        replace
      />
    );
  }

  return children;
};

export default ProtectedRoute;
