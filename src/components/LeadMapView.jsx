import { useEffect, useRef, useState } from 'react';

const DARK_MAP_STYLES = [
  { elementType: 'geometry', stylers: [{ color: '#1a1a2e' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1a1a2e' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8a8a9a' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2d2d44' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0d0d1a' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#1e1e30' }] },
];

const LeadMapView = ({ leads, apiKey }) => {
  const mapRef = useRef(null);

  // Reactive dark mode state — updates when user toggles dark/light
  const [isDark, setIsDark] = useState(
    () => document.documentElement.classList.contains('dark')
  );

  // MutationObserver watches for class changes on <html> element
  // When dark class is added/removed, isDark updates -> map re-initialises
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const leadsWithCoords = leads.filter((l) => l.lat && l.lng);
    if (!leadsWithCoords.length || !mapRef.current) return;

    const initMap = () => {
      const map = new window.google.maps.Map(mapRef.current, {
        center: { lat: leadsWithCoords[0].lat, lng: leadsWithCoords[0].lng },
        zoom: 13,
        styles: isDark ? DARK_MAP_STYLES : [],
        mapTypeControl: false,
        streetViewControl: false,
      });

      const infoWindow = new window.google.maps.InfoWindow();
      const bounds = new window.google.maps.LatLngBounds();

      leadsWithCoords.forEach((lead) => {
        const position = { lat: lead.lat, lng: lead.lng };
        bounds.extend(position);

        const marker = new window.google.maps.Marker({
          position,
          map,
          title: lead.displayName?.text || 'Business',
          icon: {
            path: window.google.maps.SymbolPath.CIRCLE,
            scale: 9,
            fillColor: '#4f46e5',
            fillOpacity: 0.95,
            strokeColor: '#ffffff',
            strokeWeight: 2,
          },
        });

        marker.addListener('click', () => {
          infoWindow.setContent(`
            <div style="font-family:Inter,system-ui,sans-serif;padding:6px 2px;max-width:220px">
              <p style="font-weight:600;font-size:13px;margin:0 0 4px;color:#0f172a">
                ${lead.displayName?.text || 'Unknown'}
              </p>
              ${lead.formattedAddress
                ? `<p style="font-size:11px;color:#64748b;margin:0 0 4px;line-height:1.4">
                     ${lead.formattedAddress}
                   </p>`
                : ''}
              ${lead.nationalPhoneNumber
                ? `<p style="font-size:11px;color:#4f46e5;font-weight:500;margin:0 0 3px">
                     ${lead.nationalPhoneNumber}
                   </p>`
                : ''}
              ${lead.rating
                ? `<p style="font-size:11px;color:#f59e0b;margin:0">
                     ★ ${lead.rating}
                     ${lead.userRatingCount
                       ? `<span style="color:#94a3b8">(${lead.userRatingCount})</span>`
                       : ''}
                   </p>`
                : ''}
              ${lead.websiteUri
                ? `<a href="${lead.websiteUri}" target="_blank" rel="noopener"
                     style="display:inline-block;margin-top:5px;font-size:11px;color:#4f46e5">
                     Visit website →
                   </a>`
                : ''}
            </div>
          `);
          infoWindow.open(map, marker);
        });
      });

      if (leadsWithCoords.length > 1) map.fitBounds(bounds);
    };

    if (window.google?.maps) {
      initMap();
    } else if (!document.getElementById('gmaps-script')) {
      const script = document.createElement('script');
      script.id = 'gmaps-script';
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}`;
      script.async = true;
      script.defer = true;
      script.onload = initMap;
      document.head.appendChild(script);
    } else {
      const check = setInterval(() => {
        if (window.google?.maps) {
          clearInterval(check);
          initMap();
        }
      }, 100);
      return () => clearInterval(check);
    }
  }, [leads, apiKey, isDark]);

  return (
    <div
      ref={mapRef}
      className="w-full rounded-2xl border border-slate-200 dark:border-white/10 overflow-hidden"
      style={{ height: 'clamp(300px, 55vh, 520px)', minHeight: '300px' }}
    />
  );
};

export default LeadMapView;
