import { useState, useEffect } from 'react';
import { Save, X, Loader2, Plus, List, CheckCircle2 } from 'lucide-react';
import { getLists, createList, bulkSaveLeads } from '../services/listService';

/**
 * SaveLeadsModal  (Phase 4)
 *
 * Props:
 *   leads       – array of raw Places API business objects to save
 *   searchMeta  – { keyword, location, scope } for default list name
 *   userId      – current user's uid
 *   onClose     – close handler
 *   onSuccess   – called after successful save with { listName, savedCount }
 */
// eslint-disable-next-line react-refresh/only-export-components
const SaveLeadsModal = ({ leads, searchMeta = {}, userId, onClose, onSuccess }) => {
  // Tab: 'existing' | 'new'
  const [tab,            setTab]            = useState('new');
  const [lists,          setLists]          = useState([]);
  const [loadingLists,   setLoadingLists]   = useState(true);
  const [selectedListId, setSelectedListId] = useState('');
  const [newListName,    setNewListName]     = useState(
    searchMeta.keyword
      ? `${searchMeta.keyword}${searchMeta.location ? ' — ' + searchMeta.location : ''}`
      : 'My Leads'
  );
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState('');
  const [savedInfo, setSavedInfo] = useState(null); // { listName, savedCount }

  // Load existing lists on mount
  useEffect(() => {
    if (!userId) return;
    getLists(userId)
      .then((ls) => {
        setLists(ls);
        if (ls.length > 0) {
          setSelectedListId(ls[0].id);
          setTab('existing');
        }
      })
      .catch((err) => console.error('[SaveLeadsModal] getLists:', err))
      .finally(() => setLoadingLists(false));
  }, [userId]);

  const handleSave = async () => {
    if (leads.length === 0) { setError('No leads to save.'); return; }

    setSaving(true);
    setError('');

    try {
      let targetId   = selectedListId;
      let targetName = '';

      if (tab === 'new') {
        const name = newListName.trim();
        if (!name) { setError('Please enter a list name.'); setSaving(false); return; }
        targetId   = await createList(userId, name); // returns the new listId string
        targetName = name;
      } else {
        const found = lists.find((l) => l.id === targetId);
        targetName  = found?.name ?? 'List';
      }

      const savedCount = await bulkSaveLeads(userId, targetId, leads);
      setSavedInfo({ listName: targetName, savedCount });
      onSuccess?.({ listName: targetName, savedCount });
    } catch (err) {
      console.error('[SaveLeadsModal] save error:', err);
      setError(err.message || 'Failed to save leads. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden">

        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600
              flex items-center justify-center shadow-sm">
              <Save className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Save to My Lists</h2>
              <p className="text-xs text-slate-400">{leads.length} lead{leads.length !== 1 ? 's' : ''} selected</p>
            </div>
          </div>
          <button onClick={onClose}
            className="text-slate-400 hover:text-slate-700 transition-colors rounded-lg p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── Success state ──────────────────────────────────────────── */}
        {savedInfo ? (
          <div className="p-8 text-center space-y-3">
            <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-7 h-7 text-emerald-600" />
            </div>
            <p className="text-base font-bold text-slate-900">Saved!</p>
            <p className="text-sm text-slate-600">
              <span className="font-semibold text-indigo-600">{savedInfo.savedCount}</span> lead{savedInfo.savedCount !== 1 ? 's' : ''} saved to{' '}
              <span className="font-semibold text-slate-800">"{savedInfo.listName}"</span>
            </p>
            <a href="/app/lists"
              className="inline-block mt-2 text-xs font-medium text-indigo-600 hover:underline">
              View in My Lists →
            </a>
            <div>
              <button onClick={onClose}
                className="mt-4 px-6 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm rounded-xl transition-colors">
                Close
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* ── Tab picker ─────────────────────────────────────────── */}
            <div className="flex border-b border-slate-100">
              {/* Show "Add to existing" tab only when lists exist */}
              {!loadingLists && lists.length > 0 && (
                <button
                  onClick={() => setTab('existing')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-semibold
                    transition-colors border-b-2 ${tab === 'existing'
                      ? 'border-indigo-600 text-indigo-700'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                    }`}>
                  <List className="w-3.5 h-3.5" /> Existing List
                </button>
              )}
              <button
                onClick={() => setTab('new')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-semibold
                  transition-colors border-b-2 ${tab === 'new'
                    ? 'border-indigo-600 text-indigo-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}>
                <Plus className="w-3.5 h-3.5" /> New List
              </button>
            </div>

            {/* ── Body ───────────────────────────────────────────────── */}
            <div className="p-6 space-y-4">
              {tab === 'existing' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-2">
                    Select a list
                  </label>
                  {loadingLists ? (
                    <div className="flex items-center gap-2 text-slate-400 text-sm py-2">
                      <Loader2 className="w-4 h-4 animate-spin" /> Loading lists…
                    </div>
                  ) : (
                    <select
                      value={selectedListId}
                      onChange={(e) => setSelectedListId(e.target.value)}
                      className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl
                        bg-slate-50 focus:bg-white focus:border-indigo-400 focus:ring-2
                        focus:ring-indigo-100 outline-none text-slate-800">
                      {lists.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name} ({l.leadCount ?? 0} leads)
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {tab === 'new' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-2">
                    List name
                  </label>
                  <input
                    type="text"
                    value={newListName}
                    onChange={(e) => setNewListName(e.target.value)}
                    placeholder="e.g. Mumbai Restaurants — Dec 24"
                    autoFocus
                    className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl
                      bg-slate-50 focus:bg-white focus:border-indigo-400 focus:ring-2
                      focus:ring-indigo-100 outline-none text-slate-800"
                  />
                </div>
              )}

              {/* Meta preview */}
              <div className="bg-slate-50 rounded-xl p-3 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-slate-400">Leads to save</span>
                  <p className="font-semibold text-slate-800 mt-0.5">{leads.length}</p>
                </div>
                {searchMeta.keyword && (
                  <div>
                    <span className="text-slate-400">Keyword</span>
                    <p className="font-semibold text-slate-800 mt-0.5 truncate">{searchMeta.keyword}</p>
                  </div>
                )}
                {searchMeta.location && (
                  <div>
                    <span className="text-slate-400">Location</span>
                    <p className="font-semibold text-slate-800 mt-0.5 truncate">{searchMeta.location}</p>
                  </div>
                )}
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                  <p className="text-red-600 text-xs">{error}</p>
                </div>
              )}
            </div>

            {/* ── Footer ─────────────────────────────────────────────── */}
            <div className="flex gap-3 px-6 pb-6">
              <button onClick={onClose} disabled={saving}
                className="flex-1 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700
                  text-sm rounded-xl transition-colors disabled:opacity-50">
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || (tab === 'new' && !newListName.trim()) || (tab === 'existing' && !selectedListId)}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5
                  bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700
                  text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50">
                {saving ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
                ) : (
                  <><Save className="w-4 h-4" /> Save</>
                )}
              </button>
            </div>
          </>
        )}

      </div>
    </div>
  );
};

export default SaveLeadsModal;
