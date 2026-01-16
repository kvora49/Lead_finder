/**
 * Quick Data Seeder for Admin Dashboard
 * This creates the necessary documents in Firestore for testing
 * Run this AFTER logging into the app as admin
 */

import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc,
  Timestamp,
  serverTimestamp 
} from 'firebase/firestore';

// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyAfBqHbkCfYxzUOBZcvyytZjNOWpn0BjnY",
  authDomain: "lead-finder-6b009.firebaseapp.com",
  projectId: "lead-finder-6b009",
  storageBucket: "lead-finder-6b009.firebasestorage.app",
  messagingSenderId: "614024043844",
  appId: "1:614024043844:web:d4d8f8dd55b54c2fe07c4d",
  measurementId: "G-6XQHTJVK7J"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function seedBasicData() {
  console.log('🌱 Seeding basic data...\n');

  try {
    // 1. Global credits
    console.log('Setting up global credits...');
    await setDoc(doc(db, 'globalCredits', 'shared'), {
      totalApiCalls: 504,
      createdAt: serverTimestamp(),
      lastUpdated: serverTimestamp()
    });
    console.log('✅ Global credits created');

    // 2. System config
    console.log('Setting up system config...');
    await setDoc(doc(db, 'systemConfig', 'creditSystem'), {
      mode: 'global',
      globalLimit: 200000,
      defaultUserLimit: 1000,
      updatedAt: serverTimestamp(),
      updatedBy: 'system'
    });
    console.log('✅ System config created');

    // 3. Sample system logs
    console.log('Creating system logs...');
    const logs = [
      { action: 'user_login', severity: 'info', details: 'User logged in successfully', hoursAgo: 1 },
      { action: 'search_performed', severity: 'info', details: 'Search for restaurants in Mumbai', hoursAgo: 2 },
      { action: 'export_excel', severity: 'info', details: 'Excel export completed', hoursAgo: 3 },
      { action: 'credit_deducted', severity: 'info', details: '45 credits deducted', hoursAgo: 4 }
    ];

    for (const log of logs) {
      await setDoc(doc(collection(db, 'systemLogs')), {
        action: log.action,
        severity: log.severity,
        details: log.details,
        timestamp: Timestamp.fromDate(new Date(Date.now() - log.hoursAgo * 60 * 60 * 1000)),
        user: 'system',
        userEmail: 'system@admin.com'
      });
    }
    console.log('✅ System logs created');

    // 4. Monthly analytics
    console.log('Creating monthly analytics...');
    const months = [
      { month: '2025-08', apiCalls: 125, cost: 0.62, searches: 15, users: 8 },
      { month: '2025-09', apiCalls: 234, cost: 1.17, searches: 28, users: 12 },
      { month: '2025-10', apiCalls: 456, cost: 2.28, searches: 52, users: 18 },
      { month: '2025-11', apiCalls: 378, cost: 1.89, searches: 41, users: 15 },
      { month: '2025-12', apiCalls: 512, cost: 2.56, searches: 64, users: 21 },
      { month: '2026-01', apiCalls: 504, cost: 2.52, searches: 58, users: 19 }
    ];

    for (const data of months) {
      await setDoc(doc(db, 'monthlyAnalytics', data.month), {
        month: data.month,
        totalApiCalls: data.apiCalls,
        totalCost: data.cost,
        totalSearches: data.searches,
        activeUsers: data.users,
        createdAt: serverTimestamp()
      });
    }
    console.log('✅ Monthly analytics created');

    console.log('\n✅ Basic data seeded successfully!');
    console.log('Note: User data will appear once users register/login');
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

seedBasicData();
