import { collection, addDoc, doc, updateDoc, increment, serverTimestamp, getDocs, query, where, getDoc, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { triggerSystemEmail } from './notificationService';

/**
 * Analytics Service
 * Tracks user activity and system events in real-time
 */

// Log system activity
export const logActivity = async (activityData) => {
  try {
    const logEntry = {
      timestamp: serverTimestamp(),
      type: activityData.type || 'general',
      severity: activityData.severity || 'info',
      action: activityData.action,
      user: activityData.user || activityData.userEmail,
      userEmail: activityData.userEmail || '',
      userId: activityData.userId || '',
      // Track WHO the action was performed ON (target user for admin actions)
      targetUserEmail: activityData.targetUserEmail || '',
      targetUserId: activityData.targetUserId || '',
      details: activityData.details || '',
      userAgent: activityData.userAgent || navigator.userAgent || '',
      ...activityData.metadata
    };

    // Only add ip field if it exists (remove undefined fields)
    if (activityData.ip) {
      logEntry.ip = activityData.ip;
    }

    await addDoc(collection(db, 'systemLogs'), logEntry);
    return true;
  } catch (error) {
    console.error('Error logging activity:', error);
    return false;
  }
};

// Log user authentication events
export const logAuthEvent = async (userId, userEmail, eventType, details = {}) => {
  try {
    const logData = {
      type: 'auth',
      severity: 'info',
      action: eventType,
      user: userEmail,
      userEmail,
      userId,
      details: typeof details === 'string' ? details : JSON.stringify(details),
      userAgent: navigator.userAgent
    };

    // Only add ip if provided
    if (details.ip) {
      logData.ip = details.ip;
    }

    await logActivity(logData);

    // Update user's last active timestamp
    if (userId) {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        lastActive: serverTimestamp()
      });
    }
  } catch (error) {
    console.error('Error logging auth event:', error);
  }
};

// Log search activity
export const logSearch = async (userId, userEmail, searchData) => {
  try {
    const searchLog = {
      timestamp: serverTimestamp(),
      userId,
      userEmail,
      keyword: searchData.keyword,
      searchQuery: searchData.query,
      location: searchData.location,
      resultCount: searchData.resultCount || 0,
      responseTime: searchData.responseTime, // in milliseconds
      success: searchData.resultCount > 0,
      filters: searchData.filters || {},
      metadata: searchData.metadata || {}
    };

    await addDoc(collection(db, 'searchLogs'), searchLog);

    // Log general activity
    await logActivity({
      type: 'search',
      severity: 'info',
      action: 'Search Performed',
      user: userEmail,
      userEmail,
      userId,
      details: `Search: "${searchData.keyword}" in ${searchData.location || 'all locations'} - ${searchData.resultCount} results`,
      creditsUsed: searchData.creditsUsed || 0
    });

    return true;
  } catch (error) {
    console.error('Error logging search:', error);
    return false;
  }
};

// Update user credit usage
// NOTE: writes directly to users/{userId} — the single source of truth.
// The legacy `userCredits` collection is deprecated.
export const updateCreditUsage = async (userId, creditsUsed) => {
  try {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      creditsUsed: increment(creditsUsed),
      searchCount: increment(1),
      lastActive:  serverTimestamp(),
    });
    return true;
  } catch (error) {
    console.error('Error updating credit usage:', error);
    return false;
  }
};

// Log data export
export const logExport = async (userId, userEmail, exportData) => {
  try {
    await logActivity({
      type: 'export',
      severity: 'info',
      action: 'Data Export',
      user: userEmail,
      userEmail,
      userId,
      details: `Exported ${exportData.recordCount} records to ${exportData.format || 'CSV'}`,
      recordCount: exportData.recordCount,
      format: exportData.format || 'CSV'
    });

    return true;
  } catch (error) {
    console.error('Error logging export:', error);
    return false;
  }
};

// Log admin actions
export const logAdminAction = async (adminId, adminEmail, action, targetUserId, details) => {
  try {
    let targetUserEmail = '';
    
    // Fetch target user's email if targetUserId is provided
    if (targetUserId) {
      try {
        const userRef = doc(db, 'users', targetUserId);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          targetUserEmail = userSnap.data().email || '';
        }
      } catch (fetchErr) {
        console.warn('Could not fetch target user email:', fetchErr);
      }
    }
    
    await logActivity({
      type: 'admin',
      severity: action.includes('suspend') || action.includes('delete') ? 'warning' : 'info',
      action,
      user: adminEmail,
      userEmail: adminEmail,
      userId: adminId,
      targetUserId: targetUserId || '',
      targetUserEmail: targetUserEmail,
      details,
      metadata: {
        isAdminAction: true
      }
    });

    return true;
  } catch (error) {
    console.error('Error logging admin action:', error);
    return false;
  }
};

// Log errors
export const logError = async (errorData) => {
  try {
    await logActivity({
      type: 'system',
      severity: 'error',
      action: errorData.action || 'Error Occurred',
      user: errorData.user || 'system',
      userEmail: errorData.userEmail,
      userId: errorData.userId,
      details: errorData.message || errorData.details,
      errorCode: errorData.code,
      stack: errorData.stack,
      metadata: errorData.metadata
    });

    return true;
  } catch (error) {
    console.error('Error logging error:', error);
    return false;
  }
};

// Log credit limit alerts
export const logCreditAlert = async (userId, userEmail, alertData) => {
  try {
    await logActivity({
      type: 'credit',
      severity: alertData.severity || 'warning',
      action: 'Credit Limit Alert',
      user: userEmail,
      userEmail,
      userId,
      details: alertData.message,
      creditUsage: alertData.usage,
      creditLimit: alertData.limit
    });

    return true;
  } catch (error) {
    console.error('Error logging credit alert:', error);
    return false;
  }
};

// Create a persistent credit top-up request for admin review
export const createCreditRequest = async (requestData) => {
  try {
    if (!requestData.userId) {
      console.error('[createCreditRequest] Missing userId');
      return { ok: false, error: 'User ID is required' };
    }

    const payload = {
      userId: requestData.userId,
      userEmail: requestData.userEmail || '',
      keyword: requestData.keyword || '',
      location: requestData.location || '',
      scope: requestData.scope || 'city',
      estimatedCostUsd: Number(requestData.estimatedCostUsd || 0),
      remainingUsd: Number(requestData.remainingUsd || 0),
      requestedAmountUsd: Number(requestData.requestedAmountUsd || 0),
      reason: requestData.reason || 'Insufficient credits for search',
      status: 'pending',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    console.log('[createCreditRequest] Auth UID:', requestData.userId);
    console.log('[createCreditRequest] Payload:', payload);

    // Write to credit_requests collection
    let docRef;
    try {
      docRef = await addDoc(collection(db, 'credit_requests'), payload);
      console.log('[createCreditRequest] ✅ Document created:', docRef.id);
    } catch (firebaseError) {
      console.error('[createCreditRequest] ❌ Firebase write failed:', {
        code: firebaseError.code,
        message: firebaseError.message,
      });
      throw firebaseError;
    }

    // Log to system logs (non-blocking - don't fail the request if this fails)
    try {
      await logActivity({
        type: 'credit',
        severity: 'warning',
        action: 'Credit Top-up Requested',
        user: payload.userEmail,
        userEmail: payload.userEmail,
        userId: payload.userId,
        details: `Requested ${payload.scope} search - Top-up: $${payload.requestedAmountUsd.toFixed(2)}`,
        metadata: {
          requestId: docRef.id,
          estimatedCostUsd: payload.estimatedCostUsd,
          remainingUsd: payload.remainingUsd,
          requestedAmountUsd: payload.requestedAmountUsd,
          status: payload.status,
        },
      });
    } catch (logError) {
      console.warn('[createCreditRequest] Log activity failed (non-critical):', logError.message);
      // Don't throw - request was already created successfully
    }

    // Trigger admin email notifications (supports multiple recipients from settings)
    try {
      await triggerSystemEmail('credit_request', {
        requestId: docRef.id,
        userEmail: payload.userEmail,
        requestedAmountUsd: payload.requestedAmountUsd,
        remainingUsd: payload.remainingUsd,
        reason: payload.reason,
      });
    } catch (emailErr) {
      console.warn('[createCreditRequest] Email trigger failed (non-critical):', emailErr?.message || emailErr);
    }

    return { ok: true, id: docRef.id };
  } catch (error) {
    console.error('[createCreditRequest] ❌ Error:', {
      code: error.code,
      message: error.message,
    });
    
    let userMessage = error.message || 'Failed to create credit request';
    if (error.code === 'permission-denied') {
      userMessage = 'Permission denied. Please try again or contact support.';
    } else if (error.code === 'unauthenticated') {
      userMessage = 'You need to be logged in to submit requests.';
    } else if (error.code === 'not-found') {
      userMessage = 'Collection not found. Try refreshing the page.';
    }
    
    return { ok: false, error: userMessage };
  }
};

// Update monthly analytics
export const updateMonthlyAnalytics = async (monthKey, analyticsData) => {
  try {
    const analyticsRef = doc(db, 'monthlyAnalytics', monthKey);
    
    await updateDoc(analyticsRef, {
      totalCost: increment(analyticsData.cost || 0),
      totalApiCalls: increment(analyticsData.apiCalls || 0),
      totalSearches: increment(analyticsData.searches || 0),
      activeUsers: analyticsData.activeUsers,
      updatedAt: serverTimestamp()
    });

    return true;
  } catch (error) {
    // If document doesn't exist, create it
    try {
      await addDoc(collection(db, 'monthlyAnalytics'), {
        month: monthKey,
        monthLabel: new Date().toLocaleDateString('en-US', { month: 'short' }),
        totalCost: analyticsData.cost || 0,
        totalApiCalls: analyticsData.apiCalls || 0,
        totalSearches: analyticsData.searches || 0,
        activeUsers: analyticsData.activeUsers || 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      return true;
    } catch (createError) {
      console.error('Error updating monthly analytics:', createError);
      return false;
    }
  }
};

// Get current month key
export const getCurrentMonthKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

export default {
  logActivity,
  logAuthEvent,
  logSearch,
  updateCreditUsage,
  logExport,
  logAdminAction,
  logError,
  logCreditAlert,
  createCreditRequest,
  updateMonthlyAnalytics,
  getCurrentMonthKey
};
