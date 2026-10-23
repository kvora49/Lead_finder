// Search planning and evidence-based ranking, independent of geography.
export const SEARCH_PLAN = {
  city: { cols: 4, rows: 4, pagesPerCell: 2, queryLimit: 4 },
  neighbourhood: { cols: 3, rows: 3, pagesPerCell: 2, queryLimit: 4 },
  specific: { cols: 2, rows: 2, pagesPerCell: 2, queryLimit: 4 },
};
export const maxSearchCalls = scope => {
  const p = SEARCH_PLAN[scope] || SEARCH_PLAN.city;
  return p.cols * p.rows * p.pagesPerCell * p.queryLimit;
};
const norm = s => String(s || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const strings = xs => Array.isArray(xs) ? xs.filter(x => typeof x === 'string' && norm(x)) : [];
const unique = xs => [...new Set(strings(xs).map(norm))];
const matches = (text, terms) => terms.some(t => (` ${norm(text)} `).includes(` ${norm(t)} `));
const PROFILES = [
  { terms: ['bat', 'bats', 'cricket bat', 'cricket bats'], categories: ['sports goods', 'sports equipment', 'sporting goods', 'cricket equipment', 'sports store'], types: ['sporting_goods_store'], possible: ['stationery', 'gift articles', 'gift', 'toys'], possibleTypes: ['stationery_store', 'gift_shop', 'toy_store'] },
  { terms: ['kurti', 'kurtis', 'kurta', 'kurtas'], categories: ['clothing', 'boutique', 'ethnic wear', 'ladies wear', 'garments', 'garment', 'apparel'], types: ['clothing_store'], possible: ['department store', 'textiles'], possibleTypes: ['department_store'] },
  { terms: ['jeans', 'denim'], categories: ['clothing', 'garments', 'apparel', 'denim wear'], types: ['clothing_store'], possible: ['department store', 'fashion'], possibleTypes: ['department_store'] },
];
export function productProfile(keyword, intent = {}) {
  const local = PROFILES.find(p => p.terms.includes(norm(keyword)));
  return {
    terms: unique([keyword, ...(local?.terms || []), ...strings(intent.synonyms), ...strings(intent.indian_synonyms)]),
    categories: unique([...(local?.categories || []), ...strings(intent.category_keywords), ...strings(intent.store_name_keywords)]),
    types: [...(local?.types || []), ...strings(intent.seller_types)],
    possible: unique([...(local?.possible || []), ...strings(intent.possible_seller_categories)]),
    possibleTypes: local?.possibleTypes || [],
  };
}
const ROLES = {
  retailer: /\b(retail(?:er)?|shop|store|showroom|boutique|outlet)\b/i,
  manufacturer: /\b(manufactur(?:er|ers|ing|e)|factory|factories|production|udyog|mfg)\b/i,
  wholesaler: /\b(wholesale|wholesaler|wholesalers|thok|bulk)\b/i,
  distributor: /\b(distributor|distributors|distribution|stockist|stockists|c\s*&\s*f)\b/i,
};
export function businessRoles(lead) {
  const roles = Object.keys(ROLES).filter(r => ROLES[r].test(lead.displayName?.text || ''));
  const types = lead.types || [];
  roles.push(...types.filter(t => ['manufacturer', 'wholesaler', 'distributor'].includes(t)));
  if (!roles.length && types.some(t => t.endsWith('_store') || t === 'gift_shop')) roles.push('retailer');
  return [...new Set(roles)];
}
export function buildProductQueries(keyword, location, type, scope, intent = {}, cellIndex = 0) {
  const p = productProfile(keyword, intent);
  const role = type === 'store' ? 'retailer' : type;
  const suffix = { retailer: 'shop', manufacturer: 'manufacturer', wholesaler: 'wholesale', distributor: 'distributor' };
  const roles = role ? [role] : Object.keys(suffix);
  const groups = roles.map(r => unique([
    `${keyword} ${suffix[r] || r}`,
    ...(p.categories.length ? [`${p.categories[0]} ${suffix[r] || r}`] : []),
    ...(r === 'retailer' ? p.possible.map(c => `${c} shop ${keyword}`) : []),
    ...(p.terms.length > 1 ? [`${p.terms[1]} ${suffix[r] || r}`] : []),
    ...strings(intent.type_queries?.[r]),
  ]));
  // Rotate query wording across restricted cells without adding a grid cell,
  // page, or query slot. All-category searches still cover every role per cell.
  const rotated = groups.map(group => group.length
    ? [...group.slice(cellIndex % group.length), ...group.slice(0, cellIndex % group.length)]
    : group);
  const queries = [];
  for (let i = 0; i < Math.max(...rotated.map(g => g.length)); i++) {
    for (const group of rotated) if (group[i] && !queries.includes(group[i])) queries.push(group[i]);
  }
  return queries.slice(0, (SEARCH_PLAN[scope] || SEARCH_PLAN.city).queryLimit).map(q => `${q} in ${location}`);
}
const NON_SELLERS = new Set(['restaurant', 'cafe', 'bank', 'atm', 'school', 'university', 'gym', 'sports_club', 'stadium', 'hospital', 'doctor', 'lodging', 'hotel', 'hindu_temple', 'church', 'mosque']);
export function classifyLead(lead, keyword, type, intent = {}, productSearch = true) {
  const name = lead.displayName?.text || '';
  const types = lead.types || [];
  const p = productProfile(keyword, intent);
  const roles = businessRoles(lead);
  const requestedRole = type === 'store' ? 'retailer' : type;
  const roleRequired = Object.hasOwn(ROLES, requestedRole);
  if (roleRequired && roles.length && !roles.includes(requestedRole)) return null;
  const nameMatch = matches(name, p.terms);
  const reviewMatch = matches(lead._reviewText || '', p.terms);
  const categoryMatch = matches(name, p.categories) || types.some(t => p.types.includes(t));
  const possibleCategory = matches(name, p.possible) || types.some(t => p.possibleTypes.includes(t));
  // A specific unrelated shop category is evidence against a product match.
  if (productSearch && p.types.length && !nameMatch && !reviewMatch && !categoryMatch && !possibleCategory && types.some(t => t.endsWith('_store') || t === 'gift_shop')) return null;
  const commercial = roles.length > 0 || types.some(t => t === 'store' || t.endsWith('_store') || t === 'gift_shop');
  if (productSearch && types.some(t => NON_SELLERS.has(t)) && !commercial) return null;
  const strong = !productSearch || nameMatch || reviewMatch || categoryMatch;
  if (productSearch && !strong && !possibleCategory && !commercial) {
    if (types.some(t => !['point_of_interest', 'establishment'].includes(t))) return null;
  }
  const roleUnverified = roleRequired ? !roles.includes(requestedRole) : !type && roles.length === 0;
  return {
    ...lead, matchStatus: strong ? 'strong' : 'possible', roleUnverified,
    businessRoles: roles, matchedKeywords: [keyword],
    matchReason: nameMatch ? 'Product mentioned in business name' : reviewMatch ? 'Product mentioned in available reviews' : categoryMatch ? 'Relevant product or store category' : !productSearch ? 'Matches the service search' : possibleCategory ? 'Related store category; availability unverified' : 'Returned for this product; availability unverified',
    confidenceScore: (nameMatch ? 100 : reviewMatch ? 90 : categoryMatch ? 70 : 20) + (roleUnverified ? 0 : 5),
  };
}
export const compareMatches = (a, b) => Number(a.matchStatus === 'possible') - Number(b.matchStatus === 'possible') || Number(!!a.roleUnverified) - Number(!!b.roleUnverified) || (b.confidenceScore || 0) - (a.confidenceScore || 0);
export function mergeMatches(leads) {
  const byId = new Map();
  for (const lead of leads) {
    const id = lead.id || lead.placeId;
    if (!id) continue;
    const prior = byId.get(id);
    if (!prior) { byId.set(id, lead); continue; }
    const best = compareMatches(lead, prior) < 0 ? lead : prior;
    byId.set(id, { ...best, matchedKeywords: [...new Set([...(prior.matchedKeywords || []), ...(lead.matchedKeywords || [])])] });
  }
  return [...byId.values()].sort(compareMatches);
}
