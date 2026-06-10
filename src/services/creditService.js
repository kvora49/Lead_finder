/**
 * Lead Finder - Credit Service (SKU-Based)
 *
 * Model:
 * - All users share a single API key.
 * - Google bills at the highest SKU tier present in FIELD_MASK (Enterprise).
 * - Enterprise free cap: 7,000 calls/month (India region).
 * - Each call costs 10 credits. All users get 2,800 credits/month.
 * - Platform hard kill at 95% of Enterprise cap (6,650 calls).
 * - Admin email alert at 80% of Enterprise cap (5,600 calls) via Cloud Function trigger.
 * - All users have the same credit allocation — no tiers, no pro/standard split.
 */

import { db } from '../firebase';
import {
  doc,
  collection,
  runTransaction,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  increment,
} from 'firebase/firestore';
import { CREDIT_CONFIG } from '../config';

const DEFAULT_USER_CREDITS = CREDIT_CONFIG.DEFAULT_USER_CREDITS; // 2800
const GLOBAL_DOC_PATH = ['system', 'global_usage'];

const currentMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

// ── User credit limit parser ──────────────────────────────────────────────────
// creditLimit field stores integer credits or 'unlimited'.
// No tiers — all users are equal. Admin can override per-user if needed.
const parseUserLimit = (creditLimitRaw) => {
  if (creditLimitRaw === 'unlimited') return { isUnlimited: true, limitCredits: Infinity };
  if (typeof creditLimitRaw === 'number') {
    return { isUnlimited: false, limitCredits: Math.max(0, Math.round(creditLimitRaw)) };
  }
  if (typeof creditLimitRaw === 'string' && creditLimitRaw.trim() !== '') {
    const n = Number.parseFloat(creditLimitRaw);
    if (Number.isFinite(n)) return { isUnlimited: false, limitCredits: Math.max(0, Math.round(n)) };
  }
  return { isUnlimited: false, limitCredits: DEFAULT_USER_CREDITS };
};

// ── Runtime settings (reads systemConfig/globalSettings for overrides) ────────
export const getCreditRuntimeSettings = async () => {
  try {
    const snap = await getDoc(doc(db, 'systemConfig', 'globalSettings'));
    if (!snap.exists()) {
      return { globalCreditLimit: CREDIT_CONFIG.PLATFORM_CREDITS_POOL };
    }
    const data = snap.data() || {};
    const configured = Number.parseInt(data.globalCreditLimit, 10);
    const effective = Number.isFinite(configured) && configured > 0
      ? Math.min(configured, CREDIT_CONFIG.PLATFORM_CREDITS_POOL)
      : CREDIT_CONFIG.PLATFORM_CREDITS_POOL;
    return { globalCreditLimit: effective };
  } catch {
    return { globalCreditLimit: CREDIT_CONFIG.PLATFORM_CREDITS_POOL };
  }
};

// ── Effective user metrics for current month ──────────────────────────────────
export const getEffectiveUserMonthMetrics = (userData = {}, month = currentMonth()) => {
  const hasCurrentMonth = userData.creditMonth === month;
  const monthlyCreditsUsed = hasCurrentMonth
    ? Number(userData.userMonthlyCreditsUsed ?? 0)
    : 0;
  const monthlyApiCalls = hasCurrentMonth
    ? Number(userData.userMonthlyApiCalls ?? 0)
    : 0;

  return {
    month,
    monthlyCreditsUsed,
    monthlyApiCalls,
    // Legacy field kept at 0 — no longer USD
    monthlyApiCost: 0,
  };
};

/**
 * Deduct credits for an API search.
 *
 * Flow:
 *   1. Pre-check: read global_usage to enforce platform kill switch (95%).
 *   2. Transaction on user doc: check user credit limit, write user counters.
 *   3. increment() on global doc: contention-free counter update.
 *   4. Write credit_log entry inside user transaction.
 *
 * @param {string} userId
 * @param {number} apiCalls   Actual Places API calls consumed (0 = cache hit)
 * @param {string} tier       'enterprise' | 'pro' | 'essentials' (default enterprise)
 * @param {object} meta       { keyword, location, scope }
 */
export const deductCredits = async (userId, apiCalls, tier = 'enterprise', meta = {}) => {
  if (!userId) throw new Error('userId is required.');
  if (!apiCalls || apiCalls <= 0) return;

  const creditsPerCall  = CREDIT_CONFIG.CREDITS_PER_TIER[tier] ?? CREDIT_CONFIG.CREDITS_PER_TIER.enterprise;
  const creditsToDeduct = apiCalls * creditsPerCall;
  const month           = currentMonth();
  const userRef         = doc(db, 'users', userId);
  const globalRef       = doc(db, ...GLOBAL_DOC_PATH);

  // ── Step 1: Platform kill switch pre-check (read-only, fast) ────────────────
  const globalSnap = await getDoc(globalRef);
  if (globalSnap.exists() && globalSnap.data().month === month) {
    const currentSkuCalls = globalSnap.data()[`sku_${tier}_calls`] ?? 0;
    if (currentSkuCalls + apiCalls > CREDIT_CONFIG.SKU_KILL_SWITCH[tier]) {
      throw new Error(
        `Platform monthly search limit reached (95% of free tier). ` +
        `Resets on the 1st of next month. Cached results are still free.`
      );
    }
  }

  // ── Step 2: User transaction (read → check → write) ─────────────────────────
  await runTransaction(db, async (tx) => {
    const userSnap = await tx.get(userRef);
    if (!userSnap.exists()) throw new Error('User profile not found. Please sign in again.');

    const ud = userSnap.data();
    const { isUnlimited, limitCredits } = parseUserLimit(ud.creditLimit);

    if (!isUnlimited && limitCredits <= 0) {
      throw new Error('Your account has been suspended. Please contact admin.');
    }

    const isNewUserMonth       = ud.creditMonth !== month;
    const creditsUsedThisMonth = isNewUserMonth ? 0 : (ud.userMonthlyCreditsUsed ?? 0);

    if (!isUnlimited && creditsUsedThisMonth + creditsToDeduct > limitCredits) {
      const remaining = Math.max(0, limitCredits - creditsUsedThisMonth);
      throw new Error(
        `Insufficient credits. You have ${remaining} credits remaining of your ` +
        `${limitCredits} monthly allocation.`
      );
    }

    const newCreditsUsed       = creditsUsedThisMonth + creditsToDeduct;
    const creditRemainingInt   = isUnlimited ? null : Math.max(0, limitCredits - newCreditsUsed);

    tx.update(userRef, {
      // SKU credit fields
      userMonthlyCreditsUsed:  newCreditsUsed,
      creditRemainingCredits:  creditRemainingInt,
      creditMonth:             month,
      // Legacy API call counters (kept for search history / analytics)
      creditsUsed:             (ud.creditsUsed ?? 0) + apiCalls,
      userMonthlyApiCalls:     (ud.userMonthlyApiCalls ?? 0) + apiCalls,
      searchCount:             (ud.searchCount ?? 0) + 1,
      lastCreditChargeAt:      serverTimestamp(),
      // Legacy USD fields frozen at null/0 — no longer used
      userMonthlyApiCost:      0,
      creditRemainingUsd:      null,
    });

    // Credit log
    tx.set(doc(collection(db, 'users', userId, 'credit_logs')), {
      userId,
      apiCalls,
      tier,
      creditsDeducted:   creditsToDeduct,
      creditsPerCall,
      userCreditLimit:   isUnlimited ? 'unlimited' : limitCredits,
      // Legacy fields frozen at 0/null
      costUsd:           0,
      userMonthlyLimitUsd: null,
      keyword:           meta.keyword  || '',
      location:          meta.location || '',
      scope:             meta.scope    || '',
      month,
      createdAt:         serverTimestamp(),
    });
  });

  // ── Step 3: Global counters — increment() (contention-free) ─────────────────
  const isNewMonth = !globalSnap.exists() || globalSnap.data().month !== month;

  if (isNewMonth) {
    await setDoc(globalRef, {
      month,
      [`sku_${tier}_calls`]: apiCalls,
      totalApiCalls:         apiCalls,
      totalCreditsUsed:      creditsToDeduct,
      monthly_api_cost:      0,   // legacy field frozen at 0
      lastUpdated:           serverTimestamp(),
    });
  } else {
    await updateDoc(globalRef, {
      [`sku_${tier}_calls`]: increment(apiCalls),
      totalApiCalls:         increment(apiCalls),
      totalCreditsUsed:      increment(creditsToDeduct),
      lastUpdated:           serverTimestamp(),
    });
  }

  console.log(
    `[credits] uid=${userId} +${apiCalls} ${tier} calls (-${creditsToDeduct} credits) | ` +
    `kill switch at ${CREDIT_CONFIG.SKU_KILL_SWITCH[tier]} ${tier} calls`
  );
};

// ── Global usage reader ───────────────────────────────────────────────────────
export const getGlobalUsage = async () => {
  const snap = await getDoc(doc(db, ...GLOBAL_DOC_PATH));
  if (!snap.exists()) {
    return {
      sku_enterprise_calls: 0,
      sku_pro_calls:        0,
      sku_essentials_calls: 0,
      totalApiCalls:        0,
      totalCreditsUsed:     0,
      monthly_api_cost:     0,
      month:                currentMonth(),
    };
  }
  const d = snap.data();
  if (d.month !== currentMonth()) {
    return {
      sku_enterprise_calls: 0,
      sku_pro_calls:        0,
      sku_essentials_calls: 0,
      totalApiCalls:        0,
      totalCreditsUsed:     0,
      monthly_api_cost:     0,
      month:                currentMonth(),
    };
  }
  return d;
};

export const ensureGlobalUsageDoc = async () => {
  const ref   = doc(db, ...GLOBAL_DOC_PATH);
  const snap  = await getDoc(ref);
  const month = currentMonth();
  if (!snap.exists() || snap.data().month !== month) {
    await setDoc(ref, {
      month,
      sku_enterprise_calls: 0,
      sku_pro_calls:        0,
      sku_essentials_calls: 0,
      totalApiCalls:        0,
      totalCreditsUsed:     0,
      monthly_api_cost:     0,
      lastUpdated:          serverTimestamp(),
    });
  }
};

// ── Platform credit % used (based on Enterprise — the real bottleneck) ────────
export const getPlatformCreditPct = (globalData = {}) => {
  const enterpriseCalls = globalData.sku_enterprise_calls ?? 0;
  return Math.min(
    +((enterpriseCalls / CREDIT_CONFIG.SKU_FREE_CAPS.enterprise) * 100).toFixed(1),
    100
  );
};

// Deprecated stubs — kept so nothing breaks during migration
export const MONTHLY_FREE_CALLS = CREDIT_CONFIG.PLATFORM_CREDITS_POOL;
export const initializeGlobalCredits  = ()       => ensureGlobalUsageDoc();
export const getGlobalCredits         = ()       => getGlobalUsage().then(d => d.totalApiCalls ?? 0);
export const addGlobalCredits         = ()       => Promise.resolve();
export const subscribeToGlobalCredits = ()       => () => {};
export const resetGlobalCredits       = ()       => Promise.resolve();
export const getCreditStats           = (calls)  => ({
  totalCalls:     calls,
  totalCost:      0,
  remainingCalls: Math.max(0, CREDIT_CONFIG.SKU_FREE_CAPS.enterprise - calls),
  percentageUsed: Math.min((calls / CREDIT_CONFIG.SKU_FREE_CAPS.enterprise) * 100, 100).toFixed(1),
});
export const initializeUserCredits = () => ensureGlobalUsageDoc();
export const getUserCredits        = () => Promise.resolve(0);
export const addCredits            = () => Promise.resolve();
export const subscribeToCredits    = (_uid, cb) => { cb(0); return () => {}; };
export const resetUserCredits      = () => Promise.resolve();
