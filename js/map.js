/**
 * HydraRide - Water Points Map Page (Leaflet + OpenStreetMap)
 * Features 9 sample free water points around Gurugram.
 * Tracks rider's simulated location, computes live distances,
 * highlights the nearest station, and allows direct tank refill.
 */

(function () {
  'use strict';

  // 9 Curated Free Water Points around Gurugram
  const WATER_POINTS = [
    {
      id: 'wp-1',
      name: 'Gurdwara Sri Guru Singh Sabha Chabeel',
      type: 'Community Pyaau & RO Chabeel',
      status: 'Operational - Chilled',
      isWorking: true,
      lat: 28.4532,
      lng: 77.0518,
      address: 'Sector 31 Main Market Road, Gurugram',
      features: 'Free 24/7 cold drinking water • Shaded two-wheeler parking'
    },
    {
      id: 'wp-2',
      name: 'Millennium City Centre Metro RO Kiosk',
      type: 'Metro Station RO Filter',
      status: 'Operational - RO Purified',
      isWorking: true,
      lat: 28.4593,
      lng: 77.0725,
      address: 'Concourse Level, Gate 1, Millennium City Centre Metro',
      features: 'RO purified • Operational 06:00 AM – 11:00 PM'
    },
    {
      id: 'wp-3',
      name: 'Sector 29 Leisure Valley Municipal Pyaau',
      type: 'MCG Public Water Cooler',
      status: 'Operational - Chilled',
      isWorking: true,
      lat: 28.4682,
      lng: 77.0645,
      address: 'Opposite Leisure Valley Park Entry, Sector 29',
      features: 'High-capacity municipal water cooler • Bench shade'
    },
    {
      id: 'wp-4',
      name: 'IFFCO Chowk Metro Gate 2 Dispenser',
      type: 'Transit Water Kiosk',
      status: 'Operational - Ambient',
      isWorking: true,
      lat: 28.4721,
      lng: 77.0726,
      address: 'IFFCO Chowk Flyover Junction, MG Road',
      features: 'Quick bottle refill for two-wheelers'
    },
    {
      id: 'wp-5',
      name: 'DLF Cyber Hub Rider Support Cooler',
      type: 'Gig Delivery Partner Hub',
      status: 'Operational - Chilled',
      isWorking: true,
      lat: 28.4952,
      lng: 77.0887,
      address: 'Ground Floor Logistics Bay, DLF Cyber Hub, DLF Phase 2',
      features: 'Dedicated delivery partner lounge • Chilled water dispenser'
    },
    {
      id: 'wp-6',
      name: 'Galleria Market Central Fountain Cooler',
      type: 'Commercial Complex Public Cooler',
      status: 'Operational - RO Purified',
      isWorking: true,
      lat: 28.4673,
      lng: 77.0864,
      address: 'DLF Phase IV, Near Central Fountain, Galleria Market',
      features: 'Open 10:00 AM – 11:30 PM • Filtered water tap'
    },
    {
      id: 'wp-7',
      name: 'Sikanderpur Metro Interchange RO Point',
      type: 'Metro Interchange RO Point',
      status: 'Operational - Chilled',
      isWorking: true,
      lat: 28.4818,
      lng: 77.0927,
      address: 'Yellow Line & Rapid Metro Concourse Walkway',
      features: 'Multi-tap high flow RO water dispenser'
    },
    {
      id: 'wp-8',
      name: 'HP Auto Care Petrol Pump RO Kiosk',
      type: 'Fuel Station Free RO Water',
      status: 'Operational - Ambient',
      isWorking: true,
      lat: 28.4802,
      lng: 77.0812,
      address: 'MG Road, Near Heritage City, Gurugram',
      features: 'Free 24/7 RO water dispenser for drivers & riders'
    },
    {
      id: 'wp-9',
      name: 'Sector 14 HUDA Market Public Pyaau',
      type: 'Public Charitable Water Tap',
      status: 'Scheduled Maintenance',
      isWorking: false,
      lat: 28.4735,
      lng: 77.0425,
      address: 'Near Post Office, Sector 14 Market',
      features: 'Filter cartridge replacement in progress'
    }
  ];

  let map = null;
  let riderMarker = null;
  let waterMarkers = {};
  let guideLine = null;
  let activeFilter = 'all';

  // Calculate distance between two coordinates in km using Haversine formula
  function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  // Format distance cleanly
  function formatDist(km) {
    if (km < 1) {
      return `${Math.round(km * 1000)} m`;
    }
    return `${km.toFixed(2)} km`;
  }

  // Format estimated ride time (assuming ~22 km/h average courier transit in traffic)
  function formatRideTime(km) {
    const mins = Math.max(1, Math.round((km / 22) * 60));
    return `~${mins} min ride`;
  }

  // Create custom SVG markers
  function createCustomIcon(type, isNearest) {
    if (type === 'rider') {
      return L.divIcon({
        className: 'custom-rider-pin',
        html: `
          <div style="
            position: relative;
            width: 38px;
            height: 38px;
            background: #0284c7;
            border: 3px solid #ffffff;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 4px 14px rgba(2, 132, 199, 0.6);
            color: #ffffff;
            font-size: 18px;
          ">
            🛵
            <div style="
              position: absolute;
              width: 100%;
              height: 100%;
              border-radius: 50%;
              border: 2px solid #38bdf8;
              animation: riderPulse 1.8s infinite;
              pointer-events: none;
            "></div>
          </div>
        `,
        iconSize: [38, 38],
        iconAnchor: [19, 19]
      });
    }

    // Water Point Icon
    const bg = isNearest ? '#10b981' : (type === 'maintenance' ? '#94a3b8' : '#0ea5e9');
    const border = isNearest ? '#ffffff' : '#ffffff';
    const shadow = isNearest ? '0 4px 16px rgba(16, 185, 129, 0.6)' : '0 2px 8px rgba(0,0,0,0.25)';

    return L.divIcon({
      className: isNearest ? 'custom-water-pin nearest' : 'custom-water-pin',
      html: `
        <div style="
          width: 32px;
          height: 32px;
          background: ${bg};
          border: 2px solid ${border};
          border-radius: 50% 50% 50% 0;
          transform: rotate(-45deg);
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: ${shadow};
          color: #ffffff;
        ">
          <div style="transform: rotate(45deg); font-size: 14px; font-weight: 700;">
            ${isNearest ? '⭐' : '💧'}
          </div>
        </div>
      `,
      iconSize: [32, 32],
      iconAnchor: [16, 32],
      popupAnchor: [0, -32]
    });
  }

  // Initialize Leaflet Map
  function initMap() {
    const reading = window.HydraCore ? window.HydraCore.getReading() : {
      riderLocation: { lat: 28.4682, lng: 77.0645 }
    };

    // Center between Cyber City, Sector 29 and Millennium City Centre
    const center = [reading.riderLocation.lat, reading.riderLocation.lng];
    map = L.map('waterMap', {
      center: center,
      zoom: 13,
      zoomControl: true
    });

    // Clean OpenStreetMap tiles
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    // Add CSS keyframe for rider marker pulse
    const styleEl = document.createElement('style');
    styleEl.innerHTML = `
      @keyframes riderPulse {
        0% { transform: scale(1); opacity: 0.9; }
        100% { transform: scale(2.2); opacity: 0; }
      }
    `;
    document.head.appendChild(styleEl);

    // Initial render of markers and list
    updateWaterPoints(reading);
  }

  // Recalculate distances, sort, update map markers, and build sidebar
  function updateWaterPoints(reading) {
    if (!map) return;

    const riderLat = reading.riderLocation.lat;
    const riderLng = reading.riderLocation.lng;

    // Update or add Rider Marker
    if (!riderMarker) {
      riderMarker = L.marker([riderLat, riderLng], {
        icon: createCustomIcon('rider', false),
        zIndexOffset: 1000
      }).addTo(map);

      riderMarker.bindPopup(`
        <div style="font-family: inherit; font-size: 13px; line-height: 1.4;">
          <strong>🛵 Rider #214 (Active)</strong><br>
          ${reading.riderLocation.area}<br>
          <span style="color:#0284c7; font-weight:600;">Shift: 11:00 AM – 7:00 PM</span>
        </div>
      `);
    } else {
      riderMarker.setLatLng([riderLat, riderLng]);
    }

    // Calculate distances to all points
    const pointsWithDist = WATER_POINTS.map(pt => {
      const distKm = haversineDistance(riderLat, riderLng, pt.lat, pt.lng);
      return {
        ...pt,
        distKm: distKm,
        distFormatted: formatDist(distKm),
        rideTimeFormatted: formatRideTime(distKm)
      };
    });

    // Sort by distance (working points first, then closest)
    pointsWithDist.sort((a, b) => {
      if (a.isWorking && !b.isWorking) return -1;
      if (!a.isWorking && b.isWorking) return 1;
      return a.distKm - b.distKm;
    });

    // Identify nearest working point
    const nearestPoint = pointsWithDist.find(p => p.isWorking) || pointsWithDist[0];

    // Draw / Update Guide Line from Rider to Nearest Water Point
    if (guideLine) {
      map.removeLayer(guideLine);
    }
    if (nearestPoint) {
      guideLine = L.polyline(
        [[riderLat, riderLng], [nearestPoint.lat, nearestPoint.lng]],
        {
          color: '#10b981',
          weight: 3,
          dashArray: '6, 8',
          opacity: 0.85
        }
      ).addTo(map);
    }

    // Render / Update Markers on Leaflet Map
    pointsWithDist.forEach(pt => {
      const isNearest = pt.id === nearestPoint.id;
      const markerType = !pt.isWorking ? 'maintenance' : (isNearest ? 'nearest' : 'normal');
      const icon = createCustomIcon(markerType, isNearest);

      if (waterMarkers[pt.id]) {
        waterMarkers[pt.id].setLatLng([pt.lat, pt.lng]);
        waterMarkers[pt.id].setIcon(icon);
      } else {
        const marker = L.marker([pt.lat, pt.lng], { icon: icon }).addTo(map);
        marker.on('click', () => {
          highlightCard(pt.id);
        });
        waterMarkers[pt.id] = marker;
      }

      // Popup Content
      const popupContent = `
        <div style="font-family: inherit; font-size: 13px; min-width: 200px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 4px;">
            <strong style="font-size: 14px; color:#0f172a;">${pt.name}</strong>
            ${isNearest ? '<span style="background:#ecfdf5; color:#065f46; font-size:10px; font-weight:700; padding:2px 6px; border-radius:10px;">NEAREST</span>' : ''}
          </div>
          <div style="color: #64748b; font-size: 11px; margin-bottom: 6px;">${pt.type}</div>
          <div style="margin-bottom: 6px;">
            <span style="font-size: 11px; font-weight: 600; padding: 2px 6px; border-radius: 4px; ${pt.isWorking ? 'background:#ecfdf5; color:#065f46;' : 'background:#fee2e2; color:#991b1b;'}">
              ${pt.status}
            </span>
          </div>
          <div style="font-size: 12px; color: #334155; margin-bottom: 8px;">
            📍 ${pt.address}<br>
            📏 <strong>${pt.distFormatted}</strong> (${pt.rideTimeFormatted})
          </div>
          <div style="font-size: 11px; color:#64748b; margin-bottom: 8px;">
            💡 ${pt.features}
          </div>
          <button onclick="window.HydraMapRefill()" style="
            width: 100%;
            background: #0284c7;
            color: #ffffff;
            border: none;
            padding: 6px 12px;
            font-size: 12px;
            font-weight: 600;
            border-radius: 6px;
            cursor: pointer;
          ">
            🚰 Refill Hydrapack Here (1.5L)
          </button>
        </div>
      `;
      waterMarkers[pt.id].bindPopup(popupContent);
    });

    // Update Nearest Spotlight Card
    renderNearestSpotlight(nearestPoint, reading);

    // Update Sidebar List
    renderSidebarList(pointsWithDist, nearestPoint);

    // Update Tank Status Bar
    renderTankBadge(reading);
  }

  // Render Nearest Station Spotlight Card
  function renderNearestSpotlight(nearest, reading) {
    const el = document.getElementById('nearestSpotlightCard');
    if (!el || !nearest) return;

    el.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:flex-start; gap: 0.5rem;">
        <div>
          <div style="font-size: 0.72rem; font-weight: 800; text-transform: uppercase; color: #059669; letter-spacing: 0.05em;">
            ⭐ Nearest Water Point (${nearest.distFormatted})
          </div>
          <div style="font-size: 1.05rem; font-weight: 800; color: var(--text-primary); margin-top: 0.2rem;">
            ${nearest.name}
          </div>
          <div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 0.15rem;">
            ${nearest.address}
          </div>
        </div>
        <button class="btn btn-primary btn-sm" id="btnQuickRefillNearest" title="Refill hydrapack tank now">
          🚰 Refill Now
        </button>
      </div>

      <div style="display:flex; align-items:center; gap: 0.75rem; margin-top: 0.65rem; font-size: 0.8rem;">
        <span class="water-point-status status-working">✓ ${nearest.status}</span>
        <span style="color: var(--primary); font-weight: 700;">⏱️ ${nearest.rideTimeFormatted}</span>
        <span style="color: var(--text-muted);">•</span>
        <span style="color: var(--text-secondary);">${nearest.features.split('•')[0]}</span>
      </div>
    `;

    const btnRefill = document.getElementById('btnQuickRefillNearest');
    if (btnRefill) {
      btnRefill.addEventListener('click', () => {
        window.HydraCore.refillTank();
      });
    }
  }

  // Render Tank level badge in header of map
  function renderTankBadge(reading) {
    const badge = document.getElementById('mapTankBadge');
    if (!badge) return;

    if (reading.tankLowWarning) {
      badge.className = 'sim-pill';
      badge.style.background = '#fee2e2';
      badge.style.borderColor = '#fca5a5';
      badge.style.color = '#991b1b';
      badge.innerHTML = `⚠️ Tank Low: ${reading.tankLevelMl} ml (${reading.tankPercent}%)`;
    } else {
      badge.className = 'sim-pill';
      badge.style.background = 'var(--water-100)';
      badge.style.borderColor = 'var(--water-200)';
      badge.style.color = 'var(--water-700)';
      badge.innerHTML = `💧 Tank: ${reading.tankLevelMl} ml (${reading.tankPercent}%)`;
    }
  }

  // Render the list of water points in sidebar
  function renderSidebarList(points, nearest) {
    const listEl = document.getElementById('waterPointsList');
    if (!listEl) return;

    // Filter points
    let filtered = points;
    if (activeFilter === 'metro') {
      filtered = points.filter(p => p.type.toLowerCase().includes('metro'));
    } else if (activeFilter === 'chabeel') {
      filtered = points.filter(p => p.type.toLowerCase().includes('pyaau') || p.type.toLowerCase().includes('chabeel'));
    } else if (activeFilter === 'working') {
      filtered = points.filter(p => p.isWorking);
    }

    listEl.innerHTML = filtered.map(pt => {
      const isNearest = pt.id === nearest.id;
      return `
        <div class="water-point-card ${isNearest ? 'featured' : ''}" id="card-${pt.id}" onclick="window.HydraMapFocus('${pt.id}')">
          <div class="water-point-title">
            <span>${pt.name}</span>
            ${isNearest ? '<span class="water-point-status status-working">⭐ NEAREST</span>' : ''}
          </div>
          <div class="water-point-type">${pt.type}</div>
          <div style="font-size: 0.76rem; color: var(--text-secondary); margin-top: 0.25rem;">
            ${pt.address}
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-top: 0.5rem;">
            <span class="water-point-status ${pt.isWorking ? 'status-working' : 'status-paused'}">
              ${pt.status}
            </span>
            <span class="water-point-dist">
              📏 ${pt.distFormatted} (${pt.rideTimeFormatted})
            </span>
          </div>
        </div>
      `;
    }).join('');
  }

  // Highlight card when marker is clicked
  function highlightCard(id) {
    const card = document.getElementById(`card-${id}`);
    if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      card.style.outline = '2px solid var(--primary)';
      setTimeout(() => { card.style.outline = ''; }, 2000);
    }
  }

  // Global handler for clicking a card or button to focus marker on map
  window.HydraMapFocus = function (id) {
    const pt = WATER_POINTS.find(p => p.id === id);
    if (pt && map && waterMarkers[id]) {
      map.setView([pt.lat, pt.lng], 15, { animate: true });
      waterMarkers[id].openPopup();
    }
  };

  // Global handler for the refill action in Leaflet popups
  window.HydraMapRefill = function () {
    if (window.HydraCore) {
      window.HydraCore.refillTank();
      alert('Hydrapack refilled successfully to 1,500 ml!');
    }
  };

  // Filter chips
  function bindFilters() {
    const filterButtons = document.querySelectorAll('[data-map-filter]');
    filterButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        filterButtons.forEach(b => b.className = 'btn btn-secondary btn-sm');
        btn.className = 'btn btn-primary btn-sm';
        activeFilter = btn.getAttribute('data-map-filter');
        if (window.HydraCore) {
          updateWaterPoints(window.HydraCore.getReading());
        }
      });
    });
  }

  // Initialize
  document.addEventListener('DOMContentLoaded', () => {
    initMap();
    bindFilters();

    // Subscribe to telemetry changes so rider movement & tank levels sync live
    if (window.HydraCore) {
      window.HydraCore.subscribe(reading => {
        updateWaterPoints(reading);
      });
    }
  });

})();
