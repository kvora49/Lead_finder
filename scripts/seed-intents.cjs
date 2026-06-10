// ─────────────────────────────────────────────────────────────────────────────
// Lead Finder v7 — Intent Cache Seeder
// Run this ONCE from your terminal to pre-populate Firestore with AI intents.
// This bypasses the browser entirely (no ad-blocker issues).
//
// SETUP (run once):
//   1. Download serviceAccountKey.json from Firebase Console:
//      https://console.firebase.google.com/project/lead-finder-6b009/settings/serviceaccounts/adminsdk
//      → Click "Generate new private key" → Save the file here as serviceAccountKey.json
//   2. npm install firebase-admin
//   3. node scripts/seed-intents.js
// ─────────────────────────────────────────────────────────────────────────────

const admin = require('firebase-admin');
const path  = require('path');

// ── Load service account ──────────────────────────────────────────────────────
let serviceAccount;
try {
  serviceAccount = require(path.join(__dirname, 'serviceAccountKey.json'));
} catch {
  console.error('\n❌  serviceAccountKey.json not found!');
  console.error('   Download it from:');
  console.error('   https://console.firebase.google.com/project/lead-finder-6b009/settings/serviceaccounts/adminsdk');
  console.error('   Save it as: scripts/serviceAccountKey.json\n');
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// ── Cache key (must match placesApi.js logic exactly) ────────────────────────
const _intentCacheKey = (keyword) => {
  const kw = keyword.toLowerCase().trim();
  const encoded = encodeURIComponent(kw);
  // Node.js equivalent of browser's btoa(unescape(encoded))
  return Buffer.from(decodeURIComponent(encoded))
    .toString('base64')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 60);
};

// ── Pre-computed intent data ──────────────────────────────────────────────────
// Generated from Gemini knowledge for common Indian business keywords.
const INTENTS = {

  // ── Clothing & Fashion ──────────────────────────────────────────────────────
  'saree': {
    search_queries: ['saree shop', 'silk saree store', 'ethnic wear boutique', 'ladies clothing store', 'vastralaya'],
    store_name_keywords: ['saree', 'silk', 'ethnic', 'ladies', 'fashion', 'boutique', 'vastralaya', 'textile'],
    review_keywords: ['saree', 'silk', 'ethnic wear', 'dupatta', 'sari'],
    synonyms: ['sari', 'sadi'],
    exclude_name_words: ['motor', 'hardware', 'electrical', 'cement', 'computer', 'medical', 'pharma'],
    anti_stock_keywords: ['jeans', 'shoes', 'footwear', 'hardware', 'motor', 'furniture'],
    is_food: false, is_service: false,
  },

  'kurti': {
    search_queries: ['kurti shop', 'ladies kurti store', 'ethnic wear boutique', 'women clothing store', 'kurta shop'],
    store_name_keywords: ['kurti', 'kurta', 'ethnic', 'ladies', 'fashion', 'boutique', 'women', 'garment'],
    review_keywords: ['kurti', 'kurta', 'ethnic wear', 'ladies wear'],
    synonyms: ['kurta', 'kurtee', 'kurtha'],
    exclude_name_words: ['motor', 'hardware', 'electrical', 'computer', 'medical', 'plywood'],
    anti_stock_keywords: ['jeans', 'denim', 'raymond', 'suit', 'nike', 'adidas', 'shoe', 'footwear'],
    is_food: false, is_service: false,
  },

  'shirt': {
    search_queries: ['shirt shop', 'readymade garment store', 'men clothing store', 'formal shirt shop'],
    store_name_keywords: ['shirt', 'garment', 'clothing', 'fashion', 'apparel', 'men', 'readymade'],
    review_keywords: ['shirt', 'formal wear', 'clothing', 'garment'],
    synonyms: ['formal shirt', 'casual shirt'],
    exclude_name_words: ['motor', 'hardware', 'electrical', 'medical', 'cement'],
    anti_stock_keywords: ['saree', 'kurti', 'shoe', 'hardware', 'motor'],
    is_food: false, is_service: false,
  },

  'jeans': {
    search_queries: ['jeans shop', 'denim store', 'casual wear shop', 'branded jeans store'],
    store_name_keywords: ['jeans', 'denim', 'fashion', 'clothing', 'casual', 'apparel'],
    review_keywords: ['jeans', 'denim', 'casual wear', 'trousers'],
    synonyms: ['denim', 'denim pants', 'jeans pants'],
    exclude_name_words: ['motor', 'hardware', 'medical', 'cement', 'jewellery'],
    anti_stock_keywords: ['saree', 'kurti', 'shoe', 'hardware'],
    is_food: false, is_service: false,
  },

  // ── Sports & Toys ───────────────────────────────────────────────────────────
  'ball': {
    search_queries: ['cricket ball shop', 'sports goods store', 'sporting equipment dealer', 'toy store'],
    store_name_keywords: ['sports', 'cricket', 'games', 'toy', 'play', 'fitness'],
    review_keywords: ['ball', 'cricket', 'sports', 'badminton', 'football'],
    synonyms: ['cricket ball', 'football', 'sports ball', 'rubber ball'],
    exclude_name_words: ['motor', 'car', 'sanitary', 'computer', 'electronics', 'pharma', 'chemist', 'cake', 'salon'],
    anti_stock_keywords: ['shoe', 'jewellery', 'furniture', 'crystal', 'cake', 'wedding', 'salon'],
    is_food: false, is_service: false,
  },

  'cricket bat': {
    search_queries: ['cricket bat shop', 'sports goods store', 'cricket equipment dealer', 'sporting goods shop'],
    store_name_keywords: ['sports', 'cricket', 'games', 'fitness', 'play'],
    review_keywords: ['cricket bat', 'bat', 'cricket', 'sports equipment'],
    synonyms: ['bat', 'willow'],
    exclude_name_words: ['motor', 'car', 'sanitary', 'computer', 'electronics', 'pharma', 'cake'],
    anti_stock_keywords: ['shoe', 'jewellery', 'furniture', 'clothing'],
    is_food: false, is_service: false,
  },

  'toy': {
    search_queries: ['toy shop', 'kids toy store', 'games and toys shop', 'toy dealer'],
    store_name_keywords: ['toy', 'kids', 'baby', 'play', 'games', 'child'],
    review_keywords: ['toy', 'toys', 'kids', 'games', 'play'],
    synonyms: ['toys', 'kids toys', 'educational toys'],
    exclude_name_words: ['motor', 'hardware', 'medical', 'cement'],
    anti_stock_keywords: ['shoe', 'jewellery', 'furniture', 'clothing'],
    is_food: false, is_service: false,
  },

  // ── Electronics & Appliances ────────────────────────────────────────────────
  'laptop': {
    search_queries: ['laptop shop', 'computer store', 'laptop dealer', 'electronics shop'],
    store_name_keywords: ['laptop', 'computer', 'electronics', 'tech', 'digital', 'IT'],
    review_keywords: ['laptop', 'computer', 'notebook', 'electronics'],
    synonyms: ['notebook', 'computer', 'PC'],
    exclude_name_words: ['motor', 'hardware', 'medical', 'cement', 'clothing', 'food'],
    anti_stock_keywords: ['shoe', 'jewellery', 'furniture', 'clothing', 'food'],
    is_food: false, is_service: false,
  },

  'mobile': {
    search_queries: ['mobile phone shop', 'smartphone store', 'mobile dealer', 'phone shop'],
    store_name_keywords: ['mobile', 'phone', 'smartphone', 'telecom', 'digital', 'electronics'],
    review_keywords: ['mobile', 'phone', 'smartphone', 'handset'],
    synonyms: ['phone', 'smartphone', 'cell phone', 'handphone'],
    exclude_name_words: ['motor', 'hardware', 'medical', 'cement', 'clothing'],
    anti_stock_keywords: ['shoe', 'jewellery', 'furniture', 'clothing'],
    is_food: false, is_service: false,
  },

  'inverter': {
    search_queries: ['inverter shop', 'solar inverter dealer', 'UPS and inverter store', 'battery inverter dealer'],
    store_name_keywords: ['inverter', 'solar', 'power', 'battery', 'electrical', 'energy'],
    review_keywords: ['inverter', 'solar', 'battery', 'power backup', 'UPS'],
    synonyms: ['UPS', 'power inverter', 'solar inverter'],
    exclude_name_words: ['motor', 'medical', 'cement', 'clothing', 'food', 'pharma'],
    anti_stock_keywords: ['furniture', 'clothing', 'food', 'shoe'],
    is_food: false, is_service: false,
  },

  'AC': {
    search_queries: ['AC shop', 'air conditioner dealer', 'split AC store', 'air conditioner shop'],
    store_name_keywords: ['AC', 'aircon', 'air conditioner', 'cooling', 'HVAC', 'refrigeration'],
    review_keywords: ['AC', 'air conditioner', 'split AC', 'cooling'],
    synonyms: ['air conditioner', 'air conditioning', 'split AC'],
    exclude_name_words: ['motor', 'medical', 'cement', 'clothing', 'food'],
    anti_stock_keywords: ['furniture', 'clothing', 'food', 'shoe'],
    is_food: false, is_service: false,
  },

  'fan': {
    search_queries: ['fan shop', 'ceiling fan dealer', 'electrical fan store', 'fan wholesale dealer'],
    store_name_keywords: ['fan', 'electrical', 'appliance', 'electronics', 'home appliance'],
    review_keywords: ['fan', 'ceiling fan', 'table fan', 'exhaust fan'],
    synonyms: ['ceiling fan', 'table fan', 'exhaust fan'],
    exclude_name_words: ['motor', 'medical', 'cement', 'clothing', 'food'],
    anti_stock_keywords: ['furniture', 'clothing', 'food', 'shoe'],
    is_food: false, is_service: false,
  },

  'TV': {
    search_queries: ['TV shop', 'television store', 'LED TV dealer', 'electronics shop'],
    store_name_keywords: ['TV', 'television', 'electronics', 'digital', 'LED', 'home appliance'],
    review_keywords: ['TV', 'television', 'LED TV', 'smart TV'],
    synonyms: ['television', 'LED TV', 'smart TV', 'OLED TV'],
    exclude_name_words: ['motor', 'medical', 'cement', 'clothing', 'food'],
    anti_stock_keywords: ['furniture', 'clothing', 'food', 'shoe'],
    is_food: false, is_service: false,
  },

  'refrigerator': {
    search_queries: ['refrigerator shop', 'fridge dealer', 'home appliance store', 'refrigerator wholesale'],
    store_name_keywords: ['refrigerator', 'fridge', 'appliance', 'electronics', 'cooling'],
    review_keywords: ['refrigerator', 'fridge', 'double door', 'single door'],
    synonyms: ['fridge', 'freezer'],
    exclude_name_words: ['motor', 'medical', 'cement', 'clothing', 'food'],
    anti_stock_keywords: ['furniture', 'clothing', 'food', 'shoe'],
    is_food: false, is_service: false,
  },

  'camera': {
    search_queries: ['camera shop', 'DSLR camera store', 'photography shop', 'camera dealer'],
    store_name_keywords: ['camera', 'photo', 'photography', 'DSLR', 'optical'],
    review_keywords: ['camera', 'DSLR', 'photography', 'lens'],
    synonyms: ['DSLR', 'digital camera', 'CCTV camera'],
    exclude_name_words: ['motor', 'medical', 'cement', 'clothing', 'food'],
    anti_stock_keywords: ['furniture', 'clothing', 'food', 'shoe'],
    is_food: false, is_service: false,
  },

  'printer': {
    search_queries: ['printer shop', 'printer dealer', 'office equipment store', 'laser printer shop'],
    store_name_keywords: ['printer', 'computer', 'electronics', 'office', 'digital'],
    review_keywords: ['printer', 'laser printer', 'inkjet printer', 'toner'],
    synonyms: ['laser printer', 'inkjet printer', 'copier'],
    exclude_name_words: ['motor', 'medical', 'cement', 'clothing', 'food'],
    anti_stock_keywords: ['furniture', 'clothing', 'food', 'shoe'],
    is_food: false, is_service: false,
  },

  // ── Construction & Hardware ─────────────────────────────────────────────────
  'cement': {
    search_queries: ['cement dealer', 'building material shop', 'construction material supplier', 'cement wholesale'],
    store_name_keywords: ['cement', 'building', 'construction', 'hardware', 'material', 'infrastructure'],
    review_keywords: ['cement', 'concrete', 'building material', 'construction'],
    synonyms: ['concrete', 'mortar'],
    exclude_name_words: ['pharma', 'medical', 'food', 'clothing', 'restaurant', 'jewellery'],
    anti_stock_keywords: ['clothing', 'food', 'jewellery', 'electronics'],
    is_food: false, is_service: false,
  },

  'hardware': {
    search_queries: ['hardware shop', 'hardware store', 'tools and hardware dealer', 'plumbing hardware shop'],
    store_name_keywords: ['hardware', 'tools', 'construction', 'building', 'sanitary', 'iron'],
    review_keywords: ['hardware', 'tools', 'plumbing', 'fixtures', 'fittings'],
    synonyms: ['tools', 'ironmongery', 'building hardware'],
    exclude_name_words: ['pharma', 'medical', 'food', 'clothing', 'restaurant', 'computer'],
    anti_stock_keywords: ['clothing', 'food', 'jewellery', 'electronics', 'mobile'],
    is_food: false, is_service: false,
  },

  'plywood': {
    search_queries: ['plywood shop', 'plywood dealer', 'timber and plywood store', 'wood product supplier'],
    store_name_keywords: ['plywood', 'timber', 'wood', 'ply', 'carpenter', 'furniture material'],
    review_keywords: ['plywood', 'timber', 'wood', 'MDF', 'laminate'],
    synonyms: ['timber', 'MDF', 'wood board', 'ply'],
    exclude_name_words: ['pharma', 'medical', 'food', 'clothing', 'restaurant'],
    anti_stock_keywords: ['clothing', 'food', 'jewellery', 'electronics'],
    is_food: false, is_service: false,
  },

  // ── Furniture & Home ────────────────────────────────────────────────────────
  'furniture': {
    search_queries: ['furniture shop', 'furniture showroom', 'home furniture store', 'furniture dealer'],
    store_name_keywords: ['furniture', 'home', 'interior', 'decor', 'sofa', 'wood'],
    review_keywords: ['furniture', 'sofa', 'bed', 'chair', 'table', 'wardrobe'],
    synonyms: ['furnishings', 'home furniture'],
    exclude_name_words: ['pharma', 'medical', 'food', 'clothing', 'restaurant', 'motor'],
    anti_stock_keywords: ['clothing', 'food', 'jewellery', 'electronics', 'shoe'],
    is_food: false, is_service: false,
  },

  'sofa': {
    search_queries: ['sofa shop', 'sofa set dealer', 'furniture showroom', 'sofa manufacturer'],
    store_name_keywords: ['sofa', 'furniture', 'home', 'interior', 'decor', 'upholstery'],
    review_keywords: ['sofa', 'sofa set', 'couch', 'furniture'],
    synonyms: ['couch', 'sofa set', 'settee'],
    exclude_name_words: ['pharma', 'medical', 'food', 'clothing', 'restaurant', 'motor'],
    anti_stock_keywords: ['clothing', 'food', 'jewellery', 'electronics'],
    is_food: false, is_service: false,
  },

  'mattress': {
    search_queries: ['mattress shop', 'mattress dealer', 'bed mattress store', 'foam mattress shop'],
    store_name_keywords: ['mattress', 'furniture', 'bed', 'sleep', 'foam', 'spring'],
    review_keywords: ['mattress', 'mattress quality', 'foam', 'spring mattress'],
    synonyms: ['gadi', 'foam mattress', 'spring mattress', 'coir mattress'],
    exclude_name_words: ['pharma', 'medical', 'food', 'clothing', 'restaurant', 'motor'],
    anti_stock_keywords: ['clothing', 'food', 'jewellery', 'electronics'],
    is_food: false, is_service: false,
  },

  // ── Footwear & Accessories ──────────────────────────────────────────────────
  'shoe': {
    search_queries: ['shoe shop', 'footwear store', 'sports shoe shop', 'shoe dealer'],
    store_name_keywords: ['shoe', 'footwear', 'chappal', 'sandal', 'sports', 'fashion'],
    review_keywords: ['shoe', 'footwear', 'chappal', 'sandal', 'sneakers'],
    synonyms: ['footwear', 'chappal', 'sandal', 'sneakers', 'paaduka'],
    exclude_name_words: ['motor', 'hardware', 'medical', 'cement', 'computer'],
    anti_stock_keywords: ['saree', 'kurti', 'hardware', 'motor', 'cement'],
    is_food: false, is_service: false,
  },

  'bag': {
    search_queries: ['bag shop', 'handbag store', 'luggage and bag shop', 'school bag dealer', 'laptop bag store'],
    store_name_keywords: ['bag', 'luggage', 'handbag', 'travel', 'backpack', 'leather'],
    review_keywords: ['bag', 'handbag', 'backpack', 'luggage', 'trolley bag'],
    synonyms: ['handbag', 'backpack', 'purse', 'luggage', 'briefcase'],
    exclude_name_words: ['motor', 'hardware', 'medical', 'cement', 'computer', 'food'],
    anti_stock_keywords: ['saree', 'kurti', 'hardware', 'motor', 'cement'],
    is_food: false, is_service: false,
  },

  'watch': {
    search_queries: ['watch shop', 'wristwatch store', 'branded watch dealer', 'watch showroom'],
    store_name_keywords: ['watch', 'clock', 'time', 'jewellery', 'fashion', 'branded'],
    review_keywords: ['watch', 'wristwatch', 'clock', 'timepiece'],
    synonyms: ['wristwatch', 'timepiece', 'clock'],
    exclude_name_words: ['motor', 'hardware', 'medical', 'cement', 'computer', 'food'],
    anti_stock_keywords: ['saree', 'kurti', 'hardware', 'motor', 'cement'],
    is_food: false, is_service: false,
  },

  // ── Books & Stationery ──────────────────────────────────────────────────────
  'book': {
    search_queries: ['book shop', 'bookstore', 'educational book shop', 'stationery and book store'],
    store_name_keywords: ['book', 'library', 'stationery', 'educational', 'literature', 'publication'],
    review_keywords: ['book', 'books', 'novel', 'textbook', 'stationery'],
    synonyms: ['books', 'textbook', 'novel'],
    exclude_name_words: ['motor', 'hardware', 'medical', 'cement', 'food', 'clothing'],
    anti_stock_keywords: ['shoe', 'jewellery', 'furniture', 'clothing', 'food'],
    is_food: false, is_service: false,
  },

  'stationery': {
    search_queries: ['stationery shop', 'office stationery store', 'school stationery shop', 'paper stationery dealer'],
    store_name_keywords: ['stationery', 'office', 'school', 'paper', 'print', 'supply'],
    review_keywords: ['stationery', 'pen', 'paper', 'notebook', 'office supplies'],
    synonyms: ['office supplies', 'school supplies'],
    exclude_name_words: ['motor', 'hardware', 'medical', 'cement', 'food', 'clothing'],
    anti_stock_keywords: ['shoe', 'jewellery', 'furniture', 'clothing', 'food'],
    is_food: false, is_service: false,
  },

  // ── Cycles & Vehicles ───────────────────────────────────────────────────────
  'cycle': {
    search_queries: ['cycle shop', 'bicycle dealer', 'cycle store', 'sports cycle shop'],
    store_name_keywords: ['cycle', 'bicycle', 'bike', 'sports', 'two-wheel'],
    review_keywords: ['cycle', 'bicycle', 'bike', 'cycling'],
    synonyms: ['bicycle', 'bike', 'pushbike'],
    exclude_name_words: ['motor', 'hardware', 'medical', 'cement', 'food', 'computer'],
    anti_stock_keywords: ['shoe', 'jewellery', 'furniture', 'clothing', 'food'],
    is_food: false, is_service: false,
  },

  // ── Gifts & Miscellaneous ───────────────────────────────────────────────────
  'gift': {
    search_queries: ['gift shop', 'gift items store', 'gifting shop', 'corporate gift dealer'],
    store_name_keywords: ['gift', 'gifting', 'present', 'souvenir', 'novelty', 'decor'],
    review_keywords: ['gift', 'gifts', 'gifting', 'presents', 'souvenir'],
    synonyms: ['presents', 'gifting items', 'souvenirs'],
    exclude_name_words: ['motor', 'hardware', 'medical', 'cement', 'computer'],
    anti_stock_keywords: ['hardware', 'motor', 'cement', 'medical'],
    is_food: false, is_service: false,
  },

  'laptop bag': {
    search_queries: ['laptop bag shop', 'laptop backpack store', 'bag shop', 'laptop carry case dealer'],
    store_name_keywords: ['bag', 'laptop', 'backpack', 'luggage', 'travel', 'leather'],
    review_keywords: ['laptop bag', 'laptop backpack', 'bag', 'carry bag'],
    synonyms: ['laptop backpack', 'laptop sleeve', 'laptop carry case'],
    exclude_name_words: ['motor', 'hardware', 'medical', 'cement', 'food'],
    anti_stock_keywords: ['saree', 'kurti', 'hardware', 'motor', 'cement'],
    is_food: false, is_service: false,
  },
};

// ── Seed function ─────────────────────────────────────────────────────────────
async function seedIntents() {
  console.log(`\n🚀 Lead Finder v7 — Intent Cache Seeder`);
  console.log(`   Seeding ${Object.keys(INTENTS).length} keywords to Firestore...\n`);

  let success = 0;
  let failed  = 0;

  for (const [keyword, intent] of Object.entries(INTENTS)) {
    const cacheKey = _intentCacheKey(keyword);
    try {
      await db.collection('keyword_intent_cache').doc(cacheKey).set({
        keyword,
        intent,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        seededBy: 'seed-intents.js',
      });
      console.log(`  ✅  ${keyword.padEnd(20)} → ${cacheKey}`);
      success++;
    } catch (err) {
      console.error(`  ❌  ${keyword.padEnd(20)} → FAILED: ${err.message}`);
      failed++;
    }
  }

  console.log(`\n─────────────────────────────────────────────`);
  console.log(`  ✅  ${success} keywords seeded successfully`);
  if (failed > 0) console.log(`  ❌  ${failed} keywords failed`);
  console.log(`─────────────────────────────────────────────\n`);
  console.log(`  Open Firebase Console to verify:`);
  console.log(`  https://console.firebase.google.com/project/lead-finder-6b009/firestore\n`);

  process.exit(0);
}

seedIntents().catch(err => {
  console.error('\n❌  Fatal error:', err.message);
  process.exit(1);
});
