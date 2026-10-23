import test from 'node:test';
import assert from 'node:assert/strict';
import { SKU_CREDITS, skuStop, weightedCredits, globalStop, checkBudget, remainingSharedSearchCalls, remainingSearchesByScope } from '../src/services/creditMath.js';
test('SKU weighting and 90 percent stops are distinct', () => {
  assert.equal(weightedCredits({ sku_essentials_calls: 2, sku_pro_calls: 2, sku_enterprise_calls: 2 }), 30);
  assert.deepEqual([skuStop('essentials'), skuStop('pro'), skuStop('enterprise')], [63000, 31500, 6300]);
  assert.equal(globalStop(), 252000);
  assert.equal(checkBudget({ sku_enterprise_calls: 6299 }, 'enterprise', 1), null);
  assert.equal(checkBudget({ sku_enterprise_calls: 6299 }, 'enterprise', 2), 'SKU');
  assert.equal(checkBudget({ sku_essentials_calls: 63000 }, 'essentials', 1), 'SKU');
});
test('all scope estimates share the Enterprise request budget', () => {
  const usage = { sku_enterprise_calls: 6172 };
  assert.equal(remainingSharedSearchCalls(usage), 128);
  assert.deepEqual(remainingSearchesByScope(usage), {
    city: 1,
    neighbourhood: 1,
    specific: 4,
  });
});
