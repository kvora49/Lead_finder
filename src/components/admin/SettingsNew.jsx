import { useState, useEffect } from 'react';
import { 
  Settings as SettingsIcon, 
  Save, 
  RotateCcw,
  Shield,
  Mail,
  Bell,
  Globe,
  Calendar,
  AlertCircle,
  CheckCircle,
  Zap,
  Lock
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAdminAuth } from '../../contexts/AdminAuthContext';
import { logAdminAction } from '../../services/analyticsService';
import { toast } from 'sonner';

const SettingsNew = () => {
  const navigate = useNavigate();
  const { adminUser, adminRole, isSuperAdmin, canEditSettings } = useAdminAuth();
  // canEditSettings = isSuperAdmin (owner + super_admin). Admin role cannot access.
  const canEdit = canEditSettings;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('general');

  // Hard redirect: admin role cannot access settings at all (not even read-only)
  useEffect(() => {
    if (!loading && !canEditSettings) navigate('/admin/dashboard', { replace: true });
  }, [loading, canEditSettings, navigate]);
  
  const [settings, setSettings] = useState({
    // General Settings
    globalCreditLimit: 200,
    defaultUserCreditLimit: 50,
    monthlyResetEnabled: true,
    monthlyResetDate: 1,
    
    // Email Settings
    emailNotificationsEnabled: true,
    adminNotificationEmail: '',
    sendWelcomeEmail: true,
    sendCreditAlerts: true,
    
    // Alert Settings
    creditAlertThreshold: 80,
    userLimitAlertEnabled: true,
    systemHealthAlertsEnabled: true,
    
    // Access Control
    requireEmailVerification: false,
    autoApproveUsers: true,
    allowedDomains: [],
    blockedDomains: [],
    
    // Maintenance
    maintenanceMode: false,
    maintenanceMessage: 'System under maintenance. Please check back later.',
    
    // Last Modified
    lastModified: null,
    lastModifiedBy: null
  });

  const [originalSettings, setOriginalSettings] = useState({});

  const normalizeEmailList = (raw) => {
    const items = String(raw || '')
      .split(',')
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean)
      .filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));

    return [...new Set(items)].join(', ');
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const settingsRef = doc(db, 'systemConfig', 'globalSettings');
      const settingsDoc = await getDoc(settingsRef);
      
      if (settingsDoc.exists()) {
        const data = settingsDoc.data();
        setSettings(prev => ({ ...prev, ...data }));
        setOriginalSettings({ ...settings, ...data });
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!canEdit) {
      toast.error('Only Super Admins can modify system settings');
      return;
    }

    setSaving(true);
    try {
      const settingsRef = doc(db, 'systemConfig', 'globalSettings');
      
      const updatedSettings = {
        ...settings,
        adminNotificationEmail: normalizeEmailList(settings.adminNotificationEmail),
        lastModified: serverTimestamp(),
        lastModifiedBy: adminUser?.email || 'admin'
      };

      // Track what changed for audit logging
      const changedFields = [];
      Object.keys(settings).forEach(key => {
        if (key !== 'lastModified' && key !== 'lastModifiedBy') {
          const oldValue = originalSettings[key];
          const newValue = settings[key];
          if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
            changedFields.push(`${key}: ${JSON.stringify(oldValue)} → ${JSON.stringify(newValue)}`);
          }
        }
      });

      const changeDetails = changedFields.length > 0 
        ? `Updated ${activeTab} settings: ${changedFields.join('; ')}`
        : `Updated ${activeTab} settings`;

      await setDoc(settingsRef, updatedSettings, { merge: true });

      await logAdminAction(
        adminUser?.uid,
        adminUser?.email,
        'System Settings Updated',
        null,
        changeDetails
      );

      setOriginalSettings(updatedSettings);
      toast.success('Settings saved successfully!');
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error('Failed to save settings. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    // eslint-disable-next-line no-restricted-globals
    if (confirm('Reset to last saved settings?')) {
      setSettings(originalSettings);
    }
  };

  const TabButton = ({ id, label, icon: Icon }) => (
    <button
      onClick={() => setActiveTab(id)}
      className={`flex items-center gap-2 px-4 py-3 rounded-lg transition-all ${
        activeTab === id
          ? 'bg-blue-600 text-white'
          : 'bg-slate-800/50 text-gray-400 hover:bg-slate-800 hover:text-white'
      }`}
    >
      <Icon className="w-4 h-4" />
      <span className="font-medium">{label}</span>
    </button>
  );

  const SettingRow = ({ label, description, children }) => (
    <div className="bg-slate-800/30 rounded-lg p-4 border border-slate-700/50">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex-1">
          <label className="block text-white font-medium mb-1">{label}</label>
          {description && <p className="text-sm text-gray-400">{description}</p>}
        </div>
        <div className="md:w-1/3">{children}</div>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-400">Loading settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">System Settings & Configuration</h1>
          <p className="text-gray-400">Manage global system settings and preferences</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleReset}
            className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Reset
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !canEdit}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Permission Warning */}
      {!canEdit && (
        <div className="bg-yellow-500/20 border border-yellow-500/30 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-semibold text-yellow-400 mb-1">View Only Mode</h4>
              <p className="text-sm text-gray-300">Only Super Admins can modify system settings.</p>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-3">
        <TabButton id="general" label="General" icon={SettingsIcon} />
        <TabButton id="credits" label="Credits" icon={Zap} />
        <TabButton id="email" label="Email" icon={Mail} />
        <TabButton id="alerts" label="Alerts" icon={Bell} />
        <TabButton id="access" label="Access Control" icon={Shield} />
        <TabButton id="maintenance" label="Maintenance" icon={Globe} />
      </div>

      {/* Settings Content */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6 space-y-4">
        {/* General Settings */}
        {activeTab === 'general' && (
          <>
            <h2 className="text-xl font-bold text-white mb-4">General Settings</h2>
            
            <SettingRow
              label="Maintenance Mode"
              description="Enable maintenance mode to restrict user access"
            >
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.maintenanceMode}
                  onChange={(e) => setSettings({ ...settings, maintenanceMode: e.target.checked })}
                  className="sr-only peer"
                  disabled={!canEdit}
                />
                <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </SettingRow>

            {settings.maintenanceMode && (
              <SettingRow
                label="Maintenance Message"
                description="Message shown to users during maintenance"
              >
                <input
                  type="text"
                  value={settings.maintenanceMessage}
                  onChange={(e) => setSettings({ ...settings, maintenanceMessage: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={!canEdit}
                />
              </SettingRow>
            )}
          </>
        )}

        {/* Credit Settings */}
        {activeTab === 'credits' && (
          <>
            <h2 className="text-xl font-bold text-white mb-4">Credit Management</h2>
            
            <SettingRow
              label="Global Monthly Budget Limit (USD)"
              description="Maximum total monthly API spend allowed system-wide"
            >
              <input
                type="number"
                value={settings.globalCreditLimit}
                onChange={(e) => setSettings({ ...settings, globalCreditLimit: parseInt(e.target.value) || 0 })}
                className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={!canEdit}
              />
            </SettingRow>

            <SettingRow
              label="Default User Monthly Budget (USD)"
              description="Default monthly API spend limit applied to new users"
            >
              <select
                value={settings.defaultUserCreditLimit}
                onChange={(e) => setSettings({ ...settings, defaultUserCreditLimit: e.target.value === 'unlimited' ? 'unlimited' : parseInt(e.target.value) })}
                className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={!canEdit}
              >
                <option value="25">$25 monthly</option>
                <option value="50">$50 monthly</option>
                <option value="75">$75 monthly</option>
                <option value="100">$100 monthly</option>
                <option value="150">$150 monthly</option>
                <option value="200">$200 monthly</option>
                <option value="unlimited">Unlimited</option>
              </select>
            </SettingRow>

            <SettingRow
              label="Monthly Credit Reset"
              description="Automatically reset credits each month"
            >
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.monthlyResetEnabled}
                  onChange={(e) => setSettings({ ...settings, monthlyResetEnabled: e.target.checked })}
                  className="sr-only peer"
                  disabled={!canEdit}
                />
                <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </SettingRow>

            {settings.monthlyResetEnabled && (
              <SettingRow
                label="Reset Date (Day of Month)"
                description="Day of month to reset credits (1-28)"
              >
                <input
                  type="number"
                  min="1"
                  max="28"
                  value={settings.monthlyResetDate}
                  onChange={(e) => setSettings({ ...settings, monthlyResetDate: parseInt(e.target.value) || 1 })}
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={!canEdit}
                />
              </SettingRow>
            )}
          </>
        )}

        {/* Email Settings */}
        {activeTab === 'email' && (
          <>
            <h2 className="text-xl font-bold text-white mb-4">Email Notifications</h2>
            
            <SettingRow
              label="Email Notifications"
              description="Enable/disable all email notifications"
            >
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.emailNotificationsEnabled}
                  onChange={(e) => setSettings({ ...settings, emailNotificationsEnabled: e.target.checked })}
                  className="sr-only peer"
                  disabled={!canEdit}
                />
                <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </SettingRow>

            <SettingRow
              label="Admin Notification Emails"
              description="Email addresses to receive admin notifications. Separate multiple addresses with commas."
            >
              <div className="space-y-2">
                <input
                  type="text"
                  value={settings.adminNotificationEmail}
                  onChange={(e) => setSettings({ ...settings, adminNotificationEmail: e.target.value })}
                  placeholder="admin@example.com, admin2@example.com"
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  disabled={!canEdit}
                />
                {settings.adminNotificationEmail && (
                  <div className="flex flex-wrap gap-1.5">
                    {settings.adminNotificationEmail
                      .split(',')
                      .map(e => e.trim())
                      .filter(e => e.length > 0)
                      .map((email, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs
                            bg-blue-500/20 text-blue-300 border border-blue-500/30"
                        >
                          {email}
                        </span>
                      ))
                    }
                  </div>
                )}
              </div>
            </SettingRow>

            <SettingRow
              label="Welcome Emails"
              description="Send welcome email to new users"
            >
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.sendWelcomeEmail}
                  onChange={(e) => setSettings({ ...settings, sendWelcomeEmail: e.target.checked })}
                  className="sr-only peer"
                  disabled={!canEdit}
                />
                <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </SettingRow>

            <SettingRow
              label="Credit Alert Emails"
              description="Send emails when users approach credit limits"
            >
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.sendCreditAlerts}
                  onChange={(e) => setSettings({ ...settings, sendCreditAlerts: e.target.checked })}
                  className="sr-only peer"
                  disabled={!canEdit}
                />
                <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </SettingRow>
          </>
        )}

        {/* Alert Settings */}
        {activeTab === 'alerts' && (
          <>
            <h2 className="text-xl font-bold text-white mb-4">Alert Configuration</h2>
            
            <SettingRow
              label="Credit Alert Threshold"
              description="Alert when user reaches this % of credit limit"
            >
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="50"
                  max="95"
                  step="5"
                  value={settings.creditAlertThreshold}
                  onChange={(e) => setSettings({ ...settings, creditAlertThreshold: parseInt(e.target.value) })}
                  className="flex-1"
                  disabled={!canEdit}
                />
                <span className="text-white font-medium w-12">{settings.creditAlertThreshold}%</span>
              </div>
            </SettingRow>

            <SettingRow
              label="User Limit Alerts"
              description="Alert admins when users reach credit limits"
            >
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.userLimitAlertEnabled}
                  onChange={(e) => setSettings({ ...settings, userLimitAlertEnabled: e.target.checked })}
                  className="sr-only peer"
                  disabled={!canEdit}
                />
                <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </SettingRow>

            <SettingRow
              label="System Health Alerts"
              description="Receive alerts about system health issues"
            >
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.systemHealthAlertsEnabled}
                  onChange={(e) => setSettings({ ...settings, systemHealthAlertsEnabled: e.target.checked })}
                  className="sr-only peer"
                  disabled={!canEdit}
                />
                <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </SettingRow>
          </>
        )}

        {/* Access Control */}
        {activeTab === 'access' && (
          <>
            <h2 className="text-xl font-bold text-white mb-4">Access Control</h2>
            
            <SettingRow
              label="Email Verification Required"
              description="Require users to verify email before access"
            >
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.requireEmailVerification}
                  onChange={(e) => setSettings({ ...settings, requireEmailVerification: e.target.checked })}
                  className="sr-only peer"
                  disabled={!canEdit}
                />
                <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </SettingRow>

            <SettingRow
              label="Auto-Approve New Users"
              description="Automatically approve new user registrations"
            >
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.autoApproveUsers}
                  onChange={(e) => setSettings({ ...settings, autoApproveUsers: e.target.checked })}
                  className="sr-only peer"
                  disabled={!canEdit}
                />
                <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </SettingRow>

            <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-4">
              <p className="text-sm text-gray-400 mb-2">
                <Lock className="w-4 h-4 inline mr-1" />
                Domain Whitelisting/Blacklisting (Coming Soon)
              </p>
              <p className="text-xs text-gray-500">Configure allowed and blocked email domains for user registration.</p>
            </div>
          </>
        )}

        {/* Maintenance */}
        {activeTab === 'maintenance' && (
          <>
            <h2 className="text-xl font-bold text-white mb-4">Maintenance & System Info</h2>
            
            <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-4 space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-400">Last Modified:</span>
                <span className="text-white">
                  {settings.lastModified
                    ? (() => {
                        const d = new Date(settings.lastModified.seconds * 1000);
                        const day = String(d.getDate()).padStart(2, '0');
                        const month = String(d.getMonth() + 1).padStart(2, '0');
                        const year = d.getFullYear();
                        const hrs = String(d.getHours()).padStart(2, '0');
                        const mins = String(d.getMinutes()).padStart(2, '0');
                        return `${day}/${month}/${year}, ${hrs}:${mins}`;
                      })()
                    : 'Never'
                  }
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Modified By:</span>
                <span className="text-white">{settings.lastModifiedBy || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">System Version:</span>
                <span className="text-white">2.0.0</span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Save Button Bottom */}
      <div className="flex justify-end gap-3">
        <button
          onClick={handleReset}
          className="px-6 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
        >
          Reset Changes
        </button>
        <button
          onClick={handleSave}
          disabled={saving || !canEdit}
          className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving...' : 'Save All Settings'}
        </button>
      </div>
    </div>
  );
};

export default SettingsNew;
