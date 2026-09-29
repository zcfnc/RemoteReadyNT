import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { MapCanvas } from '../features/dashboard/MapCanvas';
import { MapExplorerPanel } from '../features/dashboard/MapExplorerPanel';
import { ExposurePanel } from '../features/dashboard/ExposurePanel';
import { ResiliencePlanningSection } from '../features/dashboard/ResiliencePlanningSection';
import { exposureResults, type ExposureFilter } from '../features/dashboard/exposure';
import { priorityResults, stages } from '../features/dashboard/dashboard';
import type { PriorityResult } from '../features/dashboard/dashboard';
import { useDashboardData } from '../features/dashboard/useDashboardData';
import type { ConnectivityProperties, ExerciseCommunity, ExerciseStage, FacilityProperties, GeoJsonFeature } from '../types/data';
import type { View } from '../app/view';
import { downloadDecisionSupportReport } from '../services/decisionReport';
import { loadChecklist } from '../services/storage';
import contacts from '../data/useful-contacts.json';

type Selected = GeoJsonFeature<ConnectivityProperties | FacilityProperties> | undefined;

function formatRecord(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === '') return 'No record linked';
  return typeof value === 'string' ? value.replaceAll('_', ' ') : value.toLocaleString('en-AU');
}

function featureDetails(properties: ConnectivityProperties | FacilityProperties) {
  if ('provider' in properties) {
    return { region: properties.region, type: properties.kind === 'community' ? 'Remote community' : 'Small-cell site', source: properties.provider };
  }
  return { region: properties.label, type: properties.label, source: properties.source };
}

function confidenceLabel(confidence: ExerciseCommunity['confidence']) {
  return `${confidence.slice(0, 1).toUpperCase()}${confidence.slice(1)}`;
}

export function DashboardPage({ onNavigate }: { onNavigate?: (view: View) => void }) {
  const { core, optional, error } = useDashboardData();
  const [stage, setStage] = useState<ExerciseStage>('48_hours_before_simulated_impact');
  const [mapMode, setMapMode] = useState<'exercise' | 'exposure'>('exercise');
  const [exposureFilter, setExposureFilter] = useState<ExposureFilter>();
  const [selected, setSelected] = useState<Selected>();
  const [exposurePopupId, setExposurePopupId] = useState<string>();
  const [selectedResourceId, setSelectedResourceId] = useState<string>();
  const [scoreAnimationVersion, setScoreAnimationVersion] = useState(0);
  const [priorityExplanationOpen, setPriorityExplanationOpen] = useState(false);
  const [mobileActionOpen, setMobileActionOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [contactsOpen, setContactsOpen] = useState(false);
  const [updatesOpen, setUpdatesOpen] = useState(false);
  const [weatherOpen, setWeatherOpen] = useState(false);
  const [selectedTrackId, setSelectedTrackId] = useState('all');
  const [selectedBomYear, setSelectedBomYear] = useState('2025-2026');
  const [selectedBomTrackId, setSelectedBomTrackId] = useState('');
  const [layers, setLayers] = useState<Record<string, boolean>>({ uncertainty: false, bomCyclones: true, community: true, 'small-cell': false, clinic: false, hospital: false, school: false, community_centre: false });
  const current = stages.find((item) => item.id === stage) ?? stages[0];
  const outcome = stage === 'simulated_impact_outcome';
  const priorities = useMemo(() => core && optional.scenario ? priorityResults(core.connectivity, optional.scenario.communities) : [], [core, optional.scenario]);
  const activeExposureFilter = useMemo(() => exposureFilter ?? optional.cycloneExposure?.defaultFilter ?? { fromYear: 2007, toYear: 2026, radiusKm: 100 }, [exposureFilter, optional.cycloneExposure]);
  const exposureRanking = useMemo(() => optional.cycloneExposure ? exposureResults(optional.cycloneExposure, activeExposureFilter) : [], [optional.cycloneExposure, activeExposureFilter]);
  const simulationById = useMemo(() => new Map(optional.resilienceSimulation?.communities.map((item) => [item.communityId, item]) ?? []), [optional.resilienceSimulation]);
  const selectedExposure = selected?.properties.kind === 'community' ? exposureRanking.find((item) => item.community.communityId === selected.properties.id) : undefined;
  const exposureMap = useMemo(() => mapMode === 'exposure' && optional.cycloneExposure ? {
    fromYear: activeExposureFilter.fromYear,
    toYear: activeExposureFilter.toYear,
    visibleStormIds: new Set(exposureRanking.flatMap((item) => item.encounters.map((encounter) => encounter.stormId))),
    relatedStormIds: new Set(selectedExposure?.encounters.map((encounter) => encounter.stormId) ?? []),
    communityCounts: new Map(exposureRanking.map((item) => [item.community.communityId, item.count])),
    simulationById,
    filter: activeExposureFilter,
    selectedExposure,
    popupCommunityId: exposurePopupId,
    onPopupClose: (communityId: string) => setExposurePopupId((current) => current === communityId ? undefined : current),
    onViewRecords: () => {
      setScoreAnimationVersion((version) => version + 1);
      document.getElementById('resilience-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
  } : undefined, [mapMode, optional.cycloneExposure, activeExposureFilter, exposureRanking, selectedExposure, exposurePopupId, simulationById]);
  const topPriority = priorities[0];
  const activePriority = selected?.properties.kind === 'community' ? priorities.find((item) => item.feature.properties.id === selected.properties.id) ?? topPriority : topPriority;
  const navigate = (view: View) => onNavigate?.(view);
  const generateReport = async () => {
    const selectedRecord = selected?.properties.kind === 'community' ? optional.scenario?.communities.find((record) => record.community_id === selected.properties.id) : undefined;
    const selectedPoint = selected?.properties.kind === 'community' && selected.geometry.type === 'Point' ? selected.geometry.coordinates as [number, number] : undefined;
    const nearbyFacilities = selectedPoint ? (core?.facilities.features ?? [])
      .filter((facility) => facility.geometry.type === 'Point' && facility.properties.name && !facility.properties.name.startsWith('Unnamed'))
      .map((facility) => {
        const [longitude, latitude] = facility.geometry.coordinates as [number, number];
        const kilometres = Math.hypot((longitude - selectedPoint[0]) * Math.cos(selectedPoint[1] * Math.PI / 180), latitude - selectedPoint[1]) * 111;
        return { facility, kilometres };
      })
      .filter((item) => item.kilometres <= 25)
      .sort((a, b) => a.kilometres - b.kilometres)
      .slice(0, 5)
      .map((item) => `${item.facility.properties.name} (${item.facility.properties.label}, ${item.kilometres.toFixed(1)} km)`) : [];
    await downloadDecisionSupportReport({
      stage: current.label,
      scenario: optional.scenario,
      priorities,
      selectedCommunity: selected?.properties.kind === 'community' ? {
        name: selected.properties.name,
        region: selected.properties.region,
        provider: selected.properties.provider,
        coverage: selected.properties.coverage,
        backhaul: selected.properties.backhaul,
        facilities: selected.properties.facilities?.length ? selected.properties.facilities : nearbyFacilities,
        record: selectedRecord,
      } : undefined,
      checklist: ['Download the local map and community pack', 'Confirm emergency contacts', 'Test backup power', 'Test satellite or radio backup', 'Confirm the community meeting point', 'Review road and air access', 'Prepare essential health information', 'Run a no-signal drill'].map((title, index) => ({
        title,
        done: Boolean(loadChecklist()[['local-map', 'contacts', 'power', 'backup-comms', 'meeting-point', 'access', 'health', 'drill'][index]]),
      })),
    });
    setNotice('Decision-support report downloaded as a PDF.');
  };
  // Keep all hooks above the loading/error returns so their order is stable.
  const bomCycloneYears = useMemo(() => ['2007-2009', '2010-2012', '2013-2015', '2016-2018', '2019-2021', '2022-2024', '2025-2026'], []);

  const switchMapMode = (mode: 'exercise' | 'exposure') => {
    setMapMode(mode);
    setSelected(undefined);
    setExposurePopupId(undefined);
    setSelectedResourceId(undefined);
    setSelectedBomTrackId('');
    setPriorityExplanationOpen(false);
    setMobileActionOpen(false);
  };
  const selectExposureCommunity = (communityId: string) => {
    const feature = core?.connectivity.features.find((item) => item.properties.kind === 'community' && item.properties.id === communityId);
    if (feature) {
      setSelected(feature);
      setExposurePopupId(communityId);
      setSelectedResourceId(undefined);
      if (window.innerWidth <= 760) document.getElementById('map-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    setSelectedBomTrackId('');
  };

  if (error) return <section className="page page-dashboard"><div className="dashboard-error"><h1>Map unavailable</h1><p>{error}</p></div></section>;
  if (!core) return <section className="page page-dashboard"><div className="dashboard-loading">Loading map data…</div></section>;

  const displayableFacilities = core.facilities.features.filter((item) => item.properties.name && !item.properties.name.startsWith('Unnamed') && item.properties.kind !== 'shelter');
  const safePointCount = core.facilities.features.filter((item) => ['community_centre', 'shelter'].includes(item.properties.kind) && item.properties.name && !item.properties.name.startsWith('Unnamed')).length;
  const constrainedAccess = optional.scenario?.communities.filter((item) => item.access.includes('constrained')).length ?? 0;
  const sourceWarnings = optional.warnings.length;
  const historicalTracks = optional.historicalTrack?.features.filter((item) => item.properties.kind === 'historical-track') ?? [];

  return <section className="dashboard dashboard-redesign" aria-label="RemoteReady NT dashboard">
    <header className={`simulation-banner ${outcome && mapMode === 'exercise' ? 'outcome' : ''}`}>
      <span aria-hidden="true">{mapMode === 'exposure' ? '◎' : outcome ? '!' : '◒'}</span><strong>{mapMode === 'exposure' ? 'Historical analysis' : outcome ? 'Simulation outcome' : 'Historical exercise'}</strong>
      <b>{mapMode === 'exposure' ? 'Community cyclone track proximity' : outcome ? 'Scenario communications site A reported unavailable' : 'Historical cyclone communications resilience exercise'}</b>
      <p>{mapMode === 'exposure' ? 'Historical path distance analysis · not a forecast or damage record.' : outcome ? 'Simulated unavailable report · not a real network fault.' : 'Historical cyclone context with clearly labelled exercise assumptions.'}</p>
    </header>
    <div className="dashboard-visual-strip" aria-label="RemoteReady NT focus areas">
      <StripTile icon="◒" label="Cyclones and severe weather" tone="storm" />
      <StripTile icon="✈" label="Access and supply" tone="access" />
      <StripTile icon="◉" label="Communications" tone="comms" />
      <StripTile icon="✦" label="Stronger, safer communities" tone="water" />
    </div>
    <div className="dashboard-status-grid" aria-label="Current readiness summary">
      <StatusTile icon="!" label="Connectivity alerts" value={String(sourceWarnings)} note="Source warnings" tone="red" />
      <StatusTile icon="▰" label="Road and air access" value={String(constrainedAccess)} note="Communities to verify" tone="blue" />
      <StatusTile icon="⌂" label="Community safe points" value={String(safePointCount)} note="Mapped facilities" tone="orange" />
      <StatusTile icon="ϟ" label="Power and battery" value="—" note="Not modelled" tone="green" />
    </div>
    <section className="quick-actions" aria-label="Dashboard quick actions">
      <QuickAction icon="!" label="Emergency updates" onClick={() => setUpdatesOpen(true)} />
      <QuickAction icon="▤" label="Situation summary" onClick={generateReport} />
      <QuickAction icon="↓" label="Offline pack" onClick={() => navigate('preparedness')} />
      <QuickAction icon="☎" label="Useful contacts" onClick={() => setContactsOpen(true)} />
    </section>
    {optional.warnings.length > 0 && <p className="data-warning">{optional.warnings.join(' ')}</p>}
    <section className="dashboard-map-section" id="map-section" aria-labelledby="map-section-title">
      <div className="map-section-heading"><div><span className="eyebrow">MAP ANALYSIS</span><h2 id="map-section-title">{mapMode === 'exposure' ? 'Coverage point proximity' : 'Map layers'}</h2></div><div className="map-heading-actions"><div className="map-mode-switch" aria-label="Map view"><button aria-pressed={mapMode === 'exercise'} onClick={() => switchMapMode('exercise')} type="button">Cyclone path analysis</button><button aria-pressed={mapMode === 'exposure'} onClick={() => switchMapMode('exposure')} type="button">Community analysis</button></div></div></div>
      <div className={`dashboard-map-workspace ${outcome && mapMode === 'exercise' ? 'has-simulated-outcome' : ''} ${mapMode === 'exposure' ? 'is-exposure-view' : ''}`}>
        <MapCanvas analysis={exposureMap} analysisMode={mapMode === 'exposure'} bomCycloneTracks={optional.bomCycloneTracks} connectivity={core.connectivity} enabledLayers={layers} facilities={core.facilities} historicalTrack={optional.historicalTrack} onBomTrackSelect={(track) => { setSelectedBomTrackId(track.properties.stormId); if (mapMode === 'exercise') setNotice(`${track.properties.name || 'Unnamed cyclone'} selected · impact range shown.`); }} onSelect={(feature) => { setSelected(feature); if (mapMode === 'exposure') { setSelectedBomTrackId(''); setSelectedResourceId(undefined); setExposurePopupId(feature.properties.kind === 'community' ? feature.properties.id : undefined); } }} priorityCommunityId={mapMode === 'exercise' && outcome && !selectedBomTrackId ? activePriority?.feature.properties.id : undefined} selectedBomTrackId={selectedBomTrackId} selectedBomYear={selectedBomYear} selectedFeature={selected} selectedTrackId={selectedTrackId} onTrackSelect={(track) => { const id = track.properties.trackId ?? track.properties.name ?? 'all'; setSelectedTrackId(id); setNotice(`${track.properties.name ?? 'Historical cyclone track'} selected.`); }} stage={stage} />
        {mapMode === 'exercise' && <MapExplorerPanel bomCycloneCount={optional.bomCycloneTracks?.features.length} bomCycloneYears={bomCycloneYears} connectivity={core.connectivity} facilities={core.facilities} historicalTracks={historicalTracks} layers={layers} onBomYearChange={(year) => { setSelectedBomYear(year); setSelectedBomTrackId(''); setLayers((currentLayers) => ({ ...currentLayers, uncertainty: false })); }} onLayerChange={(name, value) => setLayers((currentLayers) => ({ ...currentLayers, [name]: value }))} onSelect={setSelected} onTrackChange={setSelectedTrackId} selectedBomYear={selectedBomYear} selectedTrackId={selectedTrackId} />}
        {mapMode === 'exposure' && <ExposurePanel data={optional.cycloneExposure} error={optional.exposureError} simulation={optional.resilienceSimulation} tracksUnavailable={optional.warnings.includes('BoM cyclone database unavailable.')} filter={activeExposureFilter} results={exposureRanking} selectedCommunityId={selected?.properties.kind === 'community' ? selected.properties.id : undefined} selectedStormId={selectedBomTrackId} onFilterChange={(filter) => { setExposureFilter(filter); setSelectedBomTrackId(''); }} onCommunitySelect={selectExposureCommunity} onStormSelect={(stormId) => { setSelectedBomTrackId(stormId); if (window.innerWidth <= 760) document.getElementById('map-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} />}
        {mapMode === 'exercise' && <div className="priority-column">
        <section className="exercise-context" aria-label="Exercise context">
          <div className="exercise-status"><span>SIMULATED EXERCISE</span><span>NOT LIVE</span></div>
          <strong>Historical cyclone communications resilience</strong>
          <small>Stage {stages.findIndex((item) => item.id === stage) + 1} of 4 · {current.label}</small>
        </section>
        <aside className={`priority-card ${mobileActionOpen ? 'mobile-open' : ''}`}>
          <button aria-label="Close next action" className="mobile-action-close" onClick={() => setMobileActionOpen(false)} type="button">×</button>
          <span>{outcome ? 'NEXT STEP' : 'CURRENT EXERCISE ACTION'}</span>
          <h1 aria-label={outcome && activePriority ? `Verify conditions in ${activePriority.feature.properties.name}` : undefined} className={outcome ? 'outcome-action-title' : 'stage-action-title'}>{outcome && activePriority ? <><span>Verify conditions</span><strong>{activePriority.feature.properties.name}</strong></> : outcome ? 'Verify local conditions' : current.action}</h1>
          <p>{outcome ? 'Confirm network status, safe access and community need before considering communications support.' : current.copy}</p>
          {outcome && activePriority && <>
            <div className="priority-context"><span>{activePriority === topPriority ? 'Modelled recommendation' : 'Selected community assessment'}</span><span>{confidenceLabel(activePriority.record.confidence)} confidence · Verify locally</span></div>
          </>}
          <div className="priority-actions">
            <button onClick={() => activePriority && setSelected(activePriority.feature)} type="button">{outcome ? `Review ${activePriority?.feature.properties.name ?? 'community'} →` : 'Explore map →'}</button>
            {outcome && topPriority && <button aria-label="Open assessment overview" className="why-priority" onClick={() => setPriorityExplanationOpen(true)} type="button">Assessment Overview</button>}
          </div>
        </aside>
        <div className="desktop-map-legend"><MapLegend /></div>
        </div>}
        {mapMode === 'exercise' && <button aria-expanded={mobileActionOpen} className="mobile-action-toggle" onClick={() => setMobileActionOpen((isOpen) => !isOpen)} type="button"><span aria-hidden="true">!</span> Next action</button>}
        {mapMode === 'exercise' && selected && <DetailDrawer onClose={() => setSelected(undefined)} properties={selected.properties} scenarioRecord={selected.properties.kind === 'community' ? optional.scenario?.communities.find((record) => record.community_id === selected.properties.id) : undefined} />}
        {mapMode === 'exercise' && priorityExplanationOpen && topPriority && <PriorityExplanation onClose={() => setPriorityExplanationOpen(false)} onSelectCommunity={(feature) => { setSelected(feature); setPriorityExplanationOpen(false); }} priorities={priorities} />}
      </div>
      {mapMode === 'exposure' && <ResiliencePlanningSection key={scoreAnimationVersion} data={optional.resilienceSimulation} error={optional.resilienceError} feature={selected?.properties.kind === 'community' ? selected as GeoJsonFeature<ConnectivityProperties> : undefined} filter={activeExposureFilter} onResourceSelect={setSelectedResourceId} rank={selectedExposure ? exposureRanking.indexOf(selectedExposure) + 1 : 0} result={selectedExposure} selectedResourceId={selectedResourceId} />}
      {mapMode === 'exercise' && <div className="mobile-map-legend"><MapLegend /></div>}
    </section>
    <section className="dashboard-info-grid" aria-label="RemoteReady NT information summary">
      <InfoCard icon="◉" title="Connectivity"><MetricPair value={String(core.connectivity.features.length)} label="remote locations monitored" /><MetricPair value={String(displayableFacilities.length)} label="essential facilities" /><MetricPair value={String(optional.scenario?.communities.length ?? 0)} label="exercise communities" /><a href="#map-section">View connectivity details →</a></InfoCard>
      <InfoCard icon="▤" title="Readiness"><MetricPair value={String(optional.scenario?.communities.length ?? 0)} label="exercise communities" /><MetricPair value="4" label="scenario stages" /><MetricPair value="1" label="simulation in progress" /><button className="info-link" onClick={() => navigate('preparedness')} type="button">View preparedness information →</button></InfoCard>
      <InfoCard icon="☁" title="Weather and warnings"><MetricPair value="26°C" label="Darwin current weather" /><MetricPair value="Low" label="warning level" /><p className="weather-card-status"><span className="status-dot" />No active emergency warning in demo data</p><button className="info-link" onClick={() => setWeatherOpen(true)} type="button">View weather and warnings →</button></InfoCard>
    </section>
    <footer className="dashboard-footer"><span><strong>RemoteReady NT</strong><small>Emergency communications and preparedness</small></span><span>Prototype only · Verify emergency information locally</span></footer>
    {updatesOpen && <InfoOverlay title="Emergency updates" onClose={() => setUpdatesOpen(false)}><div className="static-update"><strong>Historical exercise notice</strong><span>TC Lam communications resilience exercise</span><small>Simulation context only · not a live emergency warning</small></div><div className="static-update"><strong>Connectivity planning reminder</strong><span>Confirm current access, communications and local conditions before dispatch.</span><small>Source: RemoteReady NT exercise information</small></div></InfoOverlay>}
    {contactsOpen && <InfoOverlay title="Useful contacts" onClose={() => setContactsOpen(false)}><div className="contacts-list">{contacts.map((contact) => <div className="contact-row" key={contact.name}><span><strong>{contact.name}</strong><small>{contact.category}</small></span><a href={`tel:${contact.phone.replaceAll(' ', '')}`}>{contact.phone}</a></div>)}</div></InfoOverlay>}
    {weatherOpen && <InfoOverlay title="Weather and warnings" onClose={() => setWeatherOpen(false)}><div className="weather-detail"><div><span>Darwin, Northern Territory</span><strong>26°C · Partly cloudy</strong><small>Wind 18 km/h · Humidity 68%</small></div><div className="weather-warning-clear"><span className="status-dot" />No active emergency warning</div><p>Demonstration weather data for the competition prototype. Verify current conditions with official Bureau of Meteorology warnings before taking action.</p><small>Last updated: 29 September 2026 · Source: RemoteReady NT demo dataset</small></div></InfoOverlay>}
    {notice && <button className="dashboard-notice" onClick={() => setNotice('')} type="button">{notice} · 点击关闭</button>}
  </section>;
}

function StripTile({ icon, label, tone }: { icon: string; label: string; tone: string }) {
  return <div className={`strip-tile ${tone}`}><span aria-hidden="true">{icon}</span><strong>{label}</strong></div>;
}

function StatusTile({ icon, label, note, tone, value }: { icon: string; label: string; note: string; tone: string; value: string }) {
  return <article className={`status-tile ${tone}`}><span aria-hidden="true">{icon}</span><strong>{value}</strong><div><b>{label}</b><small>{note}</small></div></article>;
}

function QuickAction({ icon, label, onClick, pending = false }: { icon: string; label: string; onClick: () => void; pending?: boolean }) {
  return <button className={`quick-action ${pending ? 'pending' : ''}`} onClick={onClick} type="button"><span aria-hidden="true">{icon}</span><strong>{label}{pending ? '（待实现）' : ''}</strong></button>;
}

function InfoOverlay({ children, onClose, title }: { children: ReactNode; onClose: () => void; title: string }) {
  return <div className="info-overlay-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="info-overlay" role="dialog" aria-modal="true" aria-label={title}><button className="info-overlay-close" onClick={onClose} type="button" aria-label={`Close ${title}`}>×</button><p className="eyebrow">REMOTEReady NT</p><h2>{title}</h2>{children}</section></div>;
}

function InfoCard({ children, icon, pending = false, title }: { children: ReactNode; icon: string; pending?: boolean; title: string }) {
  return <article className={`dashboard-info-card ${pending ? 'pending' : ''}`}><h2><span aria-hidden="true">{icon}</span>{title}{pending && <small>待实现</small>}</h2>{children}</article>;
}

function MetricPair({ label, value }: { label: string; value: string }) {
  return <div className="metric-pair"><strong>{value}</strong><span>{label}</span></div>;
}

function PriorityExplanation({ onClose, onSelectCommunity, priorities }: { onClose: () => void; onSelectCommunity: (feature: PriorityResult['feature']) => void; priorities: PriorityResult[] }) {
  const topPriority = priorities[0];
  if (!topPriority) return null;
  const communityName = topPriority.feature.properties.name;
  const confidence = topPriority.record.confidence;
  const confidenceLabel = confidence === 'low' ? 'Verify first' : `${confidence.slice(0, 1).toUpperCase()}${confidence.slice(1)} confidence`;
  return <div className="priority-explanation-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section aria-labelledby="priority-explanation-title" aria-modal="true" className="priority-explanation" role="dialog">
      <button aria-label="Close priority explanation" className="priority-explanation-close" onClick={onClose} type="button">×</button>
      <p className="eyebrow">MODELLED PRIORITY</p>
      <h2 id="priority-explanation-title">{communityName}</h2>
      <p className="priority-explanation-subtitle">Rank #1 of {priorities.length} · scenario-based recommendation</p>
      <div className="priority-score"><strong>Indicative Priority Score: {topPriority.score.toFixed(1)} / 100</strong><span>Overall confidence: {confidence}. The score combines five labelled scenario dimensions and a confidence penalty.</span></div>
      <h3>Modelled candidate ranking</h3>
      <ol className="priority-ranking">{priorities.map((item, index) => <li key={item.record.community_id}>
        <button aria-label={`Select ${item.feature.properties.name}, rank ${index + 1}, ${item.score.toFixed(1)} out of 100`} onClick={() => onSelectCommunity(item.feature)} type="button">
          <strong>#{index + 1} {item.feature.properties.name}</strong><span>{item.score.toFixed(1)} / 100 · {item.record.confidence === 'low' ? 'Verify first' : `${item.record.confidence} confidence`}</span>
        </button>
      </li>)}</ol>
      <h3>What influenced this priority</h3>
      {topPriority.breakdown.factors.map((factor) => <section className="priority-factor" key={factor.id}>
        <h4>{factor.title}</h4><strong>{factor.score.toFixed(1)} <small>of {factor.maximum}</small></strong>
        <dl><dt>Input</dt><dd>{factor.input}</dd><dt>Effect</dt><dd>{factor.effect}</dd></dl>
      </section>)}
      <section className="priority-factor confidence-factor">
        <h4>Confidence penalty</h4><strong>{topPriority.breakdown.confidencePenalty < 0 ? '−' : ''}{Math.abs(topPriority.breakdown.confidencePenalty).toFixed(1)} <small>up to −{topPriority.breakdown.confidenceMaximum}</small></strong>
        <dl><dt>Input</dt><dd>{confidence}</dd><dt>Effect</dt><dd>{confidence === 'high' ? 'High-confidence exercise inputs receive no confidence penalty.' : `${confidenceLabel} exercise inputs reduce priority until they are verified locally.`}</dd></dl>
      </section>
    </section>
  </div>;
}

function MapLegend() {
  return <div aria-label="Map symbol legend" className="data-boundary-legend">
    <span><i className="legend-symbol published" />Published facilities</span>
    <span><i className="legend-symbol historical" />Historical track and stages</span>
    <span><i className="legend-symbol scenario" />Illustrative scenario uncertainty</span>
    <span><i className="legend-symbol outcome" />Simulated outage site</span>
    <span><i className="legend-symbol modelled" />Modelled priority</span>
    <span><i className="legend-symbol unconfirmed" />Location; status unconfirmed</span>
  </div>;
}

function DetailDrawer({ onClose, properties, scenarioRecord }: { onClose: () => void; properties: ConnectivityProperties | FacilityProperties; scenarioRecord?: ExerciseCommunity }) {
  const details = featureDetails(properties);
  const isCommunity = properties.kind === 'community';
  const isConnectivity = properties.kind === 'community' || properties.kind === 'small-cell';
  const communityProperties = 'provider' in properties ? properties : undefined;
  const activeScenarioRecord = scenarioRecord;
  const facilities = communityProperties?.facilities ?? [];
  const verifyItems = scenarioRecord?.verify_locally ?? (properties.kind === 'clinic' || properties.kind === 'hospital' || properties.kind === 'school' || properties.kind === 'community_centre'
    ? ['Confirm facility operating status and safe access with the responsible organisation.']
    : ['Confirm site status, local coverage and safe access with the responsible provider.']);

  return <aside aria-label={`${properties.name} details`} className="detail-drawer">
    <button aria-label="Close details" onClick={onClose} type="button">×</button>
    <p className="eyebrow">{isCommunity ? 'COMMUNITY DETAILS' : properties.kind === 'small-cell' ? 'SMALL CELL SITE' : 'ESSENTIAL FACILITY'}</p>
    <h2>{properties.name}</h2>
    <p className="detail-subtitle">{details.region} · {details.type}</p>

    <DetailSection badge="Published data" title="Published location record">
      {isConnectivity && communityProperties ? <DetailRows rows={[
        ['Provider', communityProperties.provider],
        ['Backhaul', communityProperties.backhaul],
        ['Coverage record', communityProperties.coverage],
        ['Population record', communityProperties.population == null ? 'Not linked' : communityProperties.population],
      ]} /> : <DetailRows rows={[
        ['Facility type', details.type],
        ['Source', details.source],
      ]} />}
      <p className="detail-note">A published or mapped location record does not confirm current service, opening status or availability.</p>
    </DetailSection>

    <DetailSection badge={activeScenarioRecord?.scenario_source === 'indicative_public_data' ? 'Indicative scenario' : 'Historical'} title="Historical context">
      <p>{activeScenarioRecord
        ? `${formatRecord(activeScenarioRecord.historical_context)}. This exercise label does not describe current conditions.`
        : isCommunity
          ? 'No community-specific historical record is linked in the available exercise data.'
          : 'No site- or facility-specific operational record is linked in the available data.'}</p>
    </DetailSection>

    <DetailSection badge={activeScenarioRecord?.scenario_source === 'indicative_public_data' ? 'Derived from public data' : 'Exercise assumption'} title="Scenario input">
      {activeScenarioRecord ? <DetailRows rows={[
        ['Exposure', activeScenarioRecord.exposure],
        ['Essential-service priority', activeScenarioRecord.essential_service_priority],
        ['Communications redundancy', activeScenarioRecord.redundancy],
        ['Access', activeScenarioRecord.access],
        ['Confidence', activeScenarioRecord.confidence],
        ['Resource option', activeScenarioRecord.recommended_resource],
      ]} /> : <p>{isCommunity
        ? 'No exercise scenario record is linked to this community.'
        : 'No site- or facility-specific operating, capacity or communications assumption is provided.'}</p>}
      <p className="detail-note">Exercise inputs are simulated planning assumptions, not live reports or verified stock.</p>
    </DetailSection>

    {isCommunity && <DetailSection badge="Published references" title="Mapped essential-service references">
      {facilities.length > 0
        ? <ul className="detail-reference-list">{facilities.map((facility) => <li key={facility}>{facility}</li>)}</ul>
        : <p>No linked facility references are recorded for this community. Nearby map points are not assumed to belong to it.</p>}
    </DetailSection>}

    <section className="verification-list"><h3>Verify locally before action</h3><p>Confirm current conditions with the community and responsible service provider.</p><ul>{verifyItems.map((item) => <li key={item}>{item}</li>)}</ul></section>
  </aside>;
}

function DetailSection({ badge, children, title }: { badge: string; children: ReactNode; title: string }) {
  return <section className="detail-section"><h3>{title}<span>{badge}</span></h3>{children}</section>;
}

function DetailRows({ rows }: { rows: Array<[string, string | number | null | undefined]> }) {
  return <dl className="detail-rows">{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{formatRecord(value)}</dd></div>)}</dl>;
}
