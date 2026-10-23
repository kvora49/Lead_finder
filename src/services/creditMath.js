export const SKU_CREDITS = { essentials: 1, pro: 4, enterprise: 10 };
export const SKU_FREE_CAPS = { essentials: 70000, pro: 35000, enterprise: 7000 };
export const GLOBAL_CREDIT_CAP = Object.keys(SKU_CREDITS).reduce((sum, tier) => sum + SKU_CREDITS[tier] * SKU_FREE_CAPS[tier], 0);
export const STOP_FRACTION = 0.9;
// Maximum Text Search calls for one live search. These match the grid plan:
// cells × query variants × pages. Actual searches can use fewer calls when
// Google has no next page, so the remaining-search figures are conservative.
export const SEARCH_SCOPE_CALL_BUDGETS = {
  city: 128,
  neighbourhood: 72,
  specific: 32,
};
export const skuStop = tier => Math.floor(SKU_FREE_CAPS[tier] * STOP_FRACTION);
export const weightedCredits = usage => Object.keys(SKU_CREDITS).reduce((sum, tier) => sum + Number(usage?.[`sku_${tier}_calls`] || 0) * SKU_CREDITS[tier], 0);
export const globalStop = () => Math.floor(GLOBAL_CREDIT_CAP * STOP_FRACTION);
// Text Search currently uses the Enterprise SKU. Both the Enterprise free-tier
// stop and the shared weighted-credit stop protect the same platform pool.
export const remainingSharedSearchCalls = (usage = {}) => Math.max(0, Math.min(
  skuStop('enterprise') - Number(usage.sku_enterprise_calls || 0),
  Math.floor((globalStop() - weightedCredits(usage)) / SKU_CREDITS.enterprise),
));
export const remainingSearchesByScope = (usage = {}) => {
  const callsLeft = remainingSharedSearchCalls(usage);
  return Object.fromEntries(Object.entries(SEARCH_SCOPE_CALL_BUDGETS)
    .map(([scope, callsPerSearch]) => [scope, Math.floor(callsLeft / callsPerSearch)]));
};
export function checkBudget(usage, tier, calls) {
  if (!Object.hasOwn(SKU_CREDITS, tier)) throw new Error(`Unknown billing tier: ${tier}`);
  if (Number(usage?.[`sku_${tier}_calls`] || 0) + calls > skuStop(tier)) return 'SKU';
  if (weightedCredits(usage) + calls * SKU_CREDITS[tier] > globalStop()) return 'GLOBAL';
  return null;
}
