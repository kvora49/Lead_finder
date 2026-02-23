/**
 * UserManagementNew — Phase 1 Enterprise RBAC upgrade
 *
 * Viewer tiers:
 *   owner       → full control, can edit other owners
 *   super_admin → full control, CANNOT edit 'owner' rows (Ghost Protection)
 *   admin       → read-only; no suspend / delete / role-change
 *
 * Tabs:
 *   All Users         → always visible
 *   Pending Requests  → only for super_admin / owner
 */
import { useState, useEffect } from 'react';
import {
  Search,
  Eye,
  Edit,
  Ban,
  CheckCircle,
  XCircle,
  Download,
  Calendar,
  Activity,
  Clock,
  TrendingUp,
  Shield,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  BarChart3,
  Users,
  UserCheck,
  AlertTriangle,
  Lock,
  Inbox,
  MoreVertical,
} from 'lucide-react';
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  query,
  orderBy,
  limit,
  startAfter,
  where,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { useAdminAuth } from '../../contexts/AdminAuthContext';
import { logAdminAction } from '../../services/analyticsService';

/* ─── helpers ───────────────────────────────────────────────────────────── */
const PAGE_SIZE = 50;

/**
 * ghostRole — if the stored DB role is 'owner', return 'Super Admin' to mask it.
 * This prevents anyone from knowing who the real owner account is.
 */
const ghostRoleLabel = (dbRole) => {
  if (dbRole === 'owner' || dbRole === 'super_admin') return 'Super Admin';
  if (dbRole === 'admin') return 'Admin';
  return 'User';
};

const ghostRoleBadge = (dbRole) => {
  const base = 'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border';
  if (dbRole === 'owner' || dbRole === 'super_admin')
    return `${base} bg-violet-500/20 text-violet-300 border-violet-500/30`;
  if (dbRole === 'admin')
    return `${base} bg-blue-500/20 text-blue-300 border-blue-500/30`;
  return `${base} bg-slate-600/30 text-slate-400 border-slate-600/20`;
};

/* ─── Sub-components ────────────────────────────────────────────────────── */
const StatusBadge = ({ status }) => {
  const map = {
    active:    'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    pending:   'bg-amber-500/15 text-amber-400 border-amber-500/30',
    suspended: 'bg-red-500/15 text-red-400 border-red-500/30',
  };
  const Icon = status === 'active' ? CheckCircle : status === 'pending' ? Clock : Ban;
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${map[status] || map.active}`}>
      <Icon className="w-3 h-3" />
      {(status || 'active').charAt(0).toUpperCase() + (status || 'active').slice(1)}
    </span>
  );
};

const CreditBar = ({ used, limit: lim }) => {
  if (lim === 'unlimited') return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-violet-500/15 text-violet-300 border border-violet-500/30">
      <TrendingUp className="w-3 h-3" />Unlimited
    </span>
  );
  if (lim === 0) return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-500/15 text-red-400 border border-red-500/30">
      <Ban className="w-3 h-3" />Suspended
    </span>
  );
  const pct = Math.min(((used || 0) / lim) * 100, 100);
  const bar = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <div className="space-y-1 min-w-[80px]">
      <span className="text-xs text-white font-medium">{Number(lim).toLocaleString()}</span>
      <div className="h-1 rounded-full bg-slate-700">
        <div className={`h-1 rounded-full ${bar}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
};

/* ─── Credit Control Modal ──────────────────────────────────────────────── */
const CreditModal = ({ user, onClose, onUpdate }) => {
  const [limitType, setLimitType] = useState(
    user.creditLimit === 'unlimited' ? 'unlimited' : user.creditLimit === 0 ? 'suspended' : 'custom'
  );
  const [amount, setAmount] = useState(
    typeof user.creditLimit === 'number' && user.creditLimit > 0 ? user.creditLimit : ''
  );

  const handleSave = () => {
    const val = limitType === 'unlimited' ? 'unlimited' : limitType === 'suspended' ? 0 : parseInt(amount) || 0;
    onUpdate(user.id, val);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-2xl max-w-sm w-full border border-slate-700 shadow-2xl">
        <div className="border-b border-slate-700 px-6 py-4 flex items-center justify-between">
          <div>
            <h3 className="text-white font-semibold">Manage Credits</h3>
            <p className="text-slate-400 text-xs mt-0.5 truncate max-w-[200px]">{user.email}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-700 transition-colors">
            <XCircle className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-3">
          {[
            { key: 'unlimited', label: 'Unlimited',             desc: 'No credit restrictions',    accent: 'violet' },
            { key: 'custom',    label: 'Custom Limit',          desc: 'Set a specific amount',      accent: 'blue'   },
            { key: 'suspended', label: 'Suspended (0 credits)', desc: 'Block all credit usage',     accent: 'red'    },
          ].map(({ key, label, desc, accent }) => (
            <button
              key={key}
              onClick={() => setLimitType(key)}
              className={`w-full px-4 py-3 rounded-xl border-2 text-left transition-all ${
                limitType === key
                  ? `bg-${accent}-500/15 border-${accent}-500/50 text-white`
                  : 'bg-slate-900/50 border-slate-700 text-slate-400 hover:border-slate-600'
              }`}
            >
              <div className="font-medium text-sm">{label}</div>
              <div className="text-xs text-slate-500">{desc}</div>
            </button>
          ))}
          {limitType === 'custom' && (
            <input
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="e.g. 200"
              className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          )}
          <div className="text-xs text-slate-500 bg-slate-900/50 rounded-xl p-3 space-y-1">
            <div className="flex justify-between"><span>Current usage:</span><span className="text-white">{(user.creditsUsed || 0).toLocaleString()}</span></div>
            <div className="flex justify-between"><span>Current limit:</span><span className="text-white">{user.creditLimit === 'unlimited' ? 'Unlimited' : String(user.creditLimit)}</span></div>
          </div>
          <div className="flex gap-3 pt-1">
            <button onClick={onClose} className="flex-1 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-sm transition-colors">Cancel</button>
            <button onClick={handleSave} className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-medium transition-colors">Save</button>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ─── User Details Modal ────────────────────────────────────────────────── */
const UserDetailModal = ({ user, onClose }) => (
  <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
    <div className="bg-slate-800 rounded-2xl max-w-lg w-full border border-slate-700 shadow-2xl">
      <div className="border-b border-slate-700 px-6 py-4 flex items-center justify-between">
        <h3 className="text-white font-semibold">User Details</h3>
        <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-700 transition-colors">
          <XCircle className="w-5 h-5" />
        </button>
      </div>
      <div className="p-6 space-y-3 text-sm">
        {[
          ['Email',         user.email],
          ['Display Name',  user.displayName],
          ['User ID',       user.id],
          ['Role',          ghostRoleLabel(user.role)],
          ['Credits Used',  (user.creditsUsed ?? 0).toLocaleString()],
          ['Credit Limit',  user.creditLimit === 'unlimited' ? 'Unlimited' : String(user.creditLimit)],
          ['Searches',      (user.searchCount ?? 0).toLocaleString()],
          ['Registered',    user.createdAt?.toLocaleDateString?.() ?? '—'],
          ['Last Active',   user.lastActive?.toLocaleDateString?.() ?? '—'],
        ].map(([label, val]) => (
          <div key={label} className="flex justify-between gap-4">
            <span className="text-slate-400">{label}</span>
            <span className="text-white text-right font-medium break-all">{val}</span>
          </div>
        ))}
        <div className="pt-2"><StatusBadge status={user.status} /></div>
      </div>
    </div>
  </div>
);

/* ═══════════════════════════════════════════════════════════════════════════
   Main Component
   ═════════════════════════════════════════════════════════════════════════ */
const UserManagementNew = () => {
  /* ── Auth ─────────────────────────────────────────────────────────────── */
  const {
    adminUser,
    role: viewerRole,
    canManageUsers,
    isOwner: viewerIsOwner,
  } = useAdminAuth();

  /* ── State ────────────────────────────────────────────────────────────── */
  const [activeTab,       setActiveTab]       = useState('all');
  const [users,           setUsers]           = useState([]);
  const [filteredUsers,   setFilteredUsers]   = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [pendingLoading,  setPendingLoading]  = useState(false);
  const [loading,         setLoading]         = useState(true);
  const [error,           setError]           = useState(null);
  const [searchTerm,      setSearchTerm]      = useState('');
  const [filterStatus,    setFilterStatus]    = useState('all');
  const [selectedUser,    setSelectedUser]    = useState(null);
  const [showDetails,     setShowDetails]     = useState(false);
  const [showCredits,     setShowCredits]     = useState(false);
  const [bulkSelected,    setBulkSelected]    = useState([]);
  const [currentPage,     setCurrentPage]     = useState(1);
  const [lastDoc,         setLastDoc]         = useState(null);
  const [hasMore,         setHasMore]         = useState(true);
  const [toast,           setToast]           = useState(null);
  const usersPerPage = 20;
  const [userStats, setUserStats] = useState({ total: 0, active: 0, suspended: 0, unlimited: 0 });

  /* ── Toast ────────────────────────────────────────────────────────────── */
  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  /* ── Fetch all users ─────────────────────────────────────────────────── */
  const fetchUsers = async (afterDoc = null) => {
    if (!adminUser) return;
    try {
      const constraints = [orderBy('createdAt', 'desc'), limit(PAGE_SIZE)];
      if (afterDoc) constraints.push(startAfter(afterDoc));
      const snap = await getDocs(query(collection(db, 'users'), ...constraints));

      const data = snap.docs.map(d => {
        const u = d.data();
        return {
          id:          d.id,
          email:       u.email        || 'N/A',
          displayName: u.displayName  || u.email?.split('@')[0] || 'N/A',
          createdAt:   u.createdAt?.toDate?.()  ?? new Date(),
          lastActive:  u.lastActive?.toDate?.() ?? new Date(),
          credits:     u.credits      ?? 0,
          creditsUsed: u.creditsUsed  ?? 0,
          searchCount: u.searchCount  ?? 0,
          status:      u.accountStatus || (u.isActive === false ? 'suspended' : 'active'),
          creditLimit: u.creditLimit   ?? 'unlimited',
          role:        u.role          ?? 'user',
        };
      });

      if (afterDoc) {
        setUsers(prev => { const m = [...prev, ...data]; calcStats(m); return m; });
      } else {
        setUsers(data);
        calcStats(data);
      }
      setHasMore(snap.docs.length === PAGE_SIZE);
      if (snap.docs.length > 0) setLastDoc(snap.docs[snap.docs.length - 1]);
      setError(null);
    } catch (err) {
      console.error('[UserMgmt] fetch error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  /* ── Fetch pending admin requests ──────────────────────────────────────── */
  const fetchPending = async () => {
    setPendingLoading(true);
    try {
      const snap = await getDocs(
        query(collection(db, 'users'), where('admin_request_status', '==', 'pending'))
      );
      setPendingRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error('[UserMgmt] pending fetch error:', err);
    } finally {
      setPendingLoading(false);
    }
  };

  useEffect(() => { if (adminUser) fetchUsers(); }, [adminUser]); // eslint-disable-line
  useEffect(() => { if (canManageUsers && activeTab === 'pending') fetchPending(); }, [activeTab, canManageUsers]); // eslint-disable-line
  useEffect(() => { applyFilters(); }, [users, searchTerm, filterStatus]); // eslint-disable-line

  const calcStats = (data) => setUserStats({
    total:     data.length,
    active:    data.filter(u => u.status === 'active').length,
    suspended: data.filter(u => u.status === 'suspended').length,
    unlimited: data.filter(u => u.creditLimit === 'unlimited').length,
  });

  const applyFilters = () => {
    let f = users;
    if (searchTerm) {
      const t = searchTerm.toLowerCase();
      f = f.filter(u => u.email.toLowerCase().includes(t) || u.displayName.toLowerCase().includes(t));
    }
    if (filterStatus !== 'all') f = f.filter(u => u.status === filterStatus);
    setFilteredUsers(f);
    setCurrentPage(1);
  };

  /* ── Mutation actions ─────────────────────────────────────────────────── */
  const updateStatus = async (userId, newStatus) => {
    try {
      await updateDoc(doc(db, 'users', userId), { accountStatus: newStatus, lastModified: new Date() });
      await logAdminAction(adminUser?.uid, adminUser?.email, 'Status Changed', userId, `→ ${newStatus}`);
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, status: newStatus } : u));
      showToast(`Status updated to ${newStatus}`);
    } catch (e) { showToast(e.message, 'error'); }
  };

  const updateCreditLimit = async (userId, newLimit) => {
    try {
      await updateDoc(doc(db, 'users', userId), { creditLimit: newLimit, lastModified: new Date() });
      await logAdminAction(adminUser?.uid, adminUser?.email, 'Credit Limit Changed', userId, `→ ${newLimit}`);
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, creditLimit: newLimit } : u));
      showToast('Credit limit updated');
    } catch (e) { showToast(e.message, 'error'); }
  };

  const updateRole = async (userId, newRole) => {
    try {
      await updateDoc(doc(db, 'users', userId), { role: newRole, lastModified: new Date() });
      await logAdminAction(adminUser?.uid, adminUser?.email, 'Role Changed', userId, `→ ${newRole}`);
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
      showToast('Role updated');
    } catch (e) { showToast(e.message, 'error'); }
  };

  const approveRequest = async (reqUserId) => {
    try {
      await updateDoc(doc(db, 'users', reqUserId), { role: 'admin', admin_request_status: 'approved' });
      await logAdminAction(adminUser?.uid, adminUser?.email, 'Admin Request Approved', reqUserId, '');
      setPendingRequests(prev => prev.filter(u => u.id !== reqUserId));
      showToast('Admin access approved');
    } catch (e) { showToast(e.message, 'error'); }
  };

  const rejectRequest = async (reqUserId) => {
    try {
      await updateDoc(doc(db, 'users', reqUserId), { admin_request_status: 'rejected' });
      await logAdminAction(adminUser?.uid, adminUser?.email, 'Admin Request Rejected', reqUserId, '');
      setPendingRequests(prev => prev.filter(u => u.id !== reqUserId));
      showToast('Request rejected', 'info');
    } catch (e) { showToast(e.message, 'error'); }
  };

  const exportCsv = () => {
    const rows = [
      ['ID', 'Email', 'Name', 'Role', 'Status', 'Credits Used', 'Registered'].join(','),
      ...filteredUsers.map(u => [u.id, u.email, u.displayName, ghostRoleLabel(u.role), u.status, u.creditsUsed, u.createdAt.toLocaleDateString()].join(',')),
    ].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['\uFEFF' + rows], { type: 'text/csv;charset=utf-8;' }));
    a.download = `users-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  /* ── Pagination ──────────────────────────────────────────────────────── */
  const lastIdx   = currentPage * usersPerPage;
  const firstIdx  = lastIdx - usersPerPage;
  const pageUsers = filteredUsers.slice(firstIdx, lastIdx);
  const totalPages = Math.ceil(filteredUsers.length / usersPerPage);

  /* ── Ghost Owner row protection ──────────────────────────────────────── */
  const canEdit = (rowUser) => {
    if (viewerRole === 'admin')                        return false; // admins are read-only
    if (rowUser.role === 'owner' && !viewerIsOwner)    return false; // Ghost protection
    return true;
  };

  /* ── Loading / error states ───────────────────────────────────────────── */
  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center">
        <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-slate-400 text-sm">Loading users…</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center space-y-3">
        <AlertTriangle className="w-12 h-12 text-red-400 mx-auto" />
        <p className="text-white font-semibold">Failed to load users</p>
        <p className="text-slate-400 text-sm">{error}</p>
        <button onClick={() => { setError(null); setLoading(true); fetchUsers(); }} className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm">Retry</button>
      </div>
    </div>
  );

  /* ─────────────────────────────────────────────────────────────────────── */
  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6 min-h-screen">

      {/* Toast notification */}
      {toast && (
        <div className={`fixed top-5 right-5 z-50 flex items-center gap-3 px-5 py-3 rounded-xl shadow-2xl text-sm font-medium animate-in fade-in slide-in-from-top-2 ${
          toast.type === 'error' ? 'bg-red-600 text-white' : toast.type === 'info' ? 'bg-slate-700 text-white' : 'bg-emerald-600 text-white'
        }`}>
          {toast.type === 'error' ? <AlertTriangle className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">User Management</h1>
          <p className="text-slate-400 mt-1 text-sm flex items-center gap-1.5">
            {viewerRole === 'admin' && (
              <><Lock className="w-3.5 h-3.5 text-amber-400" /><span className="text-amber-400">Read-only view</span>&ensp;·&ensp;</>
            )}
            {filteredUsers.length.toLocaleString()} users loaded
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { setLoading(true); fetchUsers(); }} className="p-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-slate-400 hover:text-white transition-colors" title="Refresh">
            <RefreshCw className="w-4 h-4" />
          </button>
          {canManageUsers && (
            <button onClick={exportCsv} className="flex items-center gap-2 px-4 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-600/30 rounded-xl text-sm font-medium transition-colors">
              <Download className="w-4 h-4" />Export CSV
            </button>
          )}
        </div>
      </div>

      {/* ── Stat cards ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { icon: Users,      label: 'Total',      value: userStats.total,     color: 'blue'   },
          { icon: CheckCircle, label: 'Active',     value: userStats.active,    color: 'green'  },
          { icon: Ban,        label: 'Suspended',   value: userStats.suspended, color: 'red'    },
          { icon: TrendingUp, label: 'Unlimited',   value: userStats.unlimited, color: 'violet' },
        ].map(({ icon: Icon, label, value, color }) => (
          <div key={label} className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 hover:bg-slate-800/70 transition-all">
            <div className="flex items-center justify-between mb-2">
              <Icon className={`w-5 h-5 text-${color}-400`} />
              <span className="text-2xl font-bold text-white">{value}</span>
            </div>
            <p className="text-xs text-slate-400">{label}</p>
          </div>
        ))}
      </div>

      {/* ── Tab toggle — super_admin / owner only ────────────────────────── */}
      {canManageUsers && (
        <div className="flex items-center gap-1 bg-slate-800/60 border border-slate-700/50 rounded-xl p-1 w-fit">
          <button
            onClick={() => setActiveTab('all')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'all'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
            }`}
          >
            <Users className="w-4 h-4" />All Users
          </button>
          <button
            onClick={() => setActiveTab('pending')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'pending'
                ? 'bg-amber-600 text-white shadow-lg shadow-amber-900/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
            }`}
          >
            <Inbox className="w-4 h-4" />
            Pending Requests
            {pendingRequests.length > 0 && (
              <span className="inline-flex items-center justify-center w-5 h-5 bg-amber-500 text-white text-xs rounded-full font-bold">
                {pendingRequests.length}
              </span>
            )}
          </button>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          PENDING REQUESTS TAB
         ══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'pending' && canManageUsers && (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-700/50 flex items-center gap-3">
            <Inbox className="w-5 h-5 text-amber-400" />
            <h3 className="text-white font-semibold">Admin Access Requests</h3>
            <span className="ml-auto text-xs text-slate-400">{pendingRequests.length} pending</span>
            <button onClick={fetchPending} disabled={pendingLoading} className="p-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-slate-400 hover:text-white transition-colors">
              <RefreshCw className={`w-3.5 h-3.5 ${pendingLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {pendingLoading ? (
            <div className="p-8 text-center text-slate-400 text-sm">Loading requests…</div>
          ) : pendingRequests.length === 0 ? (
            <div className="p-12 text-center space-y-2">
              <UserCheck className="w-10 h-10 text-slate-600 mx-auto" />
              <p className="text-slate-400 text-sm font-medium">No pending requests</p>
              <p className="text-slate-500 text-xs">All admin requests have been reviewed.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-700/40">
              {pendingRequests.map(req => (
                <div key={req.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 px-6 py-4 hover:bg-slate-800/30 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center flex-shrink-0">
                      <span className="text-white text-sm font-bold">
                        {((req.displayName || req.email || '?')[0]).toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <p className="text-white font-medium">{req.displayName || req.email?.split('@')[0]}</p>
                      <p className="text-slate-400 text-sm">{req.email}</p>
                      <p className="text-slate-500 text-xs mt-0.5">ID: {req.id?.slice(0, 12)}…</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-14 sm:ml-0">
                    <button
                      onClick={() => approveRequest(req.id)}
                      className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 border border-emerald-600/30 rounded-xl text-xs font-semibold transition-all active:scale-[0.97]"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />Approve
                    </button>
                    <button
                      onClick={() => rejectRequest(req.id)}
                      className="flex items-center gap-1.5 px-4 py-2 bg-red-600/20 hover:bg-red-600/40 text-red-400 border border-red-600/30 rounded-xl text-xs font-semibold transition-all active:scale-[0.97]"
                    >
                      <XCircle className="w-3.5 h-3.5" />Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          ALL USERS TAB
         ══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'all' && (
        <>
          {/* Filters */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 space-y-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  placeholder="Search by email or name…"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <select
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value)}
                className="px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
              </select>
            </div>

            {/* Bulk actions */}
            {canManageUsers && bulkSelected.length > 0 && (
              <div className="flex items-center gap-3 px-4 py-2.5 bg-indigo-500/10 border border-indigo-500/20 rounded-xl">
                <span className="text-xs text-indigo-400 font-medium">{bulkSelected.length} selected</span>
                <button onClick={async () => { for (const id of bulkSelected) await updateStatus(id, 'active'); setBulkSelected([]); }} className="px-3 py-1 bg-emerald-600/20 text-emerald-400 border border-emerald-600/30 rounded-lg text-xs font-medium">Activate</button>
                <button onClick={async () => { for (const id of bulkSelected) await updateStatus(id, 'suspended'); setBulkSelected([]); }} className="px-3 py-1 bg-red-600/20 text-red-400 border border-red-600/30 rounded-lg text-xs font-medium">Suspend</button>
                <button onClick={() => setBulkSelected([])} className="px-3 py-1 bg-slate-700 text-slate-400 rounded-lg text-xs">Clear</button>
              </div>
            )}
          </div>

          {/* Users Table */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-900/60 border-b border-slate-700/50">
                  <tr>
                    {canManageUsers && (
                      <th className="px-4 py-3 w-10">
                        <input
                          type="checkbox"
                          onChange={e => setBulkSelected(e.target.checked ? pageUsers.map(u => u.id) : [])}
                          checked={bulkSelected.length === pageUsers.length && pageUsers.length > 0}
                          className="w-4 h-4 rounded border-slate-600 text-indigo-600 focus:ring-indigo-500"
                        />
                      </th>
                    )}
                    {['User', 'Role', 'Registered', 'Last Active', 'Credits', 'Limit', 'Status', 'Actions'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/30">
                  {pageUsers.length === 0 ? (
                    <tr>
                      <td colSpan="9" className="px-4 py-12 text-center text-slate-400">
                        <Users className="w-8 h-8 mx-auto mb-2 text-slate-600" />
                        No users found
                      </td>
                    </tr>
                  ) : pageUsers.map(user => {
                    const editable     = canEdit(user);
                    const isGhostOwner = user.role === 'owner';
                    const isProtected  = isGhostOwner && !viewerIsOwner;

                    return (
                      <tr key={user.id} className="hover:bg-slate-800/30 transition-colors">
                        {canManageUsers && (
                          <td className="px-4 py-4">
                            <input
                              type="checkbox"
                              disabled={!editable}
                              checked={bulkSelected.includes(user.id)}
                              onChange={e => setBulkSelected(e.target.checked ? [...bulkSelected, user.id] : bulkSelected.filter(id => id !== user.id))}
                              className="w-4 h-4 rounded border-slate-600 text-indigo-600 focus:ring-indigo-500 disabled:opacity-30"
                            />
                          </td>
                        )}

                        {/* User */}
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-3">
                            <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-white text-sm font-bold bg-gradient-to-br ${
                              isGhostOwner ? 'from-violet-500 to-fuchsia-600' : 'from-blue-500 to-indigo-600'
                            }`}>
                              {(user.displayName || user.email || '?')[0].toUpperCase()}
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <p className="text-white font-medium">{user.displayName}</p>
                                {isProtected && <Lock className="w-3 h-3 text-slate-500" title="Ghost Owner protected" />}
                              </div>
                              <p className="text-slate-400 text-xs">{user.email}</p>
                            </div>
                          </div>
                        </td>

                        {/* Role — Ghost masking + editable dropdown */}
                        <td className="px-4 py-4">
                          {editable && canManageUsers && !isProtected ? (
                            <select
                              value={user.role === 'owner' ? 'owner' : user.role}
                              onChange={e => updateRole(user.id, e.target.value)}
                              className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            >
                              <option value="user">User</option>
                              <option value="admin">Admin</option>
                              {viewerIsOwner && <option value="super_admin">Super Admin</option>}
                            </select>
                          ) : (
                            <span className={ghostRoleBadge(user.role)}>
                              {isGhostOwner && <Shield className="w-3 h-3" />}
                              {ghostRoleLabel(user.role)}
                            </span>
                          )}
                        </td>

                        <td className="px-4 py-4 text-xs text-slate-300 whitespace-nowrap">
                          <div className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5 text-slate-500" />{user.createdAt.toLocaleDateString()}</div>
                        </td>
                        <td className="px-4 py-4 text-xs text-slate-300 whitespace-nowrap">
                          <div className="flex items-center gap-1.5"><Activity className="w-3.5 h-3.5 text-slate-500" />{user.lastActive.toLocaleDateString()}</div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-1.5 text-xs font-medium text-white">
                            <BarChart3 className="w-3.5 h-3.5 text-blue-400" />
                            {(user.creditsUsed || 0).toLocaleString()}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <CreditBar used={user.creditsUsed} limit={user.creditLimit} />
                        </td>
                        <td className="px-4 py-4">
                          <StatusBadge status={user.status} />
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-1">
                            {/* View — always */}
                            <button onClick={() => { setSelectedUser(user); setShowDetails(true); }} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-blue-400 transition-colors" title="View">
                              <Eye className="w-4 h-4" />
                            </button>

                            {/* Credit edit — canManageUsers + editable */}
                            {canManageUsers && editable && (
                              <button onClick={() => { setSelectedUser(user); setShowCredits(true); }} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-emerald-400 transition-colors" title="Manage credits">
                                <Edit className="w-4 h-4" />
                              </button>
                            )}

                            {/* Status actions — canManageUsers + editable */}
                            {canManageUsers && editable && (
                              <div className="relative group">
                                <button className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors">
                                  <MoreVertical className="w-4 h-4" />
                                </button>
                                <div className="absolute right-0 top-full mt-1 w-40 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-20 py-1">
                                  <button onClick={() => updateStatus(user.id, 'active')} className="w-full px-4 py-2 text-left text-xs text-emerald-400 hover:bg-slate-700/50 flex items-center gap-2">
                                    <CheckCircle className="w-3.5 h-3.5" />Activate
                                  </button>
                                  <button onClick={() => updateStatus(user.id, 'suspended')} className="w-full px-4 py-2 text-left text-xs text-red-400 hover:bg-slate-700/50 flex items-center gap-2">
                                    <Ban className="w-3.5 h-3.5" />Suspend
                                  </button>
                                </div>
                              </div>
                            )}

                            {/* Ghost lock indicator */}
                            {isProtected && (
                              <span className="p-1.5 text-slate-600" title="Protected by Ghost Owner policy">
                                <Lock className="w-4 h-4" />
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-6 py-4 border-t border-slate-700/50">
                <span className="text-xs text-slate-400 hidden sm:block">
                  {firstIdx + 1}–{Math.min(lastIdx, filteredUsers.length)} of {filteredUsers.length}
                </span>
                <div className="flex items-center gap-2">
                  <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 disabled:opacity-30 transition-colors"><ChevronLeft className="w-4 h-4" /></button>
                  <span className="text-xs text-slate-300 w-20 text-center">Page {currentPage} / {totalPages}</span>
                  <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 disabled:opacity-30 transition-colors"><ChevronRight className="w-4 h-4" /></button>
                </div>
                {hasMore && (
                  <button onClick={() => fetchUsers(lastDoc)} className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors hidden sm:block">Load more ↓</button>
                )}
              </div>
            )}
          </div>

          {/* Read-only notice for admin viewers */}
          {viewerRole === 'admin' && (
            <div className="flex items-center gap-3 bg-amber-500/10 border border-amber-500/20 rounded-xl px-5 py-3 text-amber-400 text-sm">
              <Lock className="w-4 h-4 flex-shrink-0" />
              You have read-only access. Role changes, suspension, and credit management require Super Admin or above.
            </div>
          )}
        </>
      )}

      {/* Modals */}
      {showDetails && selectedUser && (
        <UserDetailModal user={selectedUser} onClose={() => { setShowDetails(false); setSelectedUser(null); }} />
      )}
      {showCredits && selectedUser && (
        <CreditModal user={selectedUser} onClose={() => { setShowCredits(false); setSelectedUser(null); }} onUpdate={updateCreditLimit} />
      )}
    </div>
  );
};

export default UserManagementNew;
