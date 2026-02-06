// Test script for local development
// Run: node test-scraper.js

const axios = require('axios');

const API_URL = process.env.API_URL || 'http://localhost:3001';
const SECRET_KEY = process.env.SECRET_KEY || 'your-super-secret-key-change-this-12345';

async function testScraper() {
  console.log('🧪 Testing Sidecar Scraper...\n');
  
  try {
    // Test 1: Health Check
    console.log('1️⃣ Testing health endpoint...');
    const healthResponse = await axios.get(`${API_URL}/health`);
    console.log('✅ Health:', healthResponse.data);
    console.log('');
    
    // Test 2: Scrape Request
    console.log('2️⃣ Testing scrape endpoint...');
    console.log('   Scraping: "restaurants" in "New York"');
    console.log('   (This may take 20-30 seconds...)\n');
    
    const scrapeResponse = await axios.post(
      `${API_URL}/scrape`,
      {
        keyword: 'restaurants',
        location: 'New York',
        userId: 'test-user-123',
        forceRefresh: false
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-secret-key': SECRET_KEY
        }
      }
    );
    
    console.log('✅ Scrape completed!');
    console.log(`   Cached: ${scrapeResponse.data.cached}`);
    console.log(`   Results: ${scrapeResponse.data.count}`);
    console.log(`   Duration: ${scrapeResponse.data.duration || 'N/A'}`);
    console.log('');
    
    // Show first 3 results
    if (scrapeResponse.data.results && scrapeResponse.data.results.length > 0) {
      console.log('📊 First 3 results:');
      scrapeResponse.data.results.slice(0, 3).forEach((business, index) => {
        console.log(`\n   ${index + 1}. ${business.displayName?.text || 'Unknown'}`);
        console.log(`      Address: ${business.formattedAddress || 'N/A'}`);
        console.log(`      Phone: ${business.nationalPhoneNumber || 'N/A'}`);
        console.log(`      Rating: ${business.rating || 'N/A'} (${business.userRatingCount || 0} reviews)`);
      });
    }
    
    console.log('\n\n🎉 All tests passed!');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', error.response.data);
    }
    
    process.exit(1);
  }
}

// Run tests
testScraper();
