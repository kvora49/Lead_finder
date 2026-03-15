import { Navigate } from 'react-router-dom';
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
  const { currentUser, loading } = useAuth();

  if (loading) return <FullPageSkeleton />;
  if (!currentUser) return <Navigate to="/login" replace />;

  const isGoogleUser = currentUser.providerData?.some(
    (p) => p.providerId === 'google.com'
  );

  // Legacy users created before verification rollout are treated as verified.
  const createdAt = currentUser.metadata?.creationTime
    ? new Date(currentUser.metadata.creationTime).getTime()
    : Date.now();
  const verificationRolloutAt = new Date('2026-03-15T00:00:00Z').getTime();
  const isLegacyAccount = createdAt < verificationRolloutAt;

  if (!currentUser.emailVerified && !isGoogleUser && !isLegacyAccount) {
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
