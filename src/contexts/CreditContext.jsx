/**
 * Lead Finder - Credit Context
 *
 * Exposes both global platform usage and per-user monthly allocation usage.
 */

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from './AuthContext';
import {
  deductCredits as deductCreditsService,
  ensureGlobalUsageDoc,
  getEffectiveUserMonthMetrics,
  getCreditRuntimeSettings,
  MONTHLY_FREE_CALLS,
} from '../services/creditService';
import { CREDIT_CONFIG } from '../config';

// ─────────────────────────────────────────────────────────────────────────────

const MONTHLY_CAP_USD = CREDIT_CONFIG.PLATFORM_CAP_USD || 195.00;
const DEFAULT_USER_BUDGET_USD = CREDIT_CONFIG.DEFAULT_USER_BUDGET_USD || 50;

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

// ─────────────────────────────────────────────────────────────────────────────
// PROVIDER
// ─────────────────────────────────────────────────────────────────────────────

// eslint-disable-next-line react-refresh/only-export-components
export const CreditProvider = ({ children }) => {
  const { currentUser } = useAuth();

  // Platform-level state
  const [monthlyApiCost,  setMonthlyApiCost]  = useState(0);
  const [totalApiCalls,   setTotalApiCalls]   = useState(0);
  const [loadingGlobal,   setLoadingGlobal]   = useState(true);
  const [effectivePlatformCapUsd, setEffectivePlatformCapUsd] = useState(MONTHLY_CAP_USD);

  // Per-user analytics state (no balance, just counters)
  const [mySearchCount,  setMySearchCount]  = useState(0);
  const [myCallsUsed,    setMyCallsUsed]    = useState(0);
  const [myMonthlyUsdUsed, setMyMonthlyUsdUsed] = useState(0);
  const [myMonthlyLimitUsd, setMyMonthlyLimitUsd] = useState(DEFAULT_USER_BUDGET_USD);
  const [myUnlimited, setMyUnlimited] = useState(false);
  const [loadingUser,    setLoadingUser]    = useState(true);

  // ── Real-time listener: system/global_usage ───────────────────────────────
  useEffect(() => {
    if (!currentUser) {
      setMonthlyApiCost(0);
      setTotalApiCalls(0);
      setLoadingGlobal(false);
      return;
    }

    ensureGlobalUsageDoc().catch(() => {});
    getCreditRuntimeSettings()
      .then((cfg) => setEffectivePlatformCapUsd(cfg.globalCreditLimitUsd || MONTHLY_CAP_USD))
      .catch(() => setEffectivePlatformCapUsd(MONTHLY_CAP_USD));

    const globalRef = doc(db, 'system', 'global_usage');
    const unsub     = onSnapshot(
      globalRef,
      (snap) => {
        if (snap.exists()) {
          const d     = snap.data();
          const month = currentMonthStr();
          if (d.month === month) {
            setMonthlyApiCost(d.monthly_api_cost ?? 0);
            setTotalApiCalls(d.totalApiCalls      ?? 0);
          } else {
            setMonthlyApiCost(0);
            setTotalApiCalls(0);
          }
        } else {
          setMonthlyApiCost(0);
          setTotalApiCalls(0);
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

  // ── Real-time listener: current user's Firestore document (analytics) ────
  useEffect(() => {
    if (!currentUser?.uid) {
      setMySearchCount(0);
      setMyCallsUsed(0);
      setMyMonthlyUsdUsed(0);
      setMyMonthlyLimitUsd(DEFAULT_USER_BUDGET_USD);
      setMyUnlimited(false);
      setLoadingUser(false);
      return;
    }

    const userRef = doc(db, 'users', currentUser.uid);
    const unsub   = onSnapshot(
      userRef,
      (snap) => {
        if (snap.exists()) {
          const d = snap.data();
          const effectiveMetrics = getEffectiveUserMonthMetrics(d, currentMonthStr());

          setMySearchCount(d.searchCount ?? 0);
          setMyCallsUsed(effectiveMetrics.monthlyApiCalls);
          setMyMonthlyUsdUsed(effectiveMetrics.monthlyApiCost);

          if (d.creditLimit === 'unlimited') {
            setMyUnlimited(true);
            setMyMonthlyLimitUsd(0);
          } else if (typeof d.creditLimit === 'number') {
            setMyUnlimited(false);
            setMyMonthlyLimitUsd(Math.max(0, d.creditLimit));
          } else if (typeof d.creditLimit === 'string' && d.creditLimit.trim() !== '') {
            const parsed = Number.parseFloat(d.creditLimit);
            setMyUnlimited(false);
            setMyMonthlyLimitUsd(Number.isFinite(parsed) ? Math.max(0, parsed) : DEFAULT_USER_BUDGET_USD);
          } else {
            setMyUnlimited(false);
            setMyMonthlyLimitUsd(DEFAULT_USER_BUDGET_USD);
          }
        } else {
          setMySearchCount(0);
          setMyCallsUsed(0);
          setMyMonthlyUsdUsed(0);
          setMyMonthlyLimitUsd(DEFAULT_USER_BUDGET_USD);
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

  // ── deductCredits wrapper (stable reference) ─────────────────────────────
  const deductCredits = useCallback(
    (apiCalls, meta = {}) => {
      if (!currentUser?.uid) return Promise.reject(new Error('Not signed in.'));
      return deductCreditsService(currentUser.uid, apiCalls, meta);
    },
    [currentUser?.uid]
  );

  // ── Derived values ────────────────────────────────────────────────────────
  const remainingCalls  = Math.max(0, MONTHLY_FREE_CALLS - totalApiCalls);
  const myCreditRemainingUsd = myUnlimited
    ? null
    : Math.max(0, +(myMonthlyLimitUsd - myMonthlyUsdUsed).toFixed(4));
  const myCreditPctUsed = myUnlimited
    ? 0
    : Math.min(+((myMonthlyUsdUsed / Math.max(myMonthlyLimitUsd, 0.0001)) * 100).toFixed(1), 100);
  const platformPctUsed = Math.min(
    +((monthlyApiCost / Math.max(effectivePlatformCapUsd, 0.0001)) * 100).toFixed(1),
    100
  );

  const value = {
    // Global platform stats
    totalApiCalls,
    monthlyApiCost,
    monthlyCapUsd:  effectivePlatformCapUsd,
    remainingCalls,
    platformPctUsed,
    // Per-user analytics
    mySearchCount,
    myCallsUsed,
    myMonthlyUsdUsed,
    myMonthlyLimitUsd,
    myCreditRemainingUsd,
    myCreditPctUsed,
    myCreditIsUnlimited: myUnlimited,
    // Legacy aliases — keeps any existing consumers working
    credits:     myUnlimited ? 'unlimited' : myCreditRemainingUsd,
    creditsUsed: myCallsUsed,
    // Actions
    loading:       loadingUser || loadingGlobal,
    deductCredits,
  };

  return (
    <CreditContext.Provider value={value}>
      {children}
    </CreditContext.Provider>
  );
};

// default export removed — nothing imports it and it breaks React Fast Refresh
