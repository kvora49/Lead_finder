/**
 * LeadCard Component
 * Displays individual business lead information in a card format
 * with action buttons for calling, visiting website, and viewing on map
 */

import { Phone, Globe, MapPin } from 'lucide-react';

/**
 * LeadCard component that renders a business lead with contact actions
 * 
 * @param {Object} props - Component props
 * @param {Object} props.business - Business data object
 * @param {Object} props.business.displayName - Business name object with text property
 * @param {string} props.business.formattedAddress - Full business address
 * @param {string} props.business.nationalPhoneNumber - Business phone number
 * @param {string} props.business.websiteUri - Business website URL
 * @param {string} props.business.businessStatus - Business operational status
 */
const LeadCard = ({ business }) => {
  // Extract business name from the displayName object
  const businessName = business.displayName?.text || 'Unknown Business';
  
  // Extract address and truncate if too long for better UI
  const address = business.formattedAddress || 'Address not available';
  const truncatedAddress = address.length > 100 ? address.substring(0, 100) + '...' : address;
  
  // Extract phone number
  const phoneNumber = business.nationalPhoneNumber;
  
  // Extract website URL
  const website = business.websiteUri;
  
  // Encode address for Google Maps URL
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

  /**
   * Handle call action
   * Opens the default phone dialer with the business phone number
   */
  const handleCall = () => {
    if (phoneNumber) {
      window.location.href = `tel:${phoneNumber}`;
    }
  };

  /**
   * Handle website visit
   * Opens the business website in a new tab
   */
  const handleWebsite = () => {
    if (website) {
      // Ensure URL has protocol
      const url = website.startsWith('http') ? website : `https://${website}`;
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  /**
   * Handle map view
   * Opens Google Maps with the business location in a new tab
   */
  const handleMap = () => {
    window.open(mapsUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="glass-panel bg-white rounded-lg shadow-md hover:shadow-xl transition-shadow duration-300 p-6 border border-gray-100">
      {/* Business Name Section */}
      <div className="mb-4">
        <h3 className="text-xl font-bold text-gray-900 mb-2 line-clamp-2">
          {businessName}
        </h3>
        
        {/* Business Status Badge (if operational status is available) */}
        {business.businessStatus && business.businessStatus !== 'OPERATIONAL' && (
          <span className="inline-block px-2 py-1 text-xs font-semibold text-orange-600 bg-orange-100 rounded-full mb-2">
            {business.businessStatus}
          </span>
        )}
        
        {/* Address Section */}
        <p className="text-sm text-gray-600 flex items-start gap-2" title={address}>
          <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0 text-gray-400" />
          <span className="line-clamp-2">{truncatedAddress}</span>
        </p>
      </div>

      {/* Phone Number Display (if available) */}
      {phoneNumber && (
        <div className="mb-4 text-sm text-gray-700 flex items-center gap-2">
          <Phone className="w-4 h-4 text-gray-400" />
          <span className="font-medium">{phoneNumber}</span>
        </div>
      )}

      {/* Action Buttons Section */}
      <div className="flex gap-2 mt-4">
        {/* Call Button - Only show if phone number is available */}
        {phoneNumber && (
          <button
            onClick={handleCall}
            className="flex-1 flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-lg transition-colors duration-200 shadow-sm hover:shadow-md"
            title={`Call ${phoneNumber}`}
          >
            <Phone className="w-4 h-4" />
            <span className="text-sm">Call</span>
          </button>
        )}

        {/* Website Button - Only show if website is available */}
        {website && (
          <button
            onClick={handleWebsite}
            className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors duration-200 shadow-sm hover:shadow-md"
            title={`Visit ${website}`}
          >
            <Globe className="w-4 h-4" />
            <span className="text-sm">Website</span>
          </button>
        )}

        {/* Map Button - Always available */}
        <button
          onClick={handleMap}
          className="flex-1 flex items-center justify-center gap-2 bg-gray-600 hover:bg-gray-700 text-white font-medium py-2 px-4 rounded-lg transition-colors duration-200 shadow-sm hover:shadow-md"
          title="View on Google Maps"
        >
          <MapPin className="w-4 h-4" />
          <span className="text-sm">Map</span>
        </button>
      </div>
    </div>
  );
};

export default LeadCard;
