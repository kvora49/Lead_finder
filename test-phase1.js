#!/usr/bin/env node

/**
 * Phase 1 Test Client
 * Tests the Cloud Functions locally using the Firebase Emulator
 */

import http from 'http';

// Test configurations
const EMULATOR_HOST = '127.0.0.1';
const EMULATOR_PORT = 5001;
const PROJECT_ID = 'lead-finder-6b009';
const REGION = 'us-central1';

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

/**
 * Make HTTP request to Cloud Function
 */
function callFunction(functionName, data = null) {
  return new Promise((resolve, reject) => {
    const url = `http://${EMULATOR_HOST}:${EMULATOR_PORT}/${PROJECT_ID}/${REGION}/${functionName}`;
    
    console.log(`\n${colors.blue}📞 Calling: ${functionName}${colors.reset}`);
    console.log(`   URL: ${url}`);
    
    const postData = data ? JSON.stringify({ data }) : null;
    
    const options = {
      hostname: EMULATOR_HOST,
      port: EMULATOR_PORT,
      path: `/${PROJECT_ID}/${REGION}/${functionName}`,
      method: data ? 'POST' : 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    };
    
    if (postData) {
      options.headers['Content-Length'] = Buffer.byteLength(postData);
    }
    
    const req = http.request(options, (res) => {
      let body = '';
      
      res.on('data', (chunk) => {
        body += chunk;
      });
      
      res.on('end', () => {
        try {
          const result = JSON.parse(body);
          resolve({ status: res.statusCode, body: result });
        } catch (e) {
          resolve({ status: res.statusCode, body });
        }
      });
    });
    
    req.on('error', reject);
    
    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

/**
 * Test 1: Hello World (Baseline)
 */
async function test1HelloWorld() {
  console.log(`\n${colors.yellow}═══════════════════════════════════${colors.reset}`);
  console.log(`${colors.yellow}TEST 1: Hello World Function${colors.reset}`);
  console.log(`${colors.yellow}═══════════════════════════════════${colors.reset}`);
  
  try {
    const result = await callFunction('helloWorld');
    
    if (result.status === 200 && result.body.includes('Hello from Firebase')) {
      console.log(`${colors.green}✅ PASS${colors.reset} - Function returned expected response`);
      console.log(`   Response: ${result.body}`);
      return true;
    } else {
      console.log(`${colors.red}❌ FAIL${colors.reset} - Unexpected response`);
      console.log(`   Status: ${result.status}`);
      console.log(`   Body: ${JSON.stringify(result.body)}`);
      return false;
    }
  } catch (error) {
    console.log(`${colors.red}❌ FAIL${colors.reset} - Error calling function`);
    console.log(`   Error: ${error.message}`);
    return false;
  }
}

/**
 * Test 2: Scraper Function with Simple Query
 */
async function test2ScraperSimple() {
  console.log(`\n${colors.yellow}═══════════════════════════════════${colors.reset}`);
  console.log(`${colors.yellow}TEST 2: Scraper Function (Simple Query)${colors.reset}`);
  console.log(`${colors.yellow}═══════════════════════════════════${colors.reset}`);
  
  try {
    const startTime = Date.now();
    const result = await callFunction('scrapeMapsTest', { query: 'restaurants in ahmedabad' });
    const executionTime = Date.now() - startTime;
    
    console.log(`   Execution Time: ${executionTime}ms`);
    
    if (result.status === 200 && result.body.success) {
      console.log(`${colors.green}✅ PASS${colors.reset} - Scraper executed successfully`);
      console.log(`   Query: ${result.body.query}`);
      console.log(`   Results Count: ${result.body.resultsCount}`);
      console.log(`   Cost: ${result.body.cost}`);
      
      if (result.body.resultsCount > 0) {
        console.log(`   Sample Result: ${result.body.leads[0]?.name || 'N/A'}`);
      }
      
      return true;
    } else {
      console.log(`${colors.red}❌ FAIL${colors.reset} - Scraper failed`);
      console.log(`   Status: ${result.status}`);
      console.log(`   Error: ${result.body.error || JSON.stringify(result.body)}`);
      return false;
    }
  } catch (error) {
    console.log(`${colors.red}❌ FAIL${colors.reset} - Error calling scraper`);
    console.log(`   Error: ${error.message}`);
    return false;
  }
}

/**
 * Test 3: Scraper with Different Query
 */
async function test3ScraperDifferentQuery() {
  console.log(`\n${colors.yellow}═══════════════════════════════════${colors.reset}`);
  console.log(`${colors.yellow}TEST 3: Scraper Function (Different Query)${colors.reset}`);
  console.log(`${colors.yellow}═══════════════════════════════════${colors.reset}`);
  
  try {
    const startTime = Date.now();
    const result = await callFunction('scrapeMapsTest', { query: 'coffee shops in mumbai' });
    const executionTime = Date.now() - startTime;
    
    console.log(`   Execution Time: ${executionTime}ms`);
    
    if (result.status === 200 && result.body.success) {
      console.log(`${colors.green}✅ PASS${colors.reset} - Scraper handled different query`);
      console.log(`   Query: ${result.body.query}`);
      console.log(`   Results Count: ${result.body.resultsCount}`);
      return true;
    } else {
      console.log(`${colors.red}❌ FAIL${colors.reset}`);
      return false;
    }
  } catch (error) {
    console.log(`${colors.red}❌ FAIL${colors.reset} - ${error.message}`);
    return false;
  }
}

/**
 * Test 4: Error Handling (Missing Query)
 */
async function test4ErrorHandling() {
  console.log(`\n${colors.yellow}═══════════════════════════════════${colors.reset}`);
  console.log(`${colors.yellow}TEST 4: Error Handling (Missing Query)${colors.reset}`);
  console.log(`${colors.yellow}═══════════════════════════════════${colors.reset}`);
  
  try {
    const result = await callFunction('scrapeMapsTest', {});
    
    if (result.status !== 200) {
      console.log(`${colors.green}✅ PASS${colors.reset} - Function correctly rejected invalid input`);
      console.log(`   Status: ${result.status}`);
      return true;
    } else {
      console.log(`${colors.red}❌ FAIL${colors.reset} - Function should have rejected invalid input`);
      return false;
    }
  } catch (error) {
    console.log(`${colors.green}✅ PASS${colors.reset} - Function correctly threw error`);
    console.log(`   Error: ${error.message}`);
    return true;
  }
}

/**
 * Run all tests
 */
async function runAllTests() {
  console.log(`\n${colors.blue}╔═══════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.blue}║     Phase 1: Cloud Functions Tests        ║${colors.reset}`);
  console.log(`${colors.blue}╚═══════════════════════════════════════════╝${colors.reset}`);
  
  const results = [];
  
  try {
    results.push(['Test 1: Hello World', await test1HelloWorld()]);
    
    // Wait a bit between tests
    await new Promise(r => setTimeout(r, 2000));
    
    results.push(['Test 2: Scraper (Simple)', await test2ScraperSimple()]);
    
    // Wait before next test
    await new Promise(r => setTimeout(r, 3000));
    
    results.push(['Test 3: Scraper (Different Query)', await test3ScraperDifferentQuery()]);
    
    // Wait before error test
    await new Promise(r => setTimeout(r, 2000));
    
    results.push(['Test 4: Error Handling', await test4ErrorHandling()]);
  } catch (error) {
    console.log(`${colors.red}Fatal error during tests: ${error.message}${colors.reset}`);
  }
  
  // Print summary
  console.log(`\n${colors.blue}═══════════════════════════════════${colors.reset}`);
  console.log(`${colors.blue}TEST SUMMARY${colors.reset}`);
  console.log(`${colors.blue}═══════════════════════════════════${colors.reset}`);
  
  let passed = 0;
  let failed = 0;
  
  results.forEach(([name, result]) => {
    if (result) {
      console.log(`${colors.green}✅${colors.reset} ${name}`);
      passed++;
    } else {
      console.log(`${colors.red}❌${colors.reset} ${name}`);
      failed++;
    }
  });
  
  console.log(`\n${colors.blue}Total: ${passed} passed, ${failed} failed${colors.reset}`);
  
  if (failed === 0) {
    console.log(`\n${colors.green}🎉 All tests passed! Ready for Phase 2.${colors.reset}\n`);
    process.exit(0);
  } else {
    console.log(`\n${colors.red}⚠️  Some tests failed. Review errors above.${colors.reset}\n`);
    process.exit(1);
  }
}

// Run tests
runAllTests().catch(error => {
  console.error(`${colors.red}Fatal error:${colors.reset}`, error);
  process.exit(1);
});
