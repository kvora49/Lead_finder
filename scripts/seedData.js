/**
 * Database Seeder Script
 * Run this to populate Firestore with test data for admin dashboard
 * Usage: node scripts/seedData.js
 */

import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  getDoc,
  getDocs,
  Timestamp,
  serverTimestamp 
} from 'firebase/firestore';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';

// Firebase config from your project
const firebaseConfig = {
  apiKey: "AIzaSyAfBqHbkCfYxzUOBZcvyytZjNOWpn0BjnY",
  authDomain: "lead-finder-6b009.firebaseapp.com",
  projectId: "lead-finder-6b009",
  storageBucket: "lead-finder-6b009.firebasestorage.app",
  messagingSenderId: "614024043844",
  appId: "1:614024043844:web:d4d8f8dd55b54c2fe07c4d",
  measurementId: "G-6XQHTJVK7J"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

async function seedDatabase() {
  console.log('🌱 Starting database seeding...\n');

  try {
    // 1. Check and create global credits document
    console.log('📊 Setting up global credits...');
    const globalCreditsRef = doc(db, 'globalCredits', 'shared');
    const globalCreditsSnap = await getDoc(globalCreditsRef);
    
    if (!globalCreditsSnap.exists()) {
      await setDoc(globalCreditsRef, {
        totalApiCalls: 504,
        createdAt: serverTimestamp(),
        lastUpdated: serverTimestamp()
      });
      console.log('✅ Global credits initialized: 504 calls');
    } else {
      console.log('✅ Global credits already exist:', globalCreditsSnap.data().totalApiCalls, 'calls');
    }

    // 2. Check existing users
    console.log('\n👥 Checking existing users...');
    const usersSnapshot = await getDocs(collection(db, 'users'));
    console.log(`Found ${usersSnapshot.size} existing users`);
    
    if (usersSnapshot.size === 0) {
      console.log('⚠️  No users found. Creating test users...');
      
      // Create test user 1
      try {
        const testUser1Email = 'testuser1@example.com';
        const user1Cred = await createUserWithEmailAndPassword(auth, testUser1Email, 'Test123!@#');
        
        await setDoc(doc(db, 'users', user1Cred.user.uid), {
          email: testUser1Email,
          displayName: 'Test User 1',
          role: 'user',
          accountStatus: 'active',
          emailVerified: true,
          createdAt: Timestamp.fromDate(new Date(Date.now() - 15 * 24 * 60 * 60 * 1000)), // 15 days ago
          lastActive: Timestamp.fromDate(new Date(Date.now() - 2 * 60 * 60 * 1000)) // 2 hours ago
        });
        
        await setDoc(doc(db, 'userCredits', user1Cred.user.uid), {
          creditsUsed: 250,
          totalApiCalls: 250,
          lastUsed: Timestamp.fromDate(new Date(Date.now() - 2 * 60 * 60 * 1000))
        });
        
        console.log('✅ Created test user 1:', testUser1Email);
      } catch (error) {
        if (error.code !== 'auth/email-already-in-use') {
          console.error('Error creating user 1:', error.message);
        } else {
          console.log('ℹ️  Test user 1 already exists');
        }
      }
      
      // Create test user 2
      try {
        const testUser2Email = 'testuser2@example.com';
        const user2Cred = await createUserWithEmailAndPassword(auth, testUser2Email, 'Test123!@#');
        
        await setDoc(doc(db, 'users', user2Cred.user.uid), {
          email: testUser2Email,
          displayName: 'Test User 2',
          role: 'user',
          accountStatus: 'active',
          emailVerified: true,
          createdAt: Timestamp.fromDate(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)), // 7 days ago
          lastActive: Timestamp.fromDate(new Date(Date.now() - 30 * 60 * 1000)) // 30 min ago
        });
        
        await setDoc(doc(db, 'userCredits', user2Cred.user.uid), {
          creditsUsed: 254,
          totalApiCalls: 254,
          lastUsed: Timestamp.fromDate(new Date(Date.now() - 30 * 60 * 1000))
        });
        
        console.log('✅ Created test user 2:', testUser2Email);
      } catch (error) {
        if (error.code !== 'auth/email-already-in-use') {
          console.error('Error creating user 2:', error.message);
        } else {
          console.log('ℹ️  Test user 2 already exists');
        }
      }
    } else {
      console.log('✅ Users already exist, skipping user creation');
      usersSnapshot.forEach(doc => {
        const data = doc.data();
        console.log(`  - ${data.email} (${data.role || 'user'})`);
      });
    }

    // 3. Create system config if not exists
    console.log('\n⚙️  Setting up system config...');
    const systemConfigRef = doc(db, 'systemConfig', 'creditSystem');
    const systemConfigSnap = await getDoc(systemConfigRef);
    
    if (!systemConfigSnap.exists()) {
      await setDoc(systemConfigRef, {
        mode: 'global',
        globalLimit: 200000,
        defaultUserLimit: 1000,
        updatedAt: serverTimestamp(),
        updatedBy: 'system'
      });
      console.log('✅ System config initialized (global mode)');
    } else {
      console.log('✅ System config already exists:', systemConfigSnap.data().mode, 'mode');
    }

    // 4. Create sample search logs
    console.log('\n🔍 Creating sample search logs...');
    const searchLogsSnapshot = await getDocs(collection(db, 'searchLogs'));
    
    if (searchLogsSnapshot.size === 0) {
      const usersSnap = await getDocs(collection(db, 'users'));
      const userIds = usersSnap.docs.map(d => d.id);
      
      if (userIds.length > 0) {
        const sampleSearches = [
          { keyword: 'restaurants', location: 'Mumbai', category: 'restaurant', resultsCount: 45 },
          { keyword: 'hotels', location: 'Delhi', category: 'lodging', resultsCount: 38 },
          { keyword: 'kurti wholesalers', location: 'Mumbai', category: '', resultsCount: 52 },
          { keyword: 'cafes', location: 'Bangalore', category: 'cafe', resultsCount: 61 },
          { keyword: 'gyms', location: 'Pune', category: 'gym', resultsCount: 28 }
        ];
        
        for (let i = 0; i < sampleSearches.length; i++) {
          const search = sampleSearches[i];
          const userId = userIds[i % userIds.length];
          const daysAgo = Math.floor(Math.random() * 10);
          
          await setDoc(doc(collection(db, 'searchLogs')), {
            userId,
            keyword: search.keyword,
            location: search.location,
            category: search.category,
            resultsCount: search.resultsCount,
            timestamp: Timestamp.fromDate(new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000)),
            apiCallsUsed: search.resultsCount
          });
        }
        
        console.log(`✅ Created ${sampleSearches.length} sample search logs`);
      }
    } else {
      console.log(`✅ Search logs already exist: ${searchLogsSnapshot.size} logs`);
    }

    // 5. Create sample system logs
    console.log('\n📝 Creating sample system logs...');
    const systemLogsSnapshot = await getDocs(collection(db, 'systemLogs'));
    
    if (systemLogsSnapshot.size === 0) {
      const sampleLogs = [
        { action: 'user_login', severity: 'info', details: 'User logged in successfully' },
        { action: 'search_performed', severity: 'info', details: 'Search completed for restaurants in Mumbai' },
        { action: 'export_excel', severity: 'info', details: 'Excel export completed' },
        { action: 'credit_deducted', severity: 'info', details: '45 credits deducted for API calls' }
      ];
      
      for (let i = 0; i < sampleLogs.length; i++) {
        const log = sampleLogs[i];
        const hoursAgo = i + 1;
        
        await setDoc(doc(collection(db, 'systemLogs')), {
          action: log.action,
          severity: log.severity,
          details: log.details,
          timestamp: Timestamp.fromDate(new Date(Date.now() - hoursAgo * 60 * 60 * 1000)),
          user: 'system'
        });
      }
      
      console.log(`✅ Created ${sampleLogs.length} sample system logs`);
    } else {
      console.log(`✅ System logs already exist: ${systemLogsSnapshot.size} logs`);
    }

    // 6. Create monthly analytics
    console.log('\n📈 Creating monthly analytics...');
    const analyticsSnapshot = await getDocs(collection(db, 'monthlyAnalytics'));
    
    if (analyticsSnapshot.size === 0) {
      const months = ['2025-07', '2025-08', '2025-09', '2025-10', '2025-11', '2025-12'];
      
      for (const month of months) {
        await setDoc(doc(db, 'monthlyAnalytics', month), {
          month,
          totalApiCalls: Math.floor(Math.random() * 500) + 100,
          totalCost: parseFloat((Math.random() * 5).toFixed(2)),
          totalSearches: Math.floor(Math.random() * 50) + 10,
          activeUsers: Math.floor(Math.random() * 20) + 5,
          createdAt: serverTimestamp()
        });
      }
      
      console.log(`✅ Created ${months.length} months of analytics data`);
    } else {
      console.log(`✅ Monthly analytics already exist: ${analyticsSnapshot.size} months`);
    }

    console.log('\n✅ Database seeding completed successfully!');
    console.log('\n📊 Summary:');
    console.log('   - Global credits initialized');
    console.log('   - Test users created (if needed)');
    console.log('   - System config set up');
    console.log('   - Search logs populated');
    console.log('   - System logs created');
    console.log('   - Monthly analytics generated');
    console.log('\n🎉 Your admin dashboard should now display data!');
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error seeding database:', error);
    process.exit(1);
  }
}

// Run the seeder
seedDatabase();
