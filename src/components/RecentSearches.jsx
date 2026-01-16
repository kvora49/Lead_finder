import { useState, useEffect } from 'react';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { History, Search, MapPin, Clock, X } from 'lucide-react';

/**
 * RecentSearches Component
 * Shows user's recent searches for quick re-run
 */
const RecentSearches = ({ userId, onSearchSelect }) => {
  const [recentSearches, setRecentSearches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (userId) {
      fetchRecentSearches();
    }
  }, [userId]);

  const fetchRecentSearches = async () => {
    try {
      const q = query(
        collection(db, 'searchLogs'),
        where('userId', '==', userId),
        orderBy('timestamp', 'desc'),
        limit(10)
      );

      const snapshot = await getDocs(q);
      const searches = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp?.toDate() || new Date()
      }));

      // Remove duplicates (same keyword + location)
      const uniqueSearches = searches.filter((search, index, self) =>
        index === self.findIndex((s) => 
          s.keyword === search.keyword && s.location === search.location
        )
      );

      setRecentSearches(uniqueSearches.slice(0, 10));
    } catch (error) {
      console.error('Error fetching recent searches:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchClick = (search) => {
    onSearchSelect({
      keyword: search.keyword,
      location: search.location
    });
  };

  const formatTimeAgo = (date) => {
    const seconds = Math.floor((new Date() - date) / 1000);
    
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return date.toLocaleDateString();
  };

  if (loading) {
    return null;
  }

  if (recentSearches.length === 0) {
    return null;
  }

  const displayedSearches = showAll ? recentSearches : recentSearches.slice(0, 5);

  return (
    <div className="bg-white rounded-xl shadow-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <History className="w-5 h-5 text-blue-600" />
          <h3 className="text-lg font-semibold text-gray-800">Recent Searches</h3>
        </div>
        {recentSearches.length > 5 && (
          <button
            onClick={() => setShowAll(!showAll)}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            {showAll ? 'Show Less' : `Show All (${recentSearches.length})`}
          </button>
        )}
      </div>

      <div className="space-y-2">
        {displayedSearches.map((search) => (
          <button
            key={search.id}
            onClick={() => handleSearchClick(search)}
            className="w-full flex items-center gap-3 p-3 bg-gray-50 hover:bg-blue-50 rounded-lg transition-colors group"
          >
            <div className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
              <Search className="w-5 h-5 text-white" />
            </div>
            
            <div className="flex-1 text-left">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-semibold text-gray-800 group-hover:text-blue-600 transition-colors">
                  {search.keyword}
                </span>
                {search.resultCount > 0 && (
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                    {search.resultCount} results
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs text-gray-500">
                <span className="flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {search.location}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {formatTimeAgo(search.timestamp)}
                </span>
              </div>
            </div>

            <div className="flex-shrink-0 text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">
              <Search className="w-5 h-5" />
            </div>
          </button>
        ))}
      </div>

      <div className="mt-4 pt-4 border-t border-gray-200">
        <p className="text-xs text-gray-500 text-center">
          💡 Click any search to instantly re-run with the same keywords and location
        </p>
      </div>
    </div>
  );
};

export default RecentSearches;
