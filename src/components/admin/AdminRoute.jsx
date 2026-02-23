import { Navigate } from 'react-router-dom';
import { useAdminAuth } from '../../contexts/AdminAuthContext';

const AdminSkeleton = () => (
  <div className="min-h-screen bg-slate-900 flex items-center justify-center">
    <div className="flex flex-col items-center gap-4">
      <div className="w-10 h-10 rounded-xl bg-violet-700 animate-pulse" />
      <div className="space-y-2">
        <div className="h-2.5 w-40 bg-slate-700 rounded-full animate-pulse" />
        <div className="h-2 w-28 bg-slate-800 rounded-full animate-pulse mx-auto" />
      </div>
    </div>
  </div>
);

/**
 * AdminRoute — 4-tier RBAC guard.
 * Allows:  owner | super_admin | admin
 * Blocks:  user  →  redirected to /admin (Gatekeeper)
 */
const AdminRoute = ({ children }) => {
  const { canAccessAdmin, loading } = useAdminAuth();

  if (loading) return <AdminSkeleton />;
  // Non-admin users land on the Gatekeeper to request access / verify identity
  if (!canAccessAdmin) return <Navigate to="/admin" replace />;
  return children;
};

export default AdminRoute;
