/**
 * Lead Finder — SearchPanel  (Phase 2)
 *
 * Premium mobile-first search interface.
 * Renders:
 *   • Search form (keyword + location + optional type filter)
 *   • Live progress bar + status messages while the grid search runs
 *   • Filter bar (phone-only, has-website, deduplicate)
 *   • Responsive lead grid (1 col → 2 col → 3 col)
 *   • Empty / error / cache-hit states
 *
 * Calls: searchBusinesses() from placesApi.js
 * Does NOT touch credits — Phase 3 owns that layer.
 */

import { useState, useCallback, useRef } from 'react';
import {
  Search, MapPin, Phone, Globe, Star, RefreshCw,
  Zap, Database, AlertCircle, ChevronDown, X, Bookmark,
  FileText, Table2, Copy,
} from 'lucide-react';
import Papa from 'papaparse';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import SaveLeadsModal from './SaveLeadsModal.jsx';
import { searchBusinesses, filterByPhoneNumber, filterByAddress, deduplicateResults } from '../services/placesApi';
import { useAuth }   from '../contexts/AuthContext';
import { useCredit } from '../contexts/CreditContext';
// deduplicateResults is always applied — not a user toggle

// ─── Constants ────────────────────────────────────────────────────────────────
const BUSINESS_TYPES = [
  { value: '',                   label: 'Any type' },
  { value: 'store',              label: 'Store / Shop' },
  { value: 'restaurant',         label: 'Restaurant' },
  { value: 'lodging',            label: 'Hotel / Lodging' },
  { value: 'hospital',           label: 'Hospital / Clinic' },
  { value: 'school',             label: 'School / College' },
  { value: 'gym',                label: 'Gym / Fitness' },
  { value: 'bank',               label: 'Bank / Finance' },
  { value: 'real_estate_agency', label: 'Real Estate' },
  { value: 'manufacturer',       label: 'Manufacturer' },
  { value: 'wholesaler',         label: 'Wholesaler / Distributor' },
];

const SEARCH_SCOPES = [
  {
    value: 'city',
    label: 'Entire City',
    hint:  'Wide 5×5 grid covering the whole city',
  },
  {
    value: 'neighbourhood',
    label: 'Neighbourhood',
    hint:  'Focused 3×3 grid on a specific area or locality',
  },
  {
    value: 'specific',
    label: 'Specific Area',
    hint:  'Pinpoint a building, market, or street (single cell)',
  },
];

// ─── Export helpers (work on raw Places API result objects) ──────────────────
const leadLabel = (lead) => lead.displayName?.text || 'Unknown';
const leadAddr  = (lead) => lead.formattedAddress  || '';
const leadPhone = (lead) => lead.nationalPhoneNumber || '';
const leadWeb   = (lead) => lead.websiteUri || '';
const leadRate  = (lead) => lead.rating ?? '';
const leadRevs  = (lead) => lead.userRatingCount ?? '';

const downloadSearchCsv = (leads, keyword, location) => {
  // BOM ensures Excel opens UTF-8 correctly
  const BOM = '\uFEFF';
  const rows = leads.map((l) => ({
    'Business Name': leadLabel(l),
    'Address':       leadAddr(l),
    'Phone':         leadPhone(l),
    'Website':       leadWeb(l),
    'Rating':        leadRate(l),
    'Total Reviews': leadRevs(l),
  }));
  const csv = BOM + Papa.unparse(rows, { header: true });
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `LeadFinder_${keyword}_${location}_${new Date().toISOString().slice(0,10)}.csv`.replace(/\s+/g, '_');
  a.click();
  URL.revokeObjectURL(url);
};

const downloadSearchPdf = (leads, keyword, location) => {
  const doc        = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW      = doc.internal.pageSize.getWidth();
  const pageH      = doc.internal.pageSize.getHeight();
  const exportDate = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  const INDIGO     = [79, 70, 229];   // #4F46E5
  const VIOLET     = [109, 40, 217];  // #6D28D9
  const SLATE_900  = [15, 23, 42];
  const SLATE_500  = [100, 116, 139];
  const SLATE_50   = [248, 250, 252];
  const WHITE      = [255, 255, 255];

  // ── Header band ───────────────────────────────────────────────────────────
  // gradient simulation: two overlapping rects
  doc.setFillColor(...INDIGO);
  doc.rect(0, 0, pageW * 0.6, 28, 'F');
  doc.setFillColor(...VIOLET);
  doc.rect(pageW * 0.6, 0, pageW * 0.4, 28, 'F');

  // App name tag
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...WHITE);
  doc.text('LEAD FINDER  ·  Business Intelligence', 12, 8);

  // Main title
  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
  const titleText = `${keyword}  —  ${location}`;
  doc.text(titleText.toUpperCase(), 12, 18);

  // Stats top-right
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...WHITE);
  doc.text(`${leads.length} results`, pageW - 12, 12, { align: 'right' });
  doc.text(exportDate, pageW - 12, 19, { align: 'right' });

  // ── Thin accent line below header ─────────────────────────────────────────
  doc.setDrawColor(...INDIGO);
  doc.setLineWidth(0.8);
  doc.line(0, 28, pageW, 28);

  // ── Table ─────────────────────────────────────────────────────────────────
  autoTable(doc, {
    startY: 32,
    head:   [['#', 'Business Name', 'Address', 'Phone', 'Website', 'Rating', 'Reviews']],
    body:    leads.map((l, i) => [
      i + 1,
      leadLabel(l),
      leadAddr(l),
      leadPhone(l),
      leadWeb(l),
      leadRate(l) ? `★ ${leadRate(l)}` : '',
      leadRevs(l) ? Number(leadRevs(l)).toLocaleString() : '',
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
      0: { cellWidth: 8,  halign: 'center', textColor: SLATE_500 },
      1: { cellWidth: 52, fontStyle: 'bold' },
      2: { cellWidth: 72 },
      3: { cellWidth: 32 },
      4: { cellWidth: 52, textColor: [79, 70, 229] },
      5: { cellWidth: 18, halign: 'center', textColor: [16, 185, 129] },
      6: { cellWidth: 20, halign: 'right',  textColor: SLATE_500 },
    },
    // Footer on every page
    didDrawPage: (data) => {
      const pg  = doc.internal.getCurrentPageInfo().pageNumber;
      const tot = doc.internal.getNumberOfPages();
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...SLATE_500);
      doc.text('Lead Finder  ·  leadfinder.app', 12, pageH - 6);
      doc.text(`Page ${pg} of ${tot}`, pageW - 12, pageH - 6, { align: 'right' });
      // bottom rule
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.3);
      doc.line(12, pageH - 9, pageW - 12, pageH - 9);
    },
  });

  doc.save(`LeadFinder_${keyword}_${location}_${new Date().toISOString().slice(0,10)}.pdf`.replace(/\s+/g, '_'));
};

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Progress indicator shown while grid search is running */
const ProgressBar = ({ progress }) => {
  if (!progress) return null;

  const { phase, message, current = 0, total = 1, found = 0, apiCalls = 0 } = progress;
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  const isDone = phase === 'done';

  return (
    <div className={`rounded-xl border p-4 transition-all ${
      isDone ? 'border-emerald-200 bg-emerald-50' : 'border-indigo-200 bg-indigo-50'
    }`}>
      <div className="flex items-center justify-between mb-2 gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {isDone
            ? <Zap className="w-4 h-4 text-emerald-600 flex-none" />
            : <RefreshCw className="w-4 h-4 text-indigo-600 flex-none animate-spin" />
          }
          <span className="text-sm font-medium text-slate-700 truncate">{message}</span>
        </div>
        {!isDone && (
          <span className="text-xs text-indigo-500 font-semibold flex-none">{pct}%</span>
        )}
      </div>

      {/* Progress track */}
      {!isDone && (
        <div className="w-full bg-indigo-100 rounded-full h-1.5 overflow-hidden">
          <div
            className="bg-gradient-to-r from-indigo-500 to-violet-500 h-1.5 rounded-full transition-all duration-500"
            style={{ width: `${Math.max(pct, 4)}%` }}
          />
        </div>
      )}

      {/* Stats row */}
      {(found > 0 || apiCalls > 0) && (
        <div className="flex items-center gap-4 mt-2">
          {found > 0 && (
            <span className="text-xs text-slate-500">
              <strong className="text-slate-700">{found}</strong> found
            </span>
          )}
          {apiCalls > 0 && (
            <span className="text-xs text-slate-500">
              <strong className="text-slate-700">{apiCalls}</strong> API calls
            </span>
          )}
        </div>
      )}
    </div>
  );
};

/** Single lead card — premium compact mobile-first design with accordion contact + copy */
const LeadCard = ({ lead, selectionMode = false, isSelected = false, onToggle }) => {
  const [contactOpen, setContactOpen] = useState(false);
  const name    = lead.displayName?.text || 'Unknown Business';
  const address = lead.formattedAddress  || 'Address not available';
  const phone   = lead.nationalPhoneNumber;
  const website = lead.websiteUri;
  const rating  = lead.rating;
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

  const copyText = (text) => {
    navigator.clipboard.writeText(text).catch(() => {});
  };

  return (
    <div
      onClick={selectionMode ? onToggle : undefined}
      className={`bg-white dark:bg-[#171717] rounded-2xl border transition-all duration-300 flex flex-col overflow-hidden ring-1 ring-transparent ${selectionMode ? 'cursor-pointer' : ''} ${isSelected ? 'border-indigo-400 ring-2 ring-indigo-200 dark:ring-indigo-500/30 shadow-indigo-100' : 'border-slate-200 dark:border-white/10 hover:-translate-y-1 hover:shadow-lg dark:hover:shadow-indigo-500/5 hover:ring-slate-200 dark:hover:ring-white/20 shadow-sm'}`}>
      {/* Card body */}
      <div className="p-3 md:p-5 flex flex-col gap-2">

        {/* Header row */}
        <div className="flex items-start gap-2">
          {selectionMode && (
            <div
              className={`mt-0.5 flex-none rounded border-2 flex items-center justify-center transition-colors ${isSelected ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300 bg-white'}`}
              style={{ width: 16, height: 16, minWidth: 16 }}>
              {isSelected && (
                <svg className="w-2 h-2 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>
          )}
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white line-clamp-2 flex-1 break-words">{name}</h3>
          {lead.businessStatus && lead.businessStatus !== 'OPERATIONAL' && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 flex-none whitespace-nowrap">
              {lead.businessStatus.replace('_', ' ')}
            </span>
          )}
        </div>

        {/* Address + copy */}
        <div className="flex items-start gap-1.5">
          <MapPin className="w-3 h-3 mt-0.5 flex-none text-slate-400 dark:text-gray-600" />
          <span className="text-xs text-slate-500 dark:text-gray-400 line-clamp-2 break-words flex-1">{address}</span>
          <button
            type="button"
            title="Copy address"
            onClick={(e) => { e.stopPropagation(); copyText(address); }}
            className="flex-none text-slate-300 dark:text-gray-700 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors active:scale-[0.97] ml-0.5">
            <Copy className="w-3 h-3" strokeWidth={1.5} />
          </button>
        </div>

        {/* Rating */}
        {rating && (
          <p className="text-xs text-slate-500 dark:text-gray-500 flex items-center gap-1">
            <Star className="w-3 h-3 flex-none text-amber-400 fill-amber-400" />
            <span className="font-medium text-slate-700 dark:text-gray-300">{rating}</span>
            {lead.userRatingCount > 0 && (
              <span className="text-slate-400">({lead.userRatingCount.toLocaleString()})</span>
            )}
          </p>
        )}

        {/* Accordion: contact info */}
        {(phone || website) && (
          <div>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setContactOpen(o => !o); }}
              className="flex items-center gap-1 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 transition-colors active:scale-[0.97]"
            >
              <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${contactOpen ? 'rotate-180' : ''}`} />
              {contactOpen ? 'Hide' : 'Show'} contact
            </button>
            {contactOpen && (
              <div className="mt-1.5 space-y-1 pl-2 border-l-2 border-indigo-100 dark:border-indigo-500/30">
                {phone && (
                  <div className="flex items-center gap-1">
                    <Phone className="w-3 h-3 flex-none text-emerald-500" />
                    <span className="text-xs text-slate-700 dark:text-gray-300 font-medium">{phone}</span>
                    <button
                      type="button"
                      title="Copy phone"
                      onClick={(e) => { e.stopPropagation(); copyText(phone); }}
                      className="ml-0.5 text-slate-300 dark:text-gray-700 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors active:scale-[0.97]">
                      <Copy className="w-3 h-3" strokeWidth={1.5} />
                    </button>
                  </div>
                )}
                {website && (
                  <p className="text-xs text-slate-500 dark:text-gray-500 flex items-center gap-1.5 overflow-hidden">
                    <Globe className="w-3 h-3 flex-none text-indigo-400 dark:text-indigo-500" />
                    <span className="truncate">{website.replace(/^https?:\/\//, '')}</span>
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Action buttons — icon-only on mobile, icon+label on sm+ */}
      <div
        className="flex border-t border-slate-100 dark:border-white/10 divide-x divide-slate-100 dark:divide-white/10 mt-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {phone && (
          <a href={`tel:${phone}`}
            className="flex-1 flex items-center justify-center gap-1 py-2.5 text-xs font-semibold
              text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors active:scale-[0.97]">
            <Phone className="w-3.5 h-3.5" strokeWidth={1.5} />
            <span className="hidden sm:inline">Call</span>
          </a>
        )}
        {website && (
          <a href={website.startsWith('http') ? website : `https://${website}`}
            target="_blank" rel="noopener noreferrer"
            className="flex-1 flex items-center justify-center gap-1 py-2.5 text-xs font-semibold
              text-indigo-700 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors active:scale-[0.97]">
            <Globe className="w-3.5 h-3.5" strokeWidth={1.5} />
            <span className="hidden sm:inline">Web</span>
          </a>
        )}
        <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
          className="flex-1 flex items-center justify-center gap-1 py-2.5 text-xs font-semibold
            text-slate-700 dark:text-gray-400 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors active:scale-[0.97]">
          <MapPin className="w-3.5 h-3.5" strokeWidth={1.5} />
          <span className="hidden sm:inline">Map</span>
        </a>
      </div>
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const SearchPanel = () => {  // ── Auth + Credits ─────────────────────────────────────────────────────────────────
  const { currentUser }   = useAuth();
  const { deductCredits } = useCredit();
  // ── Form state ──────────────────────────────────────────────────────────────
  const [keyword,     setKeyword]     = useState('');
  const [location,    setLocation]    = useState('');
  const [type,        setType]        = useState('');
  const [searchScope, setSearchScope] = useState('city');
  const [area,        setArea]        = useState('');   // neighbourhood / building name

  // ── Search + result state ───────────────────────────────────────────────────
  const [results,   setResults]   = useState([]);
  const [progress,  setProgress]  = useState(null);
  const [searching, setSearching] = useState(false);
  const [error,     setError]     = useState(null);
  const [lastMeta,  setLastMeta]  = useState(null);

  // ── Filter state ────────────────────────────────────────────────────────────
  const [filterPhone,   setFilterPhone]   = useState(false);
  const [filterWebsite, setFilterWebsite] = useState(false);

  // ── Selection + save state ──────────────────────────────────────────────────
  const [selectionMode, setSelectionMode] = useState(false);
  const [selected,      setSelected]      = useState(new Set());
  const [showSaveModal, setShowSaveModal] = useState(false);

  const abortRef = useRef(false);

  // ── Derived filtered list — dedup is always on ────────────────────────────
  const visible = (() => {
    let out = deduplicateResults(results);   // always deduplicate
    if (filterPhone)   out = filterByPhoneNumber(out, true);
    if (filterWebsite) out = filterByAddress(out, false).filter((l) => l.websiteUri);
    return out;
  })();

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleSearch = useCallback(async (e) => {
    e?.preventDefault();
    if (!keyword.trim() || !location.trim()) return;
    if (searching) return;

    // ── Pre-flight credit warning ──────────────────────────────────────────────
    // We show a warning if credits are low but do NOT hard-block here.
    // Reason: the search might hit the cache (0 API calls = 0 cost = free).
    // The atomic deductCredits transaction is the real guard — it aborts with a
    // clear message if the user genuinely can't afford a live search.

    abortRef.current = false;
    setSearching(true);
    setError(null);
    setResults([]);
    setLastMeta(null);
    setProgress({ phase: 'start', message: 'Starting search…', current: 0, total: 1 });

    try {
      const res = await searchBusinesses(keyword.trim(), location.trim(), {
        type,
        searchScope,
        area: searchScope !== 'city' ? area.trim() : '',
        onProgress: (p) => {
          if (!abortRef.current) setProgress(p);
        },
      });

      if (abortRef.current) return;

      // ── Deduct actual API calls consumed (0 if cached) ──────────────────
      // We deduct AFTER the search so we charge the real cost, not an estimate.
      // Cached results (res.apiCalls === 0) are free — deductCredits is a no-op.
      if (res.apiCalls > 0) {
        try {
          await deductCredits(res.apiCalls, {
            keyword: keyword.trim(),
            location: location.trim(),
            scope: searchScope,
          });
        } catch (creditErr) {
          // Credit deduction failed — show error but still show results
          // (search already happened; don't penalise UX but log clearly)
          console.error('[credits] deduction failed after search:', creditErr.message);
          setError(`Search succeeded but credit deduction failed: ${creditErr.message}`);
        }
      }

      setResults(res.results || []);
      setLastMeta(res);
    } catch (err) {
      if (!abortRef.current) {
        setError(err.message || 'Search failed. Check your API key and try again.');
        setProgress(null);
      }
    } finally {
      if (!abortRef.current) setSearching(false);
    }
  }, [keyword, location, type, searchScope, area, searching, deductCredits]);

  const handleCancel = () => {
    abortRef.current = true;
    setSearching(false);
    setProgress(null);
  };

  const handleClear = () => {
    setResults([]);
    setError(null);
    setProgress(null);
    setLastMeta(null);
    setSelected(new Set());
    setSelectionMode(false);
  };

  // ── Selection helpers ───────────────────────────────────────────────────────
  const getLeadKey  = (lead) => lead.id || lead.placeId || lead.formattedAddress || '';
  const toggleLead  = (lead) => {
    const k = getLeadKey(lead);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  };
  const allVisibleSelected = visible.length > 0 && visible.every((l) => selected.has(getLeadKey(l)));
  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(visible.map(getLeadKey)));
    }
  };
  const cancelSelection = () => {
    setSelectionMode(false);
    setSelected(new Set());
  };
  const selectedLeads = visible.filter((l) => selected.has(getLeadKey(l)));

  // ── Multi-search derived ─────────────────────────────────────────────────────
  const hasResults    = results.length > 0;
  const keywordList   = keyword.split(',').map((k) => k.trim()).filter(Boolean);
  const locationList  = location.split(',').map((l) => l.trim()).filter(Boolean);
  const searchCount   = Math.max(keywordList.length, 1) * Math.max(locationList.length, 1);
  const isMultiSearch = searchCount > 1;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className={hasResults
      ? 'space-y-4 px-4 sm:px-6 py-6'
      : 'flex flex-col items-center justify-center min-h-[50vh] md:min-h-[calc(100vh-5rem)] py-8 px-4'
    }>

      {/* ── Hero headline (pre-search only) ─────────────────────────── */}
      {!hasResults && !searching && (
        <div className="text-center mb-6 max-w-2xl w-full">
          <h1 className="text-2xl sm:text-4xl md:text-5xl font-extrabold text-slate-900 dark:text-white tracking-tight leading-tight mb-3">
            Find Business
            <span className="block bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
              Leads Instantly
            </span>
          </h1>
          <p className="text-sm sm:text-base md:text-lg text-slate-500 dark:text-gray-400">
            Search across multiple keywords and cities in one click — powered by the Google Places API.
          </p>
        </div>
      )}

      {/* ── Search Form ──────────────────────────────────────────────── */}
      <div className={`bg-white dark:bg-[#171717] rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm w-full ${
        hasResults ? 'p-3 md:p-6' : 'max-w-4xl p-4 md:p-8 shadow-xl shadow-slate-200/60 dark:shadow-black/50'
      }`}>
        {hasResults && (
          <div className="flex items-center gap-2 mb-5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600
              flex items-center justify-center shadow-sm">
              <Search className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Business Search</h2>
              <p className="text-xs text-slate-400 dark:text-gray-500">Dynamic grid search · Zero-cost cache</p>
            </div>
          </div>
        )}

        <form onSubmit={handleSearch} className="space-y-4">

          {/* Row 0: Search scope selector */}
          <div>
            <div className="flex gap-1.5 p-1 bg-slate-100 dark:bg-white/10 rounded-xl w-fit">
              {SEARCH_SCOPES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  title={s.hint}
                  onClick={() => { setSearchScope(s.value); setArea(''); }}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all active:scale-[0.97] ${
                    searchScope === s.value
                      ? 'bg-white dark:bg-[#171717] text-indigo-700 dark:text-indigo-400 shadow-sm border border-indigo-100 dark:border-indigo-500/30'
                      : 'text-slate-500 dark:text-gray-400 hover:text-slate-800 dark:hover:text-white'
                  }`}>
                  {s.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-400 dark:text-gray-600 mt-1.5 ml-1">
              {SEARCH_SCOPES.find((s) => s.value === searchScope)?.hint}
            </p>
          </div>

          {/* Row 1: keyword + city */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Keyword */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="e.g. Kurti, Hardware shop, Pharmacy…"
                required
                className="w-full pl-10 pr-4 py-2.5 md:py-3.5 text-sm md:text-base
                  bg-transparent border-0 border-b-2 border-slate-200 dark:border-white/10 rounded-none
                  focus:border-indigo-500 dark:focus:border-indigo-500
                  outline-none transition-all placeholder-slate-400 dark:placeholder-gray-600 text-slate-800 dark:text-white"
              />
            </div>

            {/* City */}
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-gray-600 pointer-events-none" />
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder={searchScope === 'city' ? 'e.g. Ahmedabad, Surat, Mumbai…' : 'City (e.g. Ahmedabad)…'}
                required
                className="w-full pl-10 pr-4 py-2.5 md:py-3.5 text-sm md:text-base
                  bg-transparent border-0 border-b-2 border-slate-200 dark:border-white/10 rounded-none
                  focus:border-indigo-500 dark:focus:border-indigo-500
                  outline-none transition-all placeholder-slate-400 dark:placeholder-gray-600 text-slate-800 dark:text-white"
              />
            </div>
          </div>

          {/* Multi-search comma hint ─────────────────────────────────────── */}
          <p className="text-sm text-slate-400 flex flex-wrap items-center gap-x-1.5 gap-y-1">
            <span>💡 Separate multiple with commas —</span>
            <em className="not-italic font-medium text-slate-500">Kurti, Hardware</em>
            <span>in</span>
            <em className="not-italic font-medium text-slate-500">Ahmedabad, Surat</em>
            {isMultiSearch && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full
                bg-indigo-100 text-indigo-700 font-semibold text-xs">
                {searchCount} searches queued
              </span>
            )}
          </p>

          {/* Row 1b: Area / Building field — only for neighbourhood + specific scopes */}
          {searchScope !== 'city' && (
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-400 pointer-events-none" />
              <input
                value={area}
                onChange={(e) => setArea(e.target.value)}
                placeholder={
                  searchScope === 'neighbourhood'
                    ? 'Area / Neighbourhood (e.g. Maninagar, C.G. Road, Vastrapur…)'
                    : 'Building / Market / Street (e.g. Lal Darwaja Market, Relief Road…)'
                }
                required
              className="w-full pl-10 pr-36 py-2.5 md:py-3.5 text-sm
                  bg-transparent border-0 border-b-2 border-indigo-200 dark:border-indigo-500/30 rounded-none
                  focus:border-indigo-500 dark:focus:border-indigo-500
                  outline-none transition-all placeholder-indigo-300 dark:placeholder-indigo-700 text-slate-800 dark:text-white"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold
                text-indigo-400 pointer-events-none bg-indigo-50 pl-2">
                {searchScope === 'neighbourhood' ? '🏘️ Neighbourhood' : '📍 Specific Area'}
              </span>
            </div>
          )}
          <div className="flex gap-3 flex-wrap sm:flex-nowrap">
            {/* Business type */}
            <div className="relative flex-1 min-w-[160px]">
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full appearance-none pl-3 pr-8 py-2.5 md:py-3.5 text-sm
                  bg-transparent border-0 border-b-2 border-slate-200 dark:border-white/10 rounded-none
                  focus:border-indigo-500 dark:focus:border-indigo-500
                  outline-none transition-all text-slate-700 dark:text-gray-300 cursor-pointer"
              >
                {BUSINESS_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4
                text-slate-400 pointer-events-none" />
            </div>

            {/* Submit / Cancel */}
            {searching ? (
              <button type="button" onClick={handleCancel}
                className="flex items-center gap-2 px-5 py-3.5 text-sm font-semibold rounded-xl
                  bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-colors">
                <X className="w-4 h-4" /> Cancel
              </button>
            ) : (
              <button type="submit"
                disabled={!keyword.trim() || !location.trim()}
                className="flex items-center gap-2 px-5 py-2.5 md:py-3.5 text-sm font-semibold rounded-xl
                  bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-sm
                  hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed
                  transition-all hover:-translate-y-px active:scale-[0.97] whitespace-nowrap">
                <Search className="w-4 h-4" />
                {isMultiSearch ? `Search · ${searchCount} queries` : 'Search'}
              </button>
            )}
          </div>


        </form>
      </div>

      {/* ── Progress ─────────────────────────────────────────────────── */}
      {progress && <ProgressBar progress={progress} />}

      {/* ── Error ────────────────────────────────────────────────────── */}
      {error && (
        <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
          <AlertCircle className="w-4 h-4 text-red-500 flex-none mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-red-700">Search failed</p>
            <p className="text-xs text-red-500 mt-0.5 break-words">{error}</p>
          </div>
          <button onClick={() => setError(null)}
            className="flex-none text-red-400 hover:text-red-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── Results area ──────────────────────────────────────────────── */}
      {results.length > 0 && (
        <div className="space-y-4">

          {/* Sticky mini-search bar — collapses the hero form while scrolling results */}
          <div className="sticky top-16 z-20 -mx-4 sm:-mx-6 px-4 sm:px-6 py-2 bg-white/95 dark:bg-[#171717]/95 backdrop-blur-md border-b border-slate-200 dark:border-white/10 shadow-sm">
            <form onSubmit={handleSearch} className="flex items-center gap-2">
              <div className="relative flex-1 min-w-0">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 dark:text-gray-600 pointer-events-none" />
                <input
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder="Keywords…"
                  className="w-full pl-8 pr-2 py-1.5 text-sm bg-transparent border-0 border-b border-slate-200 dark:border-white/10 focus:border-indigo-500 outline-none transition-all text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-gray-600"
                />
              </div>
              <div className="relative flex-1 min-w-0">
                <MapPin className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 dark:text-gray-600 pointer-events-none" />
                <input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Location…"
                  className="w-full pl-8 pr-2 py-1.5 text-sm bg-transparent border-0 border-b border-slate-200 dark:border-white/10 focus:border-indigo-500 outline-none transition-all text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-gray-600"
                />
              </div>
              <button
                type="submit"
                disabled={!keyword.trim() || !location.trim()}
                className="flex-none flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg
                  bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50
                  transition-all active:scale-[0.97]">
                <Search className="w-3.5 h-3.5" strokeWidth={1.5} />
                <span className="hidden sm:inline">Search</span>
              </button>
            </form>
          </div>

          {/* Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Result count + cache badge */}
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-900">
                {visible.length} <span className="font-normal text-slate-500">result{visible.length !== 1 ? 's' : ''}</span>
              </span>
              {lastMeta?.cached && (
                <span className="flex items-center gap-1 text-xs font-medium px-2 py-0.5
                  rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
                  <Database className="w-3 h-3" /> Cached
                </span>
              )}
              {!lastMeta?.cached && lastMeta?.apiCalls > 0 && (
                <span className="text-xs text-slate-400">
                  {lastMeta.apiCalls} API call{lastMeta.apiCalls !== 1 ? 's' : ''}
                </span>
              )}
            </div>

            {/* Filters + list actions */}
            <div className="flex items-center gap-2 flex-wrap">
              <FilterToggle
                active={filterPhone}   onChange={setFilterPhone}
                label="Has phone" icon={<Phone className="w-3 h-3" />} />
              <FilterToggle
                active={filterWebsite} onChange={setFilterWebsite}
                label="Has website" icon={<Globe className="w-3 h-3" />} />

              {/* Separator */}
              <span className="w-px h-4 bg-slate-200" />

              {!selectionMode ? (
                /* ── Normal mode: download + Add to My List ── */
                <>
                  <button
                    onClick={() => downloadSearchCsv(visible, keyword, location)}
                    title="Download results as Excel / CSV"
                    className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full
                      bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100
                      transition-colors">
                    <Table2 className="w-3 h-3" />
                    Excel
                  </button>
                  <button
                    onClick={() => downloadSearchPdf(visible, keyword, location)}
                    title="Download results as PDF"
                    className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full
                      bg-red-50 text-red-700 border border-red-200 hover:bg-red-100
                      transition-colors">
                    <FileText className="w-3 h-3" />
                    PDF
                  </button>
                  <span className="w-px h-4 bg-slate-200" />
                  <button
                    onClick={() => setSelectionMode(true)}
                    className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full
                      bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100
                      transition-colors">
                    <Bookmark className="w-3 h-3" />
                    Add to My List
                  </button>
                </>
              ) : (
                /* ── Selection mode controls ── */
                <>
                  {/* Select all */}
                  <button
                    onClick={toggleSelectAll}
                    className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-full
                      border transition-all ${
                        allVisibleSelected
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white text-slate-600 border-slate-300 hover:border-indigo-400'
                      }`}>
                    <div className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center flex-none
                      ${ allVisibleSelected ? 'bg-white border-white' : 'border-current' }`}>
                      {allVisibleSelected && (
                        <svg className="w-2 h-2 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    Select all
                  </button>

                  {/* Save selected */}
                  <button
                    onClick={() => setShowSaveModal(true)}
                    disabled={selected.size === 0}
                    className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full
                      bg-indigo-600 text-white border border-indigo-600 hover:bg-indigo-700
                      disabled:opacity-40 transition-colors shadow-sm">
                    <Bookmark className="w-3 h-3" />
                    {selected.size > 0 ? `Save ${selected.size}` : 'Save'}
                  </button>

                  {/* Cancel selection */}
                  <button
                    onClick={cancelSelection}
                    className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-full
                      bg-white text-slate-500 border border-slate-300 hover:border-red-300
                      hover:text-red-500 transition-colors">
                    <X className="w-3 h-3" /> Cancel
                  </button>
                </>
              )}

              {!selectionMode && (
                <button onClick={handleClear}
                  className="text-xs text-slate-400 hover:text-red-500 transition-colors px-1">
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Grid */}
          {visible.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {visible.map((lead) => {
                const key        = getLeadKey(lead);
                const isSelected = selected.has(key);
                return (
                  <LeadCard
                    key={key}
                    lead={lead}
                    selectionMode={selectionMode}
                    isSelected={isSelected}
                    onToggle={() => toggleLead(lead)}
                  />
                );
              })}
            </div>
          ) : (
            <div className="text-center py-10 text-slate-400 text-sm">
              No results match the active filters.
            </div>
          )}
        </div>
      )}

      {/* ── Empty state (after search, no results) ────────────────────── */}
      {!searching && !error && results.length === 0 && progress?.phase === 'done' && (
        <div className="text-center py-14 text-slate-400">
          <Search className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">No businesses found</p>
          <p className="text-xs mt-1">Try a broader keyword or different location.</p>
        </div>
      )}

      {/* ── Save Leads Modal ─────────────────────────────────────────── */}
      {showSaveModal && (
        <SaveLeadsModal
          leads={selectedLeads}
          searchMeta={{ keyword, location, scope: searchScope }}
          userId={currentUser?.uid}
          onClose={() => setShowSaveModal(false)}
          onSuccess={() => {
            setShowSaveModal(false);
            setSelected(new Set());
          }}
        />
      )}

    </div>
  );
};

/** Reusable pill-shaped filter toggle */
const FilterToggle = ({ active, onChange, label, icon }) => (
  <button
    onClick={() => onChange(!active)}
    className={`flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full border
      transition-all ${active
        ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
        : 'bg-white text-slate-600 border-slate-300 hover:border-slate-400'
      }`}
  >
    {icon}{label}
  </button>
);

export default SearchPanel;
