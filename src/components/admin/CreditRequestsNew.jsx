import { useEffect, useState } from 'react';
import {
  CheckCircle,
  Clock,
  XCircle,
  DollarSign,
  Mail,
  Calendar,
  MessageSquare,
  Search,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { toast } from 'sonner';

const toDateValue = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value?.toDate === 'function') return value.toDate();
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
};

const CreditRequestsNew = () => {
  const [requests, setRequests] = useState([]);
  const [filteredRequests, setFilteredRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all'); // all, pending, approved, rejected
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [processingId, setProcessingId] = useState(null);
  const [approvalAmount, setApprovalAmount] = useState({});

  useEffect(() => {
    const q = query(
      collection(db, 'credit_requests'),
      orderBy('createdAt', 'desc')
    );

    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
        createdAt: toDateValue(d.data().createdAt),
        approvedAt: toDateValue(d.data().approvedAt),
        rejectedAt: toDateValue(d.data().rejectedAt),
        updatedAt: toDateValue(d.data().updatedAt),
      }));
      setRequests(data);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  useEffect(() => {
    let filtered = requests;

    if (filterStatus !== 'all') {
      filtered = filtered.filter((r) => r.status === filterStatus);
    }

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (r) =>
          r.userEmail?.toLowerCase().includes(term) ||
          r.keyword?.toLowerCase().includes(term) ||
          r.location?.toLowerCase().includes(term)
      );
    }

    setFilteredRequests(filtered);
  }, [requests, filterStatus, searchTerm]);

  const handleApprove = async (requestId, request) => {
    const approvedAmount = approvalAmount[requestId] || request.requestedAmountUsd;

    if (approvedAmount <= 0) {
      toast.error('Approved amount must be greater than 0');
      return;
    }

    setProcessingId(requestId);
    try {
      const requestRef = doc(db, 'credit_requests', requestId);
      const userRef = doc(db, 'users', request.userId);

      // Update request status
      await updateDoc(requestRef, {
        status: 'approved',
        approvedAmountUsd: approvedAmount,
        approvedBy: 'admin', // TODO: get actual admin email from context
        approvedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Update user credit limit
      await updateDoc(userRef, {
        creditLimit: (Number(request.currentUserLimit) || 50) + approvedAmount,
        lastCreditUpdate: serverTimestamp(),
      });

      toast.success(`Approved $${approvedAmount.toFixed(2)} for ${request.userEmail}`);
      setApprovalAmount((prev) => {
        const next = { ...prev };
        delete next[requestId];
        return next;
      });
      setExpandedId(null);
    } catch (error) {
      toast.error('Failed to approve request');
      console.error(error);
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (requestId, request) => {
    setProcessingId(requestId);
    try {
      const requestRef = doc(db, 'credit_requests', requestId);
      await updateDoc(requestRef, {
        status: 'rejected',
        rejectedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      toast.success(`Rejected request from ${request.userEmail}`);
      setExpandedId(null);
    } catch (error) {
      toast.error('Failed to reject request');
      console.error(error);
    } finally {
      setProcessingId(null);
    }
  };

  const getStatusBadge = (status) => {
    const configs = {
      pending: { icon: Clock, bg: 'bg-blue-50 dark:bg-blue-500/10', border: 'border-blue-200 dark:border-blue-500/30', text: 'text-blue-700 dark:text-blue-400' },
      approved: { icon: CheckCircle, bg: 'bg-emerald-50 dark:bg-emerald-500/10', border: 'border-emerald-200 dark:border-emerald-500/30', text: 'text-emerald-700 dark:text-emerald-400' },
      rejected: { icon: XCircle, bg: 'bg-red-50 dark:bg-red-500/10', border: 'border-red-200 dark:border-red-500/30', text: 'text-red-700 dark:text-red-400' },
    };

    const config = configs[status] || configs.pending;
    const Icon = config.icon;

    return (
      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold border ${config.bg} ${config.border} ${config.text}`}>
        <Icon className="w-4 h-4" />
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Loading credit requests...</p>
        </div>
      </div>
    );
  }

  const pendingCount = requests.filter((r) => r.status === 'pending').length;
  const approvedCount = requests.filter((r) => r.status === 'approved').length;
  const rejectedCount = requests.filter((r) => r.status === 'rejected').length;

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Credit Requests</h1>
          <p className="text-gray-400">Review and manage user credit top-up requests</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Pending" value={pendingCount} color="blue" />
        <StatCard label="Approved" value={approvedCount} color="emerald" />
        <StatCard label="Rejected" value={rejectedCount} color="red" />
      </div>

      {/* Filters */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by email, keyword, or location..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-gray-300 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Status Filter */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
      </div>

      {/* Requests List */}
      <div className="space-y-3">
        {filteredRequests.length === 0 ? (
          <div className="text-center py-12 bg-slate-800/50 border border-slate-700/50 rounded-xl">
            <p className="text-gray-400">No requests found</p>
          </div>
        ) : (
          filteredRequests.map((request) => (
            <div
              key={request.id}
              className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden hover:border-slate-600/50 transition-all"
            >
              {/* Request Header */}
              <button
                onClick={() => setExpandedId(expandedId === request.id ? null : request.id)}
                className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-700/30 transition-colors"
              >
                <div className="flex items-center gap-4 flex-1 min-w-0 text-left">
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-semibold truncate">{request.userEmail}</p>
                    <p className="text-sm text-gray-400 mt-0.5">
                      ${request.requestedAmountUsd?.toFixed(2) || '0.00'} requested • {request.scope} search
                    </p>
                  </div>
                  {getStatusBadge(request.status)}
                </div>
                {expandedId === request.id ? (
                  <ChevronUp className="w-5 h-5 text-gray-400 ml-2 flex-none" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-gray-400 ml-2 flex-none" />
                )}
              </button>

              {/* Request Details (Expanded) */}
              {expandedId === request.id && (
                <>
                  <div className="border-t border-slate-700 px-6 py-4 bg-slate-900/30 space-y-4">
                    {/* Search Details */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">Keyword</p>
                        <p className="text-white font-medium">{request.keyword || '—'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">Location</p>
                        <p className="text-white font-medium">{request.location || '—'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">Estimated Cost</p>
                        <p className="text-white font-medium">${request.estimatedCostUsd?.toFixed(2) || '0.00'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">Current Remaining</p>
                        <p className="text-emerald-400 font-medium">${request.remainingUsd?.toFixed(2) || '0.00'}</p>
                      </div>
                    </div>

                    {/* Request Details */}
                    <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-700">
                      <div className="flex items-center gap-2 text-sm text-gray-300">
                        <Mail className="w-4 h-4 text-gray-500" />
                        {request.userEmail}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-300">
                        <Calendar className="w-4 h-4 text-gray-500" />
                        {request.createdAt?.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>

                    {/* Reason */}
                    {request.reason && (
                      <div className="pt-2 border-t border-slate-700">
                        <p className="text-xs text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                          <MessageSquare className="w-4 h-4" />
                          User Notes
                        </p>
                        <p className="text-gray-300 text-sm italic">"{request.reason}"</p>
                      </div>
                    )}

                    {/* Amount Approval Input (for pending requests) */}
                    {request.status === 'pending' && (
                      <div className="pt-2 border-t border-slate-700">
                        <p className="text-xs text-gray-400 uppercase tracking-widest mb-3">Approval Amount</p>
                        <div className="flex gap-3">
                          <div className="flex-1 relative">
                            <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                            <input
                              type="number"
                              min="0"
                              max="1000"
                              step="5"
                              value={approvalAmount[request.id] ?? request.requestedAmountUsd ?? 0}
                              onChange={(e) =>
                                setApprovalAmount((prev) => ({
                                  ...prev,
                                  [request.id]: parseFloat(e.target.value) || 0,
                                }))
                              }
                              className="w-full pl-8 pr-4 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                          </div>
                          <span className="text-sm text-gray-400 self-center">
                            (requested:${request.requestedAmountUsd?.toFixed(2) || '0.00'})
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Action Buttons */}
                  {request.status === 'pending' && (
                    <div className="border-t border-slate-700 px-6 py-4 bg-slate-900/50 flex gap-3">
                      <button
                        onClick={() => handleReject(request.id, request)}
                        disabled={processingId === request.id}
                        className="flex-1 px-4 py-2.5 bg-red-500/20 border border-red-500/30 hover:bg-red-500/30 text-red-400 font-semibold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {processingId === request.id ? 'Processing...' : 'Reject'}
                      </button>
                      <button
                        onClick={() => handleApprove(request.id, request)}
                        disabled={processingId === request.id}
                        className="flex-1 px-4 py-2.5 bg-emerald-500/20 border border-emerald-500/30 hover:bg-emerald-500/30 text-emerald-400 font-semibold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {processingId === request.id ? 'Processing...' : 'Approve'}
                      </button>
                    </div>
                  )}

                  {/* Approval Info */}
                  {request.status === 'approved' && (
                    <div className="border-t border-slate-700 px-6 py-4 bg-emerald-500/10 border-t-emerald-500/30">
                      <p className="text-sm text-emerald-400">
                        ✓ Approved ${request.approvedAmountUsd?.toFixed(2) || '0.00'} on{' '}
                        {request.approvedAt?.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}
                      </p>
                    </div>
                  )}

                  {/* Rejection Info */}
                  {request.status === 'rejected' && (
                    <div className="border-t border-slate-700 px-6 py-4 bg-red-500/10 border-t-red-500/30">
                      <p className="text-sm text-red-400">
                        ✗ Rejected on {request.rejectedAt?.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

const StatCard = ({ label, value, color }) => {
  const colorMap = {
    blue: 'text-blue-400',
    emerald: 'text-emerald-400',
    red: 'text-red-400',
  };

  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
      <p className="text-gray-400 text-sm mb-1">{label}</p>
      <p className={`text-2xl font-bold ${colorMap[color]}`}>{value}</p>
    </div>
  );
};

export default CreditRequestsNew;
