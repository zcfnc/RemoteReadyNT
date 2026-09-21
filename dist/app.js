const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));

const app = {
  map: null,
  view: 'dashboard',
  scenario: 'outage',
  connectivity: [],
  facilities: [],
  sourceLog: null,
  layers: {},
  markersById: new Map(),
  selectedId: null,
  cycloneMarkers: [],
  cyclonePoints: [],
  timelineTimer: null,
};

const NT_BOUNDS = L.latLngBounds([[-26.1, 129], [-10.8, 138.1]]);
const BERRIMAH = {
  type: 'Feature', geometry: {type: 'Point', coordinates: [130.922, -12.435]},
  properties: {id: 'scenario-berrimah', kind: 'scenario-site', name: 'Berrimah', region: 'Greater Darwin', provider: 'Scenario mobile site', label: 'Modelled incident', priority: 'Critical'}
};
const scenarioText = {
  normal: {
    level: 'Routine monitoring', title: 'No active communications incident',
    copy: 'No active communications emergency. Explore coverage, essential services and community readiness.',
    priority: 'Borroloola', action: 'Pre-position satellite terminal and backup power', affected: '3', facilities: '2', eta: 'Planned'
  },
  cyclone: {
    level: 'Watch and act', title: 'Cyclone communications readiness scenario',
    copy: 'Review the forecast uncertainty area and pre-position portable communications before access deteriorates.',
    priority: 'Ngukurr', action: 'Stage a portable cell and generator', affected: '8', facilities: '4', eta: '4h 10m'
  },
  outage: {
    level: 'Critical incident', title: 'Berrimah mobile site unavailable',
    copy: 'Connectivity is degraded for nearby communities and essential facilities.',
    priority: 'Berrimah', action: 'Mobile site outage · restore backhaul and backup power', affected: '14', facilities: '6', eta: '2h 30m'
  }
};

function riskClass(risk) {
  return ({High: 'high', Medium: 'medium', Low: 'low'})[risk] || 'unknown';
}

function toast(message) {
  const node = $('#toast');
  node.textContent = message;
  node.classList.add('show');
  clearTimeout(window.remoteReadyToast);
  window.remoteReadyToast = setTimeout(() => node.classList.remove('show'), 2800);
}

function setView(name, updateHash = true) {
  app.view = name;
  $$('[data-view-panel]').forEach(panel => {
    const active = panel.dataset.viewPanel === name;
    panel.hidden = !active;
    panel.classList.toggle('active', active);
  });
  $$('[data-view]').forEach(button => button.classList.toggle('active', button.dataset.view === name));
  if (updateHash) history.replaceState(null, '', `#${name}`);
  if (name === 'dashboard' && app.map) setTimeout(() => {
    app.map.invalidateSize();
    focusScenarioView();
  }, 0);
  window.scrollTo({top: 0, behavior: 'smooth'});
}

function initNavigation() {
  $$('[data-view]').forEach(button => button.addEventListener('click', () => setView(button.dataset.view)));
  $$('[data-jump-view]').forEach(button => button.addEventListener('click', () => setView(button.dataset.jumpView)));
  const initial = location.hash.replace('#', '');
  if (['dashboard', 'preparedness', 'sources'].includes(initial)) setView(initial, false);
}

function initMap() {
  app.map = L.map('map', {zoomControl: false, minZoom: 4, maxZoom: 17, maxBoundsViscosity: .65});
  if ($('#view-dashboard').hidden) app.map.setView([-18.5, 133.5], 5);
  else app.map.fitBounds(NT_BOUNDS, {padding: [18, 18]});
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap contributors',
    crossOrigin: true,
  }).addTo(app.map);
  app.layers.communities = L.layerGroup().addTo(app.map);
  app.layers.smallcells = L.layerGroup();
  app.layers.health = L.layerGroup();
  app.layers.schools = L.layerGroup();
  app.layers.communityservices = L.layerGroup();
  app.layers.cyclone = L.layerGroup();
  app.layers.uncertainty = L.layerGroup();
  app.layers.outage = L.layerGroup();
  buildScenarioLayers();
}

function markerIcon(kind, extra = '', text = '') {
  const size = kind === 'community' ? 20 : kind === 'cyclone' ? 28 : 18;
  return L.divIcon({
    className: '',
    html: `<span class="${kind}-marker ${extra}">${text}</span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2]
  });
}

function buildScenarioLayers() {
  const observed = [[-10.95, 137.5], [-11.45, 136.8], [-12.05, 136.15]];
  const forecast = [[-12.05, 136.15], [-12.75, 135.25], [-13.55, 134.25]];
  app.cyclonePoints = [...observed, ...forecast.slice(1)];
  L.polyline(observed, {color: '#c93d39', weight: 5}).addTo(app.layers.cyclone);
  L.polyline(forecast, {color: '#c93d39', weight: 5, dashArray: '9 8'}).addTo(app.layers.cyclone);
  app.cyclonePoints.forEach((latlng, index) => {
    const labels = ['Thu 06', 'Thu 12', 'Thu 18', 'Fri 06', 'Fri 18'];
    const marker = L.marker(latlng, {icon: markerIcon('cyclone', index === 2 ? 'active' : '', String(index + 1)), zIndexOffset: 900})
      .bindTooltip(`${labels[index]} ACST · scenario point`, {direction: 'top'})
      .addTo(app.layers.cyclone);
    app.cycloneMarkers.push(marker);
  });
  const cone = [[-11.6,136.35],[-12.55,136.0],[-13.6,135.3],[-14.75,133.5],[-13.8,132.85],[-12.5,134.4]];
  L.polygon(cone, {color: '#e08b27', weight: 2, fillColor: '#f0b55c', fillOpacity: .24, dashArray: '5 5'}).addTo(app.layers.uncertainty);
  L.circle([-12.435, 130.922], {radius: 36000, color: '#bf3131', weight: 2, fillColor: '#bf3131', fillOpacity: .12, dashArray: '7 6'})
    .bindTooltip('Indicative Berrimah outage impact area · scenario')
    .addTo(app.layers.outage);
  L.marker([-12.435, 130.922], {icon: markerIcon('community', 'critical', '!'), zIndexOffset: 1100})
    .bindTooltip('Berrimah · critical priority (scenario)', {direction: 'top'})
    .on('click', showPriorityPlan)
    .addTo(app.layers.outage);
}

function markerStatus(feature) {
  const name = feature.properties.name;
  if (app.scenario === 'outage' && ['Wurrumiyanga', 'Milingimbi', 'Maningrida'].includes(name)) return 'degraded';
  if (app.scenario === 'cyclone') {
    if (feature.properties.risk === 'High') return 'degraded';
    if (feature.properties.risk === 'Medium') return 'offline';
  }
  return 'normal';
}

function updateMarkerStyles() {
  app.connectivity.forEach(feature => {
    const p = feature.properties;
    const marker = app.markersById.get(`${p.kind}:${p.id}`);
    if (!marker) return;
    marker.setIcon(p.kind === 'community' ? markerIcon('community', markerStatus(feature)) : markerIcon('site'));
  });
}

function addConnectivity(features) {
  app.connectivity = features;
  const communityCount = features.filter(feature => feature.properties.kind === 'community').length;
  const smallCellCount = features.filter(feature => feature.properties.kind === 'small-cell').length;
  $('#count-communities').textContent = communityCount;
  $('#count-smallcells').textContent = smallCellCount;
  $('#metric-connectivity').textContent = features.length;

  features.forEach(feature => {
    const properties = feature.properties;
    const [lng, lat] = feature.geometry.coordinates;
    const isCommunity = properties.kind === 'community';
    const icon = isCommunity ? markerIcon('community', markerStatus(feature)) : markerIcon('site');
    const marker = L.marker([lat, lng], {icon, title: properties.name, riseOnHover: true});
    marker.featureData = feature;
    marker.on('click', () => selectFeature(feature));
    marker.bindTooltip(`${escapeHtml(properties.name)} · ${escapeHtml(properties.provider)}`, {direction: 'top'});
    marker.addTo(isCommunity ? app.layers.communities : app.layers.smallcells);
    app.markersById.set(`${properties.kind}:${properties.id}`, marker);
  });
}

function facilityGroup(kind) {
  if (kind === 'clinic' || kind === 'hospital') return 'health';
  if (kind === 'school') return 'schools';
  return 'communityservices';
}

function addFacilities(features) {
  app.facilities = features;
  const counts = {health: 0, schools: 0, communityservices: 0};
  features.forEach(feature => {
    const properties = feature.properties;
    const [lng, lat] = feature.geometry.coordinates;
    const group = facilityGroup(properties.kind);
    counts[group] += 1;
    const glyph = group === 'health' ? '+' : group === 'schools' ? '■' : '●';
    const marker = L.marker([lat, lng], {icon: markerIcon('facility', group, glyph), title: properties.name, riseOnHover: true});
    marker.featureData = feature;
    marker.on('click', () => selectFeature(feature));
    marker.bindTooltip(`${escapeHtml(properties.name)} · ${escapeHtml(properties.label)}`, {direction: 'top'});
    marker.addTo(app.layers[group]);
    app.markersById.set(`facility:${properties.id}`, marker);
  });
  $('#count-health').textContent = counts.health;
  $('#count-schools').textContent = counts.schools;
  $('#count-services').textContent = counts.communityservices;
  $('#metric-facilities').textContent = features.length;
}

function selectFeature(feature, moveMap = false) {
  if (feature.properties.kind === 'scenario-site') return showPriorityPlan(true);
  const properties = feature.properties;
  app.selectedId = `${properties.kind}:${properties.id}`;
  if (moveMap) {
    const [lng, lat] = feature.geometry.coordinates;
    app.map.flyTo([lat, lng], Math.max(app.map.getZoom(), 9), {duration: .55});
  }
  $('#detail-drawer').classList.remove('closed');
  $('#detail-drawer').setAttribute('aria-hidden', 'false');
  $('#detail-name').textContent = properties.name;
  const isFacility = Boolean(properties.label);
  $('#detail-kicker').textContent = isFacility ? 'ESSENTIAL FACILITY' : properties.kind === 'small-cell' ? 'SMALL CELL SITE' : 'COMMUNITY PROFILE';
  $('#detail-region').textContent = isFacility ? `${properties.label} · ${properties.source}` : `${properties.region} · ${properties.kind === 'small-cell' ? 'small-cell coverage' : 'remote community'}`;

  if (isFacility) {
    $('#detail-body').className = '';
    $('#detail-body').innerHTML = `
      <div class="detail-block"><h3>Facility type</h3><p>${escapeHtml(properties.label)}</p></div>
      <div class="detail-block"><h3>Map source</h3><p>${escapeHtml(properties.source)}</p></div>
      <div class="detail-block detail-action"><h3>Before relying on this location</h3><p>Confirm opening status, emergency capability and access conditions with the responsible organisation.</p></div>`;
    return;
  }

  const risk = riskClass(properties.risk);
  const score = properties.resilience == null ? '—' : properties.resilience;
  const facilities = (properties.facilities || []).map(item => `<span class="facility-badge">${escapeHtml(item)}</span>`).join('') || '<span class="facility-badge">Inspect facility layers</span>';
  $('#detail-body').className = '';
  $('#detail-body').innerHTML = `
    <div class="risk-row"><span class="risk-chip ${risk}">${escapeHtml(properties.risk).toUpperCase()}</span><span class="score"><strong>${score}</strong><small>/100 resilience</small></span></div>
    <dl class="detail-list">
      <div><dt>Provider</dt><dd>${escapeHtml(properties.provider)}</dd></div>
      <div><dt>Backhaul</dt><dd>${escapeHtml(properties.backhaul)}</dd></div>
      <div><dt>Coverage record</dt><dd>${escapeHtml(properties.coverage)}</dd></div>
      <div><dt>Population model</dt><dd>${properties.population == null ? 'Not linked' : Number(properties.population).toLocaleString()}</dd></div>
      <div><dt>Data confidence</dt><dd>${escapeHtml(properties.confidence)}</dd></div>
    </dl>
    <div class="detail-block"><h3>Risk drivers</h3><p>${escapeHtml(properties.reason)}</p></div>
    <div class="detail-block"><h3>Nearby services in prototype</h3><p>${facilities}</p></div>
    <div class="detail-block detail-action"><h3>Recommended action</h3><p>${escapeHtml(properties.action)}</p></div>
    <button class="drawer-button" type="button" data-save-pack="${escapeHtml(properties.id)}">Save community data offline</button>`;
  $('[data-save-pack]', $('#detail-body')).addEventListener('click', saveOfflinePack);
}

function showPriorityPlan(moveMap = true) {
  if (moveMap) app.map.flyTo([-12.435, 130.922], 10, {duration: .55});
  $('#detail-drawer').classList.remove('closed');
  $('#detail-drawer').setAttribute('aria-hidden', 'false');
  $('#detail-kicker').textContent = 'Why this priority?';
  $('#detail-name').textContent = 'Berrimah';
  $('#detail-region').textContent = 'Greater Darwin · modelled tower-outage scenario';
  $('#detail-body').className = '';
  $('#detail-body').innerHTML = `
    <div class="decision-intro"><strong>Critical deployment priority</strong><span>Highest combined impact across affected population, essential services and restoration time.</span></div>
    <div class="decision-grid">
      <div><small>Impact</small><strong>14 communities</strong></div>
      <div><small>Essential services</small><strong>6 facilities</strong></div>
      <div><small>Backhaul</small><strong>Offline</strong></div>
      <div><small>Backup power</small><strong>Low</strong></div>
    </div>
    <div class="detail-block"><h3>Infrastructure</h3><p>The scenario assumes primary mobile backhaul is unavailable and battery reserve is approaching its operational threshold. Two alternate sites are available but do not cover the full impact area.</p></div>
    <div class="detail-block"><h3>Why Berrimah first?</h3><p>It has the largest modelled service dependency, supports the response corridor into Darwin and offers the shortest restoration path for the greatest number of critical services.</p></div>
    <div class="detail-block detail-action"><h3>Recommended action</h3><p>Dispatch a field team with a portable satellite terminal, backhaul kit and generator. Verify site safety before energising equipment.</p></div>
    <button class="drawer-button" id="dispatch-team" type="button">Dispatch response team</button>
    <button class="drawer-button secondary" id="copy-response" type="button">Copy response brief</button>`;
  $('#dispatch-team').addEventListener('click', () => toast('Prototype action recorded · team dispatch is not connected to an operational system'));
  $('#copy-response').addEventListener('click', async () => {
    const text = 'RemoteReady NT scenario brief: Berrimah is the critical deployment priority. Dispatch portable satellite backhaul and backup power. ETA 2h 30m.';
    try { await navigator.clipboard.writeText(text); toast('Response brief copied'); }
    catch { toast('Copy is not available in this browser'); }
  });
}

function setLayer(name, visible) {
  const layer = app.layers[name];
  if (!layer) return;
  if (visible && !app.map.hasLayer(layer)) layer.addTo(app.map);
  if (!visible && app.map.hasLayer(layer)) app.map.removeLayer(layer);
}

function setScenario(name) {
  app.scenario = name;
  const info = scenarioText[name];
  $('#warning-level').textContent = info.level;
  $('#warning-title').textContent = info.title;
  $('#warning-copy').textContent = info.copy;
  $('#metric-priority').textContent = info.priority;
  $('#metric-action').textContent = info.action;
  $('#metric-risk').textContent = name === 'normal' ? '3' : name === 'cyclone' ? '4' : '5';
  $('#warning-strip').className = `warning-strip ${name}`;
  $('#priority-card').className = `priority-card ${name}`;
  $('.priority-severity').innerHTML = name === 'normal' ? '<i></i> Planned' : name === 'cyclone' ? '<i></i> High' : '<i></i> Critical';
  const impact = $$('.priority-impact span');
  impact[0].innerHTML = `<strong>${info.affected}</strong> communities`;
  impact[1].innerHTML = `<strong>${info.facilities}</strong> facilities`;
  impact[2].innerHTML = `<strong>${info.eta}</strong> response ETA`;
  $$('.scenario').forEach(button => button.classList.toggle('active', button.dataset.scenario === name));
  const cyclone = name === 'cyclone';
  setLayer('cyclone', cyclone);
  setLayer('uncertainty', cyclone);
  setLayer('outage', name === 'outage');
  updateMarkerStyles();
  $('[data-layer="cyclone"]').checked = cyclone;
  $('[data-layer="uncertainty"]').checked = cyclone;
  $('#forecast-timeline').hidden = !cyclone;
  focusScenarioView();
}

function focusScenarioView() {
  if (!app.map || $('#view-dashboard').hidden) return;
  if (app.scenario === 'cyclone') app.map.fitBounds([[-14.9, 132.7], [-10.7, 137.7]], {padding: [55, 55]});
  else if (app.scenario === 'outage') app.map.flyTo([-12.435, 130.922], 9, {duration: .6});
  else app.map.fitBounds(NT_BOUNDS, {padding: [18, 18]});
}

function runSearch() {
  const query = $('#place-search').value.trim().toLowerCase();
  const all = [BERRIMAH, ...app.connectivity, ...app.facilities];
  let results = query ? all.filter(feature => {
    const p = feature.properties;
    return [p.name, p.region, p.provider, p.label].some(value => String(value || '').toLowerCase().includes(query));
  }).slice(0, 12) : [BERRIMAH, ...['Wadeye', 'Borroloola'].map(name => app.connectivity.find(feature => feature.properties.name === name)).filter(Boolean)];
  const list = $('#search-results');
  list.innerHTML = results.map((feature, index) => {
    const p = feature.properties;
    const type = p.kind === 'scenario-site' ? 'Scenario incident' : p.label || (p.kind === 'small-cell' ? 'Mobile small cell' : 'Remote community');
    const status = p.kind === 'scenario-site' ? 'Critical priority' : p.risk ? `${p.risk} resilience risk` : p.region || p.provider;
    return `<li><button type="button" data-result="${index}"><strong>${escapeHtml(p.name)}</strong><small><span>${escapeHtml(type)}</span><em>${escapeHtml(status)}</em></small></button></li>`;
  }).join('');
  list.style.display = results.length ? 'block' : 'none';
  $$('[data-result]', list).forEach(button => button.addEventListener('click', () => {
    const feature = results[Number(button.dataset.result)];
    list.style.display = 'none';
    $('#place-search').value = feature.properties.name;
    selectFeature(feature, true);
  }));
  if (query && !results.length) toast('No matching community, site or facility');
}

function initMapControls() {
  $('#zoom-in').addEventListener('click', () => app.map.zoomIn());
  $('#zoom-out').addEventListener('click', () => app.map.zoomOut());
  $('#home-map').addEventListener('click', () => app.map.fitBounds(NT_BOUNDS, {padding: [18, 18]}));
  $('#locate-map').addEventListener('click', locateUser);
  $('#fullscreen-map').addEventListener('click', async () => {
    const workspace = $('.map-workspace');
    try {
      if (!document.fullscreenElement) await workspace.requestFullscreen();
      else await document.exitFullscreen();
      setTimeout(() => app.map.invalidateSize(), 120);
    } catch { toast('Fullscreen is not available in this browser'); }
  });
  $('#reset-map').addEventListener('click', () => {
    setScenario('normal');
    app.map.fitBounds(NT_BOUNDS, {padding: [18, 18]});
    $$('[data-layer]').forEach(input => {
      const active = input.dataset.layer === 'communities';
      input.checked = active;
      setLayer(input.dataset.layer, active);
    });
    toast('Map reset to the Northern Territory view');
  });
  $('#panel-toggle').addEventListener('click', () => {
    const collapsed = $('#map-panel').classList.toggle('collapsed');
    $('#panel-toggle').textContent = collapsed ? '›' : '‹';
    $('#panel-toggle').setAttribute('aria-label', collapsed ? 'Expand map panel' : 'Collapse map panel');
  });
  $$('.layer-section-title').forEach(button => button.addEventListener('click', () => {
    const section = button.closest('.layer-section');
    section.classList.toggle('open');
    button.lastElementChild.textContent = section.classList.contains('open') ? '⌃' : '⌄';
  }));
  $$('[data-panel-tab]').forEach(button => button.addEventListener('click', () => {
    const layers = button.dataset.panelTab === 'layers';
    $$('[data-panel-tab]').forEach(item => item.classList.toggle('active', item === button));
    $('#layers-tab').hidden = !layers;
    $('#legend-tab').hidden = layers;
  }));
  $$('[data-layer]').forEach(input => input.addEventListener('change', event => setLayer(event.target.dataset.layer, event.target.checked)));
  $$('.scenario').forEach(button => button.addEventListener('click', () => setScenario(button.dataset.scenario)));
  $('#search-button').addEventListener('click', runSearch);
  $('#place-search').addEventListener('input', runSearch);
  $('#place-search').addEventListener('focus', runSearch);
  $('#place-search').addEventListener('keydown', event => { if (event.key === 'Enter') runSearch(); });
  $$('[data-quick-search]').forEach(button => button.addEventListener('click', () => {
    $('#place-search').value = button.dataset.quickSearch;
    runSearch();
  }));
  $('#drawer-close').addEventListener('click', () => {
    $('#detail-drawer').classList.add('closed');
    $('#detail-drawer').setAttribute('aria-hidden', 'true');
  });
  $('#view-priority').addEventListener('click', () => app.scenario === 'outage' ? showPriorityPlan(true) : openCurrentPriority());
  $('#incident-view').addEventListener('click', () => app.scenario === 'outage' ? showPriorityPlan(true) : openCurrentPriority());
  $('#timeline-range').addEventListener('input', event => updateTimeline(Number(event.target.value), true));
  $('#timeline-play').addEventListener('click', toggleTimeline);
}

function locateUser() {
  if (!navigator.geolocation) return toast('Location is not available in this browser');
  navigator.geolocation.getCurrentPosition(position => {
    const latlng = [position.coords.latitude, position.coords.longitude];
    app.map.flyTo(latlng, 12);
    L.circleMarker(latlng, {radius: 8, color: '#07334e', weight: 3, fillColor: '#6cc3e7', fillOpacity: 1}).addTo(app.map).bindPopup('Your current position').openPopup();
  }, () => toast('Location permission was not granted'));
}

function openCurrentPriority() {
  const target = app.connectivity.find(feature => feature.properties.name === scenarioText[app.scenario].priority);
  if (target) selectFeature(target, true);
}

function updateTimeline(index, moveMap = false) {
  const labels = ['Thu 06:00 · observed', 'Thu 12:00 · observed', 'Thu 18:00 · current', 'Fri 06:00 · forecast', 'Fri 18:00 · forecast'];
  $('#timeline-range').value = index;
  $('#timeline-current').textContent = labels[index];
  app.cycloneMarkers.forEach((marker, markerIndex) => marker.setIcon(markerIcon('cyclone', markerIndex === index ? 'active' : '', String(markerIndex + 1))));
  if (moveMap && app.cyclonePoints[index]) app.map.panTo(app.cyclonePoints[index], {animate: true, duration: .35});
}

function toggleTimeline() {
  if (app.timelineTimer) {
    clearInterval(app.timelineTimer);
    app.timelineTimer = null;
    $('#timeline-play').textContent = '▶';
    return;
  }
  $('#timeline-play').textContent = '❚❚';
  app.timelineTimer = setInterval(() => {
    const next = (Number($('#timeline-range').value) + 1) % 5;
    updateTimeline(next, true);
  }, 1300);
}

function updateChecklist() {
  const checked = $$('[data-check]:checked').length;
  const total = $$('[data-check]').length;
  const percent = Math.round(checked / total * 100);
  $('#checklist-count').textContent = `${checked} of ${total}`;
  $('#readiness-percent').textContent = `${percent}%`;
  $('#readiness-progress').style.width = `${percent}%`;
}

function initPreparedness() {
  const saved = JSON.parse(localStorage.getItem('remoteReadyChecklist') || '{}');
  $$('[data-check]').forEach(input => {
    input.checked = Boolean(saved[input.dataset.check]);
    input.addEventListener('change', () => {
      const next = {};
      $$('[data-check]').forEach(item => { next[item.dataset.check] = item.checked; });
      localStorage.setItem('remoteReadyChecklist', JSON.stringify(next));
      updateChecklist();
    });
  });
  updateChecklist();
  $('#save-offline-pack').addEventListener('click', saveOfflinePack);
  updateOfflineStatus();
  window.addEventListener('online', updateOfflineStatus);
  window.addEventListener('offline', updateOfflineStatus);
  $('#locate-me').addEventListener('click', () => {
    if (!navigator.geolocation) return toast('Location is not available in this browser');
    navigator.geolocation.getCurrentPosition(position => {
      setView('dashboard');
      const latlng = [position.coords.latitude, position.coords.longitude];
      app.map.flyTo(latlng, 11);
      L.circleMarker(latlng, {radius: 8, color: '#07334e', weight: 3, fillColor: '#6cc3e7', fillOpacity: 1}).addTo(app.map).bindPopup('Your current position').openPopup();
    }, () => toast('Location permission was not granted'));
  });
  $('#copy-summary').addEventListener('click', async () => {
    const info = scenarioText[app.scenario];
    const text = `RemoteReady NT situation note\n${info.level}: ${info.title}\nPriority: ${info.priority} — ${info.action}\nPrototype information only.`;
    try { await navigator.clipboard.writeText(text); toast('Situation note copied'); }
    catch { toast('Copy is not available in this browser'); }
  });
}

async function saveOfflinePack() {
  const assets = [
    './', 'index.html', 'styles.css', 'app.js', 'manifest.webmanifest',
    'vendor/leaflet/leaflet.css', 'vendor/leaflet/leaflet.js',
    'data/connectivity.geojson', 'data/facilities.geojson', 'data/download_log.json'
  ];
  try {
    const cache = await caches.open('remoteready-pack-v3');
    await cache.addAll(assets);
    localStorage.setItem('remoteReadyOfflinePack', new Date().toISOString());
    updateOfflineStatus();
    toast('Emergency data pack saved on this device');
  } catch {
    toast('The offline pack could not be saved. Check the local server and try again.');
  }
}

function updateOfflineStatus() {
  const saved = localStorage.getItem('remoteReadyOfflinePack');
  const network = navigator.onLine ? 'Online' : 'Offline';
  $('#offline-status').textContent = saved ? `${network} · pack saved ${new Date(saved).toLocaleDateString('en-AU')}` : `${network} · pack not saved`;
  $('#offline-note').textContent = saved
    ? 'Community, facility and source data are stored locally. Previously viewed map tiles may also remain available.'
    : 'The basemap needs a connection; save the operational data before entering a low-coverage area.';
}

function renderSources(log) {
  app.sourceLog = log;
  const entries = Object.values(log.sources || {});
  const available = entries.filter(source => source.status === 'ok').length;
  $('#source-date').textContent = log.last_attempt || 'Unknown';
  $('#source-connectivity').textContent = (log.counts?.connectivity ?? app.connectivity.length).toLocaleString();
  $('#source-facilities').textContent = (log.counts?.facilities ?? app.facilities.length).toLocaleString();
  $('#source-status').textContent = `${available} of ${entries.length} available`;
  if (log.generated_at) $('#header-updated').textContent = new Date(log.generated_at).toLocaleString('en-AU', {dateStyle:'medium', timeStyle:'short'});
  $('#source-grid').innerHTML = entries.map(source => `
    <article class="source-card ${source.status === 'ok' ? '' : 'unavailable'}">
      <div><h3>${escapeHtml(source.title || 'Public data source')}</h3><p>${escapeHtml(source.provider || 'Source provider')}</p></div>
      <span class="source-type">${escapeHtml(source.type || 'reference')}</span>
      <span class="source-state">${source.status === 'ok' ? '● AVAILABLE AT REFRESH' : '● USING CACHED OR DEMO DATA'}</span>
      ${source.url ? `<a href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer">Open official source ↗</a>` : '<span></span>'}
    </article>`).join('');
}

function initSourceDownload() {
  $('#download-source-log').addEventListener('click', () => {
    if (!app.sourceLog) return toast('Source log is still loading');
    const blob = new Blob([JSON.stringify(app.sourceLog, null, 2)], {type: 'application/json'});
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'remoteready-nt-source-log.json';
    link.click();
    URL.revokeObjectURL(link.href);
  });
}

function initDialogs() {
  const dialog = $('#help-dialog');
  $('#help-btn').addEventListener('click', () => dialog.showModal());
  $('#help-close').addEventListener('click', () => dialog.close());
}

async function loadData() {
  const [connectivity, facilities, sourceLog] = await Promise.all([
    fetch('data/connectivity.geojson').then(response => { if (!response.ok) throw new Error('connectivity'); return response.json(); }),
    fetch('data/facilities.geojson').then(response => { if (!response.ok) throw new Error('facilities'); return response.json(); }),
    fetch('data/download_log.json').then(response => { if (!response.ok) throw new Error('source log'); return response.json(); }),
  ]);
  addConnectivity(connectivity.features || []);
  addFacilities(facilities.features || []);
  renderSources(sourceLog);
  setScenario('outage');
  $('#detail-drawer').classList.add('closed');
  $('#detail-drawer').setAttribute('aria-hidden', 'true');
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('service-worker.js').catch(() => {});
}

initNavigation();
initMap();
initMapControls();
initPreparedness();
initSourceDownload();
initDialogs();
registerServiceWorker();
loadData().catch(error => {
  console.error(error);
  $('#header-updated').textContent = 'Public data failed to load';
  toast('Map data could not be loaded. Run the data refresh script and reload.');
});
