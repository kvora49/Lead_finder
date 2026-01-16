/**
 * Example: Integrating Real-Time Analytics into Your Search Component
 * 
 * This file shows how to integrate the analytics service into your existing
 * search/lead generation functionality.
 */

import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { logSearch, updateCreditUsage, logError } from '../services/analyticsService';

const SearchComponent = () => {
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(false);

  const handleSearch = async (keyword, location, filters = {}) => {
    setLoading(true);
    const startTime = Date.now();
    
    try {
      // Your existing search API call
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword, location, filters })
      });
      
      const results = await response.json();
      const responseTime = Date.now() - startTime;
      
      // Calculate credits used (adjust based on your pricing)
      const creditsUsed = calculateCredits(results.length);
      
      // Log the search activity
      await logSearch(currentUser.uid, currentUser.email, {
        keyword,
        location,
        query: `${keyword} in ${location}`,
        resultCount: results.length,
        responseTime,
        creditsUsed,
        filters,
        metadata: {
          source: 'web-app',
          apiVersion: 'v1'
        }
      });
      
      // Update user credit usage
      await updateCreditUsage(currentUser.uid, creditsUsed);
      
      setLoading(false);
      return results;
      
    } catch (error) {
      // Log the error
      await logError({
        action: 'Search Failed',
        message: error.message,
        code: error.code,
        userId: currentUser.uid,
        userEmail: currentUser.email,
        metadata: {
          keyword,
          location,
          filters
        }
      });
      
      setLoading(false);
      throw error;
    }
  };
  
  const calculateCredits = (resultCount) => {
    // Example: 1 credit per 10 results, minimum 1 credit
    return Math.max(1, Math.ceil(resultCount / 10));
  };

  return (
    // Your search UI component
    <div>
      {/* Search form */}
    </div>
  );
};

export default SearchComponent;

/**
 * Example: Integrating Analytics into Export Functionality
 */

import { logExport } from '../services/analyticsService';

const ExportButton = ({ data, format = 'CSV' }) => {
  const { currentUser } = useAuth();
  
  const handleExport = async () => {
    try {
      // Your existing export logic
      const blob = createCSVBlob(data);
      downloadFile(blob, `export-${Date.now()}.csv`);
      
      // Log the export
      await logExport(currentUser.uid, currentUser.email, {
        recordCount: data.length,
        format: format.toUpperCase()
      });
      
    } catch (error) {
      console.error('Export failed:', error);
    }
  };
  
  return (
    <button onClick={handleExport}>
      Export {format}
    </button>
  );
};

/**
 * Example: Tracking User Registration
 */

import { logAuthEvent } from '../services/analyticsService';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';

const RegisterComponent = () => {
  const handleRegister = async (email, password, displayName) => {
    try {
      // Create auth user
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      
      // Create user document
      await setDoc(doc(db, 'users', userCredential.user.uid), {
        email,
        displayName,
        accountStatus: 'active',
        creditLimit: 1000,
        createdAt: serverTimestamp(),
        lastActive: serverTimestamp()
      });
      
      // Create user credits document
      await setDoc(doc(db, 'userCredits', userCredential.user.uid), {
        creditsUsed: 0,
        totalApiCalls: 0,
        lastUsed: null
      });
      
      // Log the registration
      await logAuthEvent(
        userCredential.user.uid,
        userCredential.user.email,
        'User Registration',
        { method: 'Email/Password', displayName }
      );
      
      return userCredential;
      
    } catch (error) {
      await logError({
        action: 'Registration Failed',
        message: error.message,
        code: error.code,
        metadata: { email }
      });
      throw error;
    }
  };
  
  return (
    // Your registration form
    <div></div>
  );
};

/**
 * Example: Admin Action Logging
 */

import { logAdminAction } from '../services/analyticsService';
import { doc, updateDoc } from 'firebase/firestore';

const AdminUserActions = () => {
  const { currentUser } = useAuth(); // Admin user
  
  const suspendUser = async (targetUserId, reason) => {
    try {
      // Update user status
      const userRef = doc(db, 'users', targetUserId);
      await updateDoc(userRef, {
        accountStatus: 'suspended',
        suspendedAt: serverTimestamp(),
        suspendedBy: currentUser.uid,
        suspendReason: reason
      });
      
      // Log the admin action
      await logAdminAction(
        currentUser.uid,
        currentUser.email,
        'User Suspended',
        targetUserId,
        `Suspended user - Reason: ${reason}`
      );
      
    } catch (error) {
      console.error('Suspend user failed:', error);
    }
  };
  
  const updateCreditLimit = async (targetUserId, newLimit) => {
    try {
      // Update credit limit
      const userRef = doc(db, 'users', targetUserId);
      await updateDoc(userRef, {
        creditLimit: newLimit,
        limitUpdatedAt: serverTimestamp(),
        limitUpdatedBy: currentUser.uid
      });
      
      // Log the admin action
      await logAdminAction(
        currentUser.uid,
        currentUser.email,
        'Credit Limit Updated',
        targetUserId,
        `Updated credit limit to ${newLimit}`
      );
      
    } catch (error) {
      console.error('Update limit failed:', error);
    }
  };
  
  return (
    // Your admin actions UI
    <div></div>
  );
};

/**
 * Example: Credit Limit Alert System
 */

import { logCreditAlert } from '../services/analyticsService';
import { onSnapshot, doc } from 'firebase/firestore';

const CreditMonitor = ({ userId }) => {
  useEffect(() => {
    // Monitor user credits in real-time
    const unsubscribe = onSnapshot(
      doc(db, 'userCredits', userId),
      async (snapshot) => {
        const creditData = snapshot.data();
        const userDoc = await getDoc(doc(db, 'users', userId));
        const userData = userDoc.data();
        
        if (userData.creditLimit) {
          const usage = creditData.creditsUsed || 0;
          const limit = userData.creditLimit;
          const percentage = (usage / limit) * 100;
          
          // Alert at 80%
          if (percentage >= 80 && percentage < 100) {
            await logCreditAlert(userId, userData.email, {
              severity: 'warning',
              message: `User approaching credit limit (${percentage.toFixed(0)}%)`,
              usage,
              limit
            });
          }
          
          // Alert at 100%
          if (percentage >= 100) {
            await logCreditAlert(userId, userData.email, {
              severity: 'critical',
              message: 'User exceeded credit limit',
              usage,
              limit
            });
          }
        }
      }
    );
    
    return () => unsubscribe();
  }, [userId]);
  
  return null; // This is a monitoring component
};

export {
  SearchComponent,
  ExportButton,
  RegisterComponent,
  AdminUserActions,
  CreditMonitor
};
