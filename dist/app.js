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
  outageScenario: null,
  priorityResults: [],
  priorityStatus: 'loading',
  priorityError: '',
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
    priority: 'Borroloola', action: 'Review readiness and confirm local backup communications.', affected: '3', facilities: '2', eta: 'Planned',
    timestamp: 'Prototype normal operations · updated 09:40 ACST', dataTag: 'Published context'
  },
  cyclone: {
    level: 'Watch and act', title: 'Cyclone communications readiness scenario',
    copy: 'Review the forecast uncertainty area and pre-position portable communications before access deteriorates.',
    priority: 'Ngukurr', action: 'Stage a portable cell and generator', affected: '8', facilities: '4', eta: '4h 10m',
    timestamp: 'Prototype forecast · updated 09:40 ACST', dataTag: 'Forecast'
  },
  outage: {
    level: 'Critical incident', title: 'Berrimah mobile site unavailable',
    copy: 'Prototype inputs rank candidate communities for interim communications support.',
    priority: 'Calculating priority…', action: 'Modelled outage candidate comparison', affected: '—', facilities: '—', eta: '—',
    timestamp: 'Prototype tower outage · updated 09:40 ACST', dataTag: 'Indicative model'
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

function isMobileViewport() {
  return window.matchMedia('(max-width: 760px)').matches;
}

function setMobileActionExpanded(expanded) {
  if (!isMobileViewport()) return;
  const card = $('#priority-card');
  const toggle = $('#mobile-action-toggle');
  if (card) card.classList.toggle('mobile-collapsed', !expanded);
  if (toggle) toggle.setAttribute('aria-expanded', String(expanded));
}

function closeMobileDetail() {
  if (!isMobileViewport()) return;
  $('#detail-drawer').classList.add('closed');
  $('#detail-drawer').setAttribute('aria-hidden', 'true');
}

function openContextPanel() {
  prepareMobileDetail();
  const drawer = $('#detail-drawer');
  drawer.classList.remove('closed');
  drawer.setAttribute('aria-hidden', 'false');
  if (!isMobileViewport()) $('#priority-card').classList.add('context-replaced');
}

function closeContextPanel() {
  $('#detail-drawer').classList.add('closed');
  $('#detail-drawer').setAttribute('aria-hidden', 'true');
  $('#priority-card').classList.remove('context-replaced');
}

function prepareMobileDetail() {
  if (!isMobileViewport()) return;
  $('#map-panel').classList.add('collapsed');
  const explore = $('#explore-map');
  if (explore) explore.setAttribute('aria-expanded', 'false');
  setMobileActionExpanded(false);
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
  app.layers.decisionEvidence = L.layerGroup();
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
  L.polyline(observed, {color: '#235c79', weight: 5}).bindTooltip('Observed cyclone track').addTo(app.layers.cyclone);
  L.polyline(forecast, {color: '#176f98', weight: 5, dashArray: '9 8'}).bindTooltip('Forecast track · uncertainty applies').addTo(app.layers.cyclone);
  app.cyclonePoints.forEach((latlng, index) => {
    const labels = ['Thu 06', 'Thu 12', 'Thu 18', 'Fri 06', 'Fri 18'];
    const marker = L.marker(latlng, {icon: markerIcon('cyclone', index === 2 ? 'active' : '', String(index + 1)), zIndexOffset: 900})
      .bindTooltip(`${labels[index]} ACST · scenario point`, {direction: 'top'})
      .addTo(app.layers.cyclone);
    app.cycloneMarkers.push(marker);
  });
  const cone = [[-11.6,136.35],[-12.55,136.0],[-13.6,135.3],[-14.75,133.5],[-13.8,132.85],[-12.5,134.4]];
  L.polygon(cone, {color: '#176f98', weight: 2, fillColor: '#8fc8dc', fillOpacity: .22, dashArray: '5 5'})
    .bindTooltip('Forecast uncertainty · not a confirmed impact boundary')
    .addTo(app.layers.uncertainty);
  L.circle([-12.435, 130.922], {radius: 36000, color: '#bf3131', weight: 2, fillColor: '#bf3131', fillOpacity: .12, dashArray: '7 6'})
    .bindTooltip('Indicative Berrimah outage impact area · scenario')
    .addTo(app.layers.outage);
  L.marker([-12.435, 130.922], {icon: markerIcon('community', 'critical', '!'), zIndexOffset: 1100})
    .bindTooltip('Berrimah · modelled incident marker', {direction: 'top'})
    .on('click', () => showPriorityPlan())
    .addTo(app.layers.outage);
}

function updateDecisionEvidence() {
  const layer = app.layers.decisionEvidence;
  if (!layer) return;
  layer.clearLayers();
  if (app.scenario !== 'outage') return;

  const priority = app.priorityResults[0];
  const community = priority && getPriorityCommunity(priority);
  if (!community) return;

  const [lng, lat] = community.geometry.coordinates;
  const incident = [-12.435, 130.922];
  const destination = [lat, lng];
  L.polyline([incident, destination], {
    color: '#bf3131', weight: 3, opacity: .82, dashArray: '8 8', lineCap: 'round'
  }).bindTooltip('Indicative response corridor · modelled scenario', {sticky: true}).addTo(layer);
  L.marker(incident, {
    icon: markerIcon('decision-label', 'incident', 'INCIDENT'),
    interactive: false,
    zIndexOffset: 1180
  }).addTo(layer);
  L.marker(destination, {
    icon: markerIcon('decision-label', 'priority', `1 · ${escapeHtml(priority.name)}`),
    interactive: false,
    zIndexOffset: 1180
  }).addTo(layer);
  layer.addTo(app.map);
}

function markerStatus(feature) {
  const name = feature.properties.name;
  const priority = priorityResultForFeature(feature);
  if (app.scenario === 'outage' && priority) {
    if (priority.rank === 1) return 'priority-top';
    if (priority.rank <= 3) return 'priority-medium';
    return 'priority-watch';
  }
  if (app.scenario === 'outage' && ['Wurrumiyanga', 'Milingimbi', 'Maningrida'].includes(name)) return 'degraded';
  if (app.scenario === 'cyclone') {
    if (feature.properties.risk === 'High') return 'degraded';
    if (feature.properties.risk === 'Medium') return 'offline';
  }
  return 'normal';
}

function priorityResultForFeature(feature) {
  if (!feature || feature.properties.kind !== 'community') return null;
  return app.priorityResults.find(result => result.communityId === feature.properties.id) || null;
}

function updateMarkerStyles() {
  app.connectivity.forEach(feature => {
    const p = feature.properties;
    const marker = app.markersById.get(`${p.kind}:${p.id}`);
    if (!marker) return;
    marker.setIcon(p.kind === 'community' ? markerIcon('community', markerStatus(feature)) : markerIcon('site'));
    const priority = priorityResultForFeature(feature);
    if (p.kind === 'community' && app.scenario === 'outage' && priority) {
      marker.setTooltipContent(`${escapeHtml(p.name)} · rank #${priority.rank} · ${priority.totalScore.toFixed(1)} / 100 · indicative prototype score`);
    } else {
      marker.setTooltipContent(`${escapeHtml(p.name)} · ${escapeHtml(p.provider)}`);
    }
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
  const priority = app.scenario === 'outage' ? priorityResultForFeature(feature) : null;
  if (priority) return showPriorityPlan(priority, moveMap);
  openContextPanel();
  const properties = feature.properties;
  app.selectedId = `${properties.kind}:${properties.id}`;
  if (moveMap) {
    const [lng, lat] = feature.geometry.coordinates;
    app.map.flyTo([lat, lng], Math.max(app.map.getZoom(), 9), {duration: .55});
  }
  $('#detail-name').textContent = properties.name;
  const isFacility = Boolean(properties.label);
  $('#detail-kicker').textContent = isFacility ? 'ESSENTIAL FACILITY' : properties.kind === 'small-cell' ? 'SMALL CELL SITE' : 'COMMUNITY DETAILS';
  $('#detail-region').textContent = isFacility ? `${properties.label} · ${properties.source}` : `${properties.region} · ${properties.kind === 'small-cell' ? 'small-cell coverage' : 'remote community'}`;

  if (isFacility) {
    $('#detail-body').className = '';
    $('#detail-body').innerHTML = `
      <div class="detail-block"><h3>Published information <span class="data-status published">Published data</span></h3><p>${escapeHtml(properties.label)} · ${escapeHtml(properties.source)}</p></div>
      <div class="detail-block"><h3>Service status <span class="data-status not-confirmed">Not confirmed</span></h3><p>Map locations do not confirm opening status, emergency capability or current communications availability.</p></div>
      <div class="detail-block detail-action"><h3>Verify locally before action</h3><p>Confirm access conditions and service status with the responsible organisation.</p></div>`;
    return;
  }

  const risk = riskClass(properties.risk);
  const score = properties.resilience == null ? '—' : properties.resilience;
  const facilities = (properties.facilities || []).map(item => `<span class="facility-badge">${escapeHtml(item)}</span>`).join('') || '<span class="facility-badge">Inspect facility layers</span>';
  $('#detail-body').className = '';
  $('#detail-body').innerHTML = `
    <div class="detail-block"><h3>Published information <span class="data-status published">Published data</span></h3><dl class="detail-list">
      <div><dt>Provider</dt><dd>${escapeHtml(properties.provider)}</dd></div>
      <div><dt>Backhaul</dt><dd>${escapeHtml(properties.backhaul)}</dd></div>
      <div><dt>Coverage record</dt><dd>${escapeHtml(properties.coverage)}</dd></div>
      <div><dt>Population record</dt><dd>${properties.population == null ? 'Not linked' : Number(properties.population).toLocaleString()}</dd></div>
    </dl></div>
    <div class="detail-block"><h3>Indicative scenario assessment <span class="data-status modelled">Indicative model</span></h3><div class="risk-row"><span class="risk-chip ${risk}">${escapeHtml(properties.risk).toUpperCase()}</span><span class="score"><strong>${score}</strong><small>/100 resilience</small></span></div><p>${escapeHtml(properties.reason)}</p></div>
    <div class="detail-block"><h3>Essential services <span class="data-status not-confirmed">Not confirmed</span></h3><p>${facilities}</p></div>
    <div class="detail-block detail-action"><h3>Verify locally before action</h3><p>${escapeHtml(properties.action)} Confirm roads, service availability, community needs and site safety before deployment.</p></div>
    <button class="drawer-button" type="button" data-save-pack="${escapeHtml(properties.id)}">Save community data offline</button>`;
  $('[data-save-pack]', $('#detail-body')).addEventListener('click', saveOfflinePack);
}

function getPriorityCommunity(result) {
  return app.connectivity.find(feature => feature.properties.kind === 'community' && feature.properties.id === result.communityId);
}

function formatScoreInput(value) {
  if (value == null || value === '') return 'Missing';
  if (Array.isArray(value)) return value.length ? value.join(', ') : 'Missing';
  return String(value);
}

function renderScoreBreakdown(item) {
  const isPenalty = item.id === 'confidencePenalty';
  const score = `${item.score < 0 ? '−' : ''}${Math.abs(item.score).toFixed(1)}`;
  const maximum = isPenalty ? `maximum deduction −${item.maximum}` : `weight / ${item.maximum}`;
  const penaltyRule = isPenalty ? `<div><dt>Penalty rule</dt><dd>${escapeHtml(item.input.value)} = −${Math.abs(item.score).toFixed(1)} points</dd></div>` : '';
  return `
    <article class="score-breakdown-item ${isPenalty ? 'penalty' : ''}">
      <header><h3>${escapeHtml(item.label)}</h3><strong>${score}<small>${escapeHtml(maximum)}</small></strong></header>
      <dl>
        <div><dt>Input</dt><dd>${escapeHtml(formatScoreInput(item.input.value))}</dd></div>
        <div><dt>Rule</dt><dd>${escapeHtml(item.explanation)}</dd></div>
        ${penaltyRule}
        <div><dt>Source</dt><dd>${escapeHtml(item.input.source)}</dd></div>
        <div><dt>Updated</dt><dd>${escapeHtml(item.input.updated_at)}</dd></div>
        <div><dt>Status</dt><dd><span class="data-status ${escapeHtml(item.input.status)}">${escapeHtml(item.input.status)}</span></dd></div>
        <div><dt>Confidence</dt><dd>${escapeHtml(item.input.confidence)}</dd></div>
      </dl>
    </article>`;
}

function showPriorityPlan(resultOrMoveMap = app.priorityResults[0], moveMap = true) {
  const result = typeof resultOrMoveMap === 'boolean' ? app.priorityResults[0] : resultOrMoveMap;
  if (typeof resultOrMoveMap === 'boolean') moveMap = resultOrMoveMap;
  if (!result) {
    return toast(
      app.priorityStatus === 'unavailable'
        ? 'Priority model is unavailable. Explore the map or check data sources.'
        : 'Priority model results are still loading.'
    );
  }
  openContextPanel();
  const community = getPriorityCommunity(result);
  if (moveMap && community) {
    const [lng, lat] = community.geometry.coordinates;
    app.map.flyTo([lat, lng], 9, {duration: .55});
  }
  $('#detail-kicker').textContent = 'Why this priority?';
  $('#detail-name').textContent = result.name;
  $('#detail-region').textContent = `Rank #${result.rank} of ${app.priorityResults.length} · Prototype model · modelled scenario inputs`;
  const breakdown = result.scoreBreakdown.map(renderScoreBreakdown).join('');
  const assumptions = result.assumptions.map(item => `<li>${escapeHtml(item)}</li>`).join('');
  $('#detail-body').className = '';
  $('#detail-body').innerHTML = `
    <div class="decision-intro"><strong>Indicative Priority Score: ${result.totalScore.toFixed(1)} / 100</strong><span>Overall confidence: ${escapeHtml(result.confidence)}. ${escapeHtml(result.explanation)}</span></div>
    <section class="score-breakdown" aria-label="Priority score breakdown"><h3>Score breakdown</h3>${breakdown}</section>
    <div class="detail-block"><h3>Modelled assumptions</h3><p>These scenario inputs are competition prototype assumptions, not live incident reports or verified operator data.</p><ul>${assumptions}</ul></div>
    <div class="detail-block"><h3>Data limitations</h3><ul><li>Resilience is only a prototype proxy for backup communications or power capacity.</li><li>OpenStreetMap facility locations do not confirm opening status, capacity or communications dependency.</li><li>Missing inputs receive zero points or contribute to the confidence penalty.</li><li>This ranking cannot replace decisions by communities, government or communications providers.</li></ul></div>
    <div class="detail-block"><h3>Model method</h3><p>Priority Score = Population impact + Essential service dependency + Outage severity + Backup capacity shortage + Access/restoration difficulty − Confidence penalty.</p><p>${escapeHtml((app.outageScenario && app.outageScenario.title) || 'Modelled regional communications outage')} · ${escapeHtml((app.outageScenario && app.outageScenario.scenario_id) || 'v1')}</p></div>
    <div class="detail-block detail-action"><h3>Recommended action</h3><p>Verify local conditions, then stage interim communications support while restoration requirements are assessed. This prototype does not create an operational dispatch.</p></div>
    <button class="drawer-button" id="dispatch-team" type="button">Dispatch response team</button>
    <button class="drawer-button secondary" id="copy-response" type="button">Copy response brief</button>`;
  $('#dispatch-team').addEventListener('click', () => toast('Prototype action recorded · team dispatch is not connected to an operational system'));
  $('#copy-response').addEventListener('click', async () => {
    const text = `RemoteReady NT prototype brief: ${result.name} ranks #${result.rank} with an indicative priority score of ${result.totalScore.toFixed(1)} / 100. Verify local conditions before deploying interim communications support.`;
    try { await navigator.clipboard.writeText(text); toast('Response brief copied'); }
    catch { toast('Copy is not available in this browser'); }
  });
}

function showResponsePlan(resultOrMoveMap = app.priorityResults[0], moveMap = true) {
  const result = typeof resultOrMoveMap === 'boolean' ? app.priorityResults[0] : resultOrMoveMap;
  if (typeof resultOrMoveMap === 'boolean') moveMap = resultOrMoveMap;
  if (!result) return toast('Priority model results are still loading');
  openContextPanel();
  const community = getPriorityCommunity(result);
  if (moveMap && community) {
    const [lng, lat] = community.geometry.coordinates;
    app.map.flyTo([lat, lng], 8, {duration: .55});
  }
  $('#detail-kicker').textContent = 'Response plan · indicative prototype';
  $('#detail-name').textContent = `Deploy to ${result.name} first`;
  $('#detail-region').textContent = `Rank #${result.rank} of ${app.priorityResults.length} · Verify local conditions before acting`;
  $('#detail-body').className = '';
  $('#detail-body').innerHTML = `
    <div class="decision-intro"><strong>Recommended next action</strong><span>Stage interim communications support for ${escapeHtml(result.name)} while restoration requirements are assessed.</span></div>
    <div class="decision-grid" aria-label="Response plan summary">
      <div><small>Indicative score</small><strong>${result.totalScore.toFixed(1)} / 100</strong></div>
      <div><small>Model confidence</small><strong>${escapeHtml(result.confidence)}</strong></div>
      <div><small>High-risk candidates</small><strong>${app.priorityResults.length}</strong></div>
      <div><small>Scenario status</small><strong>Modelled outage</strong></div>
    </div>
    <div class="detail-block"><h3>Immediate response sequence</h3><ol class="response-steps"><li>Confirm local communications and access conditions with the community and responsible agencies.</li><li>Stage interim communications support and backup power according to the local response plan.</li><li>Confirm essential service needs before dispatching or redirecting resources.</li></ol></div>
    <div class="detail-block"><h3>Decision boundary</h3><p>This is an indicative prototype recommendation. It does not create an operational dispatch and must be confirmed with communities, government and communications providers.</p></div>
    <button class="drawer-button" id="copy-response" type="button">Copy response brief</button>
    <button class="drawer-button secondary" id="open-priority-evidence" type="button">Why this priority?</button>`;
  $('#copy-response').addEventListener('click', async () => {
    const text = `RemoteReady NT prototype response brief: prioritise ${result.name} for interim communications support. Indicative score ${result.totalScore.toFixed(1)} / 100, ${result.confidence} confidence. Verify local conditions before deployment.`;
    try { await navigator.clipboard.writeText(text); toast('Response brief copied'); }
    catch { toast('Copy is not available in this browser'); }
  });
  $('#open-priority-evidence').addEventListener('click', () => showPriorityPlan(result, false));
}

function renderPriorityTopThree(results, visible) {
  const list = $('#priority-top-three');
  list.hidden = !visible;
  if (!visible) {
    list.innerHTML = '';
    return;
  }
  if (!results.length) {
    list.innerHTML = '<li><span>Priority model results are unavailable.</span></li>';
    return;
  }
  list.innerHTML = results.slice(0, 3).map(result => `
    <li><button type="button" data-priority-community="${escapeHtml(result.communityId)}" class="${result.rank === 1 ? 'top-priority' : ''}"><b>#${result.rank}</b><span>${escapeHtml(result.name)}</span><small>${result.totalScore.toFixed(1)} / 100</small></button></li>`).join('');
  $$('[data-priority-community]', list).forEach(button => button.addEventListener('click', () => {
    const result = app.priorityResults.find(item => item.communityId === button.dataset.priorityCommunity);
    if (result) showPriorityPlan(result, true);
  }));
}

function setLayer(name, visible) {
  const layer = app.layers[name];
  if (!layer) return;
  if (visible && !app.map.hasLayer(layer)) layer.addTo(app.map);
  if (!visible && app.map.hasLayer(layer)) app.map.removeLayer(layer);
}

function setScenario(name) {
  closeContextPanel();
  app.scenario = name;
  const info = scenarioText[name];
  $('#view-dashboard').dataset.scenario = name;
  $('#warning-level').textContent = info.level;
  $('#warning-title').textContent = info.title;
  $('#warning-copy').textContent = info.copy;
  $('#warning-time').textContent = info.timestamp;
  const scenarioDataTag = $('#scenario-data-tag');
  if (scenarioDataTag) scenarioDataTag.textContent = info.dataTag;
  const priorityAvailable = app.priorityStatus === 'available';
  const priorityUnavailable = name === 'outage' && !priorityAvailable;
  const priority = name === 'outage' && priorityAvailable ? app.priorityResults[0] : null;
  $('#metric-priority').textContent = priority ? priority.name : priorityUnavailable ? 'Priority model unavailable' : info.priority;
  $('#metric-action').textContent = priority ? `Prioritised for interim communications support based on outage impact and essential service exposure.` : priorityUnavailable ? 'This prototype cannot calculate a deployment recommendation because scenario inputs are unavailable.' : info.action;
  $('#metric-risk').textContent = name === 'normal'
    ? '3'
    : name === 'cyclone'
      ? '4'
      : priorityAvailable
        ? String(app.priorityResults.length)
        : '—';
  const priorityKicker = $('#priority-kicker');
  if (priorityKicker) priorityKicker.textContent = name === 'normal' ? 'READINESS OVERVIEW' : 'RECOMMENDED NEXT ACTION';
  $('#view-priority').innerHTML = name === 'normal' ? 'Open readiness overview <span>→</span>' : name === 'cyclone' ? 'View recommended location <span>→</span>' : priorityUnavailable ? 'Check data sources <span>→</span>' : 'View response plan <span>→</span>';
  const whyPriority = $('#why-priority');
  if (whyPriority) whyPriority.textContent = name === 'normal' ? 'View community details' : name === 'cyclone' ? 'View map evidence' : priorityUnavailable ? 'Explore map' : 'Why this priority?';
  $('#incident-view').textContent = name === 'normal' ? 'View readiness' : name === 'cyclone' ? 'View forecast' : 'View incident';
  const priorityDataStatus = $('#priority-data-status');
  if (priorityDataStatus) {
    const dataStatus = name === 'normal' ? ['published', 'Published context'] : name === 'cyclone' ? ['forecast', 'Forecast'] : priorityUnavailable ? ['not-confirmed', 'Model unavailable'] : ['modelled', 'Indicative model'];
    priorityDataStatus.className = `data-status ${dataStatus[0]}`;
    priorityDataStatus.textContent = dataStatus[1];
  }
  const priorityBoundary = $('#priority-boundary');
  if (priorityBoundary) priorityBoundary.textContent = name === 'normal' ? 'Review community readiness' : name === 'cyclone' ? 'Forecast · uncertainty applies' : priorityUnavailable ? 'Use map and source data to verify conditions' : 'Verify before deployment';
  $('#warning-strip').className = `warning-strip ${name}`;
  $('#priority-card').className = `priority-card ${name}${priorityUnavailable ? ' model-unavailable' : ''}${isMobileViewport() ? ' mobile-collapsed' : ''}`;
  if (isMobileViewport() && $('#mobile-action-toggle')) $('#mobile-action-toggle').setAttribute('aria-expanded', 'false');
  $('.priority-severity').innerHTML = name === 'normal' ? '<i></i> Planned' : name === 'cyclone' ? '<i></i> High' : priorityUnavailable ? '<i></i> Not confirmed' : '<i></i> Priority 1';
  const impact = $$('.priority-impact span');
  if (priority) {
    impact[0].innerHTML = `<strong>${priority.totalScore.toFixed(1)}</strong> score / 100`;
    impact[1].innerHTML = `<strong>${app.priorityResults.length}</strong> high-risk communities`;
    impact[2].innerHTML = `<strong>${escapeHtml(priority.confidence)}</strong> confidence`;
  } else {
    impact[0].innerHTML = `<strong>${info.affected}</strong> communities`;
    impact[1].innerHTML = `<strong>${info.facilities}</strong> facilities`;
    impact[2].innerHTML = `<strong>${info.eta}</strong> response ETA`;
  }
  renderPriorityTopThree(app.priorityResults, name === 'outage' && priorityAvailable);
  $$('.scenario').forEach(button => button.classList.toggle('active', button.dataset.scenario === name));
  const cyclone = name === 'cyclone';
  setLayer('cyclone', cyclone);
  setLayer('uncertainty', cyclone);
  setLayer('outage', name === 'outage');
  updateDecisionEvidence();
  updateMarkerStyles();
  $('[data-layer="cyclone"]').checked = cyclone;
  $('[data-layer="uncertainty"]').checked = cyclone;
  $('#forecast-timeline').hidden = !cyclone;
  focusScenarioView();
}

function focusScenarioView() {
  if (!app.map || $('#view-dashboard').hidden) return;
  if (app.scenario === 'cyclone') app.map.fitBounds([[-14.9, 132.7], [-10.7, 137.7]], {padding: [55, 55]});
  else if (app.scenario === 'outage') {
    const community = app.priorityResults[0] && getPriorityCommunity(app.priorityResults[0]);
    if (community) {
      const [lng, lat] = community.geometry.coordinates;
      app.map.flyTo([lat, lng], 8, {duration: .6});
    } else app.map.flyTo([-12.435, 130.922], 9, {duration: .6});
  }
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
  const setMapPanelExpanded = expanded => {
    $('#map-panel').classList.toggle('collapsed', !expanded);
    const explore = $('#explore-map');
    if (explore) explore.setAttribute('aria-expanded', String(expanded));
    if (expanded && isMobileViewport()) {
      setMobileActionExpanded(false);
      closeMobileDetail();
    }
  };
  $('#panel-toggle').addEventListener('click', () => setMapPanelExpanded(false));
  const exploreMap = $('#explore-map');
  if (exploreMap) exploreMap.addEventListener('click', () => setMapPanelExpanded(true));
  const mobileActionToggle = $('#mobile-action-toggle');
  if (mobileActionToggle) mobileActionToggle.addEventListener('click', () => {
    const expanded = $('#priority-card').classList.contains('mobile-collapsed');
    setMobileActionExpanded(expanded);
    if (expanded) {
      $('#map-panel').classList.add('collapsed');
      if (exploreMap) exploreMap.setAttribute('aria-expanded', 'false');
      closeMobileDetail();
    }
  });
  const mobileActionClose = $('#mobile-action-close');
  if (mobileActionClose) mobileActionClose.addEventListener('click', () => setMobileActionExpanded(false));
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
  $('#drawer-close').addEventListener('click', closeContextPanel);
  if ($('#back-to-action')) $('#back-to-action').addEventListener('click', closeContextPanel);
  $('#view-priority').addEventListener('click', () => {
    if (app.scenario === 'outage' && app.priorityStatus !== 'available') return setView('sources');
    if (app.scenario === 'outage') return showResponsePlan(true);
    if (app.scenario === 'normal') return setView('preparedness');
    openCurrentPriority();
  });
  if ($('#why-priority')) $('#why-priority').addEventListener('click', () => {
    if (app.scenario === 'outage' && app.priorityStatus !== 'available') return setMapPanelExpanded(true);
    if (app.scenario === 'outage') return showPriorityPlan(false);
    openCurrentPriority();
  });
  $('#incident-view').addEventListener('click', () => {
    if (app.scenario === 'outage' && app.priorityStatus !== 'available') return setView('sources');
    if (app.scenario === 'outage') return showResponsePlan(true);
    if (app.scenario === 'normal') return setView('preparedness');
    $('#timeline-range').focus();
    toast('Forecast timeline is available below the map');
  });
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

async function loadPriorityModule() {
  if (window.RemoteReadyPriorityScoring?.calculatePriorityResults) return;
  const response = await fetch('priority-scoring.js');
  if (!response.ok) throw new Error('Priority scoring module is unavailable');
  const source = await response.text();
  const script = document.createElement('script');
  script.textContent = source;
  document.head.append(script);
  script.remove();
  if (!window.RemoteReadyPriorityScoring?.calculatePriorityResults) {
    throw new Error('Priority scoring module has an invalid interface');
  }
}

function setPriorityUnavailable(error) {
  app.priorityStatus = 'unavailable';
  app.priorityResults = [];
  app.outageScenario = null;
  app.priorityError = error instanceof Error ? error.message : 'Priority scenario inputs are unavailable';
  console.warn(`Priority model unavailable: ${app.priorityError}`);
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
  try {
    const [outageScenario] = await Promise.all([
      fetch('data/outage-scenario.json').then(response => { if (!response.ok) throw new Error('Outage scenario inputs are unavailable'); return response.json(); }),
      loadPriorityModule(),
    ]);
    const results = window.RemoteReadyPriorityScoring.calculatePriorityResults(
      (connectivity.features || []).filter(feature => feature.properties.kind === 'community'),
      outageScenario
    );
    if (!Array.isArray(results) || !results.length) throw new Error('Priority model returned no ranked communities');
    app.outageScenario = outageScenario;
    app.priorityResults = results;
    app.priorityStatus = 'available';
    app.priorityError = '';
  } catch (error) {
    setPriorityUnavailable(error);
  }
  setScenario('outage');
  closeContextPanel();
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
  console.error('Core map data failed to load:', error);
  $('#header-updated').textContent = 'Public data failed to load';
  toast('Core map data could not be loaded. Check the data sources and reload.');
});
