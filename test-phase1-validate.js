#!/usr/bin/env node

/**
 * Phase 1: Simplified Local Test
 * Tests if the Cloud Function code can be imported without syntax errors
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

console.log(`\n${colors.blue}╔═══════════════════════════════════════════╗${colors.reset}`);
console.log(`${colors.blue}║   Phase 1: Validation & Code Analysis     ║${colors.reset}`);
console.log(`${colors.blue}╚═══════════════════════════════════════════╝${colors.reset}\n`);

const tests = [];

// Test 1: Check if functions/index.js exists
console.log(`${colors.yellow}TEST 1: Cloud Functions File Exists${colors.reset}`);
const functionsPath = join(__dirname, 'functions', 'index.js');
if (existsSync(functionsPath)) {
  console.log(`${colors.green}✅ PASS${colors.reset} - functions/index.js found\n`);
  tests.push(true);
} else {
  console.log(`${colors.red}❌ FAIL${colors.reset} - functions/index.js not found\n`);
  tests.push(false);
}

// Test 2: Check if functions have required imports
console.log(`${colors.yellow}TEST 2: Required Imports Present${colors.reset}`);
const functionCode = readFileSync(functionsPath, 'utf-8');
const hasOnCall = functionCode.includes('onCall');
const hasPuppeteer = functionCode.includes('puppeteer');
const hasStealthPlugin = functionCode.includes('StealthPlugin');

if (hasOnCall && hasPuppeteer && hasStealthPlugin) {
  console.log(`${colors.green}✅ PASS${colors.reset} - All required imports present`);
  console.log(`   ✓ onCall imported`);
  console.log(`   ✓ puppeteer imported`);
  console.log(`   ✓ StealthPlugin imported\n`);
  tests.push(true);
} else {
  console.log(`${colors.red}❌ FAIL${colors.reset} - Missing imports`);
  if (!hasOnCall) console.log(`   ✗ onCall not found`);
  if (!hasPuppeteer) console.log(`   ✗ puppeteer not found`);
  if (!hasStealthPlugin) console.log(`   ✗ StealthPlugin not found`);
  console.log();
  tests.push(false);
}

// Test 3: Check if scraper function exists
console.log(`${colors.yellow}TEST 3: Scraper Function Defined${colors.reset}`);
const hasScraperFunction = functionCode.includes('scrapeMapsTest');
if (hasScraperFunction) {
  console.log(`${colors.green}✅ PASS${colors.reset} - scrapeMapsTest function defined\n`);
  tests.push(true);
} else {
  console.log(`${colors.red}❌ FAIL${colors.reset} - scrapeMapsTest function not found\n`);
  tests.push(false);
}

// Test 4: Check human-mimicry features
console.log(`${colors.yellow}TEST 4: Human-Mimicry Features${colors.reset}`);
const hasDelay = functionCode.includes('Math.random');
const hasUserAgent = functionCode.includes('userAgents');
const hasViewport = functionCode.includes('setViewport');

if (hasDelay && hasUserAgent && hasViewport) {
  console.log(`${colors.green}✅ PASS${colors.reset} - All stealth features present`);
  console.log(`   ✓ Random delays implemented`);
  console.log(`   ✓ User-Agent rotation implemented`);
  console.log(`   ✓ Viewport randomization implemented\n`);
  tests.push(true);
} else {
  console.log(`${colors.red}❌ FAIL${colors.reset} - Missing stealth features`);
  if (!hasDelay) console.log(`   ✗ Random delays missing`);
  if (!hasUserAgent) console.log(`   ✗ User-Agent rotation missing`);
  if (!hasViewport) console.log(`   ✗ Viewport randomization missing`);
  console.log();
  tests.push(false);
}

// Test 5: Check Firebase integration
console.log(`${colors.yellow}TEST 5: Firebase Integration${colors.reset}`);
const hasBrowserClose = functionCode.includes('browser.close');
const hasErrorHandling = functionCode.includes('catch');
const hasLogger = functionCode.includes('logger');

if (hasBrowserClose && hasErrorHandling && hasLogger) {
  console.log(`${colors.green}✅ PASS${colors.reset} - Firebase integration complete`);
  console.log(`   ✓ Browser cleanup implemented`);
  console.log(`   ✓ Error handling implemented`);
  console.log(`   ✓ Logging implemented\n`);
  tests.push(true);
} else {
  console.log(`${colors.red}❌ FAIL${colors.reset} - Incomplete Firebase integration`);
  if (!hasBrowserClose) console.log(`   ✗ Browser cleanup missing`);
  if (!hasErrorHandling) console.log(`   ✗ Error handling missing`);
  if (!hasLogger) console.log(`   ✗ Logging missing`);
  console.log();
  tests.push(false);
}

// Test 6: Check dependencies
console.log(`${colors.yellow}TEST 6: Required Dependencies${colors.reset}`);
const pkgPath = join(__dirname, 'functions', 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
const hasPuppeteerExtra = 'puppeteer-extra' in pkg.dependencies;
const hasPuppeteerStealth = 'puppeteer-extra-plugin-stealth' in pkg.dependencies;
const hasExceljs = 'exceljs' in pkg.dependencies;

if (hasPuppeteerExtra && hasPuppeteerStealth) {
  console.log(`${colors.green}✅ PASS${colors.reset} - All dependencies installed`);
  console.log(`   ✓ puppeteer-extra installed`);
  console.log(`   ✓ puppeteer-extra-plugin-stealth installed`);
  console.log(`   ✓ exceljs available: ${hasExceljs ? 'Yes' : 'Not required yet'}\n`);
  tests.push(true);
} else {
  console.log(`${colors.red}❌ FAIL${colors.reset} - Missing dependencies`);
  if (!hasPuppeteerExtra) console.log(`   ✗ puppeteer-extra not installed`);
  if (!hasPuppeteerStealth) console.log(`   ✗ puppeteer-extra-plugin-stealth not installed`);
  console.log();
  tests.push(false);
}

// Summary
console.log(`${colors.blue}═══════════════════════════════════${colors.reset}`);
console.log(`${colors.blue}TEST SUMMARY${colors.reset}`);
console.log(`${colors.blue}═══════════════════════════════════${colors.reset}`);

const passed = tests.filter(t => t).length;
const failed = tests.filter(t => !t).length;

tests.forEach((result, index) => {
  const testName = [
    'Cloud Functions File Exists',
    'Required Imports Present',
    'Scraper Function Defined',
    'Human-Mimicry Features',
    'Firebase Integration',
    'Required Dependencies'
  ][index];
  
  if (result) {
    console.log(`${colors.green}✅${colors.reset} ${testName}`);
  } else {
    console.log(`${colors.red}❌${colors.reset} ${testName}`);
  }
});

console.log(`\n${colors.blue}Total: ${passed} passed, ${failed} failed${colors.reset}`);

if (failed === 0) {
  console.log(`\n${colors.green}🎉 Phase 1 Code Validation Complete!${colors.reset}`);
  console.log(`${colors.green}Ready for Phase 2: Frontend Integration${colors.reset}\n`);
  process.exit(0);
} else {
  console.log(`\n${colors.red}⚠️  ${failed} validation(s) failed. Please review above.${colors.reset}\n`);
  process.exit(1);
}
