const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
const bind = (selector, eventName, handler, root = document) => {
  const node = $(selector, root);
  if (node) node.addEventListener(eventName, handler);
  return node;
};

const app = {
  map: null,
  view: 'dashboard',
  connectivity: [],
  facilities: [],
  rawFacilities: [],
  sourceLog: null,
  historicalTrack: null,
  exerciseScenario: null,
  exerciseStage: '48_hours_before_simulated_impact',
  outageScenario: null,
  priorityResults: [],
  priorityStatus: 'loading',
  priorityError: '',
  layers: {},
  markersById: new Map(),
  selectedId: null,
  cycloneMarkers: [],
  cyclonePoints: [],
};

const NT_BOUNDS = L.latLngBounds([[-26.1, 129], [-10.8, 138.1]]);
const SCENARIO_SITE = {
  type: 'Feature', geometry: {type: 'Point', coordinates: [134.945, -12.095]},
  properties: {id: 'scenario-arnhem-comms-site-a', kind: 'scenario-site', name: 'Scenario communications site A', region: 'Milingimbi area', provider: 'Fictional exercise asset', label: 'Simulation outcome', priority: 'Scenario'}
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
}

function closeContextPanel() {
  $('#detail-drawer').classList.add('closed');
  $('#detail-drawer').setAttribute('aria-hidden', 'true');
}

function prepareMobileDetail() {
  if (!isMobileViewport()) return;
  const panel = $('#map-panel');
  panel.classList.add('collapsed');
  panel.setAttribute('aria-hidden', 'true');
  panel.inert = true;
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

function buildScenarioLayers(trackData) {
  const features = trackData?.features || [];
  const track = features.find(feature => feature.properties?.kind === 'historical-track');
  const milestones = features.filter(feature => feature.properties?.kind === 'historical-milestone').sort((a, b) => a.properties.order - b.properties.order);
  if (track) L.geoJSON(track, {style: {color: '#235c79', weight: 5}}).bindTooltip('Historical TC Lam track · not a live warning').addTo(app.layers.cyclone);
  app.cyclonePoints = milestones.map(feature => {
    const [lng, lat] = feature.geometry.coordinates;
    return [lat, lng];
  });
  milestones.forEach((feature, index) => {
    const marker = L.marker(app.cyclonePoints[index], {icon: markerIcon('cyclone', index === 2 ? 'active' : '', String(index + 1)), zIndexOffset: 900})
      .bindTooltip(`${feature.properties.label} · historical context`, {direction: 'top'})
      .addTo(app.layers.cyclone);
    app.cycloneMarkers.push(marker);
  });
  const cone = [[-11.6,136.35],[-12.55,136.0],[-13.6,135.3],[-14.75,133.5],[-13.8,132.85],[-12.5,134.4]];
  L.polygon(cone, {color: '#176f98', weight: 2, fillColor: '#8fc8dc', fillOpacity: .22, dashArray: '5 5'})
    .bindTooltip('Scenario uncertainty · not a confirmed impact boundary')
    .addTo(app.layers.uncertainty);
  L.circle([-12.095, 134.945], {radius: 36000, color: '#bf3131', weight: 2, fillColor: '#bf3131', fillOpacity: .12, dashArray: '7 6'})
    .bindTooltip('Simulation outcome area · not a live network fault')
    .addTo(app.layers.outage);
  L.marker([-12.095, 134.945], {icon: markerIcon('community', 'critical', '!'), zIndexOffset: 1100})
    .bindTooltip('Scenario communications site A · fictional exercise asset', {direction: 'top'})
    .on('click', () => showScenarioSite())
    .addTo(app.layers.outage);
}

function updateDecisionEvidence() {
  const layer = app.layers.decisionEvidence;
  if (!layer) return;
  layer.clearLayers();
  if (app.exerciseStage !== 'simulated_impact_outcome') return;

  const priority = app.priorityResults[0];
  const community = priority && getPriorityCommunity(priority);
  if (!community) return;

  const [lng, lat] = community.geometry.coordinates;
  const incident = [-12.095, 134.945];
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
  const exerciseRecord = exerciseRecordForFeature(feature);
  if (exerciseRecord) {
    if (app.exerciseStage === '48_hours_before_simulated_impact') return 'normal';
    if (app.exerciseStage === 'simulated_impact_outcome') {
      if (exerciseRecord.community_id === 'galiwinku') return 'priority-top';
      if (exerciseRecord.confidence === 'low') return 'priority-watch';
      return ['high', 'medium_high'].includes(exerciseRecord.exposure) ? 'priority-medium' : 'normal';
    }
    return ['high', 'medium_high'].includes(exerciseRecord.exposure) ? 'degraded' : 'normal';
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
    const exerciseRecord = exerciseRecordForFeature(feature);
    if (p.kind === 'community') {
      const shouldShow = app.exerciseStage === '48_hours_before_simulated_impact' || Boolean(exerciseRecord);
      if (shouldShow && !app.layers.communities.hasLayer(marker)) app.layers.communities.addLayer(marker);
      if (!shouldShow && app.layers.communities.hasLayer(marker)) app.layers.communities.removeLayer(marker);
    }
    marker.setIcon(p.kind === 'community' ? markerIcon('community', markerStatus(feature)) : markerIcon('site'));
    if (exerciseRecord) {
      const suffix = app.exerciseStage === 'simulated_impact_outcome'
        ? `${exerciseRecord.confidence === 'low' ? 'Verify first' : 'Modelled candidate'} · ${exerciseRecord.confidence} confidence`
        : `${exerciseRecord.exposure.replace('_', '-')} scenario exposure · not confirmed`;
      marker.setTooltipContent(`${escapeHtml(p.name)} · ${escapeHtml(suffix)}`);
      return;
    }
    marker.setTooltipContent(`${escapeHtml(p.name)} · ${escapeHtml(p.provider)}`);
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

function isDisplayedFacility(feature) {
  const properties = feature?.properties || {};
  const hasUsableName = properties.name && !/^Unnamed\b/i.test(properties.name);
  return Boolean(hasUsableName) && properties.kind !== 'shelter';
}

function addFacilities(features) {
  app.rawFacilities = features;
  app.facilities = features.filter(isDisplayedFacility);
  const counts = {health: 0, schools: 0, communityservices: 0};
  app.facilities.forEach(feature => {
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
  $('#metric-facilities').textContent = app.facilities.length;
}

function showScenarioSite(feature = SCENARIO_SITE) {
  openContextPanel();
  app.selectedId = `scenario-site:${feature.properties.id}`;
  const inventory = app.exerciseScenario?.resource_inventory || {};
  $('#detail-kicker').textContent = 'SIMULATION OUTCOME';
  $('#detail-name').textContent = feature.properties.name;
  $('#detail-region').textContent = `${feature.properties.region} · fictional exercise asset`;
  $('#detail-body').className = '';
  $('#detail-body').innerHTML = `
    <div class="detail-block"><h3>Published location record <span class="data-status not-confirmed">None</span></h3><p>This marker does not identify a real tower or small-cell asset.</p></div>
    <div class="detail-block"><h3>Historical context <span class="data-status published">Historical</span></h3><p>Official records document community-level communications disruption during TC Lam; they do not identify this site.</p></div>
    <div class="detail-block"><h3>Scenario input <span class="data-status forecast">Exercise assumption</span></h3><p>The fictional site is used to connect the historical context to a post-impact decision exercise.</p><dl class="detail-list"><div><dt>Satellite terminals</dt><dd>${Number(inventory.satellite_terminals || 0)}</dd></div><div><dt>Portable cell</dt><dd>${Number(inventory.portable_cell || 0)}</dd></div><div><dt>Backup-power kit</dt><dd>${Number(inventory.backup_power_kit || 0)}</dd></div></dl><p>These quantities are simulated exercise inventory, not verified government or provider stock.</p></div>
    <div class="detail-block"><h3>Simulation outcome <span class="data-status modelled">Not live</span></h3><p>Reported unavailable in this exercise only.</p></div>
    <div class="detail-block detail-action"><h3>Verify locally before action</h3><p>Confirm operator status, power, safe access and actual community need.</p></div>`;
}

function selectFeature(feature, moveMap = false) {
  if (feature.properties.kind === 'scenario-site') return showScenarioSite(feature);
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
      <div class="detail-block"><h3>Published location record <span class="data-status published">Published data</span></h3><p>${escapeHtml(properties.label)} · ${escapeHtml(properties.source)}. A mapped location does not mean the facility is available.</p></div>
      <div class="detail-block"><h3>Historical context <span class="data-status published">Historical</span></h3><p>No facility-level TC Lam operating record is linked in this exercise.</p></div>
      <div class="detail-block"><h3>Scenario input <span class="data-status forecast">Exercise assumption</span></h3><p>No facility opening, capacity or communications status is assumed.</p></div>
      <div class="detail-block"><h3>Modelled recommendation <span class="data-status modelled">Decision support only</span></h3><p>No facility-specific deployment recommendation is generated.</p></div>
      <div class="detail-block detail-action"><h3>Verify locally before action</h3><p>Confirm access conditions and service status with the responsible organisation.</p></div>`;
    return;
  }

  const scenario = exerciseRecordForFeature(feature);
  const risk = riskClass(properties.risk);
  const score = properties.resilience == null ? '—' : properties.resilience;
  const facilities = (properties.facilities || []).map(item => `<span class="facility-badge">${escapeHtml(item)}</span>`).join('') || '<span class="facility-badge">Inspect facility layers</span>';
  const verification = (scenario?.verify_locally || ['network status', 'access conditions', 'community need']).map(item => `<li>${escapeHtml(item)}</li>`).join('');
  const historicalContext = scenario?.historical_context?.replaceAll('_', ' ') || 'No community-specific Lam impact record is linked in this exercise.';
  const recommendation = app.exerciseStage === 'simulated_impact_outcome'
    ? scenario?.confidence === 'low'
      ? 'Verify first. No equipment recommendation is shown until local conditions are confirmed.'
      : `${(scenario?.recommended_resource || 'No resource recommendation').replaceAll('_', ' ')}.`
    : 'No resource recommendation is shown before the simulated impact outcome.';
  $('#detail-body').className = '';
  $('#detail-body').innerHTML = `
    <div class="detail-block"><h3>Published location record <span class="data-status published">Published data</span></h3><dl class="detail-list">
      <div><dt>Provider</dt><dd>${escapeHtml(properties.provider)}</dd></div>
      <div><dt>Backhaul</dt><dd>${escapeHtml(properties.backhaul)}</dd></div>
      <div><dt>Coverage record</dt><dd>${escapeHtml(properties.coverage)}</dd></div>
      <div><dt>Population record</dt><dd>${properties.population == null ? 'Not linked' : Number(properties.population).toLocaleString()}</dd></div>
    </dl></div>
    <div class="detail-block"><h3>Historical context <span class="data-status published">Historical</span></h3><p>${escapeHtml(historicalContext)}. This does not describe current conditions.</p></div>
    <div class="detail-block"><h3>Scenario input <span class="data-status forecast">Exercise assumption</span></h3><dl class="detail-list"><div><dt>Exposure</dt><dd>${escapeHtml(scenario?.exposure?.replace('_', '-') || 'Not modelled')}</dd></div><div><dt>Redundancy</dt><dd>${escapeHtml(scenario?.redundancy || 'Not modelled')}</dd></div><div><dt>Access</dt><dd>${escapeHtml(scenario?.access?.replaceAll('_', ' ') || 'Not confirmed')}</dd></div><div><dt>Confidence</dt><dd>${escapeHtml(scenario?.confidence || 'Not available')}</dd></div></dl><p>Mapped essential-service references: ${facilities}</p></div>
    <div class="detail-block"><h3>Modelled recommendation <span class="data-status modelled">Decision support only</span></h3><p>${escapeHtml(recommendation)}</p></div>
    <div class="detail-block detail-action"><h3>Verify locally before action <span class="data-status not-confirmed">Not confirmed</span></h3><ul>${verification}</ul></div>
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
  const maximum = isPenalty ? `up to −${item.maximum}` : `of ${item.maximum}`;
  return `
    <article class="score-breakdown-item ${isPenalty ? 'penalty' : ''}">
      <header><h3>${escapeHtml(item.label)}</h3><strong>${score}<small>${escapeHtml(maximum)}</small></strong></header>
      <dl>
        <div><dt>Input</dt><dd>${escapeHtml(formatScoreInput(item.input.value))}</dd></div>
        <div><dt>Effect</dt><dd>${escapeHtml(item.explanation)}</dd></div>
      </dl>
    </article>`;
}

function renderCandidateRanking(selectedId) {
  return `<ol class="candidate-ranking" aria-label="Modelled candidate ranking">${app.priorityResults.map(result => `
    <li><button type="button" data-ranked-community="${escapeHtml(result.communityId)}" class="${result.communityId === selectedId ? 'active' : ''}">
      <b>#${result.rank}</b><span>${escapeHtml(result.name)}</span><small>${result.totalScore.toFixed(1)} / 100 · ${result.confidence === 'low' ? 'Verify first' : `${escapeHtml(result.confidence)} confidence`}</small>
    </button></li>`).join('')}</ol>`;
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
  app.selectedId = `priority:${result.communityId}`;
  const community = getPriorityCommunity(result);
  if (moveMap && community) {
    const [lng, lat] = community.geometry.coordinates;
    app.map.flyTo([lat, lng], 9, {duration: .55});
  }
  $('#detail-kicker').textContent = 'Why this priority?';
  $('#detail-name').textContent = result.name;
  $('#detail-region').textContent = `Rank #${result.rank} of ${app.priorityResults.length} · scenario-based recommendation`;
  const breakdown = result.scoreBreakdown.map(renderScoreBreakdown).join('');
  const assumptions = result.assumptions.map(item => `<li>${escapeHtml(item)}</li>`).join('');
  $('#detail-body').className = '';
  $('#detail-body').innerHTML = `
    <div class="decision-intro"><strong>Indicative Priority Score: ${result.totalScore.toFixed(1)} / 100</strong><span>Overall confidence: ${escapeHtml(result.confidence)}. ${escapeHtml(result.explanation)}</span></div>
    <div class="detail-block"><h3>Modelled candidate ranking</h3>${renderCandidateRanking(result.communityId)}</div>
    <section class="score-breakdown" aria-label="Factors influencing the priority"><h3>What influenced this priority</h3>${breakdown}</section>`;
  $$('[data-ranked-community]', $('#detail-body')).forEach(button => button.addEventListener('click', () => {
    const nextResult = app.priorityResults.find(item => item.communityId === button.dataset.rankedCommunity);
    if (nextResult) showPriorityPlan(nextResult, true);
  }));
}

function setLayer(name, visible) {
  const layer = app.layers[name];
  if (!layer) return;
  if (visible && !app.map.hasLayer(layer)) layer.addTo(app.map);
  if (!visible && app.map.hasLayer(layer)) app.map.removeLayer(layer);
}

const EXERCISE_STAGE_CONTENT = {
  '48_hours_before_simulated_impact': {
    title: '48 hours before simulated impact', action: 'Review published location records',
    copy: 'Identify the seven exercise communities using the historical track and published community locations.',
    status: ['published', 'Historical context'], boundary: 'Location records do not confirm current service.', next: 'Next: verify scenario exposure and access assumptions.'
  },
  '24_hours_before_simulated_impact': {
    title: '24 hours before simulated impact', action: 'Verify community information',
    copy: 'Compare scenario exposure, communications redundancy and access assumptions for the exercise communities.',
    status: ['forecast', 'Scenario input'], boundary: 'These conditions are assumptions; verify locally.', next: 'Next: prepare limited resources and offline information.'
  },
  '12_hours_before_simulated_impact': {
    title: '12 hours before simulated impact', action: 'Prepare resources and offline packs',
    copy: 'Review two satellite terminals, one portable cell and one backup-power kit without treating them as real inventory.',
    status: ['forecast', 'Scenario input'], boundary: 'No equipment has been dispatched.', next: 'Next: reveal the simulated post-impact report.'
  },
  'simulated_impact_outcome': {
    title: 'Simulated impact outcome', action: 'Verify conditions in Galiwinku',
    copy: 'Confirm network status, safe access and community need before considering communications support.',
    status: ['modelled', 'Medium confidence'], boundary: 'Verify locally.', next: ''
  }
};

function exerciseRecordForFeature(feature) {
  return app.exerciseScenario?.communities?.find(item => item.community_id === feature?.properties?.id) || null;
}

function setExerciseStage(stageId, moveMap = true) {
  const content = EXERCISE_STAGE_CONTENT[stageId];
  if (!content) return;
  app.exerciseStage = stageId;
  const outcome = stageId === 'simulated_impact_outcome';
  const modelAvailable = app.priorityStatus === 'available';
  const stageNumber = EXERCISE_STAGE_CONTENT[stageId] ? Object.keys(EXERCISE_STAGE_CONTENT).indexOf(stageId) + 1 : 1;
  const topResult = app.priorityResults[0];
  const recommendedName = topResult?.name || 'recommended community';
  $('#view-dashboard').dataset.scenario = outcome ? 'outcome' : 'exercise';
  $('#scenario-data-tag').textContent = 'SIMULATION · NOT LIVE';
  $('#exercise-stage-summary').textContent = `Stage ${stageNumber} of 4 · ${content.title}`;
  $('#timeline-current').textContent = content.title;
  $('#metric-priority').textContent = outcome && !modelAvailable ? 'Model unavailable' : outcome ? `Verify conditions in ${recommendedName}` : content.action;
  $('#metric-action').textContent = outcome && !modelAvailable ? 'The map and data-source catalogue remain available. Verify conditions without using an automated ranking.' : content.copy;
  $('#priority-kicker').textContent = outcome && !modelAvailable ? 'MODEL STATUS' : outcome ? 'RECOMMENDED NEXT STEP · MODELLED' : 'CURRENT EXERCISE ACTION';
  $('#priority-data-status').className = `data-status ${outcome && !modelAvailable ? 'not-confirmed' : content.status[0]}`;
  $('#priority-data-status').textContent = outcome && !modelAvailable ? 'Model unavailable' : outcome && topResult ? `${topResult.confidence[0].toUpperCase()}${topResult.confidence.slice(1)} confidence` : content.status[1];
  $('#priority-boundary').textContent = content.boundary;
  $('.priority-severity').innerHTML = outcome && !modelAvailable ? '<i></i> Not available' : `<i></i> Stage ${stageNumber}`;
  $('#priority-card').className = `priority-card ${outcome ? 'outage' : 'cyclone'}${outcome && !modelAvailable ? ' model-unavailable' : ''}${isMobileViewport() ? ' mobile-collapsed' : ''}`;
  $('#view-priority').innerHTML = outcome ? modelAvailable ? `Review ${escapeHtml(recommendedName)} <span>→</span>` : 'Check data sources <span>→</span>' : 'Explore map <span>→</span>';
  $('#why-priority').hidden = !(outcome && modelAvailable);
  $('#why-priority').textContent = 'Why this community?';
  const priorityRank = $('#priority-rank');
  priorityRank.hidden = !(outcome && modelAvailable);
  priorityRank.textContent = outcome && modelAvailable ? `Ranked #1 of ${app.priorityResults.length} modelled candidates` : '';
  $('#incident-view').textContent = outcome ? 'View scenario site' : 'View exercise stage';
  $('#warning-strip').className = `warning-strip ${outcome ? 'outage' : 'cyclone'}`;
  $('#warning-level').textContent = outcome ? 'Simulation outcome' : 'Historical exercise';
  $('#warning-title').textContent = outcome ? 'Scenario communications site A reported unavailable' : 'TC Lam historical communications resilience exercise';
  $('#warning-copy').textContent = outcome ? 'Simulated unavailable report · not a real network fault.' : 'Historical TC Lam context with clearly labelled exercise assumptions.';
  $('#warning-time').textContent = outcome ? 'Exercise input · verify locally' : 'Historical context · scenario v1';
  $('.warning-icon').textContent = outcome ? '!' : '◒';
  $$('.exercise-stage').forEach(button => {
    const active = button.dataset.exerciseStage === stageId;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
    button.tabIndex = active ? 0 : -1;
  });
  const activeBoundaries = new Set(['published', 'historical', 'unconfirmed']);
  if (stageId !== '48_hours_before_simulated_impact') activeBoundaries.add('scenario');
  if (outcome) {
    activeBoundaries.add('outcome');
    activeBoundaries.add('modelled');
  }
  $$('[data-boundary]').forEach(item => item.classList.toggle('active', activeBoundaries.has(item.dataset.boundary)));
  setLayer('cyclone', true);
  setLayer('uncertainty', stageId !== '48_hours_before_simulated_impact');
  setLayer('outage', outcome);
  // Supporting reference layers stay off until the user requests them.
  setLayer('smallcells', false);
  setLayer('health', false);
  setLayer('schools', false);
  setLayer('communityservices', false);
  ['smallcells', 'health', 'schools', 'communityservices', 'uncertainty'].forEach(name => {
    const checkbox = $(`[data-layer="${name}"]`);
    if (checkbox) checkbox.checked = app.map.hasLayer(app.layers[name]);
  });
  updateDecisionEvidence();
  updateMarkerStyles();
  if (moveMap) focusScenarioView();
  if (!outcome && /^(scenario-site|priority):/.test(app.selectedId || '')) {
    app.selectedId = null;
    closeContextPanel();
  }
  if (!$('#detail-drawer').classList.contains('closed') && app.selectedId) {
    const selected = [...app.connectivity, ...app.facilities].find(feature => `${feature.properties.label ? 'facility' : feature.properties.kind}:${feature.properties.id}` === app.selectedId);
    if (selected) selectFeature(selected, false);
  }
}

function focusScenarioView() {
  if (!app.map || $('#view-dashboard').hidden) return;
  if (app.exerciseStage === 'simulated_impact_outcome') {
    app.map.fitBounds([[-12.65, 134.15], [-11.75, 135.75]], {padding: [55, 55]});
    return;
  }
  app.map.fitBounds([[-14.9, 132.7], [-10.7, 137.7]], {padding: [55, 55]});
}

function runSearch() {
  const query = $('#place-search').value.trim().toLowerCase();
  const scenarioSites = app.exerciseStage === 'simulated_impact_outcome' ? [SCENARIO_SITE] : [];
  const all = [...scenarioSites, ...app.connectivity, ...app.facilities];
  let results = query ? all.filter(feature => {
    const p = feature.properties;
    return [p.name, p.region, p.provider, p.label].some(value => String(value || '').toLowerCase().includes(query));
  }).slice(0, 12) : [...scenarioSites, ...['Galiwinku', 'Milingimbi'].map(name => app.connectivity.find(feature => feature.properties.name === name)).filter(Boolean)];
  const list = $('#search-results');
  list.innerHTML = results.map((feature, index) => {
    const p = feature.properties;
    const type = p.kind === 'scenario-site' ? 'Simulated stress-test site' : p.label || (p.kind === 'small-cell' ? 'Mobile small cell' : 'Remote community');
    const status = p.kind === 'scenario-site' ? 'Scenario test · not live' : p.risk ? `${p.risk} resilience risk` : p.region || p.provider;
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
  bind('#zoom-in', 'click', () => app.map.zoomIn());
  bind('#zoom-out', 'click', () => app.map.zoomOut());
  bind('#home-map', 'click', () => app.map.fitBounds(NT_BOUNDS, {padding: [18, 18]}));
  bind('#locate-map', 'click', locateUser);
  bind('#fullscreen-map', 'click', async () => {
    const workspace = $('.map-workspace');
    try {
      if (!document.fullscreenElement) await workspace.requestFullscreen();
      else await document.exitFullscreen();
      setTimeout(() => app.map.invalidateSize(), 120);
    } catch { toast('Fullscreen is not available in this browser'); }
  });
  bind('#reset-map', 'click', () => {
    setExerciseStage('48_hours_before_simulated_impact');
    app.map.fitBounds(NT_BOUNDS, {padding: [18, 18]});
    toast('Exercise restarted at the first stage');
  });
  const setMapPanelExpanded = expanded => {
    const panel = $('#map-panel');
    panel.classList.toggle('collapsed', !expanded);
    panel.setAttribute('aria-hidden', String(!expanded));
    panel.inert = !expanded;
    const explore = $('#explore-map');
    if (explore) explore.setAttribute('aria-expanded', String(expanded));
    if (expanded && isMobileViewport()) {
      setMobileActionExpanded(false);
      closeMobileDetail();
    }
  };
  bind('#panel-toggle', 'click', () => setMapPanelExpanded(false));
  const exploreMap = $('#explore-map');
  if (exploreMap) exploreMap.addEventListener('click', () => setMapPanelExpanded(true));
  const mobileActionToggle = $('#mobile-action-toggle');
  if (mobileActionToggle) mobileActionToggle.addEventListener('click', () => {
    const expanded = $('#priority-card').classList.contains('mobile-collapsed');
    setMobileActionExpanded(expanded);
    if (expanded) {
      const panel = $('#map-panel');
      panel.classList.add('collapsed');
      panel.setAttribute('aria-hidden', 'true');
      panel.inert = true;
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
  $$('[data-layer]').forEach(input => input.addEventListener('change', event => setLayer(event.target.dataset.layer, event.target.checked)));
  $$('.exercise-stage').forEach(button => {
    button.addEventListener('click', () => setExerciseStage(button.dataset.exerciseStage));
    button.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      const stages = $$('.exercise-stage');
      const current = stages.indexOf(button);
      const next = event.key === 'ArrowRight' ? (current + 1) % stages.length : (current - 1 + stages.length) % stages.length;
      stages[next].focus();
      setExerciseStage(stages[next].dataset.exerciseStage);
    });
  });
  const restartExercise = $('#restart-exercise');
  if (restartExercise) restartExercise.addEventListener('click', () => setExerciseStage('48_hours_before_simulated_impact'));
  bind('#search-button', 'click', runSearch);
  bind('#place-search', 'input', runSearch);
  bind('#place-search', 'focus', runSearch);
  bind('#place-search', 'keydown', event => { if (event.key === 'Enter') runSearch(); });
  $$('[data-quick-search]').forEach(button => button.addEventListener('click', () => {
    $('#place-search').value = button.dataset.quickSearch;
    runSearch();
  }));
  bind('#drawer-close', 'click', closeContextPanel);
  bind('#back-to-action', 'click', closeContextPanel);
  bind('#view-priority', 'click', () => {
    if (app.exerciseStage === 'simulated_impact_outcome') {
      if (app.priorityStatus !== 'available') return setView('sources');
      return openCurrentPriority();
    }
    setMapPanelExpanded(true);
  });
  bind('#why-priority', 'click', () => {
    if (app.exerciseStage === 'simulated_impact_outcome') return showPriorityPlan(app.priorityResults[0], true);
  });
  bind('#incident-view', 'click', () => {
    if (app.exerciseStage === 'simulated_impact_outcome') return showScenarioSite();
    const activeStage = $('.exercise-stage.active');
    if (activeStage) activeStage.focus();
    toast('Current exercise stage highlighted.');
  });
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
  const result = app.priorityResults[0];
  const community = result && getPriorityCommunity(result);
  if (community) return selectFeature(community, true);
  toast('Model unavailable. Use the map and source catalogue to verify conditions.');
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
  bind('#save-offline-pack', 'click', saveOfflinePack);
  updateOfflineStatus();
  window.addEventListener('online', updateOfflineStatus);
  window.addEventListener('offline', updateOfflineStatus);
  bind('#locate-me', 'click', () => {
    if (!navigator.geolocation) return toast('Location is not available in this browser');
    navigator.geolocation.getCurrentPosition(position => {
      setView('dashboard');
      const latlng = [position.coords.latitude, position.coords.longitude];
      app.map.flyTo(latlng, 11);
      L.circleMarker(latlng, {radius: 8, color: '#07334e', weight: 3, fillColor: '#6cc3e7', fillOpacity: 1}).addTo(app.map).bindPopup('Your current position').openPopup();
    }, () => toast('Location permission was not granted'));
  });
  bind('#copy-summary', 'click', async () => {
    const info = EXERCISE_STAGE_CONTENT[app.exerciseStage];
    const text = `RemoteReady NT exercise note\n${info.title}\nExercise action: ${info.action}\n${info.copy}\nHistorical context and simulated inputs only; not a live warning.`;
    try { await navigator.clipboard.writeText(text); toast('Situation note copied'); }
    catch { toast('Copy is not available in this browser'); }
  });
}

async function saveOfflinePack() {
  const assets = [
    './', 'index.html', 'styles.css', 'app.js', 'manifest.webmanifest',
    'vendor/leaflet/leaflet.css', 'vendor/leaflet/leaflet.js',
    'data/connectivity.geojson', 'data/facilities.geojson', 'data/download_log.json',
    'data/tc-lam-track.geojson', 'data/lam-exercise-scenario.json'
  ];
  try {
    const cache = await caches.open('remoteready-pack-v4');
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
  const facilitySource = Object.values(log.sources || {}).find(source => Number.isFinite(source.records));
  if (facilitySource) {
    facilitySource.title = 'OpenStreetMap facility records (raw import)';
    facilitySource.display_records = app.facilities.length;
    facilitySource.display_policy = 'Raw records retained; unnamed records and generic OSM shelters are excluded from the default map and search.';
  }
  if (log.counts) log.counts.displayed_facilities = app.facilities.length;
  app.sourceLog = log;
  const entries = Object.values(log.sources || {});
  const available = entries.filter(source => source.status === 'ok').length;
  $('#source-date').textContent = log.last_attempt || 'Unknown';
  $('#source-connectivity').textContent = (log.counts?.connectivity ?? app.connectivity.length).toLocaleString();
  $('#source-facilities').textContent = app.facilities.length.toLocaleString();
  $('#source-facility-policy').textContent = `${app.rawFacilities.length.toLocaleString()} raw OSM records retained · ${app.facilities.length.toLocaleString()} named non-shelter facilities displayed by default`;
  $('#source-status').textContent = `${available} of ${entries.length} available`;
  if (log.generated_at) $('#header-updated').textContent = new Date(log.generated_at).toLocaleString('en-AU', {dateStyle:'medium', timeStyle:'short'});
  $('#source-grid').innerHTML = entries.map(source => `
    <article class="source-card ${source.status === 'ok' ? '' : 'unavailable'}">
      <div><h3>${escapeHtml(source.title || 'Public data source')}</h3><p>${escapeHtml(source.provider || 'Source provider')}${source.records ? ` · ${Number(source.records).toLocaleString()} imported records; ${app.facilities.length.toLocaleString()} named non-shelter facilities displayed` : ''}</p></div>
      <span class="source-type">${escapeHtml(source.type || 'reference')}</span>
      <span class="source-state">${source.status === 'ok' ? '● AVAILABLE AT REFRESH' : '● USING CACHED OR DEMO DATA'}</span>
      ${source.url ? `<a href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer">Open official source ↗</a>` : '<span></span>'}
    </article>`).join('');
}

function initSourceDownload() {
  bind('#download-source-log', 'click', () => {
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
  bind('#help-btn', 'click', () => dialog?.showModal());
  bind('#help-close', 'click', () => dialog?.close());
}

const PRIORITY_WEIGHTS = {
  exposure: {high: 30, medium_high: 24, medium: 18, low_medium: 10},
  essential: {critical: 25, high: 20, medium: 12},
  redundancy: {fragile: 20, limited: 18, partial: 10, higher: 3},
  access: {highly_constrained: 15, constrained: 13, partly_constrained: 9, accessible_with_limits: 4},
  historical: {officially_documented_impact: 10, officially_documented_impact_context: 8, historical_preparedness_context: 5, historical_response_context_only: 3, not_verified_by_reviewed_sources: 0},
  confidencePenalty: {high: 0, medium: -5, low: -10}
};

function calculateExercisePriorities(connectivity, scenario) {
  const communities = new Map(connectivity.filter(feature => feature.properties.kind === 'community').map(feature => [feature.properties.id, feature]));
  const dimensions = [
    ['exposure', 'Scenario exposure', PRIORITY_WEIGHTS.exposure, 30],
    ['essential_service_priority', 'Essential service dependency', PRIORITY_WEIGHTS.essential, 25],
    ['redundancy', 'Communications redundancy shortage', PRIORITY_WEIGHTS.redundancy, 20],
    ['access', 'Access difficulty', PRIORITY_WEIGHTS.access, 15],
    ['historical_context', 'Historical context', PRIORITY_WEIGHTS.historical, 10]
  ];
  return (scenario.communities || []).map(record => {
    const feature = communities.get(record.community_id);
    if (!feature) return null;
    const scoreBreakdown = dimensions.map(([field, label, weights, maximum]) => ({
      id: field,
      label,
      score: weights[record[field]] || 0,
      maximum,
      explanation: `${String(record[field]).replaceAll('_', ' ')} increases this community's relative priority.`,
      input: {value: record[field], source: 'lam-exercise-scenario.json', updated_at: scenario.updated_at, status: 'modelled', confidence: record.confidence}
    }));
    const penalty = PRIORITY_WEIGHTS.confidencePenalty[record.confidence] ?? -10;
    scoreBreakdown.push({
      id: 'confidencePenalty', label: 'Confidence penalty', score: penalty, maximum: 10,
      explanation: 'Low-confidence exercise inputs reduce priority until they are verified locally.',
      input: {value: record.confidence, source: 'lam-exercise-scenario.json', updated_at: scenario.updated_at, status: 'modelled', confidence: record.confidence}
    });
    const totalScore = Math.max(0, scoreBreakdown.reduce((sum, item) => sum + item.score, 0));
    return {
      communityId: record.community_id,
      name: feature.properties.name,
      totalScore,
      confidence: record.confidence,
      recommendedResource: record.confidence === 'low' ? 'Verify first' : record.recommended_resource.replaceAll('_', ' '),
      explanation: record.confidence === 'low' ? 'Verification is required before any equipment allocation.' : 'The score combines five labelled scenario dimensions and a confidence penalty.',
      assumptions: record.confidence === 'low'
        ? [...record.verify_locally, 'Equipment allocation withheld until local verification']
        : [...record.verify_locally, `Resource suggestion: ${record.recommended_resource.replaceAll('_', ' ')}`],
      scoreBreakdown
    };
  }).filter(Boolean).sort((a, b) => b.totalScore - a.totalScore).map((result, index) => ({...result, rank: index + 1}));
}

function setPriorityUnavailable(error) {
  app.priorityStatus = 'unavailable';
  app.priorityResults = [];
  app.outageScenario = null;
  app.priorityError = error instanceof Error ? error.message : 'Priority scenario inputs are unavailable';
  console.warn(`Priority model unavailable: ${app.priorityError}`);
}

async function loadData() {
  const [connectivity, facilities, sourceLog, historicalTrack, exerciseScenario] = await Promise.all([
    fetch('data/connectivity.geojson').then(response => { if (!response.ok) throw new Error('connectivity'); return response.json(); }),
    fetch('data/facilities.geojson').then(response => { if (!response.ok) throw new Error('facilities'); return response.json(); }),
    fetch('data/download_log.json').then(response => { if (!response.ok) throw new Error('source log'); return response.json(); }),
    fetch('data/tc-lam-track.geojson').then(response => { if (!response.ok) throw new Error('historical TC Lam track'); return response.json(); }),
    fetch('data/lam-exercise-scenario.json').then(response => { if (!response.ok) throw new Error('Lam exercise scenario'); return response.json(); }),
  ]);
  app.historicalTrack = historicalTrack;
  app.exerciseScenario = exerciseScenario;
  buildScenarioLayers(historicalTrack);
  addConnectivity(connectivity.features || []);
  addFacilities(facilities.features || []);
  renderSources(sourceLog);
  try {
    const results = calculateExercisePriorities(connectivity.features || [], exerciseScenario);
    if (!Array.isArray(results) || !results.length) throw new Error('Priority model returned no ranked communities');
    app.outageScenario = {
      title: 'TC Lam communications resilience exercise',
      scenario_id: exerciseScenario.exercise_id,
      model_version: 'transparent-rule-v1'
    };
    app.priorityResults = results;
    app.priorityStatus = 'available';
    app.priorityError = '';
  } catch (error) {
    setPriorityUnavailable(error);
  }
  setExerciseStage('48_hours_before_simulated_impact', false);
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
