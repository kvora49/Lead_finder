/**
 * UserManagementNew — Phase 1 Enterprise RBAC upgrade
 *
 * Viewer tiers:
 *   owner       → full control, can edit other owners
 *   super_admin → full control, CANNOT edit 'owner' rows (Ghost Protection)
 *   admin       → read-only; no suspend / delete / role-change
 */
import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Eye,
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
  AlertTriangle,
  Lock,
  MoreVertical,
  Mail,
  Loader2,
  Zap,
} from 'lucide-react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  query,
  limit,
  startAfter,
  getDoc,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { useAdminAuth } from '../../contexts/AdminAuthContext';
import { logAdminAction } from '../../services/analyticsService';
import { getEffectiveUserMonthMetrics } from '../../services/creditService';
import ConfirmDangerModal from '../ConfirmDangerModal';
import { toast } from 'sonner';

/* ─── helpers ───────────────────────────────────────────────────────────── */
const PAGE_SIZE = 50;

const currentMonthStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const formatUsd = (value) => `$${Number(value || 0).toFixed(2)}`;

/** Format a Date as DD/MM/YYYY */
const formatAdminDate = (date) => {
  if (!date || !(date instanceof Date) || isNaN(date)) return '—';
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
};

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
    deleted:   'bg-slate-500/20 text-slate-300 border-slate-500/30',
  };
  const Icon = status === 'active'
    ? CheckCircle
    : status === 'pending'
      ? Clock
      : status === 'deleted'
        ? XCircle
        : Ban;
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
      <span className="text-xs text-white font-medium">{formatUsd(lim)}</span>
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
    const parsed = Number.parseFloat(amount);
    const val = limitType === 'unlimited' ? 'unlimited' : limitType === 'suspended' ? 0 : (Number.isFinite(parsed) ? Math.max(0, +parsed.toFixed(2)) : 0);
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
            { key: 'custom',    label: 'Custom Monthly Limit',  desc: 'Set per-user USD allocation',accent: 'blue'   },
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
              placeholder="e.g. 50"
              className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          )}
          <div className="text-xs text-slate-500 bg-slate-900/50 rounded-xl p-3 space-y-1">
            <div className="flex justify-between"><span>Current month spent:</span><span className="text-white">{formatUsd(user.monthlyCreditUsdUsed)}</span></div>
            <div className="flex justify-between"><span>Current limit:</span><span className="text-white">{user.creditLimit === 'unlimited' ? 'Unlimited' : formatUsd(user.creditLimit)}</span></div>
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
  <AnimatePresence>
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      <motion.aside
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 280 }}
        className="fixed inset-y-0 right-0 z-[80] w-full max-w-lg bg-slate-800 border-l border-slate-700 shadow-2xl flex flex-col"
      >
        <div className="border-b border-slate-700 px-6 py-4 flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-white font-semibold text-lg">User Details</h3>
            <p className="text-slate-400 text-xs mt-0.5 truncate max-w-[260px]">{user.email}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-700 transition-colors" aria-label="Close user details">
            <XCircle className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-3 text-sm overflow-y-auto">
          {[
            ['Email', user.email],
            ['Display Name', user.displayName],
            ['User ID', user.id],
            ['Role', ghostRoleLabel(user.role)],
            ['API Calls Used', (user.creditsUsed ?? 0).toLocaleString()],
            ['Spent This Month', formatUsd(user.monthlyCreditUsdUsed)],
            ['Credit Limit', user.creditLimit === 'unlimited' ? 'Unlimited' : formatUsd(user.creditLimit)],
            ['Searches', (user.searchCount ?? 0).toLocaleString()],
            ['Registered', user.createdAt ? formatAdminDate(user.createdAt) : '—'],
            ['Last Active', user.lastActive ? formatAdminDate(user.lastActive) : 'Never'],
          ].map(([label, val]) => (
            <div key={label} className="flex justify-between gap-4">
              <span className="text-slate-400">{label}</span>
              <span className="text-white text-right font-medium break-all">{val}</span>
            </div>
          ))}
          <div className="pt-2"><StatusBadge status={user.status} /></div>
        </div>
      </motion.aside>
    </>
  </AnimatePresence>
);

/* ─── Invite Admin Modal ─────────────────────────────────────────────────── */
const InviteModal = ({ onClose, canPromoteToSuperAdmin }) => {
  const [email,      setEmail]      = useState('');
  const [role,       setRole]       = useState('admin');
  const [loading,    setLoading]    = useState(false);
  const [success,    setSuccess]    = useState(false);
  const [emailSent,  setEmailSent]  = useState(true);
  const [inviteUrl,  setInviteUrl]  = useState('');
  const [copied,     setCopied]     = useState(false);
  const [errMsg,     setErrMsg]     = useState('');

  const handleSend = async () => {
    if (!email.trim()) { setErrMsg('Email is required'); return; }
    setLoading(true);
    setErrMsg('');
    try {
      const fns = getFunctions();
      const sendInvite = httpsCallable(fns, 'sendAdminInvite');
      const result = await sendInvite({ email: email.trim(), role });
      setEmailSent(result.data.emailSent !== false);
      setInviteUrl(result.data.inviteUrl || '');
      setSuccess(true);
    } catch (err) {
      setErrMsg(err?.message || 'Failed to send invite. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-2xl max-w-md w-full border border-slate-700 shadow-2xl">
        <div className="border-b border-slate-700 px-6 py-4 flex items-center justify-between">
          <div>
            <h3 className="text-white font-semibold flex items-center gap-2">
              <Mail className="w-4 h-4 text-indigo-400" />Invite Admin
            </h3>
            <p className="text-slate-400 text-xs mt-0.5">Send a 24-hour secure invite link via email</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-700 transition-colors">
            <XCircle className="w-5 h-5" />
          </button>
        </div>

        {success ? (
          <div className="p-6 text-center space-y-4">
            <div className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto ${
              emailSent ? 'bg-emerald-500/15 border border-emerald-500/30' : 'bg-amber-500/15 border border-amber-500/30'
            }`}>
              <CheckCircle className={`w-7 h-7 ${emailSent ? 'text-emerald-400' : 'text-amber-400'}`} />
            </div>
            <div>
              <p className="text-white font-semibold">{emailSent ? 'Invite Sent!' : 'Invite Created'}</p>
              <p className="text-slate-400 text-sm mt-1">
                {emailSent
                  ? <>A secure invite link was sent to <strong className="text-white">{email}</strong>. It expires in 24 hours.</>
                  : <>SMTP is not configured. Share this invite link manually with <strong className="text-white">{email}</strong>:</>
                }
              </p>
            </div>
            {!emailSent && inviteUrl && (
              <div className="text-left">
                <div className="bg-slate-900 border border-slate-600 rounded-xl px-3 py-2 flex items-center gap-2">
                  <span className="text-indigo-300 text-xs break-all flex-1 select-all">{inviteUrl}</span>
                  <button
                    onClick={handleCopy}
                    className="shrink-0 px-2 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs transition-colors"
                  >
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <p className="text-amber-400/70 text-xs mt-2">To enable email delivery, set SMTP credentials in <code className="text-amber-300">functions/.env</code> and redeploy functions.</p>
              </div>
            )}
            <button onClick={onClose} className="w-full py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-sm transition-colors">Done</button>
          </div>
        ) : (
          <div className="p-6 space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-2">Recipient Email</label>
              <input
                type="email"
                value={email}
                onChange={e => { setEmail(e.target.value); setErrMsg(''); }}
                placeholder="colleague@example.com"
                className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-2">Role to Assign</label>
              <select
                value={role}
                onChange={e => setRole(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="admin">Admin</option>
                {canPromoteToSuperAdmin && <option value="super_admin">Super Admin</option>}
              </select>
            </div>
            {errMsg && <p className="text-red-400 text-xs">{errMsg}</p>}
            <div className="flex gap-3 pt-1">
              <button onClick={onClose} className="flex-1 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-sm transition-colors">Cancel</button>
              <button
                onClick={handleSend}
                disabled={loading}
                className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading
                  ? <><Loader2 className="w-4 h-4 animate-spin" />Sending…</>
                  : <><Mail className="w-4 h-4" />Send Invite</>}
              </button>
            </div>
            <p className="text-xs text-slate-500 text-center">
              The recipient receives a link that expires in 24 hours.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════
   Main Component
   ═════════════════════════════════════════════════════════════════════════ */
const UserManagementNew = () => {
  /* ── Auth ─────────────────────────────────────────────────────────────── */
  const {
    adminUser,
    role: viewerRole,
    canManageUsers,
    canBasicUserActions,
    canDeleteUsers,
    canChangeRoles,
    canPromoteToSuperAdmin,
    canManageCredits,
    canApprovePending,
    isOwner: viewerIsOwner,
  } = useAdminAuth();
  const navigate = useNavigate();

  /* ── State ────────────────────────────────────────────────────────────── */
  const [users,           setUsers]           = useState([]);
  const [filteredUsers,   setFilteredUsers]   = useState([]);
  const [loading,         setLoading]         = useState(true);
  const [error,           setError]           = useState(null);
  const [searchTerm,      setSearchTerm]      = useState('');
  const [filterStatus,    setFilterStatus]    = useState('all');
  const [selectedUser,    setSelectedUser]    = useState(null);
  const [showDetails,     setShowDetails]     = useState(false);
  const [showCredits,     setShowCredits]     = useState(false);
  const [bulkSelected,    setBulkSelected]    = useState([]);
  const [bulkSelectMode,  setBulkSelectMode]  = useState(false);
  const [currentPage,     setCurrentPage]     = useState(1);
  const [lastDoc,         setLastDoc]         = useState(null);
  const [hasMore,         setHasMore]         = useState(true);
  const [showInvite,      setShowInvite]      = useState(false);
  const [showBulkGrantModal, setShowBulkGrantModal] = useState(false);
  const [bulkGrantAmount, setBulkGrantAmount] = useState('');
  const [bulkGranting, setBulkGranting] = useState(false);
  const usersPerPage = 20;
  const [userStats, setUserStats] = useState({ total: 0, active: 0, suspended: 0, unlimited: 0 });

  const calcStats = (data) => setUserStats({
    total:     data.length,
    active:    data.filter(u => u.status === 'active').length,
    suspended: data.filter(u => u.status === 'suspended').length,
    unlimited: data.filter(u => u.creditLimit === 'unlimited').length,
  });

  const mapUserDoc = (d) => {
    const u = d.data();
    const effectiveMetrics = getEffectiveUserMonthMetrics(u, currentMonthStr());
    const resolvedStatus = u.accountStatus
      || (u.approvalStatus === 'pending' ? 'pending' : (u.isActive === false ? 'suspended' : 'active'));
    return {
      id:          d.id,
      email:       u.email        || 'N/A',
      displayName: u.displayName  || u.email?.split('@')[0] || 'N/A',
      createdAt:   u.createdAt?.toDate?.()  ?? new Date(0),
      lastActive:  u.lastActive?.toDate?.() ?? null,
      credits:     u.credits      ?? 0,
      creditsUsed: effectiveMetrics.monthlyApiCalls,
      monthlyCreditUsdUsed: effectiveMetrics.monthlyApiCost,
      searchCount: u.searchCount  ?? 0,
      status:      resolvedStatus,
      creditLimit: u.creditLimit   ?? 50,
      role:        u.role          ?? 'user',
    };
  };

  /* ── Danger modal (Safe-Delete / Safe-Suspend) ────────────────────── */
  const [dangerModal, setDangerModal] = useState({
    open: false, title: '', message: '', confirmLabel: 'Confirm', onConfirm: null, loading: false,
  });
  const openDangerModal = (title, message, onConfirm, confirmLabel = 'Confirm') =>
    setDangerModal({ open: true, title, message, confirmLabel, onConfirm, loading: false });

  /* ── Toast ────────────────────────────────────────────────────────────── */
  const showToast = (msg, type = 'success') => {
    if (type === 'error') {
      toast.error(msg);
    } else if (type === 'info') {
      toast.info(msg);
    } else {
      toast.success(msg);
    }
  };

  /* ── Fetch all users ─────────────────────────────────────────────────── */
  const fetchUsers = async (afterDoc = null) => {
    if (!adminUser) return;
    try {
      // NOTE: No orderBy — avoids excluding documents that lack a 'createdAt'
      // field (e.g. early registrations or OAuth users). We sort client-side.
      const constraints = [limit(PAGE_SIZE)];
      if (afterDoc) constraints.push(startAfter(afterDoc));
      const snap = await getDocs(query(collection(db, 'users'), ...constraints));

      const data = snap.docs.map(mapUserDoc);

      // Sort client-side: newest first (handles missing createdAt safely)
      data.sort((a, b) => b.createdAt - a.createdAt);

      if (afterDoc) {
        setUsers(prev => [...prev, ...data]);
      } else {
        setUsers(data);
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

  useEffect(() => {
    if (!adminUser) return;

    setLoading(true);
    const usersQuery = query(collection(db, 'users'));

    const unsubscribe = onSnapshot(
      usersQuery,
      (snap) => {
        const data = snap.docs.map(mapUserDoc);
        data.sort((a, b) => b.createdAt - a.createdAt);
        setUsers(data);
        setHasMore(false);
        setLastDoc(null);
        setError(null);
        setLoading(false);
      },
      (err) => {
        console.error('[UserMgmt] realtime users error:', err);
        setError(err.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [adminUser]);

  useEffect(() => { applyFilters(); }, [users, searchTerm, filterStatus]); // eslint-disable-line
  useEffect(() => { calcStats(users); }, [users]);

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
      const userDoc = await getDoc(doc(db, 'users', userId));
      const oldStatus = userDoc.data()?.accountStatus || (userDoc.data()?.isActive === false ? 'suspended' : 'active');
      const user = users.find(u => u.id === userId);

      const statusPayload = {
        accountStatus: newStatus,
        lastModified: new Date(),
      };

      if (newStatus === 'active') {
        statusPayload.isActive = true;
        statusPayload.approvalStatus = 'approved';
      }

      if (newStatus === 'suspended') {
        statusPayload.isActive = false;
      }

      if (newStatus === 'deleted') {
        statusPayload.isActive = false;
        statusPayload.approvalStatus = 'deleted';
        statusPayload.deletedAt = new Date();
        statusPayload.deletedBy = adminUser?.email || '';
      }

      await updateDoc(doc(db, 'users', userId), statusPayload);
       await logAdminAction(
         adminUser?.uid,
         adminUser?.email,
         'Status Changed',
         userId,
         `Updated status for ${user?.email || userId}: ${oldStatus} → ${newStatus}`
       );
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, status: newStatus } : u));
      showToast(`Status updated to ${newStatus}`);
    } catch (e) { showToast(e.message, 'error'); }
  };

  const updateCreditLimit = async (userId, newLimit) => {
    try {
      const userDoc = await getDoc(doc(db, 'users', userId));
      const oldLimit = userDoc.data()?.creditLimit || 'unknown';
      const user = users.find(u => u.id === userId);

      await updateDoc(doc(db, 'users', userId), { creditLimit: newLimit, lastModified: new Date() });
       await logAdminAction(
         adminUser?.uid,
         adminUser?.email,
         'Credit Limit Changed',
         userId,
         `Updated credit limit for ${user?.email || userId}: ${oldLimit} → ${newLimit}`
       );
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, creditLimit: newLimit } : u));
      showToast('User monthly allocation updated');
    } catch (e) { showToast(e.message, 'error'); }
  };

  const updateRole = async (userId, newRole) => {
    try {
      const userDoc = await getDoc(doc(db, 'users', userId));
      const oldRole = userDoc.data()?.role || 'unknown';
      const user = users.find(u => u.id === userId);

      await updateDoc(doc(db, 'users', userId), { role: newRole, lastModified: new Date() });
       await logAdminAction(
         adminUser?.uid,
         adminUser?.email,
         'Role Changed',
         userId,
         `Updated role for ${user?.email || userId}: ${oldRole} → ${newRole}`
       );
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
      showToast('Role updated');
    } catch (e) { showToast(e.message, 'error'); }
  };

  const exportCsv = () => {
    const rows = [
      ['ID', 'Email', 'Name', 'Role', 'Status', 'Monthly Spend (USD)', 'Monthly Limit (USD)', 'API Calls Used', 'Registered'].join(','),
      ...filteredUsers.map(u => [
        u.id,
        u.email,
        u.displayName,
        ghostRoleLabel(u.role),
        u.status,
        Number(u.monthlyCreditUsdUsed || 0).toFixed(2),
        u.creditLimit === 'unlimited' ? 'unlimited' : Number(u.creditLimit || 0).toFixed(2),
        u.creditsUsed,
        u.createdAt ? formatAdminDate(u.createdAt) : '—',
      ].join(',')),
    ].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['\uFEFF' + rows], { type: 'text/csv;charset=utf-8;' }));
    a.download = `users-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  const handleBulkGrant = async () => {
    const amount = parseFloat(bulkGrantAmount);
    if (!amount || amount <= 0) {
      toast.error('Enter a valid amount greater than 0');
      return;
    }
    setBulkGranting(true);
    try {
      const snap = await getDocs(collection(db, 'users'));
      await Promise.all(
        snap.docs.map((d) => {
          const current = typeof d.data().creditLimit === 'number'
            ? d.data().creditLimit
            : 0;
          return updateDoc(doc(db, 'users', d.id), {
            creditLimit: current + amount,
          });
        })
      );
      toast.success(`$${amount} granted to ${snap.docs.length} users`);
      setShowBulkGrantModal(false);
      setBulkGrantAmount('');
    } catch (err) {
      toast.error('Bulk grant failed: ' + err.message);
    } finally {
      setBulkGranting(false);
    }
  };

  /* ── Pagination ──────────────────────────────────────────────────────── */
  const lastIdx   = currentPage * usersPerPage;
  const firstIdx  = lastIdx - usersPerPage;
  const pageUsers = filteredUsers.slice(firstIdx, lastIdx);
  const totalPages = Math.ceil(filteredUsers.length / usersPerPage);

  /* ── Row-level edit gates ─────────────────────────────────────────────── */
  // canEditRole — gates role changes, status changes, and deletion.
  // Super admin and owner CANNOT change their own role.
  const canEditRole = (rowUser) => {
    // Self-protection: NO admin can change their own role
    if (rowUser.id === adminUser?.uid) return false;
    // Ghost Owner protection — only real owner can touch owner rows
    if (rowUser.role === 'owner' && !viewerIsOwner) return false;
    // super_admin CANNOT edit other super_admin rows
    if (rowUser.role === 'super_admin' && !viewerIsOwner) return false;
    // admin can only act on plain 'user' rows
    if (viewerRole === 'admin') return rowUser.role === 'user';
    return true;
  };

  // canEditCredits — gates the Allocate (credit limit) button only.
  // Super admin and owner CAN manage their own credit limit.
  // Regular admins still cannot touch their own credits.
  const canEditCredits = (rowUser) => {
    // Ghost Owner protection — only real owner can touch owner rows
    if (rowUser.role === 'owner' && !viewerIsOwner) return false;
    // super_admin rows: only owner can touch them (except self-grant below)
    if (rowUser.role === 'super_admin' && !viewerIsOwner) {
      // Allow super_admin to manage their OWN credits only
      if (rowUser.id === adminUser?.uid && viewerRole === 'super_admin') return true;
      return false;
    }
    // admin can only act on plain 'user' rows
    if (viewerRole === 'admin') return rowUser.role === 'user';
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
    <div className="p-3 sm:p-4 md:p-6 lg:p-8 space-y-6 min-h-screen overflow-x-hidden max-w-full">

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">User Management</h1>
          <p className="text-slate-400 mt-1 text-sm flex items-center gap-1.5">
            {viewerRole === 'admin' && (
              <><Lock className="w-3.5 h-3.5 text-amber-400" /><span className="text-amber-400">Can suspend/activate users only</span>&ensp;·&ensp;</>
            )}
            {filteredUsers.length.toLocaleString()} users loaded
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { setLoading(true); fetchUsers(); }} className="p-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-slate-400 hover:text-white transition-colors" title="Refresh">
            <RefreshCw className="w-4 h-4" />
          </button>
          {canManageUsers && (
            <>
              {canApprovePending && (
                <button
                  onClick={() => navigate('/admin/access')}
                  className="flex items-center gap-2 px-4 py-2 bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-600/30 rounded-xl text-sm font-medium transition-colors"
                >
                  Access Control
                </button>
              )}
              <button
                onClick={() => setShowBulkGrantModal(true)}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg
                  bg-emerald-500/10 text-emerald-400 border border-emerald-500/20
                  hover:bg-emerald-500/20 transition-colors"
              >
                <Zap className="w-3.5 h-3.5" strokeWidth={1.5} />
                Bulk grant
              </button>
              <button
                onClick={() => setShowInvite(true)}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-400 border border-indigo-600/30 rounded-xl text-sm font-medium transition-colors"
              >
                <Mail className="w-4 h-4" />Invite Admin
              </button>
              <button onClick={exportCsv} className="flex items-center gap-2 px-4 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-600/30 rounded-xl text-sm font-medium transition-colors">
                <Download className="w-4 h-4" />Export CSV
              </button>
              <button
                onClick={() => { setBulkSelectMode((m) => !m); setBulkSelected([]); }}
                className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5
                  rounded-full border transition-all ${
                  bulkSelectMode
                    ? 'bg-indigo-600 dark:bg-indigo-600 text-white dark:text-white border-indigo-600 dark:border-indigo-600'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-600 hover:border-indigo-400 dark:hover:border-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300'
                }`}
              >
                {bulkSelectMode && bulkSelected.length > 0
                  ? `${bulkSelected.length} selected`
                  : 'Select'
                }
              </button>
            </>
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

      {/* ══════════════════════════════════════════════════════════════════
          ALL USERS
         ══════════════════════════════════════════════════════════════════ */}
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
                <option value="deleted">Deleted</option>
              </select>
            </div>

            {/* Bulk actions */}
            {canManageUsers && bulkSelected.length > 0 && (
              <div className="flex items-center gap-3 px-4 py-2.5 bg-indigo-500/10 border border-indigo-500/20 rounded-xl">
                <span className="text-xs text-indigo-400 font-medium">{bulkSelected.length} selected</span>
                <button onClick={async () => { for (const id of bulkSelected) await updateStatus(id, 'active'); setBulkSelected([]); }} className="px-3 py-1 bg-emerald-600/20 text-emerald-400 border border-emerald-600/30 rounded-lg text-xs font-medium">Activate</button>
                <button onClick={() => setDangerModal({ open: true, title: 'Suspend Selected Users?', message: `Suspend ${bulkSelected.length} selected user(s)? They will lose access immediately.`, confirmLabel: 'Suspend', onConfirm: async () => { for (const id of bulkSelected) await updateStatus(id, 'suspended'); setBulkSelected([]); }, loading: false })} className="px-3 py-1 bg-red-600/20 text-red-400 border border-red-600/30 rounded-lg text-xs font-medium">Suspend</button>
                <button onClick={() => { setBulkSelected([]); setBulkSelectMode(false); }} className="px-3 py-1 bg-slate-700 text-slate-400 rounded-lg text-xs">Clear</button>
              </div>
            )}
          </div>

          {/* Users Table */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden max-w-full">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-900/60 border-b border-slate-700/50">
                  <tr>
                    {canManageUsers && bulkSelectMode && (
                      <th className="px-4 py-3 w-10">
                        <input
                          type="checkbox"
                          onChange={e => setBulkSelected(e.target.checked ? pageUsers.map(u => u.id) : [])}
                          checked={bulkSelected.length === pageUsers.length && pageUsers.length > 0}
                          className="w-4 h-4 rounded border-slate-600 text-indigo-600 focus:ring-indigo-500"
                        />
                      </th>
                    )}
                    {/* spacer for admin view — no checkboxes */}
                    {['User', 'Role', 'Registered', 'Last Active', 'Spend', 'Limit', 'Status', 'Actions'].map((h, i) => (
                      <th
                        key={h}
                        className={`px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider whitespace-nowrap ${
                          i === 0 ? 'sticky left-0 z-10 bg-slate-900/60' : ''
                        }`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/30">
                  {pageUsers.length === 0 ? (
                    <tr>
                      <td colSpan={canManageUsers && bulkSelectMode ? 9 : 8} className="px-4 py-12 text-center text-slate-400">
                        <Users className="w-8 h-8 mx-auto mb-2 text-slate-600" />
                        No users found
                      </td>
                    </tr>
                  ) : pageUsers.map(user => {
                    const editable      = canEditRole(user);
                    const editableCredit = canEditCredits(user);
                    const isGhostOwner = user.role === 'owner';
                    const isProtected  = isGhostOwner && !viewerIsOwner;

                    return (
                      <tr key={user.id} className="hover:bg-slate-800/30 transition-colors">
                        {canManageUsers && bulkSelectMode && (
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
                        <td className="px-4 py-4 sticky left-0 z-10 bg-slate-800/50">
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
                        {/* admin viewers: badge only (cannot change roles)             */}
                        {/* super_admin viewers: user ↔ admin only (no super_admin opt) */}
                        {/* owner viewers: full dropdown incl. super_admin              */}
                        <td className="px-4 py-4">
                          {canChangeRoles && editable && !isProtected ? (
                            <select
                              value={user.role === 'owner' ? 'super_admin' : user.role}
                              onChange={e => updateRole(user.id, e.target.value)}
                              className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            >
                              <option value="user">User</option>
                              <option value="admin">Admin</option>
                              {/* Only owner can promote to / demote from super_admin */}
                              {canPromoteToSuperAdmin && <option value="super_admin">Super Admin</option>}
                            </select>
                          ) : (
                            <span className={ghostRoleBadge(user.role)}>
                              {isGhostOwner && <Shield className="w-3 h-3" />}
                              {ghostRoleLabel(user.role)}
                            </span>
                          )}
                        </td>

                        <td className="px-4 py-4 text-xs text-slate-300 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-slate-500" />
                            {user.createdAt ? formatAdminDate(user.createdAt) : '—'}
                          </div>
                        </td>
                        <td className="px-4 py-4 text-xs text-slate-300 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <Activity className="w-3.5 h-3.5 text-slate-500" />
                            {user.lastActive ? formatAdminDate(user.lastActive) : <span className="text-slate-500 italic">Never</span>}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-1.5 text-xs font-medium text-white">
                            <BarChart3 className="w-3.5 h-3.5 text-blue-400" />
                            {formatUsd(user.monthlyCreditUsdUsed)}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <CreditBar used={user.monthlyCreditUsdUsed} limit={user.creditLimit} />
                        </td>
                        <td className="px-4 py-4">
                          <StatusBadge status={user.status} />
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2">
                            {canManageCredits && editableCredit && (
                              <button
                                onClick={() => { setSelectedUser(user); setShowCredits(true); }}
                                className="px-3 py-1.5 rounded-lg bg-emerald-600/15 hover:bg-emerald-600/25 text-emerald-400 border border-emerald-600/30 text-xs font-semibold transition-colors"
                                title="Allocate monthly credits"
                              >
                                Allocate
                              </button>
                            )}

                            {/* View — always */}
                            <button onClick={() => { setSelectedUser(user); setShowDetails(true); }} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-blue-400 transition-colors" title="View">
                              <Eye className="w-4 h-4" />
                            </button>

                            {/* Status actions:
                                - owner / super_admin: activate + suspend + soft-delete
                                - admin: activate + suspend on 'user' rows only (canEdit gates which rows)
                                canBasicUserActions covers the admin tier */}
                            {(canManageUsers || canBasicUserActions) && editable && (
                              <div className="relative group">
                                <button className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors">
                                  <MoreVertical className="w-4 h-4" />
                                </button>
                                <div className="absolute right-0 top-full mt-1 w-40 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-20 py-1">
                                  <button onClick={() => updateStatus(user.id, 'active')} className="w-full px-4 py-2 text-left text-xs text-emerald-400 hover:bg-slate-700/50 flex items-center gap-2">
                                    <CheckCircle className="w-3.5 h-3.5" />Activate
                                  </button>
                                  <button onClick={() => openDangerModal(
                                    'Suspend User?',
                                    `Suspending ${user.email} revokes all access immediately.`,
                                    () => updateStatus(user.id, 'suspended'),
                                    'Suspend'
                                  )} className="w-full px-4 py-2 text-left text-xs text-red-400 hover:bg-slate-700/50 flex items-center gap-2">
                                    <Ban className="w-3.5 h-3.5" />Suspend
                                  </button>
                                  {/* Soft delete — owner / super_admin only, not admin */}
                                  {canDeleteUsers && (
                                    <button onClick={() => openDangerModal(
                                      'Soft Delete User?',
                                      `Soft-deleting ${user.email} preserves their data but permanently revokes access.`,
                                      () => updateStatus(user.id, 'deleted'),
                                      'Delete'
                                    )} className="w-full px-4 py-2 text-left text-xs text-red-500 hover:bg-slate-700/50 flex items-center gap-2">
                                      <XCircle className="w-3.5 h-3.5" />Soft Delete
                                    </button>
                                  )}
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

      {/* Modals */}
      {showDetails && selectedUser && (
        <UserDetailModal user={selectedUser} onClose={() => { setShowDetails(false); setSelectedUser(null); }} />
      )}
      {showCredits && selectedUser && (
        <CreditModal user={selectedUser} onClose={() => { setShowCredits(false); setSelectedUser(null); }} onUpdate={updateCreditLimit} />
      )}
      {showInvite && (
        <InviteModal onClose={() => setShowInvite(false)} canPromoteToSuperAdmin={canPromoteToSuperAdmin} />
      )}

      {/* Danger confirmation modal — safe suspend / soft delete */}
      <ConfirmDangerModal
        isOpen={dangerModal.open}
        onClose={() => setDangerModal(m => ({ ...m, open: false }))}
        onConfirm={async () => {
          setDangerModal(m => ({ ...m, loading: true }));
          await dangerModal.onConfirm?.();
          setDangerModal(m => ({ ...m, open: false, loading: false }));
        }}
        title={dangerModal.title}
        message={dangerModal.message}
        confirmLabel={dangerModal.confirmLabel || 'Confirm'}
        loading={dangerModal.loading}
      />

      {showBulkGrantModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl
            p-6 w-full max-w-sm mx-4 shadow-2xl">
            <h3 className="text-sm font-semibold text-white mb-1">
              Bulk credit grant
            </h3>
            <p className="text-xs text-gray-400 mb-4">
              Adds this amount to every user's credit limit simultaneously.
            </p>
            <div className="flex items-center gap-2 mb-4">
              <span className="text-sm text-gray-400">$</span>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={bulkGrantAmount}
                onChange={(e) => setBulkGrantAmount(e.target.value)}
                placeholder="Amount per user"
                className="flex-1 px-3 py-2 text-sm rounded-lg bg-slate-700
                  border border-slate-600 text-white placeholder-gray-500
                  focus:outline-none focus:border-emerald-500 transition-colors"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setShowBulkGrantModal(false); setBulkGrantAmount(''); }}
                className="text-xs px-4 py-2 rounded-lg border border-slate-600
                  text-gray-400 hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button
                disabled={!bulkGrantAmount || bulkGranting}
                onClick={handleBulkGrant}
                className="text-xs px-4 py-2 rounded-lg bg-emerald-600 text-white
                  hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              >
                {bulkGranting ? 'Granting...' : 'Grant to all users'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagementNew;
