import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

// Skeleton loader shown while Firebase Auth resolves the session
const FullPageSkeleton = () => (
  <div className="min-h-screen bg-slate-50 flex items-center justify-center">
    <div className="flex flex-col items-center gap-4">
      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 animate-pulse" />
      <div className="space-y-2">
        <div className="h-2.5 w-32 bg-slate-200 rounded-full animate-pulse" />
        <div className="h-2 w-24 bg-slate-100 rounded-full animate-pulse mx-auto" />
      </div>
    </div>
  </div>
);

const ProtectedRoute = ({ children }) => {
  const { currentUser, loading } = useAuth();

  if (loading) return <FullPageSkeleton />;
  return currentUser ? children : <Navigate to="/login" replace />;
};

export default ProtectedRoute;
