import { Navigate } from 'react-router-dom';
import { useAdminAuth } from '../../contexts/AdminAuthContext';
import { Loader2 } from 'lucide-react';

const AdminRoute = ({ children }) => {
  const { adminUser, loading } = useAdminAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-blue-500 animate-spin mx-auto mb-4" />
          <p className="text-gray-300 text-lg">Verifying admin access...</p>
        </div>
      </div>
    );
  }

  if (!adminUser) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

export default AdminRoute;
