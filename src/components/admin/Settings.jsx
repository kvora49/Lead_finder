import React, { useState, useEffect } from 'react';
import { doc, getDoc, updateDoc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { Settings as SettingsIcon, Key, Shield, Bell, Database, Mail, Globe, Save, AlertCircle, DollarSign } from 'lucide-react';
import { useAdminAuth } from '../../contexts/AdminAuthContext';
import { logAdminAction } from '../../services/analyticsService';
import CreditSettingsModal from './CreditSettingsModal';

/**
 * Settings Component
 * Real-time global application settings and configuration
 * Features: API keys, credit limits, notifications, email settings
 */
const Settings = () => {
  const { isSuperAdmin, currentAdmin } = useAdminAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCreditSettings, setShowCreditSettings] = useState(false);
  const [settings, setSettings] = useState({
    // API Settings
    rapidApiKey: '',
    apiRateLimit: 100,
    
    // Credit Settings
    defaultCreditLimit: 1000,
    creditCostPerSearch: 5,
    creditAlertThreshold: 80,
    
    // Email Settings
    emailNotifications: true,
    emailProvider: 'sendgrid',
    emailApiKey: '',
    notificationEmail: '',
    
    // Security Settings
    requireEmailVerification: true,
    autoApproveUsers: false,
    sessionTimeout: 30,
    
    // System Settings
    maintenanceMode: false,
    debugMode: false,
    maxResultsPerSearch: 100
  });

  useEffect(() => {
    // Set up real-time listener for settings
    const settingsRef = doc(db, 'systemConfig', 'global');
    
    const unsubscribe = onSnapshot(
      settingsRef,
      (doc) => {
        if (doc.exists()) {
          setSettings(prevSettings => ({ ...prevSettings, ...doc.data() }));
        }
        setLoading(false);
      },
      (error) => {
        console.error('Error fetching settings:', error);
        setLoading(false);
      }
    );

    // Cleanup listener
    return () => unsubscribe();
  }, []);

  const handleSave = async () => {
    if (!isSuperAdmin) {
      alert('Only Super Admins can modify settings');
      return;
    }

    try {
      setSaving(true);
      
      // Save settings to Firestore
      const settingsRef = doc(db, 'systemConfig', 'global');
      
      try {
        await updateDoc(settingsRef, {
          ...settings,
          updatedAt: new Date(),
          updatedBy: currentAdmin?.email || 'admin'
        });
      } catch (error) {
        // If document doesn't exist, create it
        await setDoc(settingsRef, {
          ...settings,
          createdAt: new Date(),
          updatedAt: new Date(),
          updatedBy: currentAdmin?.email || 'admin'
        });
      }

      // Log the admin action
      await logAdminAction(
        currentAdmin?.uid,
        currentAdmin?.email,
        'Settings Updated',
        null,
        'Updated system configuration'
      );
      
      alert('Settings saved successfully!');
      setSaving(false);
    } catch (error) {
      console.error('Error saving settings:', error);
      alert('Failed to save settings');
      setSaving(false);
    }
  };

  const handleChange = (field, value) => {
    setSettings({ ...settings, [field]: value });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Settings</h1>
          <p className="text-slate-400 mt-1">Configure global application settings</p>
        </div>
        <button
          onClick={handleSave}
          disabled={!isSuperAdmin || saving}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      {!isSuperAdmin && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-yellow-400 font-medium">Read-Only Mode</p>
            <p className="text-yellow-300/80 text-sm mt-1">
              Only Super Admins can modify settings. Contact your administrator to request changes.
            </p>
          </div>
        </div>
      )}

      {/* Credit System Settings */}
      <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-green-400" />
            Credit System Configuration
          </h3>
          <button
            onClick={() => setShowCreditSettings(true)}
            disabled={!isSuperAdmin}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <SettingsIcon className="w-4 h-4" />
            Configure Credit Mode
          </button>
        </div>
        <div className="bg-blue-500/10 border border-blue-500/50 rounded-lg p-4">
          <p className="text-blue-400 text-sm">
            <strong>Credit Mode:</strong> Determines whether users share a global credit pool or have individual limits.
            Click "Configure Credit Mode" to change between global and individual credit systems.
          </p>
        </div>
      </div>

      {/* API Settings */}
      <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Key className="w-5 h-5 text-blue-400" />
          API Configuration
        </h3>
        <div className="space-y-4">
          <div>
            <label className="text-slate-400 text-sm mb-2 block">RapidAPI Key</label>
            <input
              type="password"
              value={settings.rapidApiKey}
              onChange={(e) => handleChange('rapidApiKey', e.target.value)}
              disabled={!isSuperAdmin}
              placeholder="Enter your RapidAPI key"
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            />
          </div>
          
          <div>
            <label className="text-slate-400 text-sm mb-2 block">
              API Rate Limit (requests/minute)
            </label>
            <input
              type="number"
              value={settings.apiRateLimit}
              onChange={(e) => handleChange('apiRateLimit', parseInt(e.target.value))}
              disabled={!isSuperAdmin}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            />
          </div>

          <div>
            <label className="text-slate-400 text-sm mb-2 block">
              Max Results Per Search
            </label>
            <input
              type="number"
              value={settings.maxResultsPerSearch}
              onChange={(e) => handleChange('maxResultsPerSearch', parseInt(e.target.value))}
              disabled={!isSuperAdmin}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            />
          </div>
        </div>
      </div>

      {/* Credit Settings */}
      <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Database className="w-5 h-5 text-green-400" />
          Credit Configuration
        </h3>
        <div className="space-y-4">
          <div>
            <label className="text-slate-400 text-sm mb-2 block">
              Default Credit Limit (per user)
            </label>
            <input
              type="number"
              value={settings.defaultCreditLimit}
              onChange={(e) => handleChange('defaultCreditLimit', parseInt(e.target.value))}
              disabled={!isSuperAdmin}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            />
          </div>
          
          <div>
            <label className="text-slate-400 text-sm mb-2 block">
              Credits Cost Per Search
            </label>
            <input
              type="number"
              value={settings.creditCostPerSearch}
              onChange={(e) => handleChange('creditCostPerSearch', parseInt(e.target.value))}
              disabled={!isSuperAdmin}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            />
          </div>

          <div>
            <label className="text-slate-400 text-sm mb-2 block">
              Alert Threshold (%)
            </label>
            <input
              type="number"
              value={settings.creditAlertThreshold}
              onChange={(e) => handleChange('creditAlertThreshold', parseInt(e.target.value))}
              disabled={!isSuperAdmin}
              min="0"
              max="100"
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            />
            <p className="text-slate-500 text-xs mt-1">
              Alert when user reaches this percentage of their credit limit
            </p>
          </div>
        </div>
      </div>

      {/* Email Settings */}
      <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Mail className="w-5 h-5 text-purple-400" />
          Email Configuration
        </h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white font-medium">Email Notifications</p>
              <p className="text-slate-400 text-sm">Send automated email notifications</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.emailNotifications}
                onChange={(e) => handleChange('emailNotifications', e.target.checked)}
                disabled={!isSuperAdmin}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          <div>
            <label className="text-slate-400 text-sm mb-2 block">Email Provider</label>
            <select
              value={settings.emailProvider}
              onChange={(e) => handleChange('emailProvider', e.target.value)}
              disabled={!isSuperAdmin}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            >
              <option value="sendgrid">SendGrid</option>
              <option value="mailgun">Mailgun</option>
              <option value="smtp">SMTP</option>
            </select>
          </div>

          <div>
            <label className="text-slate-400 text-sm mb-2 block">Email API Key</label>
            <input
              type="password"
              value={settings.emailApiKey}
              onChange={(e) => handleChange('emailApiKey', e.target.value)}
              disabled={!isSuperAdmin}
              placeholder="Enter email service API key"
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            />
          </div>

          <div>
            <label className="text-slate-400 text-sm mb-2 block">
              Notification Email
            </label>
            <input
              type="email"
              value={settings.notificationEmail}
              onChange={(e) => handleChange('notificationEmail', e.target.value)}
              disabled={!isSuperAdmin}
              placeholder="admin@company.com"
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            />
            <p className="text-slate-500 text-xs mt-1">
              Admin email for system notifications
            </p>
          </div>
        </div>
      </div>

      {/* Security Settings */}
      <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Shield className="w-5 h-5 text-red-400" />
          Security Configuration
        </h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white font-medium">Require Email Verification</p>
              <p className="text-slate-400 text-sm">Users must verify email before access</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.requireEmailVerification}
                onChange={(e) => handleChange('requireEmailVerification', e.target.checked)}
                disabled={!isSuperAdmin}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-white font-medium">Auto-Approve New Users</p>
              <p className="text-slate-400 text-sm">Automatically activate new registrations</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.autoApproveUsers}
                onChange={(e) => handleChange('autoApproveUsers', e.target.checked)}
                disabled={!isSuperAdmin}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          <div>
            <label className="text-slate-400 text-sm mb-2 block">
              Session Timeout (minutes)
            </label>
            <input
              type="number"
              value={settings.sessionTimeout}
              onChange={(e) => handleChange('sessionTimeout', parseInt(e.target.value))}
              disabled={!isSuperAdmin}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            />
          </div>
        </div>
      </div>

      {/* System Settings */}
      <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Globe className="w-5 h-5 text-orange-400" />
          System Configuration
        </h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
            <div>
              <p className="text-white font-medium">Maintenance Mode</p>
              <p className="text-slate-400 text-sm">Disable app for all users (admins only)</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.maintenanceMode}
                onChange={(e) => handleChange('maintenanceMode', e.target.checked)}
                disabled={!isSuperAdmin}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-red-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-600"></div>
            </label>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-white font-medium">Debug Mode</p>
              <p className="text-slate-400 text-sm">Enable detailed error logging</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.debugMode}
                onChange={(e) => handleChange('debugMode', e.target.checked)}
                disabled={!isSuperAdmin}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>
        </div>
      </div>

      {/* Credit Settings Modal */}
      {showCreditSettings && (
        <CreditSettingsModal
          adminUser={currentAdmin}
          onClose={() => setShowCreditSettings(false)}
          onUpdate={() => {
            // Settings updated successfully
          }}
        />
      )}
    </div>
  );
};

export default Settings;
