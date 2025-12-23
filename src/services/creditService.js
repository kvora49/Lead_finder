import { db } from '../firebase';
import { doc, getDoc, setDoc, updateDoc, increment } from 'firebase/firestore';

/**
 * Credit Service - Manages user credits synced across all devices via Firestore
 */

const CREDITS_COLLECTION = 'userCredits';

/**
 * Get current month identifier (YYYY-MM)
 */
const getCurrentMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

/**
 * Initialize credits for a new user or new month
 * @param {string} userId - User's Firebase UID
 * @returns {Promise<Object>} Credit data
 */
export const initializeUserCredits = async (userId) => {
  const currentMonth = getCurrentMonth();
  const userDocRef = doc(db, CREDITS_COLLECTION, userId);

  try {
    const docSnap = await getDoc(userDocRef);

    if (!docSnap.exists()) {
      // New user - create initial credit document
      const initialData = {
        userId,
        currentMonth,
        totalApiCalls: 0,
        lastUpdated: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      };
      await setDoc(userDocRef, initialData);
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
      await updateDoc(userDocRef, resetData);
      return resetData;
    }

    return data;
  } catch (error) {
    console.error('Error initializing credits:', error);
    throw error;
  }
};

/**
 * Get user's current credit balance
 * @param {string} userId - User's Firebase UID
 * @returns {Promise<number>} Total API calls used this month
 */
export const getUserCredits = async (userId) => {
  try {
    const data = await initializeUserCredits(userId);
    return data.totalApiCalls || 0;
  } catch (error) {
    console.error('Error getting credits:', error);
    return 0;
  }
};

/**
 * Add credits (increment API call count)
 * @param {string} userId - User's Firebase UID
 * @param {number} amount - Number of API calls to add
 * @returns {Promise<number>} New total
 */
export const addCredits = async (userId, amount = 1) => {
  const userDocRef = doc(db, CREDITS_COLLECTION, userId);
  const currentMonth = getCurrentMonth();

  try {
    // First ensure user exists and month is current
    await initializeUserCredits(userId);

    // Increment the counter
    await updateDoc(userDocRef, {
      totalApiCalls: increment(amount),
      lastUpdated: new Date().toISOString(),
      currentMonth,
    });

    // Get updated value
    const docSnap = await getDoc(userDocRef);
    return docSnap.data().totalApiCalls;
  } catch (error) {
    console.error('Error adding credits:', error);
    throw error;
  }
};

/**
 * Subscribe to credit updates in real-time
 * @param {string} userId - User's Firebase UID
 * @param {Function} callback - Function to call when credits update
 * @returns {Function} Unsubscribe function
 */
export const subscribeToCredits = (userId, callback) => {
  const userDocRef = doc(db, CREDITS_COLLECTION, userId);

  // Use Firestore's onSnapshot for real-time updates
  const { onSnapshot } = require('firebase/firestore');
  
  const unsubscribe = onSnapshot(userDocRef, (doc) => {
    if (doc.exists()) {
      const data = doc.data();
      const currentMonth = getCurrentMonth();

      // Check if month changed
      if (data.currentMonth !== currentMonth) {
        // Month changed - reset credits
        initializeUserCredits(userId).then((resetData) => {
          callback(resetData.totalApiCalls || 0);
        });
      } else {
        callback(data.totalApiCalls || 0);
      }
    } else {
      // Document doesn't exist yet - initialize
      initializeUserCredits(userId).then((data) => {
        callback(data.totalApiCalls || 0);
      });
    }
  }, (error) => {
    console.error('Error subscribing to credits:', error);
  });

  return unsubscribe;
};

/**
 * Manually reset credits (admin function)
 * @param {string} userId - User's Firebase UID
 */
export const resetUserCredits = async (userId) => {
  const userDocRef = doc(db, CREDITS_COLLECTION, userId);
  const currentMonth = getCurrentMonth();

  try {
    await updateDoc(userDocRef, {
      totalApiCalls: 0,
      currentMonth,
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error resetting credits:', error);
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
