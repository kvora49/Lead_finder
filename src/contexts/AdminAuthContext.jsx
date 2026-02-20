// AdminAuthContext — Phase 1 stub
// Admin status is derived entirely from the user's Firestore `role` field,
// which is set securely in AuthContext.  Phase 5 will expand this context
// with full admin management, impersonation, and audit-log helpers.
import { createContext, useContext } from 'react';
import { useAuth } from './AuthContext';

const AdminAuthContext = createContext(null);

// eslint-disable-next-line react-refresh/only-export-components
export const useAdminAuth = () => {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error('useAdminAuth must be used within AdminAuthProvider');
  return ctx;
};

export const AdminAuthProvider = ({ children }) => {
  const { currentUser, userProfile, loading, isAdmin, isSuperAdmin } = useAuth();

  const value = {
    adminUser:      isAdmin ? currentUser : null,
    adminRole:      userProfile?.role ?? null,
    loading,
    isAdmin,
    isSuperAdmin,
    canManageUsers: isAdmin,
    canViewOnly:    userProfile?.role === 'viewer',
  };

  return (
    <AdminAuthContext.Provider value={value}>
      {children}
    </AdminAuthContext.Provider>
  );
};
