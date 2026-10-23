import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as matching from '../src/services/searchMatching.js';
import { checkBudget } from '../src/services/creditMath.js';

// Run the real service with fake network/Firestore dependencies. No API keys or calls.
const source = readFileSync(new URL('../src/services/placesApi.js', import.meta.url), 'utf8')
  .replace(/^import[\s\S]*?from ['"][^'"]+['"];\s*/gm, '')
  .replaceAll('import.meta.env.DEV', 'false')
  .replace(/^export default .*;$/gm, '')
  .replace(/^export /gm, '');
function harness() {
  const cache = new Map(), calls = [], geocodes = [];
  const doc = (_db, collection, id) => collection + '/' + id;
  const point = (id, city, lat = 5) => ({ id, displayName: { text: 'Kurti Store' }, types: ['clothing_store'], formattedAddress: city, location: { latitude: lat, longitude: 5 } });
  const deps = {
    ...matching, checkBudget, getGlobalUsage: async () => ({}), db: {}, doc, GOOGLE_API_KEY: 'fake', GEMINI_API_KEY: '',
    GEMINI_CONFIG: { INTENT_CACHE_COLLECTION: 'intent' }, CACHE_CONFIG: { COLLECTION: 'cache', TTL_HOURS: 24 },
    getDoc: async ref => ({ exists: () => cache.has(ref), data: () => cache.get(ref) }),
    setDoc: async (ref, data, options) => cache.set(ref, options?.merge ? { ...cache.get(ref), ...data } : data), serverTimestamp: () => Date.now(), increment: n => n,
    setTimeout: fn => setTimeout(fn, 0), clearTimeout,
    fetch: async (url, init) => {
      if (url.includes('geocode')) {
        const city = new URL(url).searchParams.get('address').split(', ').at(-1);
        geocodes.push(city);
        return { json: async () => ({ status: 'OK', results: [{ geometry: { location: { lat: 5, lng: 5 }, viewport: { northeast: { lat: 10, lng: 10 }, southwest: { lat: 0, lng: 0 } }, bounds: { northeast: { lat: 9, lng: 9 }, southwest: { lat: 1, lng: 1 } } } }] }) };
      }
      const body = JSON.parse(init.body); calls.push({ body, headers: init.headers });
      const city = body.textQuery.split(' in ').at(-1).split(', ').at(-1);
      const payload = body.pageToken ? { places: [point(city + '-second', city)] } : {
        places: [point(city + '-first', city), point(city + '-outside', city, 11)],
        nextPageToken: 'page-two',
      };
      return { ok: true, text: async () => JSON.stringify(payload) };
    },
  };
  const search = new Function(...Object.keys(deps), source + '\nreturn searchBusinesses;')(...Object.values(deps));
  return { search, calls, geocodes };
}
test('real pipeline follows sparse pages, enforces geographic fence and reuses cache', async () => {
  const { search, calls } = harness();
  const result = await search('kurti', 'Surat', { type: 'store', searchScope: 'specific' });
  assert.equal(result.results.length, 2);
  assert.ok(result.results.every(l => !l.id.includes('outside')));
  assert.equal(result.diagnostics.collected, 3);
  assert.equal(result.diagnostics.afterGeography, 2);
  assert.ok(calls.some(c => c.body.pageToken === 'page-two'));
  assert.ok(calls.every(c => c.headers['X-Goog-FieldMask'].includes('nextPageToken')));
  assert.ok(calls.every(c => c.body.locationRestriction.rectangle && c.body.pageSize === 20));
  const before = calls.length;
  const cached = await search('kurti', 'Surat', { type: 'store', searchScope: 'specific' });
  assert.equal(cached.cached, true);
  assert.equal(cached.apiCalls, 0);
  assert.equal(calls.length, before);
});
test('multiple keywords and locations preserve all pairs and merge strongest matches', async () => {
  const { search, geocodes } = harness();
  const result = await search('kurti, kurta', 'Surat, Ahmedabad', { searchScope: 'specific' });
  assert.equal(geocodes.length, 4);
  assert.equal(result.results.length, 4);
  assert.ok(result.results.every(l => l.matchedKeywords.length === 2));
  const cached = await search('kurti, kurta', 'Surat, Ahmedabad', { searchScope: 'specific' });
  assert.equal(cached.cached, true);
  assert.equal(cached.apiCalls, 0);
});
test('cancelled search never makes an API call', async () => {
  const { search, calls } = harness();
  const controller = new AbortController(); controller.abort();
  await assert.rejects(search('kurti', 'Surat', { signal: controller.signal }), { name: 'AbortError' });
  assert.equal(calls.length, 0);
});
