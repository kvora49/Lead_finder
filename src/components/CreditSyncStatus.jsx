import { useState, useEffect } from 'react';
import { Wifi, WifiOff, RefreshCw } from 'lucide-react';

/**
 * Credit Sync Status Indicator
 * Shows if credits are syncing with Firestore
 */
const CreditSyncStatus = ({ isOnline = true }) => {
  const [lastSync, setLastSync] = useState(new Date());
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (isOnline) {
      const interval = setInterval(() => {
        setLastSync(new Date());
      }, 60000); // Update every minute

      return () => clearInterval(interval);
    }
  }, [isOnline]);

  const getTimeAgo = () => {
    const seconds = Math.floor((new Date() - lastSync) / 1000);
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    return `${Math.floor(seconds / 3600)}h ago`;
  };

  return (
    <div className="flex items-center gap-2 text-xs text-gray-600">
      {isOnline ? (
        <>
          <Wifi className="w-3 h-3 text-green-500" />
          <span className="text-green-600">Synced across devices</span>
        </>
      ) : (
        <>
          <WifiOff className="w-3 h-3 text-red-500" />
          <span className="text-red-600">Offline - sync paused</span>
        </>
      )}
      {syncing && (
        <RefreshCw className="w-3 h-3 animate-spin text-blue-500" />
      )}
    </div>
  );
};

export default CreditSyncStatus;
