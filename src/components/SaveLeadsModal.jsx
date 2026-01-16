import { useState } from 'react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { Save, X, Loader2 } from 'lucide-react';

/**
 * SaveLeadsModal Component
 * Allows users to save current search results to "My Lists"
 */
const SaveLeadsModal = ({ leads, searchQuery, userId, onClose, onSuccess }) => {
  const [listName, setListName] = useState(`${searchQuery.keyword} - ${searchQuery.location}`);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!listName.trim()) {
      setError('Please enter a list name');
      return;
    }

    if (leads.length === 0) {
      setError('No leads to save');
      return;
    }

    setSaving(true);
    setError('');

    try {
      // Save to Firestore under user's savedLists collection
      const listsRef = collection(db, 'savedLists', userId, 'lists');
      
      await addDoc(listsRef, {
        name: listName.trim(),
        createdAt: serverTimestamp(),
        leads: leads,
        totalLeads: leads.length,
        searchQuery: {
          keyword: searchQuery.keyword,
          location: searchQuery.location,
          category: searchQuery.category || 'All'
        }
      });

      onSuccess?.();
      onClose();
    } catch (err) {
      console.error('Error saving leads:', err);
      setError('Failed to save leads. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-md w-full shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
              <Save className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-800">Save to My Lists</h2>
              <p className="text-sm text-gray-500">{leads.length} leads</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              List Name
            </label>
            <input
              type="text"
              value={listName}
              onChange={(e) => setListName(e.target.value)}
              placeholder="Enter a name for this list"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
          </div>

          {/* Preview Info */}
          <div className="bg-gray-50 rounded-lg p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Total Leads:</span>
              <span className="font-semibold text-gray-800">{leads.length}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Keyword:</span>
              <span className="font-semibold text-gray-800">{searchQuery.keyword}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Location:</span>
              <span className="font-semibold text-gray-800">{searchQuery.location}</span>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}

          {/* Info Note */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-blue-700 text-sm">
              💡 Saved lists can be accessed anytime from "My Lists" page
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-6 border-t border-gray-200">
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !listName.trim()}
            className="flex-1 px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Save List
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SaveLeadsModal;
