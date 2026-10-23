import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyLead, buildProductQueries, mergeMatches, maxSearchCalls, SEARCH_PLAN } from '../src/services/searchMatching.js';
const lead = (name, types = [], id = name) => ({ id, displayName: { text: name }, types });
test('kurti searches retain relevant clothing shops without product in their name', () => {
  assert.equal(classifyLead(lead('Patel Fashion', ['clothing_store']), 'kurti', 'store').matchStatus, 'strong');
});
test('bat searches include sports shops and label stationery/gift shops as possible', () => {
  assert.equal(classifyLead(lead('ABC', ['sporting_goods_store']), 'bat', 'store').matchStatus, 'strong');
  for (const type of ['stationery_store', 'gift_shop', 'toy_store']) assert.equal(classifyLead(lead('ABC', [type]), 'bat', 'store').matchStatus, 'possible');
  assert.equal(classifyLead(lead('Patel Hardware', ['hardware_store']), 'bat', 'store'), null);
  assert.equal(classifyLead(lead('Cricket Academy', ['school']), 'bat', ''), null);
});
test('manufacturer searches exclude evidenced retailers but preserve unknown roles', () => {
  assert.equal(classifyLead(lead('Kurti Boutique', ['clothing_store']), 'kurti', 'manufacturer'), null);
  assert.equal(classifyLead(lead('Kurti Factory', ['store']), 'kurti', 'manufacturer').roleUnverified, false);
  assert.equal(classifyLead(lead('Kurti Enterprises', ['store']), 'kurti', 'manufacturer').roleUnverified, true);
});
test('wholesaler and distributor are distinct and explicit multiple roles are supported', () => {
  assert.equal(classifyLead(lead('Kurti Wholesale'), 'kurti', 'distributor'), null);
  assert.equal(classifyLead(lead('Kurti Wholesale Distributor'), 'kurti', 'distributor').roleUnverified, false);
});
test('word boundaries prevent bat matching unrelated substrings', () => {
  assert.equal(classifyLead(lead('Batra Enterprises', ['store']), 'bat', '').matchStatus, 'possible');
});
test('generic product sellers remain possible and query-independent role uncertainty is explicit', () => {
  const result = classifyLead(lead('Patel Enterprises', ['store']), 'custom widget', 'manufacturer');
  assert.equal(result.matchStatus, 'possible');
  assert.equal(result.roleUnverified, true);
});
test('any-type queries include every role, even with long AI retailer query lists', () => {
  const queries = buildProductQueries('kurti', 'Surat', '', 'city', { type_queries: { retailer: Array(8).fill('kurti store') } });
  for (const role of ['shop', 'manufacturer', 'wholesale', 'distributor']) assert.ok(queries.some(q => q.includes(role)));
  assert.ok(queries.every(q => q.endsWith('in Surat')));
});
test('neighbourhood cells vary jeans wording without adding query slots or dropping roles', () => {
  const first = buildProductQueries('jeans', 'Gheekanta, Ahmedabad', '', 'neighbourhood', {}, 0);
  const second = buildProductQueries('jeans', 'Gheekanta, Ahmedabad', '', 'neighbourhood', {}, 1);
  const third = buildProductQueries('jeans', 'Gheekanta, Ahmedabad', '', 'neighbourhood', {}, 2);
  for (const queries of [first, second, third]) {
    assert.equal(queries.length, SEARCH_PLAN.neighbourhood.queryLimit);
    for (const role of ['shop', 'manufacturer', 'wholesale', 'distributor']) {
      assert.ok(queries.some(q => q.includes(role)));
    }
  }
  assert.notDeepEqual(first, second);
  assert.notDeepEqual(second, third);
  assert.ok(Array.from({ length: 9 }, (_, i) => buildProductQueries('jeans', 'Gheekanta, Ahmedabad', '', 'neighbourhood', {}, i))
    .some(queries => queries.some(q => q.startsWith('denim '))));
});
test('retail query expansion covers sports and secondary sellers without AI', () => {
  const queries = buildProductQueries('bat', 'Ahmedabad', 'store', 'city');
  assert.ok(queries.some(q => q.includes('sports goods')));
  assert.ok(queries.some(q => q.includes('stationery')));
  assert.ok(queries.some(q => q.includes('gift')));
});
test('multi-keyword merging keeps the strongest evidence, deduplicates and ranks possible last', () => {
  const possible = classifyLead(lead('ABC', ['store'], 'shared'), 'bat', '');
  const strong = classifyLead(lead('Kurti Store', ['clothing_store'], 'shared'), 'kurti', '');
  const other = classifyLead(lead('XYZ', ['stationery_store']), 'bat', '');
  const out = mergeMatches([other, possible, strong]);
  assert.equal(out.length, 2);
  assert.equal(out[0].id, 'shared');
  assert.deepEqual(out[0].matchedKeywords, ['bat', 'kurti']);
  assert.equal(out[1].matchStatus, 'possible');
});
test('scope geometry retained and request bounds cover every query and page', () => {
  for (const [scope, cols, rows] of [['city',4,4], ['neighbourhood',3,3], ['specific',2,2]]) {
    assert.equal(SEARCH_PLAN[scope].cols, cols);
    assert.equal(SEARCH_PLAN[scope].rows, rows);
    assert.equal(maxSearchCalls(scope), cols * rows * 8);
  }
});
