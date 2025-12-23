/**
 * Universal Business Lead Finder - Main Application Component
 * 
 * This application allows users to search for businesses using Google Places API
 * and export the results as CSV files. Users can filter by category, require phone numbers,
 * and search by keyword and location.
 */

import { useState, useEffect } from 'react';
import { Search, Download, Loader2, LogOut, User } from 'lucide-react';
import ExcelJS from 'exceljs';
import LeadCard from './components/LeadCard';
import CreditSyncStatus from './components/CreditSyncStatus';
import { searchBusinesses, filterByPhoneNumber, filterByAddress } from './services/placesApi';
import { GOOGLE_API_KEY } from './config';
import { useAuth } from './contexts/AuthContext';
import { subscribeToCredits, addCredits, getCreditStats, initializeUserCredits } from './services/creditService';

/**
 * Main App Component
 */
function App() {
  const { currentUser, signOut } = useAuth();
  
  // State Management
  const [keyword, setKeyword] = useState(''); // Search keyword (e.g., "Kurti", "Electronics")
  const [location, setLocation] = useState(''); // Location (e.g., "Mumbai", "New York")
  const [selectedCategory, setSelectedCategory] = useState('All'); // Business category filter
  const [searchScope, setSearchScope] = useState('wide'); // Search area scope: wide, neighborhood, or specific
  const [specificArea, setSpecificArea] = useState(''); // Specific area/building/street name
  const [requirePhone, setRequirePhone] = useState(false); // Filter to show only businesses with phone numbers
  const [leads, setLeads] = useState([]); // Array of business leads from API
  const [loading, setLoading] = useState(false); // Loading state during API call
  const [loadingProgress, setLoadingProgress] = useState(''); // Loading progress message
  const [error, setError] = useState(null); // Error message if API call fails
  
  // Credit tracking states - synced with Firestore
  const [apiCallsThisSession, setApiCallsThisSession] = useState(0); // API calls in current session
  const [totalApiCalls, setTotalApiCalls] = useState(0); // Total API calls from Firestore
  
  const [currentMonth] = useState(() => {
    const now = new Date();
    return now.toLocaleString('default', { month: 'long', year: 'numeric' });
  });
  
  const [nextResetDate] = useState(() => {
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return nextMonth.toLocaleDateString('default', { month: 'long', day: 'numeric', year: 'numeric' });
  });

  // Initialize and subscribe to credit updates from Firestore
  useEffect(() => {
    if (!currentUser) return;

    // Initialize credits first to ensure document exists
    initializeUserCredits(currentUser.uid).then((data) => {
      setTotalApiCalls(data.totalApiCalls || 0);
    }).catch((error) => {
      console.error('Error initializing credits:', error);
    });

    // Subscribe to real-time updates
    const unsubscribe = subscribeToCredits(currentUser.uid, (credits) => {
      setTotalApiCalls(credits);
    });

    return () => unsubscribe();
  }, [currentUser]);

  // Available business categories for search
  const categories = [
    'All',
    'Custom',
    'Wholesaler',
    'Retailer',
    'Manufacturer',
    'Service Provider'
  ];

  /**
   * Handles the search form submission
   * Fetches businesses from Google Places API based on search criteria
   */
  const handleSearch = async () => {
    // Validation: Check if required fields are filled
    if (!keyword.trim() || !location.trim()) {
      setError('Please enter both keyword and location');
      return;
    }

    // Check if API key is configured
    if (GOOGLE_API_KEY === 'PASTE_YOUR_API_KEY_HERE') {
      setError('Please configure your Google API Key in src/config.js');
      return;
    }

    // Reset error and set loading state
    setError(null);
    setLoading(true);
    setLoadingProgress('Searching for businesses...');

    try {
      // Track API calls - will be synced to Firestore
      let callsInThisSearch = 0;
      
      // Call the API service to search for businesses with pagination
      const response = await searchBusinesses(
        keyword,
        selectedCategory,
        location,
        GOOGLE_API_KEY,
        searchScope,
        specificArea,
        // Progress callback
        (progress) => {
          if (progress.page > 1) {
            setLoadingProgress(`Loading more results... (Page ${progress.page}, ${progress.total} found)`);
          }
        },
        // API call callback - fired immediately after each request
        async () => {
          callsInThisSearch++;
          const newSessionCalls = apiCallsThisSession + callsInThisSearch;
          setApiCallsThisSession(newSessionCalls);
          
          // Update Firestore immediately (syncs across devices)
          try {
            await addCredits(currentUser.uid, 1);
          } catch (error) {
            console.error('Error updating credits:', error);
          }
        }
      );

      // Update session calls
      setApiCallsThisSession(apiCallsThisSession + callsInThisSearch);

      // Extract places from response
      let places = response.places || [];
      console.log(`🎯 API returned ${places.length} total unique businesses after pagination`);

      // Filter by exact address matching for neighborhood searches
      if (searchScope === 'neighborhood' && specificArea.trim()) {
        const beforeFilter = places.length;
        places = filterByAddress(places, specificArea);
        console.log(`📍 Address filter: ${beforeFilter} → ${places.length} (removed ${beforeFilter - places.length} not matching "${specificArea}")`);
      }

      // Filter by phone number if required
      if (requirePhone) {
        const beforeFilter = places.length;
        places = filterByPhoneNumber(places);
        console.log(`📞 Phone filter: ${beforeFilter} → ${places.length} (removed ${beforeFilter - places.length} without phone)`);
      }

      // Update leads state with results
      setLeads(places);
      console.log(`✅ Final results shown to user: ${places.length} businesses`);

      // Show message if no results found
      if (places.length === 0) {
        setError(`No businesses found${searchScope === 'neighborhood' && specificArea ? ` with "${specificArea}" in their address` : ''}. Try different search criteria.`);
      }
    } catch (err) {
      // Handle errors from API call
      console.error('Search error:', err);
      setError(err.message || 'Failed to search businesses. Please check your API key and try again.');
    } finally {
      // Reset loading state
      setLoading(false);
      setLoadingProgress('');
    }
  };

  /**
   * Helper function to parse and clean address into components
   */
  const parseAddress = (fullAddress) => {
    if (!fullAddress || fullAddress === 'N/A') {
      return { street: 'N/A', city: 'N/A', state: 'N/A', country: 'N/A' };
    }

    // Split address by comma
    const parts = fullAddress.split(',').map(part => part.trim());
    
    // Try to intelligently parse address components
    const street = parts[0] || 'N/A';
    const city = parts[1] || 'N/A';
    const state = parts[2] || 'N/A';
    const country = parts[parts.length - 1] || 'N/A';

    return { street, city, state, country };
  };

  /**
   * Exports the current leads to an Excel file with professional formatting
   * Includes better column organization, auto-fit widths, and clean styling
   * Uses ExcelJS for secure and feature-rich Excel generation
   */
  const exportToExcel = async () => {
    if (leads.length === 0) {
      alert('No leads to export');
      return;
    }

    // Create a new workbook and worksheet
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Business Leads');

    // Define columns with proper widths
    worksheet.columns = [
      { header: 'Sr. No.', key: 'srNo', width: 8 },
      { header: 'Business Name', key: 'name', width: 30 },
      { header: 'Category', key: 'category', width: 18 },
      { header: 'Phone Number', key: 'phone', width: 18 },
      { header: 'Website', key: 'website', width: 50 },
      { header: 'Street Address', key: 'street', width: 50 },
      { header: 'City/Area', key: 'city', width: 22 },
      { header: 'State/Region', key: 'state', width: 22 },
      { header: 'Country', key: 'country', width: 15 },
      { header: 'Business Status', key: 'status', width: 15 }
    ];

    // Style the header row
    worksheet.getRow(1).font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' } // Blue background
    };
    worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    worksheet.getRow(1).height = 30;

    // Add data rows
    leads.forEach((business, index) => {
      const address = parseAddress(business.formattedAddress);
      
      const row = worksheet.addRow({
        srNo: index + 1,
        name: business.displayName?.text || 'N/A',
        category: selectedCategory,
        phone: business.nationalPhoneNumber || 'N/A',
        website: business.websiteUri || 'N/A',
        street: address.street,
        city: address.city,
        state: address.state,
        country: address.country,
        status: business.businessStatus || 'OPERATIONAL'
      });

      // Style data rows - alternate row colors for better readability
      if (index % 2 === 0) {
        row.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF2F2F2' } // Light gray
        };
      }

      // Calculate dynamic row height based on content length
      const maxLength = Math.max(
        (address.street || '').length,
        (business.websiteUri || '').length,
        (business.displayName?.text || '').length
      );
      
      // Set taller row height for long content
      if (maxLength > 80) {
        row.height = 45;
      } else if (maxLength > 50) {
        row.height = 35;
      } else {
        row.height = 25;
      }

      // Set alignment with wrap text for all cells
      row.alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
      
      // Center align specific columns
      row.getCell('srNo').alignment = { vertical: 'middle', horizontal: 'center' };
      row.getCell('category').alignment = { vertical: 'middle', horizontal: 'center' };
      row.getCell('status').alignment = { vertical: 'middle', horizontal: 'center' };

      // Add borders to all cells
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFD3D3D3' } },
          left: { style: 'thin', color: { argb: 'FFD3D3D3' } },
          bottom: { style: 'thin', color: { argb: 'FFD3D3D3' } },
          right: { style: 'thin', color: { argb: 'FFD3D3D3' } }
        };
      });
    });

    // Add borders to header row
    worksheet.getRow(1).eachCell((cell) => {
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    });

    // Generate filename with timestamp
    const fileName = `business-leads-${keyword}-${location}-${new Date().toISOString().slice(0, 10)}.xlsx`;

    // Generate Excel file and trigger download
    try {
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error generating Excel file:', error);
      alert('Failed to generate Excel file. Please try again.');
    }
  };

  /**
   * Handles Enter key press in input fields to trigger search
   */
  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      {/* Header Section */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold text-gray-900 mb-2">
                Universal Lead Finder
              </h1>
              <p className="text-gray-600 text-lg">
                Find Wholesalers, Retailers, and Services across the globe
              </p>
            </div>
            
            {/* User Profile & Logout */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 rounded-lg">
                <User className="w-5 h-5 text-gray-600" />
                <div className="text-sm">
                  <p className="font-semibold text-gray-800">
                    {currentUser?.displayName || 'User'}
                  </p>
                  <p className="text-xs text-gray-500">
                    {currentUser?.email}
                  </p>
                </div>
              </div>
              <button
                onClick={signOut}
                className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                <span className="font-medium">Logout</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Credit Usage Tracker */}
      <div className="bg-gradient-to-r from-green-50 to-blue-50 border-b border-gray-200">
        <div className="container mx-auto px-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            {/* Credit Summary */}
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                <div>
                  <span className="text-sm font-semibold text-gray-700 block">Credits Tracker</span>
                  <span className="text-xs text-gray-500">{currentMonth}</span>
                </div>
              </div>
              
              <div className="h-8 w-px bg-gray-300"></div>
              
              {/* This Session */}
              <div>
                <p className="text-xs text-gray-500">This Session</p>
                <p className="text-lg font-bold text-blue-600">{apiCallsThisSession} calls</p>
              </div>
              
              {/* Total Used */}
              <div>
                <p className="text-xs text-gray-500">Total Used</p>
                <p className="text-lg font-bold text-purple-600">{totalApiCalls} calls</p>
                <CreditSyncStatus isOnline={true} />
              </div>
              
              {/* Cost Calculator */}
              <div>
                <p className="text-xs text-gray-500">Estimated Cost</p>
                <p className="text-lg font-bold text-orange-600">${(totalApiCalls * 0.032).toFixed(2)}</p>
              </div>
              
              {/* Free Credit Remaining */}
              <div>
                <p className="text-xs text-gray-500">Free Credit Left</p>
                <p className="text-lg font-bold text-green-600">
                  ${Math.max(0, 200 - (totalApiCalls * 0.032)).toFixed(2)}
                </p>
              </div>
            </div>
            
            {/* Progress Bar */}
            <div className="flex-1 min-w-[200px] max-w-md">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-600">Free Tier Usage</span>
                <span className="text-xs font-semibold text-gray-700">
                  {Math.min(100, ((totalApiCalls * 0.032) / 200 * 100)).toFixed(1)}%
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div 
                  className={`h-2.5 rounded-full transition-all duration-500 ${
                    (totalApiCalls * 0.032) > 200 ? 'bg-red-500' :
                    (totalApiCalls * 0.032) > 150 ? 'bg-orange-500' :
                    (totalApiCalls * 0.032) > 100 ? 'bg-yellow-500' :
                    'bg-green-500'
                  }`}
                  style={{ width: `${Math.min(100, ((totalApiCalls * 0.032) / 200 * 100))}%` }}
                ></div>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                💡 $200 free credit/month • Resets on {nextResetDate}
              </p>
            </div>
            
            {/* Reset Button */}
            <button
              onClick={async () => {
                if (window.confirm('Reset all API call tracking? This will clear session and total counts across all devices.')) {
                  setApiCallsThisSession(0);
                  // Reset in Firestore (syncs across all devices)
                  const { resetUserCredits } = await import('./services/creditService');
                  await resetUserCredits(currentUser.uid);
                }
              }}
              className="text-xs px-3 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg transition-colors"
            >
              Reset Tracker
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Container */}
      <main className="container mx-auto px-4 py-8">
        {/* Search Section */}
        <div className="glass-panel bg-white rounded-xl shadow-lg p-6 mb-8">
          <h2 className="text-2xl font-semibold text-gray-800 mb-6">Search Criteria</h2>

          {/* Category Selection Tabs */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Business Category
            </label>
            <div className="flex flex-wrap gap-2">
              {categories.map((category) => (
                <button
                  key={category}
                  onClick={() => setSelectedCategory(category)}
                  className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
                    selectedCategory === category
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {category}
                </button>
              ))}
            </div>
          </div>

          {/* Search Scope Selection */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Search Area Scope (Narrow down to save costs)
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setSearchScope('wide')}
                className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
                  searchScope === 'wide'
                    ? 'bg-purple-600 text-white shadow-md'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Wide Area (Whole City)
              </button>
              <button
                onClick={() => setSearchScope('neighborhood')}
                className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
                  searchScope === 'neighborhood'
                    ? 'bg-purple-600 text-white shadow-md'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Neighborhood (Smaller Area)
              </button>
              <button
                onClick={() => setSearchScope('specific')}
                className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
                  searchScope === 'specific'
                    ? 'bg-purple-600 text-white shadow-md'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Specific Location (Street/Building)
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              💡 Tip: Use "Neighborhood" or "Specific Location" to reduce API costs and get more targeted results
            </p>
          </div>

          {/* Specific Area Input - Show for both 'neighborhood' and 'specific' */}
          {(searchScope === 'neighborhood' || searchScope === 'specific') && (
            <div className="mb-6 p-4 bg-purple-50 border border-purple-200 rounded-lg">
              <label htmlFor="specificArea" className="block text-sm font-medium text-gray-700 mb-2">
                {searchScope === 'neighborhood' ? 'Neighborhood/Area Name' : 'Specific Area Details'}
              </label>
              <input
                id="specificArea"
                type="text"
                value={specificArea}
                onChange={(e) => setSpecificArea(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder={
                  searchScope === 'neighborhood'
                    ? "e.g., Andheri West, Brooklyn, Downtown, Connaught Place"
                    : "e.g., Linking Road, 5th Avenue, Crawford Market, Phoenix Mall"
                }
                className="w-full px-4 py-3 border border-purple-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
              />
              <p className="text-xs text-gray-600 mt-2">
                {searchScope === 'neighborhood'
                  ? 'Enter a neighborhood or district name to narrow your search to a smaller area'
                  : 'Enter a specific street name, market area, or building to get very targeted results'}
              </p>
            </div>
          )}

          {/* Search Inputs Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {/* Keyword Input */}
            <div>
              <label htmlFor="keyword" className="block text-sm font-medium text-gray-700 mb-2">
                Keyword
              </label>
              <input
                id="keyword"
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="e.g., Kurti, Electronics, Furniture"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              />
            </div>

            {/* Location Input */}
            <div>
              <label htmlFor="location" className="block text-sm font-medium text-gray-700 mb-2">
                Location
              </label>
              <input
                id="location"
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="e.g., Mumbai, New York, London"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              />
            </div>
          </div>

          {/* Phone Number Filter Toggle */}
          <div className="flex items-center justify-between mb-6 p-4 bg-gray-50 rounded-lg">
            <div>
              <label htmlFor="requirePhone" className="font-medium text-gray-800 cursor-pointer">
                Phone Number Required
              </label>
              <p className="text-sm text-gray-600 mt-1">
                Only show businesses with phone numbers
              </p>
            </div>
            <div className="relative">
              <input
                id="requirePhone"
                type="checkbox"
                checked={requirePhone}
                onChange={(e) => setRequirePhone(e.target.checked)}
                className="sr-only peer"
              />
              <label
                htmlFor="requirePhone"
                className="block w-14 h-8 bg-gray-300 rounded-full cursor-pointer peer-checked:bg-blue-600 transition-colors duration-200"
              >
                <span className="absolute top-1 left-1 w-6 h-6 bg-white rounded-full transition-transform duration-200 peer-checked:translate-x-6" />
              </label>
            </div>
          </div>

          {/* Search Button */}
          <button
            onClick={handleSearch}
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold py-4 rounded-lg transition-colors duration-200 flex items-center justify-center gap-2 shadow-md hover:shadow-lg"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Searching...</span>
              </>
            ) : (
              <>
                <Search className="w-5 h-5" />
                <span>Search Google Maps</span>
              </>
            )}
          </button>

          {/* Loading Progress Message */}
          {loading && loadingProgress && (
            <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-blue-700 text-sm font-medium">{loadingProgress}</p>
            </div>
          )}

          {/* Error Message Display */}
          {error && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}
        </div>

        {/* Results Section */}
        {leads.length > 0 && (
          <div className="glass-panel bg-white rounded-xl shadow-lg p-6">
            {/* Results Header with Export Button */}
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-semibold text-gray-800">
                Results ({leads.length} {leads.length === 1 ? 'lead' : 'leads'} found)
              </h2>
              <button
                onClick={exportToExcel}
                className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-medium px-6 py-3 rounded-lg transition-colors duration-200 shadow-md hover:shadow-lg"
              >
                <Download className="w-5 h-5" />
                <span>Download Excel</span>
              </button>
            </div>

            {/* Results Grid - Responsive layout */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {leads.map((business, index) => (
                <LeadCard key={index} business={business} />
              ))}
            </div>
          </div>
        )}

        {/* Empty State - Show when no results and not loading */}
        {!loading && leads.length === 0 && !error && (
          <div className="text-center py-12">
            <Search className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 text-lg">
              Enter search criteria and click "Search Google Maps" to find business leads
            </p>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-12">
        <div className="container mx-auto px-4 py-6 text-center text-gray-600 text-sm">
          <p>Powered by Google Places API | Built with React & Vite</p>
        </div>
      </footer>
    </div>
  );
}

export default App;
