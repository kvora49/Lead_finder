/**
 * Lead Finder — Credit Context  (Phase 3 — Global Tracking)
 *
 * All users share a single platform pool from Google's $200/month free tier.
 * No per-user credit limits. Any user can search until the platform hits $195.
 *
 * Exposed values:
 *   totalApiCalls   {number}    Total Places API calls made this month (global)
 *   monthlyApiCost  {number}    Platform USD spent this month
 *   monthlyCapUsd   {number}    Safety cap ($195)
 *   remainingCalls  {number}    MONTHLY_FREE_CALLS − totalApiCalls
 *   platformPctUsed {number}    0–100% of cap consumed
 *   mySearchCount   {number}    This user's search count (analytics only)
 *   myCallsUsed     {number}    This user's API calls used (analytics only)
 *   loading         {boolean}
 *   deductCredits   {Function}  (apiCalls, meta?) → Promise<void>
 *
 * Legacy aliases (so nothing breaks):
 *   credits         → null   (no per-user balance)
 *   creditsUsed     → myCallsUsed
 */

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from './AuthContext';
import {
  deductCredits as deductCreditsService,
  ensureGlobalUsageDoc,
  MONTHLY_FREE_CALLS,
} from '../services/creditService';

// ─────────────────────────────────────────────────────────────────────────────

const MONTHLY_CAP_USD = 195.00;

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

  // Per-user analytics state (no balance, just counters)
  const [mySearchCount,  setMySearchCount]  = useState(0);
  const [myCallsUsed,    setMyCallsUsed]    = useState(0);
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
      setLoadingUser(false);
      return;
    }

    const userRef = doc(db, 'users', currentUser.uid);
    const unsub   = onSnapshot(
      userRef,
      (snap) => {
        if (snap.exists()) {
          const d = snap.data();
          setMySearchCount(d.searchCount  ?? 0);
          setMyCallsUsed(d.creditsUsed    ?? 0);
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
  const platformPctUsed = Math.min(
    +((monthlyApiCost / MONTHLY_CAP_USD) * 100).toFixed(1),
    100
  );

  const value = {
    // Global platform stats
    totalApiCalls,
    monthlyApiCost,
    monthlyCapUsd:  MONTHLY_CAP_USD,
    remainingCalls,
    platformPctUsed,
    // Per-user analytics
    mySearchCount,
    myCallsUsed,
    // Legacy aliases — keeps any existing consumers working
    credits:     null,
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
