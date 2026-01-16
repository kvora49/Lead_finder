/**
 * Add Regular Admin User Script
 * 
 * This script adds a new admin user (not super admin).
 * Run this after you already have a super admin set up.
 * 
 * INSTRUCTIONS:
 * 1. Update the admin email below
 * 2. Run: node scripts/addAdmin.js
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, serverTimestamp } from 'firebase/firestore';

// Your Firebase config (from src/firebase.js)
const firebaseConfig = {
  apiKey: "AIzaSyCRPZg4iK4TdNvQxUK4x3jc8q37Jd58MmI",
  authDomain: "lead-finder-6b009.firebaseapp.com",
  projectId: "lead-finder-6b009",
  storageBucket: "lead-finder-6b009.firebasestorage.app",
  messagingSenderId: "1020136892036",
  appId: "1:1020136892036:web:a55cb272c8b40ab36c04d1"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function addAdminUser() {
  console.log('🚀 Adding Admin User...\n');

  try {
    // CHANGE THIS EMAIL TO THE NEW ADMIN'S EMAIL
    const adminEmail = 'newadmin@company.com';
    
    console.log(`📧 Creating admin: ${adminEmail}`);
    
    await setDoc(doc(db, 'adminUsers', adminEmail), {
      email: adminEmail,
      role: 'admin', // Regular admin (not super_admin)
      createdAt: serverTimestamp(),
      permissions: {
        canManageUsers: true,      // Can approve/suspend users
        canViewAnalytics: true,     // Can view analytics & logs
        canModifySettings: false,   // Cannot modify system settings
        canAccessLogs: true         // Can view audit logs
      }
    });
    
    console.log('✅ Admin user created successfully!\n');
    console.log('📋 Permissions:');
    console.log('   ✅ Manage Users');
    console.log('   ✅ View Analytics');
    console.log('   ✅ Access Logs');
    console.log('   ❌ Modify Settings (super admin only)\n');
    console.log(`🎉 ${adminEmail} can now log in to /admin/dashboard`);

  } catch (error) {
    console.error('❌ Error creating admin user:', error);
    process.exit(1);
  }
}

addAdminUser();
