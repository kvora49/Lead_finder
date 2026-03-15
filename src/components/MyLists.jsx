/**
 * My Lists  (Phase 4)
 *
 * Full-featured lead list manager:
 *  • Browse all saved lists
 *  • View leads in a chosen list
 *  • Export leads as Excel  (.xlsx)
 *  • Export leads as PDF  (jspdf + autotable)
 *  • Import leads from CSV (papaparse)
 *  • Delete individual leads or entire lists
 *
 * Firestore paths (via listService):
 *   users/{uid}/lists/{listId}                ← list metadata
 *   users/{uid}/lists/{listId}/leads/{leadId} ← individual leads
 */

import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import Papa from 'papaparse';
import { toast } from 'sonner';
import {
  BookmarkCheck, Trash2, ArrowLeft,
  FileText, Table2, Upload, Loader2, Search,
  Phone, Globe, Star, MapPin, X, AlertCircle,
  ChevronRight, FolderOpen, Plus, Download,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  getLists,
  getLeads,
  deleteList,
  deleteLead,
  bulkSaveLeads,
  updateLeadNote,
} from '../services/listService';
import ConfirmDangerModal from './ConfirmDangerModal';

// ─── CSV row → normalised lead ────────────────────────────────────────────────
const csvRowToLead = (row) => ({
  name:        row.name        || row.Name        || '',
  address:     row.address     || row.Address     || '',
  phone:       row.phone       || row.Phone       || '',
  website:     row.website     || row.Website     || '',
  rating:      parseFloat(row.rating  || row.Rating)  || null,
  reviewCount: parseInt(row.reviewCount || row.Reviews || '0') || 0,
  placeId:     row.placeId     || row.place_id    || '',
  status:      row.status      || row.Status      || '',
  lat:         parseFloat(row.lat) || null,
  lng:         parseFloat(row.lng) || null,
  savedAt:     row.savedAt     || new Date().toISOString(),
});

// ─── Export helpers ───────────────────────────────────────────────────────────
const exportExcel = async (leads, listName) => {
  const { utils, write } = await import('xlsx');
  const rows = leads.map((l) => ({
    'Business Name': l.name        || '',
    'Address':       l.address     || '',
    'Phone':         l.phone       || '',
    'Website':       l.website     || '',
    'Rating':        l.rating      ?? '',
    'Total Reviews': l.reviewCount ?? '',
    'Status':        l.status      || '',
    'Place ID':      l.placeId     || '',
  }));

  const ws = utils.json_to_sheet(rows);

  // Make address easier to read in Excel by inserting line breaks after commas.
  rows.forEach((row, idx) => {
    const rawAddress = String(row['Address'] || '').trim();
    if (!rawAddress) return;
    const cellRef = `B${idx + 2}`;
    const formatted = rawAddress.replace(/,\s*/g, ',\n');
    if (ws[cellRef]) ws[cellRef].v = formatted;
  });

  // Make website cells reliably clickable via HYPERLINK formula.
  rows.forEach((row, idx) => {
    const raw = String(row['Website'] || '').trim();
    if (!raw) return;
    const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const cellRef = `D${idx + 2}`;
    const escapedUrl = url.replace(/"/g, '""');
    const escapedText = raw.replace(/"/g, '""');
    ws[cellRef] = {
      t: 'str',
      f: `HYPERLINK("${escapedUrl}","${escapedText}")`,
      v: raw,
    };
  });

  ws['!cols'] = [
    { wch: 36 },
    { wch: 120 },
    { wch: 20 },
    { wch: 46 },
    { wch: 10 },
    { wch: 14 },
    { wch: 14 },
    { wch: 24 },
  ];
  ws['!rows'] = [{ hpt: 22 }, ...rows.map(() => ({ hpt: 42 }))];
  ws['!autofilter'] = { ref: 'A1:H1' };

  const wb = utils.book_new();
  utils.book_append_sheet(wb, ws, 'My Leads');
  const out = write(wb, { bookType: 'xlsx', type: 'array' });

  const blob = new Blob(
    [out],
    { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
  );
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `LeadFinder_${listName.replace(/[^a-z0-9]/gi, '_')}_${new Date().toISOString().slice(0,10)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
};

const exportPdf = async (leads, listName) => {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');
  const doc        = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW      = doc.internal.pageSize.getWidth();
  const pageH      = doc.internal.pageSize.getHeight();
  const exportDate = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  const INDIGO     = [79, 70, 229];
  const VIOLET     = [109, 40, 217];
  const SLATE_900  = [15, 23, 42];
  const SLATE_500  = [100, 116, 139];
  const SLATE_50   = [248, 250, 252];
  const WHITE      = [255, 255, 255];

  // ── Header band ───────────────────────────────────────────────────────────
  doc.setFillColor(...INDIGO);
  doc.rect(0, 0, pageW * 0.6, 28, 'F');
  doc.setFillColor(...VIOLET);
  doc.rect(pageW * 0.6, 0, pageW * 0.4, 28, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...WHITE);
  doc.text('LEAD FINDER  ·  My Lists', 12, 8);

  doc.setFontSize(15);
  doc.text(listName.toUpperCase(), 12, 18);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`${leads.length} leads`, pageW - 12, 12, { align: 'right' });
  doc.text(exportDate, pageW - 12, 19, { align: 'right' });

  doc.setDrawColor(...INDIGO);
  doc.setLineWidth(0.8);
  doc.line(0, 28, pageW, 28);

  // ── Table ─────────────────────────────────────────────────────────────────
  autoTable(doc, {
    startY: 32,
    head:   [['#', 'Business Name', 'Address', 'Phone', 'Website', 'Rating', 'Reviews', 'Status']],
    body:    leads.map((l, i) => [
      i + 1,
      l.name    || '',
      l.address || '',
      l.phone   || '',
      l.website || '',
      l.rating  ? String(l.rating) : '',
      l.reviewCount ? Number(l.reviewCount).toLocaleString() : '',
      l.status  || '',
    ]),
    styles: {
      fontSize:    8,
      cellPadding: { top: 3.5, right: 4, bottom: 3.5, left: 4 },
      textColor:   SLATE_900,
      lineColor:   [226, 232, 240],
      lineWidth:   0.2,
      font:        'helvetica',
      overflow:    'linebreak',
    },
    headStyles: {
      fillColor:  INDIGO,
      textColor:  WHITE,
      fontStyle:  'bold',
      fontSize:   8,
      halign:     'left',
      cellPadding: { top: 4, right: 4, bottom: 4, left: 4 },
    },
    alternateRowStyles: { fillColor: SLATE_50 },
    columnStyles: {
      0: { cellWidth: 18, halign: 'center', textColor: SLATE_500, cellPadding: { left: 1.5, right: 1.5, top: 3.5, bottom: 3.5 } },
      1: { cellWidth: 52, fontStyle: 'bold' },
      2: { cellWidth: 58 },
      3: { cellWidth: 32 },
      4: { cellWidth: 54, textColor: [79, 70, 229] },
      5: { cellWidth: 20, halign: 'center', textColor: [16, 185, 129] },
      6: { cellWidth: 20, halign: 'right',  textColor: SLATE_500 },
      7: { cellWidth: 22, halign: 'center' },
    },
    didDrawPage: (data) => {
      const pg  = doc.internal.getCurrentPageInfo().pageNumber;
      const tot = doc.internal.getNumberOfPages();
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...SLATE_500);
      doc.text('Lead Finder  ·  leadfinder.app', 12, pageH - 6);
      doc.text(`Page ${pg} of ${tot}`, pageW - 12, pageH - 6, { align: 'right' });
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.3);
      doc.line(12, pageH - 9, pageW - 12, pageH - 9);
    },
  });

  doc.save(`LeadFinder_${listName.replace(/[^a-z0-9]/gi, '_')}_${new Date().toISOString().slice(0,10)}.pdf`);
};

// ─── Lead row ─────────────────────────────────────────────────────────────────
const LeadRow = ({
  lead,
  onDelete,
  bulkMode,
  isSelected,
  onToggleBulk,
  editingNoteId,
  noteText,
  setNoteText,
  setEditingNoteId,
  onSaveNote,
}) => (
  <>
    <tr
      onClick={bulkMode ? () => onToggleBulk(lead.id) : undefined}
      className={`hover:bg-slate-50 transition-colors group ${bulkMode ? 'cursor-pointer' : ''} ${
        isSelected ? 'bg-indigo-50 ring-2 ring-indigo-500' : ''
      }`}
    >
      {bulkMode && (
        <td className="px-4 py-3 w-10 align-top">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggleBulk(lead.id)}
            onClick={(e) => e.stopPropagation()}
            className="mt-1 w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
          />
        </td>
      )}
      <td className="px-4 py-3 text-sm font-medium text-slate-900 max-w-[200px] align-top">
        <span className="line-clamp-1">{lead.name || '—'}</span>
      </td>
      <td className="px-4 py-3 text-xs text-slate-600 max-w-[200px] align-top">
        <span className="flex items-start gap-1 line-clamp-2">
          <MapPin className="w-3 h-3 mt-0.5 flex-none text-slate-400" />
          {lead.address || '—'}
        </span>
      </td>
      <td className="px-4 py-3 text-xs text-slate-700 align-top">
        {lead.phone
          ? <a href={`tel:${lead.phone}`}
              className="flex items-center gap-1 text-emerald-700 hover:underline"
              onClick={(e) => e.stopPropagation()}>
              <Phone className="w-3 h-3" />{lead.phone}
            </a>
          : <span className="text-slate-300">—</span>
        }
      </td>
      <td className="px-4 py-3 text-xs max-w-[160px] truncate align-top">
        {lead.website
          ? <a href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`}
              target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-indigo-600 hover:underline truncate"
              onClick={(e) => e.stopPropagation()}>
              <Globe className="w-3 h-3 flex-none" />
              <span className="truncate">{lead.website.replace(/^https?:\/\//, '').split('/')[0]}</span>
            </a>
          : <span className="text-slate-300">—</span>
        }
      </td>
      <td className="px-4 py-3 text-xs text-slate-600 align-top">
        {lead.rating
          ? <span className="flex items-center gap-1">
              <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
              {lead.rating}
              {lead.reviewCount > 0 && (
                <span className="text-slate-400">({lead.reviewCount})</span>
              )}
            </span>
          : <span className="text-slate-300">—</span>
        }
      </td>
      <td className="px-4 py-3 align-top">
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(lead.id); }}
          className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500
            transition-all p-1 rounded">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </td>
    </tr>
    <tr className="bg-white">
      <td colSpan={bulkMode ? 7 : 6} className="px-4 pb-3 pt-0">
        <div className="mt-2 pt-2 border-t border-slate-100 dark:border-white/5">
          {editingNoteId === lead.id ? (
            <div className="flex flex-col gap-1.5">
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Add a private note..."
                rows={2}
                autoFocus
                className="w-full text-xs resize-none rounded-lg border
                  border-slate-200 dark:border-white/10 bg-white dark:bg-white/5
                  text-slate-700 dark:text-gray-300
                  placeholder-slate-300 dark:placeholder-gray-600
                  px-2.5 py-1.5 focus:outline-none
                  focus:border-indigo-400 dark:focus:border-indigo-500
                  transition-colors"
              />
              <div className="flex gap-1.5">
                <button
                  onClick={(e) => { e.stopPropagation(); onSaveNote(lead.id); }}
                  className="text-[10px] font-semibold px-2.5 py-1 rounded-lg
                    bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
                >
                  Save
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setEditingNoteId(null); }}
                  className="text-[10px] font-medium px-2.5 py-1 rounded-lg
                    border border-slate-200 dark:border-white/10
                    text-slate-500 dark:text-gray-400
                    hover:border-slate-300 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setEditingNoteId(lead.id);
                setNoteText(lead.note || '');
              }}
              className="flex items-center gap-1.5 text-[10px] w-full text-left
                text-slate-400 dark:text-gray-600
                hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors"
            >
              <FileText className="w-3 h-3 flex-shrink-0" strokeWidth={1.5} />
              {lead.note
                ? <span className="truncate italic">{lead.note}</span>
                : <span>Add note</span>
              }
            </button>
          )}
        </div>
      </td>
    </tr>
  </>
);

// ─── Main component ───────────────────────────────────────────────────────────
const MyLists = () => {
  const { currentUser } = useAuth();
  const uid = currentUser?.uid;

  const [lists,          setLists]          = useState([]);
  const [loadingLists,   setLoadingLists]   = useState(true);
  const [selectedList,   setSelectedList]   = useState(null);
  const [leads,          setLeads]          = useState([]);
  const [loadingLeads,   setLoadingLeads]   = useState(false);
  const [exporting,      setExporting]      = useState(null);   // 'excel' | 'pdf' | null
  const [importing,      setImporting]      = useState(false);
  const [importResult,   setImportResult]   = useState(null);
  const [error,          setError]          = useState('');
  const [deletingListId, setDeletingListId] = useState(null);
  const [searchFilter,   setSearchFilter]   = useState('');
  const [editingNoteId,  setEditingNoteId]  = useState(null);
  const [noteText,       setNoteText]       = useState('');
  const [bulkMode,       setBulkMode]       = useState(false);
  const [bulkSelected,   setBulkSelected]   = useState(new Set());

  // ── Danger modal state (Safe Delete) ────────────────────────────────────
  const [dangerModal, setDangerModal] = useState({
    open: false, title: '', message: '', confirmLabel: 'Delete', onConfirm: null, loading: false,
  });

  const importFileRef = useRef(null);
  const activeListId = selectedList?.id;
  const activeListName = selectedList?.name;

  // ── Load lists ─────────────────────────────────────────────────────────────
  const fetchLists = async () => {
    if (!uid) return;
    setLoadingLists(true);
    try {
      const ls = await getLists(uid);
      setLists(ls);
    } catch (err) {
      setError('Failed to load lists: ' + err.message);
    } finally {
      setLoadingLists(false);
    }
  };

  useEffect(() => { fetchLists(); }, [uid]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Open a list ────────────────────────────────────────────────────────────
  const openList = async (list) => {
    setSelectedList(list);
    setLeads([]);
    setSearchFilter('');
    setBulkMode(false);
    setBulkSelected(new Set());
    setImportResult(null);
    setError('');
    setLoadingLeads(true);
    try {
      const ls = await getLeads(uid, list.id);
      setLeads(ls);
    } catch (err) {
      setError('Failed to load leads: ' + err.message);
    } finally {
      setLoadingLeads(false);
    }
  };

  // ── Delete entire list ─────────────────────────────────────────────────────
  const handleDeleteList = async (listId) => {
    setDeletingListId(listId);
    try {
      await deleteList(uid, listId);
      setLists((prev) => prev.filter((l) => l.id !== listId));
      if (selectedList?.id === listId) setSelectedList(null);
      toast.success('List deleted');
    } catch (err) {
      setError('Failed to delete list: ' + err.message);
    } finally {
      setDeletingListId(null);
    }
  };

  const requestDeleteList = (listId) => {
    const list = lists.find(l => l.id === listId);
    setDangerModal({
      open: true,
      title: 'Delete List?',
      message: `“${list?.name || 'This list'}” and all ${list?.leadCount ?? 'its'} lead(s) will be permanently deleted. This cannot be undone.`,
      confirmLabel: 'Delete List',
      onConfirm: () => handleDeleteList(listId),
      loading: false,
    });
  };

  // ── Delete single lead ─────────────────────────────────────────────────────
  const handleDeleteLead = async (leadId) => {
    if (!selectedList) return;
    try {
      await deleteLead(uid, selectedList.id, leadId);
      setLeads((prev) => prev.filter((l) => l.id !== leadId));
      setLists((prev) =>
        prev.map((l) =>
          l.id === selectedList.id
            ? { ...l, leadCount: Math.max(0, (l.leadCount ?? 1) - 1) }
            : l
        )
      );
      toast.success('Lead removed');
    } catch (err) {
      setError('Failed to delete lead: ' + err.message);
    }
  };

  const requestDeleteLead = (leadId) => {
    const lead = leads.find(l => l.id === leadId);
    setDangerModal({
      open: true,
      title: 'Remove Lead?',
      message: `“${lead?.name || 'This lead'}” will be permanently removed from the list.`,
      confirmLabel: 'Remove Lead',
      onConfirm: () => handleDeleteLead(leadId),
      loading: false,
    });
  };

  // ── Export Excel ───────────────────────────────────────────────────────────
  const handleExportExcel = async () => {
    if (!visibleLeads.length) return;
    setExporting('excel');
    try {
      await exportExcel(visibleLeads, selectedList.name);
      toast.success('Excel downloaded!');
    }
    finally { setExporting(null); }
  };

  // ── Export PDF ─────────────────────────────────────────────────────────────
  const handleExportPdf = async () => {
    if (!visibleLeads.length) return;
    setExporting('pdf');
    try { await exportPdf(visibleLeads, selectedList.name); }
    finally { setExporting(null); }
  };

  // ── Import CSV ─────────────────────────────────────────────────────────────
  const handleImportFile = (e) => {
    const file = e.target.files?.[0];
    if (!file || !selectedList) return;
    setImporting(true);
    setError('');

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async ({ data, errors }) => {
        if (errors.length > 0) {
          setError(`CSV parse error: ${errors[0].message}`);
          setImporting(false);
          return;
        }
        try {
          const mapped = data
            .map(csvRowToLead)
            .filter((r) => r.name || r.address);
          const count = await bulkSaveLeads(uid, selectedList.id, mapped);
          setImportResult({ count, listName: selectedList.name });
          toast.success(`Imported ${count} leads successfully`);
          const fresh = await getLeads(uid, selectedList.id);
          setLeads(fresh);
          const freshLists = await getLists(uid);
          setLists(freshLists);
        } catch (err) {
          setError('Import failed: ' + err.message);
          toast.error('Import failed. Check your CSV format.');
        } finally {
          setImporting(false);
          if (importFileRef.current) importFileRef.current.value = '';
        }
      },
      error: (err) => {
        setError('Failed to read file: ' + err.message);
        setImporting(false);
      },
    });
  };

  // ── Filtered leads ─────────────────────────────────────────────────────────
  const visibleLeads = searchFilter.trim()
    ? leads.filter((l) => {
        const q = searchFilter.toLowerCase();
        return (
          l.name?.toLowerCase().includes(q)    ||
          l.address?.toLowerCase().includes(q) ||
          l.phone?.includes(q)                 ||
          l.website?.toLowerCase().includes(q)
        );
      })
    : leads;

  const handleBulkDelete = async () => {
    const ids = Array.from(bulkSelected);
    try {
      await Promise.all(ids.map((id) => deleteLead(currentUser.uid, activeListId, id)));
      const remaining = leads.filter((l) => !bulkSelected.has(l.id));
      setLeads(remaining);
      setBulkSelected(new Set());
      setBulkMode(false);
      toast.success(`${ids.length} lead${ids.length > 1 ? 's' : ''} deleted`);
      const freshLists = await getLists(uid);
      setLists(freshLists);
    } catch {
      toast.error('Failed to delete selected leads');
    }
  };

  const handleBulkExportExcel = async () => {
    const selectedLeads = leads.filter((l) => bulkSelected.has(l.id));
    await exportExcel(selectedLeads, activeListName || 'selected-leads');
    toast.success(`Exported ${selectedLeads.length} leads to Excel`);
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
    <div className="min-h-screen bg-slate-50 dark:bg-[#0A0A0A]">
      <div className="bg-white dark:bg-[#121212] border-b border-slate-200 dark:border-white/10 px-4 sm:px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center gap-4">
          <Link to="/app"
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-indigo-600 transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Search
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600
              flex items-center justify-center shadow-sm">
              <BookmarkCheck className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-900 dark:text-white">My Lists</h1>
              <p className="text-xs text-slate-400 dark:text-gray-500">
                {lists.length} list{lists.length !== 1 ? 's' : ''} saved
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Error banner ───────────────────────────────────────────────── */}
      {error && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 mt-4">
          <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-none" />
            <span className="flex-1">{error}</span>
            <button onClick={() => setError('')}><X className="w-4 h-4" /></button>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex gap-6" style={{ minHeight: 'calc(100vh - 152px)' }}>

          {/* ── Left: list panel ─────────────────────────────────────── */}
          <div className="w-72 flex-none flex flex-col gap-3">
            <h2 className="text-xs font-bold text-slate-500 dark:text-gray-400 uppercase tracking-wide px-1">
              Saved Lists
            </h2>

            {loadingLists ? (
              <div className="flex items-center gap-2 text-slate-400 text-sm justify-center py-10">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading…
              </div>
            ) : lists.length === 0 ? (
              <div className="text-center py-14 text-slate-400">
                <FolderOpen className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm font-medium">No lists yet</p>
                <p className="text-xs mt-1">Save leads from search results</p>
                <Link to="/app"
                  className="inline-flex items-center gap-1 mt-3 text-xs font-semibold
                    text-indigo-600 hover:underline">
                  <Plus className="w-3.5 h-3.5" /> Start searching
                </Link>
              </div>
            ) : (
              <div className="overflow-y-auto flex-1 space-y-2 pr-1">
                {lists.map((list) => (
                  <div
                    key={list.id}
                    onClick={() => openList(list)}
                    className={`group flex items-center gap-3 p-3 rounded-xl cursor-pointer
                      transition-all border ${
                        selectedList?.id === list.id
                          ? 'bg-indigo-50 dark:bg-indigo-500/15 border-indigo-200 dark:border-indigo-500/30 shadow-sm'
                          : 'bg-white dark:bg-[#171717] border-slate-200 dark:border-white/10 hover:border-indigo-300 hover:bg-slate-50 dark:hover:bg-white/5'
                      }`}>
                    <div className={`w-8 h-8 rounded-lg flex-none flex items-center justify-center ${
                        selectedList?.id === list.id
                          ? 'bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-300'
                          : 'bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-gray-400'
                    }`}>
                      <BookmarkCheck className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold truncate ${
                        selectedList?.id === list.id ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-800 dark:text-gray-100'
                      }`}>{list.name}</p>
                      <p className="text-xs text-slate-400 dark:text-gray-500">
                        {list.leadCount ?? 0} lead{list.leadCount !== 1 ? 's' : ''}
                        {list.createdAt && (
                          <span className="ml-1.5">
                            {new Date(
                              typeof list.createdAt?.toDate === 'function'
                                ? list.createdAt.toDate()
                                : list.createdAt
                            ).toLocaleDateString()}
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex-none flex items-center gap-1">
                      <ChevronRight className={`w-3.5 h-3.5 transition-opacity ${
                        selectedList?.id === list.id
                          ? 'text-indigo-400 opacity-100'
                          : 'text-slate-300 opacity-0 group-hover:opacity-100'
                      }`} />
                      <button
                        onClick={(e) => { e.stopPropagation(); requestDeleteList(list.id); }}
                        disabled={deletingListId === list.id}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded text-slate-300
                          hover:text-red-500 transition-all disabled:opacity-50">
                        {deletingListId === list.id
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <Trash2 className="w-3.5 h-3.5" />
                        }
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Right: leads panel ───────────────────────────────────── */}
          <div className="flex-1 min-w-0 flex flex-col gap-4">
            {!selectedList ? (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-400 dark:text-gray-500 gap-3">
                <BookmarkCheck className="w-14 h-14 opacity-20" />
                <p className="text-sm font-medium">Select a list to view its leads</p>
              </div>
            ) : (
              <>
                {/* Toolbar card */}
                <div className="bg-white dark:bg-[#171717] rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-base font-bold text-slate-900 dark:text-white">{selectedList.name}</h2>
                      <p className="text-xs text-slate-400 dark:text-gray-500 mt-0.5">
                        {loadingLeads
                          ? 'Loading…'
                          : `${visibleLeads.length}${searchFilter ? ' matching' : ''} of ${leads.length} lead${leads.length !== 1 ? 's' : ''}`
                        }
                      </p>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Filter input */}
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                        <input
                          value={searchFilter}
                          onChange={(e) => setSearchFilter(e.target.value)}
                          placeholder="Filter leads…"
                          className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 dark:border-white/10 rounded-lg
                            bg-slate-50 dark:bg-white/5 text-slate-800 dark:text-gray-200
                            focus:bg-white dark:focus:bg-white/10 focus:border-indigo-400 focus:ring-1
                            focus:ring-indigo-100 dark:focus:ring-indigo-500/20 outline-none w-40"
                        />
                      </div>

                      {/* Export CSV */}
                      <button
                        onClick={handleExportExcel}
                        disabled={!leads.length || !!exporting}
                        title="Export visible leads as CSV"
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold
                          rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200
                          hover:bg-emerald-100 disabled:opacity-40 transition-colors">
                        {exporting === 'excel'
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <Download className="w-3.5 h-3.5" />
                        }
                        Excel
                      </button>

                      {/* Export PDF */}
                      <button
                        onClick={handleExportPdf}
                        disabled={!leads.length || !!exporting}
                        title="Export visible leads as PDF"
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold
                          rounded-lg bg-red-50 text-red-700 border border-red-200
                          hover:bg-red-100 disabled:opacity-40 transition-colors">
                        {exporting === 'pdf'
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <FileText className="w-3.5 h-3.5" />
                        }
                        PDF
                      </button>

                      {/* Import CSV */}
                      <button
                        onClick={() => importFileRef.current?.click()}
                        disabled={importing}
                        title="Import leads from a CSV file"
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold
                          rounded-lg bg-violet-50 text-violet-700 border border-violet-200
                          hover:bg-violet-100 disabled:opacity-40 transition-colors">
                        {importing
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <Upload className="w-3.5 h-3.5" />
                        }
                        Import CSV
                      </button>

                      <button
                        onClick={() => { setBulkMode((m) => !m); setBulkSelected(new Set()); }}
                        className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5
                          rounded-full border transition-all active:scale-[0.97] ${
                          bulkMode
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-white dark:bg-[#171717] text-slate-600 dark:text-gray-400 border-slate-200 dark:border-white/10 hover:border-indigo-300'
                        }`}
                      >
                        {bulkMode && bulkSelected.size > 0
                          ? `${bulkSelected.size} selected`
                          : 'Select'
                        }
                      </button>

                      <input
                        ref={importFileRef}
                        type="file"
                        accept=".csv"
                        className="hidden"
                        onChange={handleImportFile}
                      />
                    </div>
                  </div>

                  {/* Import success toast */}
                  {importResult && (
                    <div className="mt-3 flex items-center gap-2 text-xs font-medium text-emerald-700
                      bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                      <Table2 className="w-3.5 h-3.5 flex-none" />
                      Imported {importResult.count} lead{importResult.count !== 1 ? 's' : ''} successfully!
                      <button onClick={() => setImportResult(null)} className="ml-auto text-emerald-400 hover:text-emerald-700">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Leads table */}
                <div className="flex-1 bg-white dark:bg-[#171717] rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm overflow-hidden flex flex-col">
                  {bulkMode && bulkSelected.size > 0 && (
                    <div className="flex items-center gap-3 px-4 py-2.5 mb-3
                      bg-indigo-50 dark:bg-indigo-500/10
                      border border-indigo-200 dark:border-indigo-500/30 rounded-xl mx-3 mt-3">
                      <span className="text-xs font-semibold text-indigo-700 dark:text-indigo-300">
                        {bulkSelected.size} lead{bulkSelected.size > 1 ? 's' : ''} selected
                      </span>
                      <button
                        onClick={handleBulkExportExcel}
                        className="text-xs font-medium px-3 py-1 rounded-full
                          bg-emerald-50 dark:bg-emerald-500/10
                          text-emerald-700 dark:text-emerald-400
                          border border-emerald-200 dark:border-emerald-500/30
                          hover:bg-emerald-100 transition-colors"
                      >
                        Export Excel
                      </button>
                      <button
                        onClick={handleBulkDelete}
                        className="text-xs font-medium px-3 py-1 rounded-full
                          bg-red-50 dark:bg-red-500/10
                          text-red-700 dark:text-red-400
                          border border-red-200 dark:border-red-500/30
                          hover:bg-red-100 transition-colors"
                      >
                        Delete selected
                      </button>
                      <button
                        onClick={() => { setBulkMode(false); setBulkSelected(new Set()); }}
                        className="ml-auto text-xs text-slate-400 hover:text-red-500 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  )}

                  {loadingLeads ? (
                    <div className="flex-1 flex items-center justify-center text-slate-400 gap-2 py-20">
                      <Loader2 className="w-5 h-5 animate-spin" /> Loading leads…
                    </div>
                  ) : visibleLeads.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-2 py-16">
                      <Search className="w-10 h-10 opacity-20" />
                      {searchFilter
                        ? <p className="text-sm">No leads match "{searchFilter}"</p>
                        : <>
                            <p className="text-sm font-medium">This list is empty</p>
                            <p className="text-xs">Import a CSV or save leads from search</p>
                          </>
                      }
                    </div>
                  ) : (
                    <div className="overflow-auto flex-1">
                      <table className="w-full text-left">
                        <thead className="sticky top-0 bg-slate-50 dark:bg-white/5 border-b border-slate-200 dark:border-white/10 z-10">
                          <tr>
                            {bulkMode && <th className="px-4 py-3 w-10" />}
                            <th className="px-4 py-3 text-xs font-semibold text-slate-600 dark:text-gray-400 whitespace-nowrap">Business</th>
                            <th className="px-4 py-3 text-xs font-semibold text-slate-600 dark:text-gray-400 whitespace-nowrap">Address</th>
                            <th className="px-4 py-3 text-xs font-semibold text-slate-600 dark:text-gray-400 whitespace-nowrap">Phone</th>
                            <th className="px-4 py-3 text-xs font-semibold text-slate-600 dark:text-gray-400 whitespace-nowrap">Website</th>
                            <th className="px-4 py-3 text-xs font-semibold text-slate-600 dark:text-gray-400 whitespace-nowrap">Rating</th>
                            <th className="px-4 py-3 w-10" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {visibleLeads.map((lead) => (
                            <LeadRow
                              key={lead.id}
                              lead={lead}
                              onDelete={requestDeleteLead}
                              bulkMode={bulkMode}
                              isSelected={bulkSelected.has(lead.id)}
                              onToggleBulk={(id) => {
                                setBulkSelected((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(id)) next.delete(id); else next.add(id);
                                  return next;
                                });
                              }}
                              editingNoteId={editingNoteId}
                              noteText={noteText}
                              setNoteText={setNoteText}
                              setEditingNoteId={setEditingNoteId}
                              onSaveNote={async (leadId) => {
                                try {
                                  await updateLeadNote(currentUser.uid, activeListId, leadId, noteText);
                                  setLeads((prev) => prev.map((l) => (
                                    l.id === leadId
                                      ? {
                                          ...l,
                                          note: noteText.trim(),
                                          noteUpdatedAt: new Date().toISOString(),
                                        }
                                      : l
                                  )));
                                  setEditingNoteId(null);
                                  toast.success('Note saved');
                                } catch {
                                  toast.error('Failed to save note');
                                }
                              }}
                            />
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>{/* /flex gap-6 */}
      </div>{/* /max-w-7xl */}
    </div>{/* /min-h-screen */}

    {/* Safe Delete confirmation modal */}
    <ConfirmDangerModal
      isOpen={dangerModal.open}
      onClose={() => setDangerModal(m => ({ ...m, open: false }))}
      onConfirm={async () => {
        setDangerModal(m => ({ ...m, loading: true }));
        await dangerModal.onConfirm?.();
        setDangerModal(m => ({ ...m, open: false, loading: false }));
      }}
      title={dangerModal.title}
      message={dangerModal.message}
      confirmLabel={dangerModal.confirmLabel || 'Delete'}
      loading={dangerModal.loading}
    />
  </>
  );
};

export default MyLists;
