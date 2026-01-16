import { db } from '../firebase';
import { doc, getDoc, setDoc, updateDoc, increment, onSnapshot, collection, getDocs } from 'firebase/firestore';

/**
 * Credit Service - Manages GLOBAL credits synced across ALL users via Firestore
 * All users share the same credit counter
 */

const CREDITS_COLLECTION = 'globalCredits';
const GLOBAL_DOC_ID = 'shared'; // Single document for all users

/**
 * Get current month identifier (YYYY-MM)
 */
const getCurrentMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

/**
 * Initialize global credits (shared by all users)
 * Checks for old credit data and migrates if needed
 * @returns {Promise<Object>} Credit data
 */
export const initializeGlobalCredits = async () => {
  const currentMonth = getCurrentMonth();
  const docRef = doc(db, CREDITS_COLLECTION, GLOBAL_DOC_ID);

  try {
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      console.log('📝 globalCredits/shared not found, checking for old data...');
      
      // Check if old data exists in globalCredits collection (different doc IDs)
      try {
        const collectionRef = collection(db, CREDITS_COLLECTION);
        const snapshot = await getDocs(collectionRef);
        
        let oldData = null;
        snapshot.forEach(doc => {
          if (doc.id !== GLOBAL_DOC_ID) {
            console.log('🔍 Found old credit document:', doc.id, doc.data());
            oldData = doc.data();
          }
        });

        // If old data found, migrate it to the new 'shared' document
        if (oldData && oldData.totalApiCalls) {
          console.log('🔄 Migrating old credit data:', oldData.totalApiCalls);
          const migratedData = {
            currentMonth,
            totalApiCalls: oldData.totalApiCalls || 0,
            lastUpdated: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            migratedFrom: 'old-structure'
          };
          await setDoc(docRef, migratedData);
          return migratedData;
        }
      } catch (migrationError) {
        console.warn('Could not check for old data:', migrationError);
      }

      // No old data - create fresh document
      const initialData = {
        currentMonth,
        totalApiCalls: 0,
        lastUpdated: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      };
      await setDoc(docRef, initialData);
      return initialData;
    }

    const data = docSnap.data();

    // Check if month changed - reset credits
    if (data.currentMonth !== currentMonth) {
      const resetData = {
        ...data,
        currentMonth,
        totalApiCalls: 0,
        lastUpdated: new Date().toISOString(),
      };
      await updateDoc(docRef, resetData);
      return resetData;
    }

    return data;
  } catch (error) {
    console.error('Error initializing global credits:', error);
    throw error;
  }
};

/**
 * Get global credit balance (shared by all users)
 * @returns {Promise<number>} Total API calls used this month
 */
export const getGlobalCredits = async () => {
  try {
    const data = await initializeGlobalCredits();
    return data.totalApiCalls || 0;
  } catch (error) {
    console.error('Error getting global credits:', error);
    return 0;
  }
};

/**
 * Add credits to global counter (increment API call count)
 * @param {number} amount - Number of API calls to add
 * @returns {Promise<number>} New total
 */
export const addGlobalCredits = async (amount = 1) => {
  const docRef = doc(db, CREDITS_COLLECTION, GLOBAL_DOC_ID);
  const currentMonth = getCurrentMonth();

  try {
    // First ensure document exists and month is current
    await initializeGlobalCredits();

    // Increment the counter
    await updateDoc(docRef, {
      totalApiCalls: increment(amount),
      lastUpdated: new Date().toISOString(),
      currentMonth,
    });

    // Get updated value
    const docSnap = await getDoc(docRef);
    return docSnap.data().totalApiCalls;
  } catch (error) {
    console.error('Error adding global credits:', error);
    throw error;
  }
};

/**
 * Subscribe to global credit updates in real-time
 * @param {Function} callback - Function to call when credits update
 * @returns {Function} Unsubscribe function
 */
export const subscribeToGlobalCredits = (callback) => {
  const docRef = doc(db, CREDITS_COLLECTION, GLOBAL_DOC_ID);

  const unsubscribe = onSnapshot(docRef, (doc) => {
    if (doc.exists()) {
      const data = doc.data();
      const currentMonth = getCurrentMonth();

      // Check if month changed
      if (data.currentMonth !== currentMonth) {
        // Month changed - reset credits
        initializeGlobalCredits().then((resetData) => {
          callback(resetData.totalApiCalls || 0);
        }).catch(err => {
          console.error('Error resetting credits:', err);
          callback(0);
        });
      } else {
        callback(data.totalApiCalls || 0);
      }
    } else {
      // Document doesn't exist yet - initialize it
      console.log('📝 Global credits document not found, creating...');
      initializeGlobalCredits().then((data) => {
        console.log('✅ Global credits initialized:', data);
        callback(data.totalApiCalls || 0);
      }).catch(err => {
        console.error('❌ Error initializing credits:', err);
        callback(0);
      });
    }
  }, (error) => {
    console.error('Error subscribing to global credits:', error);
    // Still call callback with 0 to avoid UI freeze
    callback(0);
  });

  return unsubscribe;
};

/**
 * Manually reset global credits (admin function)
 */
export const resetGlobalCredits = async () => {
  const docRef = doc(db, CREDITS_COLLECTION, GLOBAL_DOC_ID);
  const currentMonth = getCurrentMonth();

  try {
    await updateDoc(docRef, {
      totalApiCalls: 0,
      currentMonth,
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error resetting global credits:', error);
    throw error;
  }
};

/**
 * Get credit statistics for display
 * @param {number} totalCalls - Total API calls used
 * @returns {Object} Credit statistics
 */
export const getCreditStats = (totalCalls) => {
  const costPerRequest = 32; // $32 per 1000 requests
  const totalCost = (totalCalls * costPerRequest) / 1000;

  return {
    totalCalls,
    totalCost: totalCost.toFixed(2),
    remainingCalls: totalCalls < 1000 ? 1000 - totalCalls : 0,
    percentageUsed: Math.min((totalCalls / 1000) * 100, 100).toFixed(1),
  };
};

// Backward compatibility wrappers (ignore userId parameter, use global functions)
export const initializeUserCredits = async (userId) => {
  console.log('⚠️ Using backward compatibility: initializeUserCredits → initializeGlobalCredits');
  return initializeGlobalCredits();
};

export const getUserCredits = async (userId) => {
  console.log('⚠️ Using backward compatibility: getUserCredits → getGlobalCredits');
  return getGlobalCredits();
};

export const addCredits = async (userId, amount = 1) => {
  console.log('⚠️ Using backward compatibility: addCredits → addGlobalCredits');
  return addGlobalCredits(amount);
};

export const subscribeToCredits = (userId, callback) => {
  console.log('⚠️ Using backward compatibility: subscribeToCredits → subscribeToGlobalCredits');
  return subscribeToGlobalCredits(callback);
};

export const resetUserCredits = async (userId) => {
  console.log('⚠️ Using backward compatibility: resetUserCredits → resetGlobalCredits');
  return resetGlobalCredits();
};
