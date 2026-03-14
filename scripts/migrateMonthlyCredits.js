import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import admin from 'firebase-admin';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const COST_PER_CALL = 0.032;
const DEFAULT_USER_BUDGET_USD = 50;

const currentMonthStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const resolveServiceAccountPath = () => {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return path.resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS);
  }
  return path.resolve(
    __dirname,
    '..',
    'lead-finder-6b009-firebase-adminsdk-fbsvc-e44143234f.json'
  );
};

const parseLimit = (raw) => {
  if (raw === 'unlimited') return { limitUsd: Infinity, normalizedLimit: 'unlimited' };
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const value = Math.max(0, raw);
    return { limitUsd: value, normalizedLimit: value };
  }
  if (typeof raw === 'string' && raw.trim() !== '') {
    const parsed = Number.parseFloat(raw);
    if (Number.isFinite(parsed)) {
      const value = Math.max(0, parsed);
      return { limitUsd: value, normalizedLimit: value };
    }
  }
  return { limitUsd: DEFAULT_USER_BUDGET_USD, normalizedLimit: DEFAULT_USER_BUDGET_USD };
};

const getEffectiveMetrics = (userData, month) => {
  const legacyApiCalls = Number(userData.creditsUsed ?? 0);
  const legacyCostUsd = +(legacyApiCalls * COST_PER_CALL).toFixed(4);

  const hasCurrentMonthRecord = userData.creditMonth === month;
  const explicitApiCalls = hasCurrentMonthRecord ? Number(userData.userMonthlyApiCalls ?? 0) : 0;
  const explicitCostUsd = hasCurrentMonthRecord ? +(Number(userData.userMonthlyApiCost ?? 0)).toFixed(4) : 0;

  const useLegacyFallback = !hasCurrentMonthRecord || (
    explicitApiCalls === 0 && explicitCostUsd === 0 && legacyApiCalls > 0
  );

  return {
    monthlyApiCalls: useLegacyFallback ? legacyApiCalls : explicitApiCalls,
    monthlyApiCost: useLegacyFallback ? legacyCostUsd : explicitCostUsd,
    usedLegacyFallback: useLegacyFallback,
  };
};

const allocateProportionalCalls = (entries, targetTotalCalls) => {
  if (!entries.length || targetTotalCalls <= 0) return new Map();

  const totalLegacyCalls = entries.reduce((sum, entry) => sum + entry.legacyCalls, 0);
  if (totalLegacyCalls <= 0) return new Map();

  const preliminary = entries.map((entry) => {
    const exact = (entry.legacyCalls / totalLegacyCalls) * targetTotalCalls;
    const baseCalls = Math.floor(exact);
    return {
      id: entry.id,
      baseCalls,
      remainder: exact - baseCalls,
    };
  });

  let assigned = preliminary.reduce((sum, entry) => sum + entry.baseCalls, 0);
  const remaining = targetTotalCalls - assigned;

  preliminary
    .sort((a, b) => b.remainder - a.remainder)
    .slice(0, Math.max(0, remaining))
    .forEach((entry) => {
      entry.baseCalls += 1;
      assigned += 1;
    });

  return new Map(preliminary.map((entry) => [entry.id, entry.baseCalls]));
};

const serviceAccountPath = resolveServiceAccountPath();
if (!fs.existsSync(serviceAccountPath)) {
  console.error(`[migrateMonthlyCredits] Service account JSON not found at: ${serviceAccountPath}`);
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

async function migrateMonthlyCredits() {
  const month = currentMonthStr();
  console.log(`[migrateMonthlyCredits] Starting migration for ${month}`);

  const globalSnap = await db.collection('system').doc('global_usage').get();
  const globalData = globalSnap.exists ? globalSnap.data() : null;
  const hasCurrentGlobalUsage = globalData?.month === month;
  const globalMonthlyCalls = hasCurrentGlobalUsage ? Number(globalData.totalApiCalls ?? 0) : 0;
  const globalMonthlyCost = hasCurrentGlobalUsage ? Number(globalData.monthly_api_cost ?? 0) : 0;

  const usersSnapshot = await db.collection('users').get();
  console.log(`[migrateMonthlyCredits] Found ${usersSnapshot.size} user documents`);

  const rawEntries = usersSnapshot.docs.map((userDoc) => {
    const userData = userDoc.data();
    return {
      id: userDoc.id,
      userDoc,
      userData,
      effectiveMetrics: getEffectiveMetrics(userData, month),
      legacyCalls: Number(userData.creditsUsed ?? 0),
    };
  });

  const legacyPositiveEntries = rawEntries.filter((entry) => entry.legacyCalls > 0);
  const scaledCallMap = hasCurrentGlobalUsage
    ? allocateProportionalCalls(legacyPositiveEntries, globalMonthlyCalls)
    : new Map();

  let updatedUsers = 0;
  let createdLogs = 0;
  let defaultLimitsApplied = 0;

  for (const entry of rawEntries) {
    const { userDoc, userData, effectiveMetrics, legacyCalls } = entry;
    const metrics = { ...effectiveMetrics };

    if (hasCurrentGlobalUsage && legacyCalls > 0) {
      const scaledCalls = scaledCallMap.get(userDoc.id) ?? 0;
      metrics.monthlyApiCalls = scaledCalls;
      metrics.monthlyApiCost = +(scaledCalls * COST_PER_CALL).toFixed(4);
      metrics.usedLegacyFallback = true;
    }

    const { limitUsd, normalizedLimit } = parseLimit(userData.creditLimit);
    const remainingUsd = limitUsd === Infinity
      ? null
      : +(Math.max(0, limitUsd - metrics.monthlyApiCost).toFixed(4));

    const updatePayload = {
      creditMonth: month,
      userMonthlyApiCalls: metrics.monthlyApiCalls,
      userMonthlyApiCost: metrics.monthlyApiCost,
      creditRemainingUsd: remainingUsd,
      lastCreditMigrationAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (userData.creditLimit === undefined || userData.creditLimit === null || userData.creditLimit === '') {
      updatePayload.creditLimit = normalizedLimit;
      defaultLimitsApplied += 1;
    }

    await userDoc.ref.set(updatePayload, { merge: true });
    updatedUsers += 1;

    if (metrics.monthlyApiCalls > 0) {
      const syntheticLogRef = userDoc.ref.collection('credit_logs').doc(`legacy-backfill-${month}`);
      await syntheticLogRef.set({
        userId: userDoc.id,
        apiCalls: metrics.monthlyApiCalls,
        costUsd: metrics.monthlyApiCost,
        userMonthlyLimitUsd: normalizedLimit,
        keyword: 'legacy-backfill',
        location: 'legacy migration',
        scope: 'migration',
        month,
        source: 'legacy-normalization',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      createdLogs += 1;
    }

    console.log(
      `[migrateMonthlyCredits] ${userData.email || userDoc.id}: ` +
      `${metrics.monthlyApiCalls} calls, $${metrics.monthlyApiCost.toFixed(2)}, ` +
      `${metrics.usedLegacyFallback ? 'legacy' : 'existing'} data`
    );
  }

  console.log('[migrateMonthlyCredits] Completed successfully');
  if (hasCurrentGlobalUsage) {
    console.log(`[migrateMonthlyCredits] Reconciled to global monthly usage: ${globalMonthlyCalls} calls / $${globalMonthlyCost.toFixed(2)}`);
  }
  console.log(`[migrateMonthlyCredits] Users updated: ${updatedUsers}`);
  console.log(`[migrateMonthlyCredits] Synthetic logs written: ${createdLogs}`);
  console.log(`[migrateMonthlyCredits] Default limits applied: ${defaultLimitsApplied}`);
}

migrateMonthlyCredits().catch((error) => {
  console.error('[migrateMonthlyCredits] Failed:', error);
  process.exit(1);
});