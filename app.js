'use strict';

/* =========================================================
   Wegpunkt – einfacher Multi-Stopp-Routenplaner
   Nutzt ausschliesslich kostenlose, schluessellose Dienste:
   - OpenStreetMap Tiles (Karte)
   - Nominatim (Adresssuche / Geocoding)
   - OSRM Demo-Server (Routen-Optimierung, "Trip"-Dienst)
   Alle Daten (Stopps, Einstellungen) bleiben nur auf diesem
   Geraet (localStorage) - es gibt keinen eigenen Server.
   ========================================================= */

const CONFIG = {
  NOMINATIM_URL: 'https://nominatim.openstreetmap.org',
  OSRM_URL: 'https://router.project-osrm.org',
  STORAGE_KEY: 'wegpunkt_state_v1',
  SEARCH_DEBOUNCE_MS: 450,
  DEFAULT_CENTER: [52.5200, 13.4050], // Berlin, falls kein Standort verfuegbar
  DEFAULT_ZOOM: 12,
};

/* ---------------- State ---------------- */
let state = {
  stops: [],            // {id, lat, lon, address, done}
  settings: {
    useStart: false,
    roundtrip: true,
  },
  currentLocation: null, // {lat, lon}
  route: null,           // {geojson, distanceKm, durationMin}
};

function loadState() {
  try {
    const raw = localStorage.getItem(CONFIG.STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      state.stops = Array.isArray(parsed.stops) ? parsed.stops : [];
      state.settings = Object.assign(state.settings, parsed.settings || {});
    }
  } catch (e) {
    console.warn('Konnte gespeicherten Zustand nicht laden:', e);
  }
}

function saveState() {
  try {
    localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify({
      stops: state.stops,
      settings: state.settings,
    }));
  } catch (e) {
    console.warn('Konnte Zustand nicht speichern:', e);
  }
}

/* ---------------- Hilfsfunktionen ---------------- */
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

let toastTimer = null;
function showToast(msg, ms = 3200) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}

function shortAddress(displayName) {
  if (!displayName) return 'Unbekannte Adresse';
  const parts = displayName.split(',').map(p => p.trim());
  return parts.slice(0, 2).join(', ');
}

function isIOS() {
  return /iP(hone|ad|od)/.test(navigator.userAgent);
}

/* ---------------- Karte (Leaflet) ---------------- */
let map, markerLayer, routeLayer, startMarker;

function initMap() {
  map = L.map('map', { zoomControl: false, attributionControl: true })
    .setView(CONFIG.DEFAULT_CENTER, CONFIG.DEFAULT_ZOOM);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-Mitwirkende',
  }).addTo(map);

  L.control.zoom({ position: 'bottomright' }).addTo(map);

  markerLayer = L.layerGroup().addTo(map);
  routeLayer = L.layerGroup().addTo(map);

  map.on('click', onMapClick);
}

function pinDivIcon(label, cls) {
  return L.divIcon({
    className: '',
    html: `<div class="wp-pin ${cls || ''}"><span>${label}</span></div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 24],
    popupAnchor: [0, -22],
  });
}

function renderMarkers() {
  markerLayer.clearLayers();
  const bounds = [];

  if (state.settings.useStart && state.currentLocation) {
    const m = L.marker([state.currentLocation.lat, state.currentLocation.lon], {
      icon: pinDivIcon('S', 'start'),
    }).bindPopup('Mein Standort (Start)');
    markerLayer.addLayer(m);
    bounds.push([state.currentLocation.lat, state.currentLocation.lon]);
  }

  state.stops.forEach((s, i) => {
    const m = L.marker([s.lat, s.lon], {
      icon: pinDivIcon(String(i + 1), s.done ? 'done' : ''),
    }).bindPopup(s.address);
    markerLayer.addLayer(m);
    bounds.push([s.lat, s.lon]);
  });

  if (bounds.length === 1) {
    map.setView(bounds[0], 15);
  } else if (bounds.length > 1) {
    map.fitBounds(bounds, { padding: [60, 60] });
  }
}

function renderRouteOnMap() {
  routeLayer.clearLayers();
  if (!state.route || !state.route.geojson) return;
  const layer = L.geoJSON(state.route.geojson, {
    style: { color: '#FF6A2B', weight: 5, opacity: 0.9 },
  });
  routeLayer.addLayer(layer);
}

async function onMapClick(e) {
  const { lat, lng } = e.latlng;
  showToast('Adresse wird ermittelt …', 1500);
  try {
    const res = await fetch(
      `${CONFIG.NOMINATIM_URL}/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18`,
      { headers: { Accept: 'application/json' } }
    );
    if (!res.ok) throw new Error('reverse geocode failed');
    const data = await res.json();
    const address = data.display_name ? shortAddress(data.display_name) : `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    addStop(lat, lng, address);
  } catch (err) {
    addStop(lat, lng, `${lat.toFixed(5)}, ${lng.toFixed(5)}`);
    showToast('Adresse konnte nicht ermittelt werden – Koordinate verwendet.');
  }
}

/* ---------------- Stopps verwalten ---------------- */
function addStop(lat, lon, address) {
  state.stops.push({ id: uid(), lat, lon, address, done: false });
  state.route = null;
  afterStopsChanged();
  showToast('Stopp hinzugefügt.');
}

function removeStop(id) {
  state.stops = state.stops.filter(s => s.id !== id);
  state.route = null;
  afterStopsChanged();
}

function moveStop(id, dir) {
  const i = state.stops.findIndex(s => s.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= state.stops.length) return;
  [state.stops[i], state.stops[j]] = [state.stops[j], state.stops[i]];
  state.route = null;
  afterStopsChanged();
}

function toggleDone(id) {
  const s = state.stops.find(s => s.id === id);
  if (s) s.done = !s.done;
  afterStopsChanged();
}

function afterStopsChanged() {
  saveState();
  renderMarkers();
  renderRouteOnMap();
  renderList();
  updateTripStatsVisibility();
}

/* ---------------- Liste (Bottom Sheet) rendern ---------------- */
function renderList() {
  const list = document.getElementById('stopList');
  const empty = document.getElementById('emptyState');
  const countBadge = document.getElementById('stopCount');

  countBadge.textContent = String(state.stops.length);
  list.innerHTML = '';

  if (state.stops.length === 0) {
    empty.style.display = '';
    list.style.display = 'none';
    return;
  }
  empty.style.display = 'none';
  list.style.display = '';

  state.stops.forEach((s, i) => {
    const li = document.createElement('li');
    li.className = 'stop-row' + (s.done ? ' done' : '');

    li.innerHTML = `
      <div class="stop-index">${i + 1}</div>
      <div class="stop-main">
        <div class="stop-address"></div>
        <div class="stop-sub">${s.done ? 'Erledigt' : 'Offen'}</div>
      </div>
      <div class="stop-actions">
        <button class="mini-btn reorder" data-act="up" ${i === 0 ? 'disabled' : ''} aria-label="Nach oben">
          <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M12 5l7 7-1.4 1.4L13 8.8V19h-2V8.8l-4.6 4.6L5 12z"/></svg>
        </button>
        <button class="mini-btn reorder" data-act="down" ${i === state.stops.length - 1 ? 'disabled' : ''} aria-label="Nach unten">
          <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M12 19l-7-7 1.4-1.4L11 15.2V5h2v10.2l4.6-4.6L19 12z"/></svg>
        </button>
        <button class="mini-btn nav" data-act="nav" aria-label="Navigation starten">
          <svg viewBox="0 0 24 24" width="17" height="17"><path fill="currentColor" d="M3 11.5L20.5 3 12 20.5l-2.3-6.2z"/></svg>
        </button>
        <button class="mini-btn del" data-act="del" aria-label="Stopp löschen">
          <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M6 7h12l-1 13H7L6 7Zm3-3h6l1 2H8l1-2Z"/></svg>
        </button>
      </div>`;

    li.querySelector('.stop-address').textContent = s.address;
    li.querySelector('.stop-main').addEventListener('click', () => toggleDone(s.id));
    li.querySelector('[data-act="up"]').addEventListener('click', (ev) => { ev.stopPropagation(); moveStop(s.id, -1); });
    li.querySelector('[data-act="down"]').addEventListener('click', (ev) => { ev.stopPropagation(); moveStop(s.id, 1); });
    li.querySelector('[data-act="nav"]').addEventListener('click', (ev) => { ev.stopPropagation(); navigateToStop(s); });
    li.querySelector('[data-act="del"]').addEventListener('click', (ev) => { ev.stopPropagation(); removeStop(s.id); });

    list.appendChild(li);
  });
}

function updateTripStatsVisibility() {
  const box = document.getElementById('tripStats');
  const navAllBtn = document.getElementById('navigateAllBtn');
  if (state.route) {
    box.hidden = false;
    document.getElementById('statDistance').textContent = state.route.distanceKm.toFixed(1);
    document.getElementById('statDuration').textContent = Math.round(state.route.durationMin);
    navAllBtn.hidden = false;
  } else {
    box.hidden = true;
    navAllBtn.hidden = true;
  }
}

/* ---------------- Adresssuche (Nominatim) ---------------- */
let searchAbort = null;
let searchDebounceTimer = null;

function initSearch() {
  const input = document.getElementById('searchInput');
  const list = document.getElementById('suggestList');

  input.addEventListener('input', () => {
    clearTimeout(searchDebounceTimer);
    const q = input.value.trim();
    if (q.length < 3) {
      list.hidden = true;
      list.innerHTML = '';
      return;
    }
    searchDebounceTimer = setTimeout(() => runSearch(q), CONFIG.SEARCH_DEBOUNCE_MS);
  });

  document.addEventListener('click', (e) => {
    if (!list.contains(e.target) && e.target !== input) {
      list.hidden = true;
    }
  });
}

async function runSearch(query) {
  const list = document.getElementById('suggestList');
  if (searchAbort) searchAbort.abort();
  searchAbort = new AbortController();

  try {
    const url = `${CONFIG.NOMINATIM_URL}/search?format=jsonv2&addressdetails=0&limit=6&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, { signal: searchAbort.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error('search failed');
    const results = await res.json();

    list.innerHTML = '';
    if (!results.length) {
      list.innerHTML = '<li class="suggest-empty">Keine Treffer gefunden.</li>';
      list.hidden = false;
      return;
    }
    results.forEach(r => {
      const li = document.createElement('li');
      const main = shortAddress(r.display_name);
      li.innerHTML = `${main}<small></small>`;
      li.querySelector('small').textContent = r.display_name;
      li.addEventListener('click', () => {
        addStop(parseFloat(r.lat), parseFloat(r.lon), main);
        document.getElementById('searchInput').value = '';
        list.hidden = true;
        list.innerHTML = '';
      });
      list.appendChild(li);
    });
    list.hidden = false;
  } catch (err) {
    if (err.name !== 'AbortError') {
      showToast('Suche fehlgeschlagen. Bitte erneut versuchen.');
    }
  }
}

/* ---------------- Standort ---------------- */
function initLocate() {
  document.getElementById('locateBtn').addEventListener('click', () => {
    if (!('geolocation' in navigator)) {
      showToast('Standort wird von diesem Browser nicht unterstützt.');
      return;
    }
    showToast('Standort wird ermittelt …', 2000);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        state.currentLocation = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        document.getElementById('toggleStart').checked = true;
        state.settings.useStart = true;
        saveState();
        renderMarkers();
        map.setView([state.currentLocation.lat, state.currentLocation.lon], 15);
        showToast('Standort gesetzt.');
      },
      () => showToast('Standort konnte nicht ermittelt werden.'),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}

/* ---------------- Einstellungen ---------------- */
function initSettings() {
  const startToggle = document.getElementById('toggleStart');
  const roundtripToggle = document.getElementById('toggleRoundtrip');

  startToggle.checked = state.settings.useStart;
  roundtripToggle.checked = state.settings.roundtrip;

  startToggle.addEventListener('change', () => {
    state.settings.useStart = startToggle.checked;
    state.route = null;
    if (startToggle.checked && !state.currentLocation) {
      document.getElementById('locateBtn').click();
    }
    saveState();
    renderMarkers();
    updateTripStatsVisibility();
  });

  roundtripToggle.addEventListener('change', () => {
    state.settings.roundtrip = roundtripToggle.checked;
    state.route = null;
    saveState();
    updateTripStatsVisibility();
  });
}

/* ---------------- Bottom Sheet ein-/ausklappen ---------------- */
function initSheet() {
  const sheet = document.getElementById('sheet');
  document.getElementById('sheetHandle').addEventListener('click', () => {
    sheet.classList.toggle('collapsed');
  });
}

/* ---------------- Route optimieren (OSRM Trip) ---------------- */
function buildTripPoints() {
  const points = [];
  if (state.settings.useStart && state.currentLocation) {
    points.push({ lon: state.currentLocation.lon, lat: state.currentLocation.lat, stopId: null });
  }
  state.stops.forEach(s => points.push({ lon: s.lon, lat: s.lat, stopId: s.id }));
  return points;
}

function tripParams() {
  const { useStart, roundtrip } = state.settings;
  if (roundtrip) {
    return useStart
      ? { source: 'first', destination: 'any' }
      : { source: 'any', destination: 'any' };
  }
  // Einfache Fahrt: OSRM erlaubt nur source=first & destination=last
  return { source: 'first', destination: 'last' };
}

async function optimizeRoute() {
  const points = buildTripPoints();
  if (points.length < 2) {
    showToast('Bitte mindestens 2 Stopps hinzufügen (oder Standort als Start nutzen).');
    return;
  }

  const btn = document.getElementById('optimizeBtn');
  btn.disabled = true;
  const originalLabel = btn.innerHTML;
  btn.innerHTML = 'Optimiere …';

  try {
    const coordStr = points.map(p => `${p.lon},${p.lat}`).join(';');
    const { source, destination } = tripParams();
    const url = `${CONFIG.OSRM_URL}/trip/v1/driving/${coordStr}` +
      `?roundtrip=${state.settings.roundtrip}&source=${source}&destination=${destination}` +
      `&geometries=geojson&overview=full`;

    const res = await fetch(url);
    if (!res.ok) throw new Error('OSRM request failed: ' + res.status);
    const data = await res.json();
    if (data.code !== 'Ok' || !data.trips || !data.trips.length) {
      throw new Error(data.message || 'Keine Route gefunden');
    }

    const trip = data.trips[0];

    // Neue Reihenfolge anhand waypoint_index bestimmen (Pseudo-Startpunkt ausschliessen)
    const withOrder = points.map((p, i) => ({
      stopId: p.stopId,
      order: data.waypoints[i].waypoint_index,
    })).filter(p => p.stopId !== null);

    withOrder.sort((a, b) => a.order - b.order);
    const stopsById = Object.fromEntries(state.stops.map(s => [s.id, s]));
    state.stops = withOrder.map(w => stopsById[w.stopId]);

    state.route = {
      geojson: trip.geometry,
      distanceKm: trip.distance / 1000,
      durationMin: trip.duration / 60,
    };

    saveState();
    renderMarkers();
    renderRouteOnMap();
    renderList();
    updateTripStatsVisibility();
    showToast('Route optimiert.');
  } catch (err) {
    console.error(err);
    showToast('Route konnte nicht berechnet werden. Bitte später erneut versuchen.');
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalLabel;
  }
}

/* ---------------- Navigation an externe Karten-App übergeben ---------------- */
function navigateToStop(stop) {
  const { lat, lon } = stop;
  let url;
  if (isIOS()) {
    url = `https://maps.apple.com/?daddr=${lat},${lon}&dirflg=d`;
  } else {
    url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}&travelmode=driving`;
  }
  window.open(url, '_blank');
}

function navigateWholeRoute() {
  if (!state.stops.length) return;
  const pts = [];
  if (state.settings.useStart && state.currentLocation) {
    pts.push(`${state.currentLocation.lat},${state.currentLocation.lon}`);
  }
  state.stops.forEach(s => pts.push(`${s.lat},${s.lon}`));

  const origin = pts[0];
  const destination = state.settings.roundtrip ? origin : pts[pts.length - 1];
  const waypoints = pts.slice(1, state.settings.roundtrip ? pts.length : pts.length - 1);

  const params = new URLSearchParams({
    api: '1',
    origin,
    destination,
    travelmode: 'driving',
  });
  if (waypoints.length) params.set('waypoints', waypoints.join('|'));

  window.open(`https://www.google.com/maps/dir/?${params.toString()}`, '_blank');
}

/* ---------------- PWA: Service Worker ---------------- */
function initServiceWorker() {
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {
      /* Offline-Installation optional - Kernfunktion braucht das nicht */
    });
  }
}

/* ---------------- Start ---------------- */
function init() {
  loadState();
  initMap();
  initSearch();
  initLocate();
  initSettings();
  initSheet();
  initServiceWorker();

  document.getElementById('optimizeBtn').addEventListener('click', optimizeRoute);
  document.getElementById('navigateAllBtn').addEventListener('click', navigateWholeRoute);

  renderMarkers();
  renderList();
  updateTripStatsVisibility();

  // Versuche unauffällig, groben Standort für einen sinnvollen Kartenausschnitt zu bekommen
  if (state.stops.length === 0 && 'geolocation' in navigator) {
    navigator.geolocation.getCurrentPosition(
      (pos) => map.setView([pos.coords.latitude, pos.coords.longitude], 13),
      () => {},
      { timeout: 4000 }
    );
  }
}

document.addEventListener('DOMContentLoaded', init);
