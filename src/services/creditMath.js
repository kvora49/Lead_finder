export const SKU_CREDITS = { essentials: 1, pro: 4, enterprise: 10 };
export const SKU_FREE_CAPS = { essentials: 70000, pro: 35000, enterprise: 7000 };
export const GLOBAL_CREDIT_CAP = Object.keys(SKU_CREDITS).reduce((sum, tier) => sum + SKU_CREDITS[tier] * SKU_FREE_CAPS[tier], 0);
export const STOP_FRACTION = 0.9;
export const skuStop = tier => Math.floor(SKU_FREE_CAPS[tier] * STOP_FRACTION);
export const weightedCredits = usage => Object.keys(SKU_CREDITS).reduce((sum, tier) => sum + Number(usage?.[`sku_${tier}_calls`] || 0) * SKU_CREDITS[tier], 0);
export const globalStop = () => Math.floor(GLOBAL_CREDIT_CAP * STOP_FRACTION);
export function checkBudget(usage, tier, calls) {
  if (!Object.hasOwn(SKU_CREDITS, tier)) throw new Error(`Unknown billing tier: ${tier}`);
  if (Number(usage?.[`sku_${tier}_calls`] || 0) + calls > skuStop(tier)) return 'SKU';
  if (weightedCredits(usage) + calls * SKU_CREDITS[tier] > globalStop()) return 'GLOBAL';
  return null;
}
