/**
 * AdminAuthContext — Phase 1 Enterprise Upgrade
 *
 * 4-tier RBAC:  owner  >  super_admin  >  admin  >  user
 *
 * LEGACY PURGE: The old boolean `isAdmin`/`isSuperAdmin` pattern from
 * AuthContext is intentionally NOT forwarded here. All dashboard code
 * should use the fine-grained role string from this context.
 */
import { createContext, useContext } from 'react';
import { useAuth } from './AuthContext';

const AdminAuthContext = createContext(null);

// eslint-disable-next-line react-refresh/only-export-components
export const useAdminAuth = () => {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error('useAdminAuth must be used inside AdminAuthProvider');
  return ctx;
};

export const AdminAuthProvider = ({ children }) => {
  const { currentUser, userProfile, loading } = useAuth();

  // Raw string role from Firestore  — never trust client mutations
  const role               = userProfile?.role               ?? null;
  const adminRequestStatus = userProfile?.admin_request_status ?? null;

  // Capability flags derived purely from the role string
  const isOwner        = role === 'owner';
  const isSuperAdmin   = role === 'super_admin' || isOwner;   // owner ⊃ super_admin
  const canAccessAdmin = role === 'owner' || role === 'super_admin' || role === 'admin';
  const canManageUsers = isOwner || role === 'super_admin';    // full management
  const canPromoteToAdmin = canManageUsers || role === 'admin'; // admin can promote users
  const canEditOwner   = isOwner;                             // Ghost Owner protection

  const value = {
    // Populated only when the user is actually allowed into the dashboard
    adminUser: canAccessAdmin ? currentUser : null,
    currentUser,
    userProfile,

    // The source of truth for all role checks
    role,                  // 'owner' | 'super_admin' | 'admin' | 'user' | null
    adminRole: role,       // backward-compat alias used by SettingsNew / legacy components
    adminRequestStatus,    // 'pending' | 'approved' | 'rejected' | null

    // Derived booleans — use these in components
    isOwner,
    isSuperAdmin,
    isAdmin:       canAccessAdmin,
    canAccessAdmin,
    canManageUsers,
    canPromoteToAdmin,
    canEditOwner,

    loading,
  };

  return (
    <AdminAuthContext.Provider value={value}>
      {children}
    </AdminAuthContext.Provider>
  );
};
