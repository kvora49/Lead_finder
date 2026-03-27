/**
 * Lead Finder - Credit Service
 *
 * Model:
 * - Global monthly usage is tracked in system/global_usage and capped at $195.
 * - Each user has a dynamic monthly USD allocation (users/{uid}.creditLimit).
 * - Actual Google API usage cost is charged from measured apiCalls only.
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
const HARD_CAP_USD = CREDIT_CONFIG.PLATFORM_CAP_USD || 195.00;
const DEFAULT_USER_BUDGET_USD = CREDIT_CONFIG.DEFAULT_USER_BUDGET_USD || 50;
const GLOBAL_DOC_PATH = ['system', 'global_usage'];

/** Total free calls per month (for display) */
export const MONTHLY_FREE_CALLS = Math.floor(HARD_CAP_USD / COST_PER_CALL); // 6 093

const currentMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const parseUserLimit = (creditLimitRaw) => {
  if (creditLimitRaw === 'unlimited') return { isUnlimited: true, limitUsd: Infinity };
  if (typeof creditLimitRaw === 'number') {
    return { isUnlimited: false, limitUsd: Math.max(0, creditLimitRaw) };
  }
  if (typeof creditLimitRaw === 'string' && creditLimitRaw.trim() !== '') {
    const n = Number.parseFloat(creditLimitRaw);
    if (Number.isFinite(n)) return { isUnlimited: false, limitUsd: Math.max(0, n) };
  }
  return { isUnlimited: false, limitUsd: DEFAULT_USER_BUDGET_USD };
};

const parseDefaultUserLimit = (raw) => {
  if (raw === 'unlimited') return 'unlimited';
  const n = Number.parseFloat(raw);
  if (Number.isFinite(n) && n >= 0) return n;
  return DEFAULT_USER_BUDGET_USD;
};

export const getCreditRuntimeSettings = async () => {
  try {
    const snap = await getDoc(doc(db, 'systemConfig', 'globalSettings'));
    if (!snap.exists()) {
      return {
        globalCreditLimitUsd: HARD_CAP_USD,
        defaultUserCreditLimitUsd: DEFAULT_USER_BUDGET_USD,
      };
    }

    const data = snap.data() || {};
    const configuredGlobal = Number.parseFloat(data.globalCreditLimit);
    const safeGlobal = Number.isFinite(configuredGlobal) && configuredGlobal > 0
      ? configuredGlobal
      : HARD_CAP_USD;

    // Global setting can reduce spending below hard cap, but never exceed hard cap.
    const effectiveGlobalLimit = Math.min(safeGlobal, HARD_CAP_USD);
    const parsedDefaultUser = parseDefaultUserLimit(data.defaultUserCreditLimit);

    return {
      globalCreditLimitUsd: effectiveGlobalLimit,
      defaultUserCreditLimitUsd: parsedDefaultUser,
    };
  } catch {
    return {
      globalCreditLimitUsd: HARD_CAP_USD,
      defaultUserCreditLimitUsd: DEFAULT_USER_BUDGET_USD,
    };
  }
};

export const getEffectiveUserMonthMetrics = (userData = {}, month = currentMonth()) => {
  const legacyApiCalls = Number(userData.creditsUsed ?? 0);
  const legacyCostUsd = +(legacyApiCalls * COST_PER_CALL).toFixed(4);

  const hasCurrentMonthRecord = userData.creditMonth === month;
  const explicitApiCalls = hasCurrentMonthRecord ? Number(userData.userMonthlyApiCalls ?? 0) : 0;
  const explicitCostUsd = hasCurrentMonthRecord ? +(Number(userData.userMonthlyApiCost ?? 0)).toFixed(4) : 0;

  const shouldUseLegacyFallback = !hasCurrentMonthRecord || (
    explicitApiCalls === 0 && explicitCostUsd === 0 && legacyApiCalls > 0
  );

  return {
    month,
    monthlyApiCalls: shouldUseLegacyFallback ? legacyApiCalls : explicitApiCalls,
    monthlyApiCost: shouldUseLegacyFallback ? legacyCostUsd : explicitCostUsd,
    isLegacyFallback: shouldUseLegacyFallback,
  };
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
  if (!userId) throw new Error('userId is required.');
  if (!apiCalls || apiCalls <= 0) return;

  const costUsd   = +(apiCalls * COST_PER_CALL).toFixed(4);
  const month     = currentMonth();
  const userRef   = doc(db, 'users', userId);
  const globalRef = doc(db, ...GLOBAL_DOC_PATH);
  const runtimeSettings = await getCreditRuntimeSettings();
  const monthlyCapUsd = runtimeSettings.globalCreditLimitUsd;

  await runTransaction(db, async (tx) => {
    const [userSnap, globalSnap] = await Promise.all([
      tx.get(userRef),
      tx.get(globalRef),
    ]);

    if (!userSnap.exists()) {
      throw new Error('User profile not found. Please sign in again.');
    }

    const ud = userSnap.data();
    const { isUnlimited, limitUsd } = parseUserLimit(ud.creditLimit);
    const currentUserMetrics = getEffectiveUserMonthMetrics(ud, month);
    const isNewUserMonth = ud.creditMonth !== month;
    const userCurrentMonthCost = currentUserMetrics.monthlyApiCost;
    const userCurrentMonthCalls = currentUserMetrics.monthlyApiCalls;

    if (!isUnlimited && limitUsd <= 0) {
      throw new Error('Your credit allocation is 0. Please contact admin.');
    }

    if (!isUnlimited && userCurrentMonthCost + costUsd > limitUsd) {
      const remaining = Math.max(0, limitUsd - userCurrentMonthCost);
      throw new Error(
        `Insufficient user credits. Remaining $${remaining.toFixed(2)} of $${limitUsd.toFixed(2)} monthly allocation.`
      );
    }

    const globalData    = globalSnap.exists() ? globalSnap.data() : {};
    const isNewMonth    = !globalSnap.exists() || globalData.month !== month;
    const currentCost   = isNewMonth ? 0 : (globalData.monthly_api_cost ?? 0);

    if (currentCost + costUsd > monthlyCapUsd) {
      throw new Error(
        `Platform monthly search budget reached ` +
        `($${currentCost.toFixed(2)} / $${monthlyCapUsd}). ` +
        `Resets on the 1st of next month. Cached results are still free.`
      );
    }

    const newUserMonthCost = +(userCurrentMonthCost + costUsd).toFixed(4);

    const newGlobal = {
      month,
      monthly_api_cost: isNewMonth ? costUsd : currentCost + costUsd,
      totalApiCalls:    isNewMonth ? apiCalls : (globalData.totalApiCalls ?? 0) + apiCalls,
      lastUpdated:      serverTimestamp(),
    };
    if (!globalSnap.exists() || isNewMonth) tx.set(globalRef, newGlobal);
    else                                     tx.update(globalRef, newGlobal);

    // Keep legacy counters while adding precise per-user monthly USD tracking.
    tx.update(userRef, {
      creditsUsed: (ud.creditsUsed ?? 0) + apiCalls,
      searchCount: (ud.searchCount ?? 0) + 1,
      creditMonth: month,
      userMonthlyApiCost: newUserMonthCost,
      userMonthlyApiCalls: userCurrentMonthCalls + apiCalls,
      creditRemainingUsd: isUnlimited ? null : +(Math.max(0, limitUsd - newUserMonthCost).toFixed(4)),
      lastCreditChargeAt: serverTimestamp(),
    });

    tx.set(doc(collection(db, 'users', userId, 'credit_logs')), {
      userId,
      apiCalls,
      costUsd,
      userMonthlyLimitUsd: isUnlimited ? 'unlimited' : limitUsd,
      keyword:  meta.keyword  || '',
      location: meta.location || '',
      scope:    meta.scope    || '',
      month,
      createdAt: serverTimestamp(),
    });

    console.log(
      `[credits] uid=${userId} +${apiCalls} calls ($${costUsd}) | ` +
      `user: $${userCurrentMonthCost.toFixed(2)} -> $${newUserMonthCost.toFixed(2)} | ` +
      `platform: $${currentCost.toFixed(2)} -> $${(currentCost + costUsd).toFixed(2)}/$${monthlyCapUsd}`
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

// Backward compatibility stubs.
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
