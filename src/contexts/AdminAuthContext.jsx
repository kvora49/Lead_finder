/**
 * AdminAuthContext — RBAC v2 (Option C)
 *
 * 4-tier hierarchy:  owner  >  super_admin  >  admin  >  user
 *
 * Ghost-Owner rule:
 *   The 'owner' role is NEVER displayed in the UI.  It renders identically
 *   to 'super_admin' ("Super Admin") everywhere.  This means a super_admin
 *   user can never identify or edit the owner account because:
 *     • The owner row looks like any other Super Admin row.
 *     • super_admin users are BLOCKED from editing rows whose DB role is
 *       'owner' OR 'super_admin' — only the owner themselves can do that.
 *
 * Permission matrix:
 * ┌──────────────────────────────┬───────┬─────────────┬───────┐
 * │ Action                       │ owner │ super_admin │ admin │
 * ├──────────────────────────────┼───────┼─────────────┼───────┤
 * │ View dashboard               │  ✓    │  ✓          │  ✓    │
 * │ View analytics / logs        │  ✓    │  ✓          │  ✓    │
 * │ Suspend / activate users     │  ✓    │  ✓ *        │  ✓ ** │
 * │ Delete users (soft)          │  ✓    │  ✓ *        │  ✗    │
 * │ Manage credit limits         │  ✓    │  ✓ *        │  ✗    │
 * │ Approve pending admin reqs   │  ✓    │  ✓          │  ✗    │
 * │ Change role  user ↔ admin    │  ✓    │  ✓ *        │  ✗    │
 * │ Promote to super_admin       │  ✓    │  ✗          │  ✗    │
 * │ Edit  super_admin / owner    │  ✓    │  ✗          │  ✗    │
 * │ Access Settings page         │  ✓    │  ✓          │  ✗    │
 * ├──────────────────────────────┴───────┴─────────────┴───────┤
 * │  * only on rows where target role is 'user' or 'admin'     │
 * │ ** only suspend/activate on rows where target role='user'  │
 * └────────────────────────────────────────────────────────────┘
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

  // Raw string role from Firestore — never trust client mutations
  const role               = userProfile?.role               ?? null;
  const adminRequestStatus = userProfile?.admin_request_status ?? null;

  // ── Tier checks ────────────────────────────────────────────────────────
  const isOwner      = role === 'owner';
  const isSuperAdmin = role === 'super_admin' || isOwner; // owner ⊃ super_admin

  // ── Dashboard access ────────────────────────────────────────────────────
  const canAccessAdmin = ['owner', 'super_admin', 'admin'].includes(role);

  // ── User management ─────────────────────────────────────────────────────
  // Full CRUD on user/admin rows (suspend, delete, credit, role change)
  const canManageUsers        = isOwner || role === 'super_admin';
  // Admin can ONLY suspend/activate plain 'user' rows — no delete, no roles
  const canBasicUserActions   = role === 'admin';
  // Hard delete / soft delete
  const canDeleteUsers        = isOwner || role === 'super_admin';
  // Change role between user ↔ admin  (NOT to super_admin unless isOwner)
  const canChangeRoles        = isOwner || role === 'super_admin';
  // Promote someone to super_admin — OWNER ONLY (prevents super_admin self-replication)
  const canPromoteToSuperAdmin = isOwner;
  // Approve pending admin-access requests (sets role:'admin')
  const canApprovePending     = isOwner || role === 'super_admin';
  // Manage credit limits
  const canManageCredits      = isOwner || role === 'super_admin';
  // Ghost Owner — only owner can see/edit rows that are internally 'owner'
  const canEditOwner          = isOwner;

  // ── Settings & config ───────────────────────────────────────────────────
  const canEditSettings = isSuperAdmin; // admin cannot touch settings

  // ── Legacy compat aliases ────────────────────────────────────────────────
  // canPromoteToAdmin kept for any component still referencing it
  const canPromoteToAdmin = canChangeRoles;

  const value = {
    adminUser: canAccessAdmin ? currentUser : null,
    currentUser,
    userProfile,

    // Source of truth
    role,        // 'owner' | 'super_admin' | 'admin' | 'user' | null
    adminRole: role,
    adminRequestStatus,

    // Tier booleans
    isOwner,
    isSuperAdmin,
    isAdmin: canAccessAdmin,

    // Fine-grained capability flags
    canAccessAdmin,
    canManageUsers,
    canBasicUserActions,
    canDeleteUsers,
    canChangeRoles,
    canPromoteToSuperAdmin,
    canApprovePending,
    canManageCredits,
    canEditOwner,
    canEditSettings,

    // Legacy aliases
    canPromoteToAdmin,

    loading,
  };

  return (
    <AdminAuthContext.Provider value={value}>
      {children}
    </AdminAuthContext.Provider>
  );
};
