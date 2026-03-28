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
  FileText, Table2, Copy, Clock, LayoutGrid, Map as MapIcon,
} from 'lucide-react';
import Papa from 'papaparse';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import SaveLeadsModal from './SaveLeadsModal.jsx';
import LeadMapView from './LeadMapView.jsx';
import CreditRequestModal from './CreditRequestModal.jsx';
import { searchBusinesses, filterByPhoneNumber, filterByAddress, deduplicateResults, getFilterChips, filterBySubtype } from '../services/placesApi';
import { createCreditRequest, logSearch, logActivity } from '../services/analyticsService';
import { GOOGLE_API_KEY, CREDIT_CONFIG } from '../config.js';
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
    hint:  '4×4 grid — covers the entire city (32 API calls)',
  },
  {
    value: 'neighbourhood',
    label: 'Neighbourhood',
    hint:  '4×3 grid — focused on your area (24 API calls)',
  },
  {
    value: 'specific',
    label: 'Specific Area',
    hint:  '1×1 grid — one exact building or street (≤9 API calls)',
  },
];

const SEARCH_SCOPE_LABELS = {
  city: 'Entire City',
  neighbourhood: 'Neighbourhood',
  specific: 'Specific Area',
};

const MAX_API_CALLS_PER_PAIR = {
  city: 32,
  neighbourhood: 24,
  specific: 9,
};

const COST_PER_CALL_USD = CREDIT_CONFIG.COST_PER_REQUEST_USD || 0.032;

// ─── Export helpers (work on raw Places API result objects) ──────────────────
const leadLabel = (lead) => lead.displayName?.text || 'Unknown';
const leadAddr  = (lead) => lead.formattedAddress  || '';
const leadPhone = (lead) => lead.nationalPhoneNumber || '';
const leadWeb   = (lead) => lead.websiteUri || '';
const leadRate  = (lead) => lead.rating ?? '';
const leadRevs  = (lead) => lead.userRatingCount ?? '';

const downloadSearchExcel = async (leads, keyword, location) => {
  const { utils, write } = await import('xlsx');
  const rows = leads.map((l) => ({
    'Business Name': leadLabel(l),
    'Address':       leadAddr(l),
    'Phone':         leadPhone(l),
    'Website':       leadWeb(l),
    'Rating':        leadRate(l),
    'Total Reviews': leadRevs(l),
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
    { wch: 36 }, // Business Name
    { wch: 120 }, // Address (very wide + multiline)
    { wch: 20 }, // Phone
    { wch: 46 }, // Website
    { wch: 10 }, // Rating
    { wch: 14 }, // Total Reviews
  ];
  ws['!rows'] = [{ hpt: 22 }, ...rows.map(() => ({ hpt: 42 }))];
  ws['!autofilter'] = { ref: 'A1:F1' };

  const wb = utils.book_new();
  utils.book_append_sheet(wb, ws, 'Search Results');
  const out = write(wb, { bookType: 'xlsx', type: 'array' });

  const blob = new Blob(
    [out],
    { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `LeadFinder_${keyword}_${location}_${new Date().toISOString().slice(0,10)}.xlsx`.replace(/\s+/g, '_');
  a.click();
  URL.revokeObjectURL(url);
  toast.success('Excel downloaded!');
};

const downloadSearchPdf = async (leads, keyword, location) => {
  const tid = toast.loading('Preparing PDF...');
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');
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
      leadRate(l) ? String(leadRate(l)) : '',
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
      0: { cellWidth: 18, halign: 'center', textColor: SLATE_500, cellPadding: { left: 1.5, right: 1.5, top: 3.5, bottom: 3.5 } },
      1: { cellWidth: 52, fontStyle: 'bold' },
      2: { cellWidth: 66 },
      3: { cellWidth: 32 },
      4: { cellWidth: 56, textColor: [79, 70, 229] },
      5: { cellWidth: 22, halign: 'center', textColor: [16, 185, 129] },
      6: { cellWidth: 22, halign: 'right',  textColor: SLATE_500 },
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
  toast.dismiss(tid);
  toast.success('PDF downloaded!');
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
      isDone
        ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10'
        : 'border-indigo-200 bg-indigo-50 dark:border-indigo-500/30 dark:bg-indigo-500/10'
    }`}>
      <div className="flex items-center justify-between mb-2 gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {isDone
            ? <Zap className="w-4 h-4 text-emerald-600 flex-none" />
            : <RefreshCw className="w-4 h-4 text-indigo-600 flex-none animate-spin" />
          }
          <span className="text-sm font-medium text-slate-700 dark:text-gray-200 truncate">{message}</span>
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
            <span className="text-xs text-slate-500 dark:text-gray-400">
              <strong className="text-slate-700 dark:text-white">{found}</strong> found
            </span>
          )}
          {apiCalls > 0 && (
            <span className="text-xs text-slate-500 dark:text-gray-400">
              <strong className="text-slate-700 dark:text-white">{apiCalls}</strong> API calls
            </span>
          )}
        </div>
      )}
    </div>
  );
};

/** Single lead card — premium compact mobile-first design with accordion contact + copy */
const LeadCardSkeleton = () => (
  <div className="animate-pulse bg-white dark:bg-[#171717] rounded-2xl
    border border-slate-200 dark:border-white/10 p-5 flex flex-col gap-3 h-44">
    <div className="h-3.5 bg-slate-200 dark:bg-white/10 rounded-lg w-3/4" />
    <div className="h-2.5 bg-slate-100 dark:bg-white/5 rounded-lg w-full" />
    <div className="h-2.5 bg-slate-100 dark:bg-white/5 rounded-lg w-2/3" />
    <div className="h-2.5 bg-slate-100 dark:bg-white/5 rounded-lg w-1/2" />
    <div className="mt-auto h-8 bg-slate-100 dark:bg-white/5 rounded-lg w-full" />
  </div>
);

const LeadCard = ({ lead, selectionMode = false, isSelected = false, onToggle }) => {
  const [contactOpen, setContactOpen] = useState(false);
  const name    = lead.displayName?.text || 'Unknown Business';
  const address = lead.formattedAddress  || 'Address not available';
  const phone   = lead.nationalPhoneNumber;
  const website = lead.websiteUri;
  const rating  = lead.rating;
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

  const copyText = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      toast.success('Copied!');
    }).catch(() => {});
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
  const navigate = useNavigate();
  const {
    deductCredits,
    myCreditRemainingUsd,
    myCreditIsUnlimited,
    myMonthlyLimitUsd,
    loading: loadingCredits,
  } = useCredit();
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
  const [filterPhone,    setFilterPhone]    = useState(false);
  const [filterWebsite,  setFilterWebsite]  = useState(false);
  const [subtype,        setSubtype]        = useState('');   // context-aware — value from getFilterChips(type)
  const [filterRating,   setFilterRating]   = useState(0);

  const [savedSearches, setSavedSearches] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('lf-saved-searches') || '[]');
    } catch {
      return [];
    }
  });
  const [showSavedDropdown, setShowSavedDropdown] = useState(false);
  const [viewMode, setViewMode] = useState('grid');

  // ── Selection + save state ──────────────────────────────────────────────────
  const [selectionMode, setSelectionMode] = useState(false);
  const [selected,      setSelected]      = useState(new Set());
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showCreditModal, setShowCreditModal] = useState(false);
  const [creditRequestLoading, setCreditRequestLoading] = useState(false);

  const abortRef = useRef(false);

  const estimateMaxSearchCostUsd = useCallback(() => {
    const keywordCount = keyword.split(',').map((k) => k.trim()).filter(Boolean).length || 1;
    const locationCount = location.split(',').map((l) => l.trim()).filter(Boolean).length || 1;
    const pairCount = keywordCount * locationCount;
    const callsPerPair = MAX_API_CALLS_PER_PAIR[searchScope] ?? MAX_API_CALLS_PER_PAIR.city;
    return +(pairCount * callsPerPair * COST_PER_CALL_USD).toFixed(4);
  }, [keyword, location, searchScope]);

  const ensureSufficientCredits = useCallback((forRefresh = false) => {
    if (loadingCredits) {
      setError('Checking your credit balance. Please try again in a moment.');
      return false;
    }

    if (myCreditIsUnlimited) return true;

    const remainingUsd = Number(myCreditRemainingUsd ?? 0);
    const estimatedCostUsd = estimateMaxSearchCostUsd();

    if (remainingUsd + 0.0001 < estimatedCostUsd) {
      const actionLabel = forRefresh ? 'refresh search' : 'search';
      const message =
        `Not enough credits to ${actionLabel}. ` +
        `Estimated cost is $${estimatedCostUsd.toFixed(2)}, but only $${Math.max(0, remainingUsd).toFixed(2)} remains. ` +
        'Please ask admin for more credits or use a smaller search scope.';
      setError(message);
      toast.error('Insufficient credits for this search');
      return false;
    }

    return true;
  }, [loadingCredits, myCreditIsUnlimited, myCreditRemainingUsd, estimateMaxSearchCostUsd]);

  // ── Derived filtered list — dedup is always on ────────────────────────────
  const visible = (() => {
    let out = deduplicateResults(results);   // always deduplicate
    if (filterPhone)   out = filterByPhoneNumber(out, true);
    if (filterWebsite) out = filterByAddress(out, false).filter((l) => l.websiteUri);
    if (subtype)       out = filterBySubtype(out, type, subtype);
    if (filterRating > 0) out = out.filter((l) => (l.rating ?? 0) >= filterRating);
    return out;
  })();

  const isCreditError = !!error && /not enough credits|insufficient user credits|credit allocation|monthly allocation/i.test(error);

  const openCreditModal = useCallback(() => {
    setShowCreditModal(true);
  }, []);

  const handleCreditRequestSubmit = useCallback(async (details) => {
    setCreditRequestLoading(true);
    try {
      if (!currentUser?.uid) {
        toast.error('Authentication error. Please refresh and try again.');
        return;
      }

      const estimatedCostUsd = estimateMaxSearchCostUsd();
      const remainingUsd = Number(myCreditRemainingUsd ?? 0);
      
      console.log('[SearchPanel] Submitting credit request:', {
        userId: currentUser?.uid,
        userEmail: currentUser?.email,
        estimatedCostUsd,
        requestedAmountUsd: details.requestedAmountUsd,
      });

      const result = await createCreditRequest({
        userId: currentUser?.uid,
        userEmail: currentUser?.email,
        keyword: keyword.trim(),
        location: location.trim(),
        scope: searchScope,
        estimatedCostUsd,
        remainingUsd,
        requestedAmountUsd: details.requestedAmountUsd,
        reason: details.reason,
      });

      if (result.ok) {
        toast.success('Credit request submitted! Admin will review it shortly.');
        setShowCreditModal(false);
        setError(null);
        navigate('/platform-usage');
        return;
      }

      const errorMsg = result.error || 'Unknown error';
      console.error('[SearchPanel] Credit request failed:', errorMsg);
      toast.error(`Request failed: ${errorMsg}`);
    } finally {
      setCreditRequestLoading(false);
    }
  }, [
    estimateMaxSearchCostUsd,
    myCreditRemainingUsd,
    currentUser?.uid,
    currentUser?.email,
    keyword,
    location,
    searchScope,
    navigate,
  ]);

  const saveCurrentSearch = () => {
    if (!keyword.trim() || !location.trim()) return;
    const entry = {
      id: Date.now(),
      keyword: keyword.trim(),
      location: location.trim(),
      scope: searchScope,
      area: searchScope !== 'city' ? area.trim() : '',
      type,
      savedAt: new Date().toISOString(),
    };
    const updated = [
      entry,
      ...savedSearches.filter(
        (s) => !(s.keyword === entry.keyword && s.location === entry.location)
      ),
    ].slice(0, 10);
    setSavedSearches(updated);
    localStorage.setItem('lf-saved-searches', JSON.stringify(updated));
    toast.success('Search template saved!');
  };

  const loadSavedSearch = (s) => {
    setKeyword(s.keyword);
    setLocation(s.location);
    setSearchScope(s.scope || 'city');
    setArea(s.area || '');
    setType(s.type || '');
    setShowSavedDropdown(false);
  };

  const deleteSavedSearch = (id, e) => {
    e.stopPropagation();
    const updated = savedSearches.filter((s) => s.id !== id);
    setSavedSearches(updated);
    localStorage.setItem('lf-saved-searches', JSON.stringify(updated));
  };

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleSearch = useCallback(async (e) => {
    e?.preventDefault();
    if (!keyword.trim() || !location.trim()) return;
    if (searching) return;
    if (!ensureSufficientCredits(false)) {
      // Log credit exhaustion failure
      try {
        if (currentUser?.uid) {
          const remainingUsd = Number(myCreditRemainingUsd ?? 0);
          const estimatedCostUsd = estimateMaxSearchCostUsd();
          await logActivity({
            type: 'credit',
            severity: 'error',
            action: 'Search Blocked - Insufficient Credits',
            user: currentUser.email,
            userEmail: currentUser.email,
            userId: currentUser.uid,
            details: `User attempted search for "${keyword.trim()}" in ${location.trim()}. Required: $${estimatedCostUsd.toFixed(2)}, Available: $${Math.max(0, remainingUsd).toFixed(2)}`,
          });
        }
      } catch (logErr) {
        if (import.meta.env.DEV) console.warn('[SearchPanel] Failed to log credit error:', logErr);
      }
      return;
    }
    const searchStartTime = Date.now();

    abortRef.current = false;
    setSearching(true);
    setError(null);
    setResults([]);
    setLastMeta(null);
    setFilterPhone(false);
    setFilterWebsite(false);
    setSubtype('');
    setFilterRating(0);
    setViewMode('grid');
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
        await deductCredits(res.apiCalls, {
          keyword: keyword.trim(),
          location: location.trim(),
          scope: searchScope,
        });
      }

      setResults(res.results || []);
      setLastMeta(res);

      // Log the search to systemLogs and searchLogs
      try {
        if (currentUser?.uid) {
          await logSearch(currentUser.uid, currentUser.email, {
            keyword: keyword.trim(),
            query: `${keyword.trim()} in ${location.trim()}`,
            location: location.trim(),
            resultCount: res.results?.length ?? 0,
            success: true,
            creditsUsed: res.apiCalls ?? 0,
            responseTime: Date.now() - searchStartTime,
            filters: { type, searchScope, area },
            metadata: { cached: res.cached ?? false },
          });
        }
      } catch (logErr) {
        // Log failure is non-fatal — never block the search result
        if (import.meta.env.DEV) console.warn('[Search] logSearch failed:', logErr);
      }
    } catch (err) {
      if (!abortRef.current) {
        const errorMsg = err.message || 'Search failed. Check your API key and try again.';
        setError(errorMsg);
        setProgress(null);

        // Log credit-related and API errors to systemLogs
        try {
          if (currentUser?.uid) {
            await logSearch(currentUser.uid, currentUser.email, {
              keyword: keyword.trim(),
              query: `${keyword.trim()} in ${location.trim()}`,
              location: location.trim(),
              resultCount: 0,
              success: false,
              errorMessage: errorMsg,
              creditsUsed: 0,
              responseTime: Date.now() - searchStartTime,
              filters: { type, searchScope, area },
              metadata: { failed: true },
            });
          }

          if (currentUser?.uid && (errorMsg.toLowerCase().includes('credit') || errorMsg.toLowerCase().includes('insufficient'))) {
            await logActivity({
              type: 'credit',
              severity: 'error',
              action: 'Search Failed - Credit Error',
              user: currentUser.email,
              userEmail: currentUser.email,
              userId: currentUser.uid,
              details: `Search for "${keyword.trim()}" in ${location.trim()} failed: ${errorMsg}`,
            });
          }
        } catch (logErr) {
          if (import.meta.env.DEV) console.warn('[SearchPanel] Failed to log error:', logErr);
        }
      }
    } finally {
      if (!abortRef.current) setSearching(false);
    }
  }, [keyword, location, type, searchScope, area, searching, deductCredits, currentUser, ensureSufficientCredits]);

  const handleCancel = () => {
    abortRef.current = true;
    setSearching(false);
    setProgress(null);
  };

  // Re-runs the current search bypassing the Firestore cache and writes a
  // fresh entry.  Only active when results are showing as "Cached".
  const handleRefresh = useCallback(async () => {
    if (!keyword.trim() || !location.trim() || searching) return;
    if (!ensureSufficientCredits(true)) {
      // Log refresh credit exhaustion failure
      try {
        if (currentUser?.uid) {
          const remainingUsd = Number(myCreditRemainingUsd ?? 0);
          const estimatedCostUsd = estimateMaxSearchCostUsd();
          await logActivity({
            type: 'credit',
            severity: 'error',
            action: 'Search Refresh Blocked - Insufficient Credits',
            user: currentUser.email,
            userEmail: currentUser.email,
            userId: currentUser.uid,
            details: `User attempted refresh for "${keyword.trim()}" in ${location.trim()}. Required: $${estimatedCostUsd.toFixed(2)}, Available: $${Math.max(0, remainingUsd).toFixed(2)}`,
          });
        }
      } catch (logErr) {
        if (import.meta.env.DEV) console.warn('[SearchPanel] Failed to log refresh credit error:', logErr);
      }
      return;
    }
    const searchStartTime = Date.now();

    abortRef.current = false;
    setSearching(true);
    setError(null);
    setResults([]);
    setLastMeta(null);
    setViewMode('grid');
    setProgress({ phase: 'start', message: 'Starting fresh search…', current: 0, total: 1 });

    try {
      const res = await searchBusinesses(keyword.trim(), location.trim(), {
        type,
        searchScope,
        area: searchScope !== 'city' ? area.trim() : '',
        forceRefresh: true,          // ← skip cache read, run live sweep
        onProgress: (p) => {
          if (!abortRef.current) setProgress(p);
        },
      });

      if (abortRef.current) return;

      if (res.apiCalls > 0) {
        await deductCredits(res.apiCalls, {
          keyword: keyword.trim(),
          location: location.trim(),
          scope: searchScope,
        });
      }

      setResults(res.results || []);
      setLastMeta(res);

      // Log the refreshed search to systemLogs and searchLogs
      try {
        if (currentUser?.uid) {
          await logSearch(currentUser.uid, currentUser.email, {
            keyword: keyword.trim(),
            query: `${keyword.trim()} in ${location.trim()}`,
            location: location.trim(),
            resultCount: res.results?.length ?? 0,
            success: true,
            creditsUsed: res.apiCalls ?? 0,
            responseTime: Date.now() - searchStartTime,
            filters: { type, searchScope, area },
            metadata: { cached: res.cached ?? false, refreshed: true },
          });
        }
      } catch (logErr) {
        if (import.meta.env.DEV) console.warn('[Search] logSearch failed:', logErr);
      }
    } catch (err) {
      if (!abortRef.current) {
        const errorMsg = err.message || 'Refresh failed. Check your API key and try again.';
        setError(errorMsg);
        setProgress(null);

        // Log credit-related and API errors to systemLogs
        try {
          if (currentUser?.uid) {
            await logSearch(currentUser.uid, currentUser.email, {
              keyword: keyword.trim(),
              query: `${keyword.trim()} in ${location.trim()}`,
              location: location.trim(),
              resultCount: 0,
              success: false,
              errorMessage: errorMsg,
              creditsUsed: 0,
              responseTime: Date.now() - searchStartTime,
              filters: { type, searchScope, area },
              metadata: { failed: true, refreshed: true },
            });
          }

          if (currentUser?.uid && (errorMsg.toLowerCase().includes('credit') || errorMsg.toLowerCase().includes('insufficient'))) {
            await logActivity({
              type: 'credit',
              severity: 'error',
              action: 'Search Refresh Failed - Credit Error',
              user: currentUser.email,
              userEmail: currentUser.email,
              userId: currentUser.uid,
              details: `Refresh for "${keyword.trim()}" in ${location.trim()} failed: ${errorMsg}`,
            });
          }
        } catch (logErr) {
          if (import.meta.env.DEV) console.warn('[SearchPanel] Failed to log refresh error:', logErr);
        }
      }
    } finally {
      if (!abortRef.current) setSearching(false);
    }
  }, [keyword, location, type, searchScope, area, searching, deductCredits, currentUser, ensureSufficientCredits]);

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
      ? 'space-y-4 px-4 sm:px-6 py-6 overflow-x-hidden w-full'
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
            Search across multiple keywords and cities in one click.
          </p>
        </div>
      )}

      {/* ── Search Form ──────────────────────────────────────────────── */}
      <div className={`bg-white dark:bg-[#171717] rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm w-full ${
        hasResults ? 'p-3 md:p-6' : 'max-w-4xl p-4 md:p-8 shadow-xl shadow-slate-200/60 dark:shadow-black/50 overflow-hidden'
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
            <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 dark:bg-white/10 rounded-xl w-full">
              {SEARCH_SCOPES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  title={s.hint}
                  onClick={() => { setSearchScope(s.value); setArea(''); }}
                  className={`w-full px-3 py-1.5 text-xs font-semibold rounded-lg transition-all active:scale-[0.97] ${
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
                    ? 'e.g. Maninagar, C.G. Road…'
                    : 'e.g. New Cloth Market, Relief Road…'
                }
                required
              className="w-full pl-10 pr-28 sm:pr-36 py-2.5 md:py-3.5 text-sm
                  bg-transparent border-0 border-b-2 border-indigo-200 dark:border-indigo-500/30 rounded-none
                  focus:border-indigo-500 dark:focus:border-indigo-500
                  outline-none transition-all placeholder-indigo-300 dark:placeholder-indigo-700 text-slate-800 dark:text-white"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold
                text-indigo-400 dark:text-indigo-500 pointer-events-none
                bg-indigo-50 dark:bg-indigo-500/10 pl-2 rounded-sm">
                <span className="hidden sm:inline">
                  {searchScope === 'neighbourhood' ? '🏘️ Neighbourhood' : '📍 Specific Area'}
                </span>
                <span className="sm:hidden">
                  {searchScope === 'neighbourhood' ? '🏘️' : '📍'}
                </span>
              </span>
            </div>
          )}
          <div className="flex gap-3 flex-wrap sm:flex-nowrap">
            {/* Business type */}
            <div className="relative flex-1 min-w-[160px]">
              <select
                value={type}
                onChange={(e) => { setType(e.target.value); setSubtype(''); }}
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
                  transition-all hover:-translate-y-px active:scale-[0.97] whitespace-nowrap btn-ripple">
                <Search className="w-4 h-4" />
                {isMultiSearch ? `Search · ${searchCount} queries` : 'Search'}
              </button>
            )}

            {keyword.trim() && location.trim() && (
              <button
                type="button"
                onClick={saveCurrentSearch}
                title="Save this search as a template"
                className="flex-none p-2.5 rounded-xl border border-slate-200 dark:border-white/10
                  text-slate-400 dark:text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400
                  hover:border-indigo-300 dark:hover:border-indigo-500/40 transition-all active:scale-[0.97]"
              >
                <Bookmark className="w-4 h-4" strokeWidth={1.5} />
              </button>
            )}

            {savedSearches.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => setShowSavedDropdown((o) => !o)}
                  className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-xl
                    border border-slate-200 dark:border-white/10 text-slate-600 dark:text-gray-400
                    hover:bg-slate-50 dark:hover:bg-white/5 transition-all"
                >
                  <Clock className="w-3.5 h-3.5" strokeWidth={1.5} />
                  <span className="hidden sm:inline">Saved</span>
                  <span className="text-[10px] bg-indigo-100 dark:bg-indigo-500/20
                    text-indigo-700 dark:text-indigo-300 px-1.5 py-0.5 rounded-full font-semibold">
                    {savedSearches.length}
                  </span>
                </button>

                {showSavedDropdown && (
                  <>
                    <div
                      className="fixed inset-0 z-30"
                      onClick={() => setShowSavedDropdown(false)}
                    />
                    <div className="fixed top-32 right-8 w-72 bg-white dark:bg-[#1e1e1e]
                      border border-slate-200 dark:border-white/10 rounded-xl shadow-2xl z-40 overflow-hidden">
                      <div className="px-3 py-2 border-b border-slate-100 dark:border-white/5">
                        <p className="text-[10px] font-semibold uppercase tracking-widest
                          text-slate-400 dark:text-gray-600">
                          Saved searches
                        </p>
                      </div>
                      <div className="max-h-64 overflow-y-auto">
                        {savedSearches.length === 0 ? (
                          <div className="px-3 py-4 text-center">
                            <p className="text-xs text-slate-500">No saved searches</p>
                          </div>
                        ) : (
                          savedSearches.map((s) => (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => loadSavedSearch(s)}
                              className="w-full flex items-center gap-2 px-3 py-2.5 text-left
                                hover:bg-slate-50 dark:hover:bg-white/5 transition-colors group"
                            >
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                                  {s.keyword}
                                </p>
                                <p className="text-[10px] text-slate-400 dark:text-gray-600 truncate">
                                  {s.location}
                                  {s.scope && s.scope !== 'city' && s.area ? ` • ${s.area}` : ''}
                                </p>
                                <p className="text-[10px] text-indigo-600 dark:text-indigo-300 font-medium mt-0.5 truncate">
                                  {SEARCH_SCOPE_LABELS[s.scope || 'city']}
                                </p>
                              </div>
                              <span
                                onClick={(e) => deleteSavedSearch(s.id, e)}
                                className="flex-none opacity-0 group-hover:opacity-100 text-slate-300
                                  dark:text-gray-700 hover:text-red-500 dark:hover:text-red-400
                                  transition-all cursor-pointer p-0.5"
                              >
                                <X className="w-3 h-3" strokeWidth={1.5} />
                              </span>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  </>
                )}
              </>
            )}
          </div>


        </form>
      </div>

      {/* ── Progress ─────────────────────────────────────────────────── */}
      {progress && <ProgressBar progress={progress} />}

      {/* Skeleton grid — shown while search is running and no results yet */}
      {searching && results.length === 0 && (
        <div className="w-full overflow-hidden">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 mt-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <LeadCardSkeleton key={i} />
            ))}
          </div>
        </div>
      )}

      {/* ── Error ────────────────────────────────────────────────────── */}
      {error && (
        <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
          <AlertCircle className="w-4 h-4 text-red-500 flex-none mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-red-700">Search failed</p>
            <p className="text-xs text-red-500 mt-0.5 break-words">{error}</p>
            {isCreditError && (
              <button
                type="button"
                onClick={openCreditModal}
                className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg
                  bg-amber-500 text-white hover:bg-amber-600 transition-colors"
              >
                Request Credits
              </button>
            )}
          </div>
          <button onClick={() => setError(null)}
            className="flex-none text-red-400 hover:text-red-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── Credit Request Modal ─────────────────────────────────────── */}
      <CreditRequestModal
        isOpen={showCreditModal}
        onClose={() => setShowCreditModal(false)}
        userEmail={currentUser?.email}
        estimatedCostUsd={estimateMaxSearchCostUsd()}
        remainingUsd={Number(myCreditRemainingUsd ?? 0)}
        currentLimitUsd={Number(myMonthlyLimitUsd ?? 50)}
        onSubmit={handleCreditRequestSubmit}
        isLoading={creditRequestLoading}
      />

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
                  transition-all active:scale-[0.97] btn-ripple">
                <Search className="w-3.5 h-3.5" strokeWidth={1.5} />
                <span className="hidden sm:inline">Search</span>
              </button>
            </form>
          </div>

          {/* Toolbar */}
          <div className="space-y-2.5">

            {/* Row 1: Context-aware filter chips — zero API calls, instant client-side filter */}
            {/* Chips adapt to the selected type: products show Retailer/Wholesaler/Distributor/Manufacturer, */}
            {/* restaurants show Restaurant/Cafe/Fast Food/Catering, banks show Bank/Finance/Insurance/Forex, etc. */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-slate-500 dark:text-gray-400 mr-1">Filter:</span>
              {getFilterChips(type).map((r) => (
                <button
                  key={r.value}
                  type="button"
                  title={r.hint}
                  onClick={() => setSubtype(r.value)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all active:scale-[0.97] ${
                    subtype === r.value
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                      : 'bg-white dark:bg-[#171717] text-slate-600 dark:text-gray-400 border-slate-200 dark:border-white/10 hover:border-indigo-300 hover:text-indigo-600'
                  }`}
                >
                  {r.label}
                  {subtype === r.value && r.value !== '' && (
                    <span className="ml-1 opacity-70">· {visible.length}</span>
                  )}
                </button>
              ))}
              {subtype !== '' && (
                <span className="text-xs text-slate-400 dark:text-gray-600 ml-1">
                  {visible.length} of {deduplicateResults(results).length} results
                </span>
              )}

              {/* Rating filter separator */}
              <span className="w-px h-4 bg-slate-200 dark:bg-white/10 mx-1" />

              {/* Rating chips */}
              {[
                { value: 0, label: 'Any ★' },
                { value: 3, label: '3★+' },
                { value: 4, label: '4★+' },
                { value: 4.5, label: '4.5★+' },
              ].map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFilterRating(value)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold border
                    transition-all active:scale-[0.97] ${
                    filterRating === value
                      ? 'bg-amber-500 text-white border-amber-500 shadow-sm'
                      : 'bg-white dark:bg-[#171717] text-slate-600 dark:text-gray-400 border-slate-200 dark:border-white/10 hover:border-amber-300 hover:text-amber-600 dark:hover:text-amber-400'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Row 2: Count + cache | Filters + actions */}
            <div className="flex flex-wrap items-center justify-between gap-2">
            {/* Result count + cache badge */}
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-900 dark:text-white">
                {visible.length} <span className="font-normal text-slate-500 dark:text-gray-400">result{visible.length !== 1 ? 's' : ''}</span>
              </span>
              <div className="flex items-center gap-0.5 bg-slate-100 dark:bg-white/5
                rounded-lg p-0.5 border border-slate-200 dark:border-white/10">
                {[
                  { mode: 'grid', Icon: LayoutGrid, label: 'Grid' },
                  { mode: 'map', Icon: MapIcon, label: 'Map' },
                ].map(({ mode, Icon, label }) => (
                  <button
                    key={mode}
                    onClick={() => setViewMode(mode)}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md
                      text-xs font-medium transition-all ${
                      viewMode === mode
                        ? 'bg-white dark:bg-white/10 text-slate-900 dark:text-white shadow-sm'
                        : 'text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-300'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" strokeWidth={1.5} />
                    <span className="hidden sm:inline">{label}</span>
                  </button>
                ))}
              </div>
              {lastMeta?.cached && (
                <>
                  <span className="flex items-center gap-1 text-xs font-medium px-2 py-0.5
                    rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
                    <Database className="w-3 h-3" /> Cached
                  </span>
                  <button
                    type="button"
                    onClick={handleRefresh}
                    title="Discard cached results and run a fresh live search"
                    className="flex items-center gap-1 text-xs font-medium px-2 py-0.5
                      rounded-full bg-slate-100 text-slate-600 border border-slate-200
                      hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200
                      transition-colors active:scale-[0.96]">
                    <RefreshCw className="w-3 h-3" /> Refresh
                  </button>
                </>
              )}
              {!lastMeta?.cached && lastMeta?.apiCalls > 0 && (
                <span className="text-xs text-slate-400 dark:text-gray-400">
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

              <div className="flex items-center gap-2 flex-wrap">
                {/* Separator */}
                <span className="w-px h-4 bg-slate-200" />

                {!selectionMode ? (
                  /* ── Normal mode: download + Add to My List ── */
                  <>
                    <button
                      onClick={() => downloadSearchExcel(visible, keyword, location)}
                      title="Download results as Excel / CSV"
                      className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full
                        bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100
                        transition-colors ${results.length > 0 && !searching ? 'animate-export-ready' : ''}`}>
                      <Table2 className="w-3 h-3" />
                      Excel
                    </button>
                    <button
                      onClick={async () => { await downloadSearchPdf(visible, keyword, location); }}
                      title="Download results as PDF"
                      className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full
                        bg-red-50 text-red-700 border border-red-200 hover:bg-red-100
                        transition-colors ${results.length > 0 && !searching ? 'animate-export-ready' : ''}`}>
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
              </div>

              {!selectionMode && (
                <button onClick={handleClear}
                  className="text-xs text-slate-400 hover:text-red-500 transition-colors px-1">
                  Clear
                </button>
              )}
            </div>
          </div> {/* end Row 2 */}

          </div> {/* end space-y-2.5 toolbar wrapper */}

          {/* Grid / Map */}
          {visible.length > 0 ? (
            viewMode === 'grid' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {visible.map((lead, index) => {
                  const key        = getLeadKey(lead);
                  const isSelected = selected.has(key);
                  return (
                    <motion.div
                      key={key}
                      initial={{ opacity: 0, x: -16 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{
                        duration: 0.22,
                        delay: Math.min(index * 0.03, 0.6),
                        ease: 'easeOut',
                      }}
                    >
                      <LeadCard
                        lead={lead}
                        selectionMode={selectionMode}
                        isSelected={isSelected}
                        onToggle={() => toggleLead(lead)}
                      />
                    </motion.div>
                  );
                })}
              </div>
            ) : (
              <LeadMapView leads={visible} apiKey={GOOGLE_API_KEY} />
            )
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
            setSelectionMode(false);
            toast.success('Leads saved to My Lists!');
          }}
          onError={() => {
            toast.error('Failed to save leads. Please try again.');
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
