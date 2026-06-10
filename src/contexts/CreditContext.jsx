/**
 * Lead Finder - Credit Context (SKU-Based)
 *
 * Exposes SKU-based credit state to the whole app.
 * All users are equal — same 2,800 credits/month, no tiers.
 * Admin can override creditLimit per user (integer credits or 'unlimited').
 *
 * Key values exposed:
 *   myCreditsUsed        — credits consumed this month
 *   myCreditsLimit       — monthly credit limit (default 2,800)
 *   myCreditsRemaining   — credits left this month
 *   myCreditPctUsed      — percentage used (0–100)
 *   myCreditIsUnlimited  — true if admin set 'unlimited'
 *   platformEnterpriseCallsUsed — raw Enterprise SKU calls (admin use)
 *   platformCreditPctUsed       — platform % used (based on Enterprise cap)
 */

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from './AuthContext';
import {
  deductCredits as deductCreditsService,
  ensureGlobalUsageDoc,
  getEffectiveUserMonthMetrics,
  getCreditRuntimeSettings,
} from '../services/creditService';
import { CREDIT_CONFIG } from '../config';
import { triggerSystemEmail } from '../services/notificationService';

const DEFAULT_USER_CREDITS = CREDIT_CONFIG.DEFAULT_USER_CREDITS;

const currentMonthStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const CreditContext = createContext(null);

export const useCredit = () => {
  const ctx = useContext(CreditContext);
  if (!ctx) throw new Error('useCredit must be used inside <CreditProvider>');
  return ctx;
};

// eslint-disable-next-line react-refresh/only-export-components
export const CreditProvider = ({ children }) => {
  const { currentUser } = useAuth();

  // ── Platform-level state ───────────────────────────────────────────────────
  const [platformEnterpriseCallsUsed, setPlatformEnterpriseCallsUsed] = useState(0);
  const [platformTotalApiCalls,       setPlatformTotalApiCalls]       = useState(0);
  const [platformTotalCreditsUsed,    setPlatformTotalCreditsUsed]    = useState(0);
  const [loadingGlobal,               setLoadingGlobal]               = useState(true);

  // ── Per-user state ─────────────────────────────────────────────────────────
  const [mySearchCount,      setMySearchCount]      = useState(0);
  const [myApiCallsUsed,     setMyApiCallsUsed]     = useState(0);
  const [myCreditsUsed,      setMyCreditsUsed]      = useState(0);
  const [myCreditsLimit,     setMyCreditsLimit]     = useState(DEFAULT_USER_CREDITS);
  const [myUnlimited,        setMyUnlimited]        = useState(false);
  const [loadingUser,        setLoadingUser]        = useState(true);

  // ── Alert settings ─────────────────────────────────────────────────────────
  const [creditAlertThresholdPct, setCreditAlertThresholdPct] = useState(80);
  const [creditAlertsEnabled,     setCreditAlertsEnabled]     = useState(true);

  // ── Real-time listener: system/global_usage ─────────────────────────────
  useEffect(() => {
    if (!currentUser) {
      setPlatformEnterpriseCallsUsed(0);
      setPlatformTotalApiCalls(0);
      setPlatformTotalCreditsUsed(0);
      setLoadingGlobal(false);
      return;
    }

    ensureGlobalUsageDoc().catch(() => {});

    const globalRef = doc(db, 'system', 'global_usage');
    const unsub = onSnapshot(
      globalRef,
      (snap) => {
        if (snap.exists()) {
          const d     = snap.data();
          const month = currentMonthStr();
          if (d.month === month) {
            setPlatformEnterpriseCallsUsed(d.sku_enterprise_calls ?? 0);
            setPlatformTotalApiCalls(d.totalApiCalls           ?? 0);
            setPlatformTotalCreditsUsed(d.totalCreditsUsed     ?? 0);
          } else {
            setPlatformEnterpriseCallsUsed(0);
            setPlatformTotalApiCalls(0);
            setPlatformTotalCreditsUsed(0);
          }
        } else {
          setPlatformEnterpriseCallsUsed(0);
          setPlatformTotalApiCalls(0);
          setPlatformTotalCreditsUsed(0);
        }
        setLoadingGlobal(false);
      },
      (err) => {
        console.warn('[CreditContext] global snapshot error:', err.message);
        setLoadingGlobal(false);
      }
    );
    return unsub;
  }, [currentUser?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Real-time listener: current user document ────────────────────────────
  useEffect(() => {
    if (!currentUser?.uid) {
      setMySearchCount(0);
      setMyApiCallsUsed(0);
      setMyCreditsUsed(0);
      setMyCreditsLimit(DEFAULT_USER_CREDITS);
      setMyUnlimited(false);
      setLoadingUser(false);
      return;
    }

    const userRef = doc(db, 'users', currentUser.uid);
    const unsub   = onSnapshot(
      userRef,
      (snap) => {
        if (snap.exists()) {
          const d       = snap.data();
          const metrics = getEffectiveUserMonthMetrics(d, currentMonthStr());

          setMySearchCount(d.searchCount ?? 0);
          setMyApiCallsUsed(metrics.monthlyApiCalls);
          setMyCreditsUsed(metrics.monthlyCreditsUsed);

          if (d.creditLimit === 'unlimited') {
            setMyUnlimited(true);
            setMyCreditsLimit(0);
          } else if (typeof d.creditLimit === 'number') {
            setMyUnlimited(false);
            setMyCreditsLimit(Math.max(0, Math.round(d.creditLimit)));
          } else if (typeof d.creditLimit === 'string' && d.creditLimit.trim() !== '') {
            const parsed = Number.parseFloat(d.creditLimit);
            setMyUnlimited(false);
            setMyCreditsLimit(Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : DEFAULT_USER_CREDITS);
          } else {
            setMyUnlimited(false);
            setMyCreditsLimit(DEFAULT_USER_CREDITS);
          }
        } else {
          setMySearchCount(0);
          setMyApiCallsUsed(0);
          setMyCreditsUsed(0);
          setMyCreditsLimit(DEFAULT_USER_CREDITS);
          setMyUnlimited(false);
        }
        setLoadingUser(false);
      },
      (err) => {
        console.warn('[CreditContext] user snapshot error:', err.message);
        setLoadingUser(false);
      }
    );
    return unsub;
  }, [currentUser?.uid]);

  // ── Alert settings loader ─────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!currentUser?.uid) {
        setCreditAlertThresholdPct(80);
        setCreditAlertsEnabled(true);
        return;
      }
      try {
        const snap = await getDoc(doc(db, 'systemConfig', 'globalSettings'));
        if (!snap.exists() || cancelled) return;
        const data = snap.data() || {};
        const parsed = Number.parseInt(data.creditAlertThreshold, 10);
        setCreditAlertThresholdPct(
          Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 100) : 80
        );
        setCreditAlertsEnabled((data.emailNotificationsEnabled ?? true) && (data.sendCreditAlerts ?? true));
      } catch {
        if (!cancelled) { setCreditAlertThresholdPct(80); setCreditAlertsEnabled(true); }
      }
    };
    load();
    return () => { cancelled = true; };
  }, [currentUser?.uid]);

  // ── deductCredits wrapper ─────────────────────────────────────────────────
  const deductCredits = useCallback(
    (apiCalls, meta = {}) => {
      if (!currentUser?.uid) return Promise.reject(new Error('Not signed in.'));
      // All current calls are Enterprise tier (phone+website+ratings in FIELD_MASK)
      return deductCreditsService(currentUser.uid, apiCalls, 'enterprise', meta);
    },
    [currentUser?.uid]
  );

  // ── Derived values ────────────────────────────────────────────────────────
  const myCreditsRemaining = myUnlimited
    ? null
    : Math.max(0, myCreditsLimit - myCreditsUsed);

  const myCreditPctUsed = myUnlimited
    ? 0
    : Math.min(+((myCreditsUsed / Math.max(myCreditsLimit, 1)) * 100).toFixed(1), 100);

  const platformCreditPctUsed = Math.min(
    +((platformEnterpriseCallsUsed / CREDIT_CONFIG.SKU_FREE_CAPS.enterprise) * 100).toFixed(1),
    100
  );

  // ── User alert at 80% ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!currentUser?.uid || !currentUser?.email) return;
    if (myUnlimited || !creditAlertsEnabled) return;
    if (myCreditPctUsed < creditAlertThresholdPct) return;

    const now      = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const dedupeKey = `credit-alert-email:${currentUser.uid}:${monthKey}:${creditAlertThresholdPct}`;
    if (window.localStorage.getItem(dedupeKey) === 'sent') return;

    triggerSystemEmail('credit_alert', {
      userEmail:        currentUser.email,
      usagePct:         myCreditPctUsed,
      creditsRemaining: myCreditsRemaining ?? 0,
      creditsTotal:     myCreditsLimit,
      remainingUsd:     0,          // legacy field — kept for Cloud Function compat
      requestedAmountUsd: 0,
      reason: `You have used ${myCreditPctUsed}% of your ${myCreditsLimit} monthly credits`,
    }).then((result) => {
      if (result?.ok) window.localStorage.setItem(dedupeKey, 'sent');
    });
  }, [
    currentUser?.uid,
    currentUser?.email,
    myUnlimited,
    myCreditPctUsed,
    myCreditsRemaining,
    myCreditsLimit,
    creditAlertsEnabled,
    creditAlertThresholdPct,
  ]);

  const value = {
    // ── Platform stats (for admin dashboard) ──────────────────────────────
    platformEnterpriseCallsUsed,
    platformTotalApiCalls,
    platformTotalCreditsUsed,
    platformCreditPctUsed,
    platformEnterpriseCap: CREDIT_CONFIG.SKU_FREE_CAPS.enterprise,

    // ── Per-user credits ───────────────────────────────────────────────────
    mySearchCount,
    myApiCallsUsed,
    myCreditsUsed,
    myCreditsLimit,
    myCreditsRemaining,
    myCreditPctUsed,
    myCreditIsUnlimited: myUnlimited,

    // ── Legacy aliases — keeps existing consumers working ──────────────────
    // SearchPanel, Sidebar, PlatformUsagePage still reference these names
    totalApiCalls:       platformTotalApiCalls,
    monthlyApiCost:      0,
    monthlyCapUsd:       0,
    remainingCalls:      Math.max(0, CREDIT_CONFIG.SKU_FREE_CAPS.enterprise - platformEnterpriseCallsUsed),
    platformPctUsed:     platformCreditPctUsed,
    myCallsUsed:         myApiCallsUsed,
    myMonthlyUsdUsed:    0,
    myMonthlyLimitUsd:   myCreditsLimit,       // repurposed: now holds credit count
    myCreditRemainingUsd: myCreditsRemaining,  // repurposed: now holds credit count
    credits:             myUnlimited ? 'unlimited' : myCreditsRemaining,
    creditsUsed:         myApiCallsUsed,

    // ── Actions ────────────────────────────────────────────────────────────
    loading: loadingUser || loadingGlobal,
    deductCredits,
  };

  return (
    <CreditContext.Provider value={value}>
      {children}
    </CreditContext.Provider>
  );
};
