/**
 * Admin Data Seeder Component
 * Accessible from Admin Dashboard to populate test data
 */

import { useState } from 'react';
import { Database, AlertCircle, CheckCircle2 } from 'lucide-react';
import { collection, doc, setDoc, getDocs, Timestamp, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAdminAuth } from '../../contexts/AdminAuthContext';

const DataSeeder = () => {
  const { adminUser } = useAdminAuth();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const seedData = async () => {
    setLoading(true);
    setError('');
    setStatus('Starting data seeding...');

    try {
      // 1. Global Credits
      setStatus('Creating global credits...');
      await setDoc(doc(db, 'globalCredits', 'shared'), {
        totalApiCalls: 504,
        createdAt: serverTimestamp(),
        lastUpdated: serverTimestamp()
      });

      // 2. System Config
      setStatus('Creating system config...');
      await setDoc(doc(db, 'systemConfig', 'creditSystem'), {
        mode: 'global',
        globalLimit: 200000,
        defaultUserLimit: 1000,
        updatedAt: serverTimestamp(),
        updatedBy: adminUser?.email || 'admin'
      });

      // 3. System Logs
      setStatus('Creating system logs...');
      const logs = [
        { action: 'user_login', severity: 'info', details: 'User logged in successfully', hoursAgo: 1 },
        { action: 'search_performed', severity: 'info', details: 'Search completed for restaurants in Mumbai', hoursAgo: 2 },
        { action: 'export_excel', severity: 'info', details: 'Excel export completed', hoursAgo: 3 },
        { action: 'credit_deducted', severity: 'info', details: '45 credits deducted for API calls', hoursAgo: 4 },
        { action: 'user_registered', severity: 'info', details: 'New user registered', hoursAgo: 12 },
        { action: 'admin_action', severity: 'info', details: 'Admin updated credit settings', hoursAgo: 24 }
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

      // 4. Monthly Analytics (last 6 months)
      setStatus('Creating monthly analytics...');
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

      setStatus('✅ Data seeded successfully! Refresh the dashboard to see changes.');
      setLoading(false);
    } catch (err) {
      console.error('Seeding error:', err);
      setError(err.message || 'Failed to seed data');
      setLoading(false);
    }
  };

  const checkExistingData = async () => {
    setLoading(true);
    setStatus('Checking existing data...');

    try {
      const logsSnapshot = await getDocs(collection(db, 'systemLogs'));
      const analyticsSnapshot = await getDocs(collection(db, 'monthlyAnalytics'));
      const usersSnapshot = await getDocs(collection(db, 'users'));

      setStatus(`
        📊 Current Data:
        - System Logs: ${logsSnapshot.size}
        - Monthly Analytics: ${analyticsSnapshot.size} months
        - Users: ${usersSnapshot.size}
        - Note: Global credits and config are single documents
      `);
      setLoading(false);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-lg p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 bg-blue-100 rounded-lg">
          <Database className="w-6 h-6 text-blue-600" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-gray-800">Database Seeder</h2>
          <p className="text-sm text-gray-600">Populate test data for dashboard testing</p>
        </div>
      </div>

      <div className="space-y-4">
        {/* Status Display */}
        {status && (
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-gray-700 whitespace-pre-line">{status}</p>
            </div>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            onClick={seedData}
            disabled={loading}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium px-6 py-3 rounded-lg transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Database className="w-5 h-5" />
            {loading ? 'Seeding...' : 'Seed Test Data'}
          </button>

          <button
            onClick={checkExistingData}
            disabled={loading}
            className="flex items-center gap-2 bg-gray-600 hover:bg-gray-700 text-white font-medium px-6 py-3 rounded-lg transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Check Existing Data
          </button>
        </div>

        {/* Info */}
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <h3 className="font-semibold text-gray-800 mb-2">What this does:</h3>
          <ul className="text-sm text-gray-700 space-y-1 list-disc list-inside">
            <li>Creates global credits document (504 API calls)</li>
            <li>Sets up system config (global credit mode)</li>
            <li>Generates 6 sample system logs</li>
            <li>Creates 6 months of analytics data (Aug 2025 - Jan 2026)</li>
            <li>Does NOT create user accounts (users must register normally)</li>
          </ul>
          <p className="text-sm text-gray-600 mt-3">
            <strong>Note:</strong> After seeding, refresh the dashboard to see updated stats.
            User data will appear once actual users register and use the app.
          </p>
        </div>
      </div>
    </div>
  );
};

export default DataSeeder;
