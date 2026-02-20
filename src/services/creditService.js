/**
 * Lead Finder â€” Credit Service  (Phase 3 â€” Global Tracking)
 *
 * Model: ALL users share a single global pool from Google's $200/month
 * free tier (~6,093 API calls). No per-user credit limits exist.
 * Any authenticated user can search as long as the platform hasn't
 * hit the $195 safety cap this month.
 *
 * The only gate: system/global_usage monthly budget.
 * Per-user analytics (searchCount, creditsUsed) are recorded for
 * admin visibility but do NOT block searches.
 */

import { db } from '../firebase';
import {
  doc,
  collection,
  runTransaction,
  getDoc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { CREDIT_CONFIG } from '../config';

const COST_PER_CALL   = CREDIT_CONFIG.COST_PER_REQUEST_USD; // $0.032
const MONTHLY_CAP_USD = 195.00;
const GLOBAL_DOC_PATH = ['system', 'global_usage'];

/** Total free calls per month (for display) */
export const MONTHLY_FREE_CALLS = Math.floor(MONTHLY_CAP_USD / COST_PER_CALL); // 6 093

const currentMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

/**
 * Atomic Firestore transaction:
 *   1. Read system/global_usage.
 *   2. Abort if projected cost >= $195 (platform cap).
 *   3. Increment global stats + record per-user analytics.
 *   4. Write audit receipt to users/{userId}/credit_logs.
 *
 * @param {string} userId
 * @param {number} apiCalls  Actual Places API calls consumed (0 = free cache hit)
 * @param {object} [meta]    { keyword, location, scope }
 */
export const deductCredits = async (userId, apiCalls, meta = {}) => {
  if (!userId)                    throw new Error('userId is required.');
  if (!apiCalls || apiCalls <= 0) return;  // cached â€” free, skip

  const costUsd   = +(apiCalls * COST_PER_CALL).toFixed(4);
  const month     = currentMonth();
  const userRef   = doc(db, 'users', userId);
  const globalRef = doc(db, ...GLOBAL_DOC_PATH);

  await runTransaction(db, async (tx) => {
    const [userSnap, globalSnap] = await Promise.all([
      tx.get(userRef),
      tx.get(globalRef),
    ]);

    if (!userSnap.exists()) {
      throw new Error('User profile not found. Please sign in again.');
    }

    // â”€â”€ GLOBAL GUARD â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const globalData    = globalSnap.exists() ? globalSnap.data() : {};
    const isNewMonth    = !globalSnap.exists() || globalData.month !== month;
    const currentCost   = isNewMonth ? 0 : (globalData.monthly_api_cost ?? 0);

    if (currentCost + costUsd > MONTHLY_CAP_USD) {
      throw new Error(
        `Platform monthly search budget reached ` +
        `($${currentCost.toFixed(2)} / $${MONTHLY_CAP_USD}). ` +
        `Resets on the 1st of next month. Cached results are still free.`
      );
    }

    // â”€â”€ Write 1: global usage â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const newGlobal = {
      month,
      monthly_api_cost: isNewMonth ? costUsd : currentCost + costUsd,
      totalApiCalls:    isNewMonth ? apiCalls : (globalData.totalApiCalls ?? 0) + apiCalls,
      lastUpdated:      serverTimestamp(),
    };
    if (!globalSnap.exists() || isNewMonth) tx.set(globalRef, newGlobal);
    else                                     tx.update(globalRef, newGlobal);

    // â”€â”€ Write 2: per-user analytics (no balance deduction) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const ud = userSnap.data();
    tx.update(userRef, {
      creditsUsed: (ud.creditsUsed ?? 0) + apiCalls,
      searchCount: (ud.searchCount ?? 0) + 1,
    });

    // â”€â”€ Write 3: audit receipt â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    tx.set(doc(collection(db, 'users', userId, 'credit_logs')), {
      userId,
      apiCalls,
      costUsd,
      keyword:  meta.keyword  || '',
      location: meta.location || '',
      scope:    meta.scope    || '',
      month,
      createdAt: serverTimestamp(),
    });

    console.log(
      `[credits] uid=${userId} +${apiCalls} calls ($${costUsd}) | ` +
      `platform: $${currentCost.toFixed(2)} â†’ $${(currentCost + costUsd).toFixed(2)}/$${MONTHLY_CAP_USD}`
    );
  });
};

export const getUserCreditBalance = async (userId) => {
  if (!userId) return 0;
  const snap = await getDoc(doc(db, 'users', userId));
  return snap.exists() ? (snap.data().credits ?? 0) : 0;
};

export const getGlobalUsage = async () => {
  const snap = await getDoc(doc(db, ...GLOBAL_DOC_PATH));
  if (!snap.exists()) return { monthly_api_cost: 0, totalApiCalls: 0, month: currentMonth() };
  const d = snap.data();
  return d.month === currentMonth() ? d : { monthly_api_cost: 0, totalApiCalls: 0, month: currentMonth() };
};

export const ensureGlobalUsageDoc = async () => {
  const ref   = doc(db, ...GLOBAL_DOC_PATH);
  const snap  = await getDoc(ref);
  const month = currentMonth();
  if (!snap.exists() || snap.data().month !== month) {
    await setDoc(ref, { month, monthly_api_cost: 0, totalApiCalls: 0, lastUpdated: serverTimestamp() });
  }
};

// â”€â”€ Backward-compat stubs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
/* eslint-disable no-unused-vars */
export const initializeGlobalCredits  = ()        => ensureGlobalUsageDoc();
export const getGlobalCredits         = ()        => getGlobalUsage().then(d => d.totalApiCalls ?? 0);
export const addGlobalCredits         = ()        => Promise.resolve();
export const subscribeToGlobalCredits = ()        => () => {};
export const resetGlobalCredits       = ()        => Promise.resolve();
export const getCreditStats           = (n)       => ({
  totalCalls:     n,
  totalCost:      (n * COST_PER_CALL).toFixed(2),
  remainingCalls: Math.max(0, MONTHLY_FREE_CALLS - n),
  percentageUsed: Math.min((n / MONTHLY_FREE_CALLS) * 100, 100).toFixed(1),
});
export const initializeUserCredits = (_uid) => ensureGlobalUsageDoc();
export const getUserCredits        = (uid)  => getUserCreditBalance(uid);
export const addCredits            = ()     => Promise.resolve();
export const subscribeToCredits    = (_uid, cb) => { cb(0); return () => {}; };
export const resetUserCredits      = ()     => Promise.resolve();
/* eslint-enable no-unused-vars */
