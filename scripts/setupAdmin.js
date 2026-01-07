/**
 * Firestore Admin Setup Script
 * 
 * This script helps initialize the required Firestore collections
 * for the admin dashboard. Run this after setting up Firebase.
 * 
 * INSTRUCTIONS:
 * 1. Make sure Firebase is configured in your project
 * 2. Update the admin email below with your email
 * 3. Run this script once: node scripts/setupAdmin.js
 * 4. Or manually create collections in Firebase Console
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, serverTimestamp } from 'firebase/firestore';

// Your Firebase config (copy from firebase.js)
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function setupAdminDashboard() {
  console.log('🚀 Starting Admin Dashboard Setup...\n');

  try {
    // 1. Create Super Admin User
    const adminEmail = 'admin@company.com'; // CHANGE THIS TO YOUR EMAIL
    console.log(`📧 Creating super admin: ${adminEmail}`);
    
    await setDoc(doc(db, 'adminUsers', adminEmail), {
      email: adminEmail,
      role: 'super_admin',
      createdAt: serverTimestamp(),
      permissions: {
        canManageUsers: true,
        canViewAnalytics: true,
        canModifySettings: true,
        canAccessLogs: true
      }
    });
    console.log('✅ Super admin created successfully\n');

    // 2. Create System Config
    console.log('⚙️  Creating system configuration...');
    
    await setDoc(doc(db, 'systemConfig', 'global'), {
      // API Settings
      rapidApiKey: '',
      apiRateLimit: 100,
      maxResultsPerSearch: 100,
      
      // Credit Settings
      defaultCreditLimit: 1000,
      creditCostPerSearch: 5,
      creditAlertThreshold: 80,
      
      // Email Settings
      emailNotifications: true,
      emailProvider: 'sendgrid',
      emailApiKey: '',
      notificationEmail: adminEmail,
      
      // Security Settings
      requireEmailVerification: true,
      autoApproveUsers: false,
      sessionTimeout: 30,
      
      // System Settings
      maintenanceMode: false,
      debugMode: false,
      
      updatedAt: serverTimestamp(),
      updatedBy: 'setup-script'
    });
    console.log('✅ System configuration created\n');

    // 3. Create Sample Admin Log
    console.log('📝 Creating sample admin log...');
    
    await setDoc(doc(db, 'adminLogs', 'setup-log'), {
      timestamp: serverTimestamp(),
      type: 'system',
      severity: 'info',
      action: 'Admin Dashboard Initialized',
      user: 'system',
      details: 'Admin dashboard setup completed successfully',
      ip: '127.0.0.1'
    });
    console.log('✅ Sample log created\n');

    console.log('🎉 Admin Dashboard Setup Complete!\n');
    console.log('Next Steps:');
    console.log('1. Update Firestore Security Rules (see ADMIN_DASHBOARD_README.md)');
    console.log('2. Set your RapidAPI key in Settings page');
    console.log('3. Login and navigate to /admin');
    console.log(`4. Make sure you login with: ${adminEmail}\n`);

  } catch (error) {
    console.error('❌ Setup failed:', error);
    console.log('\nTroubleshooting:');
    console.log('- Check Firebase config is correct');
    console.log('- Ensure Firestore is enabled in Firebase Console');
    console.log('- Verify network connection');
    console.log('- Check Firebase permissions');
  }
}

// Run setup
setupAdminDashboard();

/*
 * MANUAL SETUP ALTERNATIVE:
 * 
 * If you prefer to set up manually via Firebase Console:
 * 
 * 1. Go to Firebase Console → Firestore Database
 * 
 * 2. Create collection: adminUsers
 *    Document ID: your-email@company.com
 *    Fields:
 *      - email (string): "your-email@company.com"
 *      - role (string): "super_admin"
 *      - createdAt (timestamp): Auto
 *      - permissions (map):
 *        - canManageUsers (boolean): true
 *        - canViewAnalytics (boolean): true
 *        - canModifySettings (boolean): true
 *        - canAccessLogs (boolean): true
 * 
 * 3. Create collection: systemConfig
 *    Document ID: global
 *    Fields: (copy from the script above)
 * 
 * 4. Update Security Rules (see ADMIN_DASHBOARD_README.md)
 */
