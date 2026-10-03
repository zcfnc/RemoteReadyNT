import { useCallback, useEffect, useMemo, useState } from 'react';
import { heroBackground } from '../components/layout/heroBackground';
import type { ReactNode } from 'react';
import { MapCanvas } from '../features/dashboard/MapCanvas';
import { MapExplorerPanel } from '../features/dashboard/MapExplorerPanel';
import { ExposurePanel } from '../features/dashboard/ExposurePanel';
import { ResiliencePlanningSection } from '../features/dashboard/ResiliencePlanningSection';
import { exposureResults, type ExposureFilter } from '../features/dashboard/exposure';
import { priorityResults, stages } from '../features/dashboard/dashboard';
import { useDashboardData } from '../features/dashboard/useDashboardData';
import type { ConnectivityProperties, ExerciseCommunity, ExerciseStage, FacilityProperties, GeoJsonFeature } from '../types/data';
import type { View } from '../app/view';
import { downloadDecisionSupportReport } from '../services/decisionReport';
import { loadChecklist } from '../services/storage';

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

export function DashboardPage({ onNavigate, onRegisterExport }: { onNavigate?: (view: View) => void; onRegisterExport?: (handler?: () => void) => void }) {
  const { core, optional, error } = useDashboardData();
  const [stage] = useState<ExerciseStage>('48_hours_before_simulated_impact');
  const [mapMode, setMapMode] = useState<'exercise' | 'exposure'>('exposure');
  const [exposureFilter, setExposureFilter] = useState<ExposureFilter>();
  const [selected, setSelected] = useState<Selected>();
  const [exposurePopupId, setExposurePopupId] = useState<string>();
  const [selectedResourceId, setSelectedResourceId] = useState<string>();
  const [scoreAnimationVersion, setScoreAnimationVersion] = useState(0);
  const [notice, setNotice] = useState('');
  const [weatherOpen, setWeatherOpen] = useState(false);
  const [selectedTrackId, setSelectedTrackId] = useState('all');
  const [selectedBomYear, setSelectedBomYear] = useState('2025-2026');
  const [selectedBomTrackId, setSelectedBomTrackId] = useState('');
  const [layers, setLayers] = useState<Record<string, boolean>>({ uncertainty: false, bomCyclones: true, community: true, 'small-cell': false, clinic: false, hospital: false, school: false, community_centre: false });
  const current = stages.find((item) => item.id === stage) ?? stages[0];
  const outcome = stage === 'simulated_impact_outcome';
  const priorities = useMemo(() => core && optional.scenario ? priorityResults(core.connectivity, optional.scenario.communities) : [], [core, optional.scenario]);
  const generateReport = useCallback(async (reportCommunity: GeoJsonFeature<ConnectivityProperties> | null) => {
    if (!reportCommunity && priorities.length === 0) {
      setNotice('All-communities report unavailable: review-priority data have not loaded.');
      return;
    }
    const selectedRecord = reportCommunity ? optional.scenario?.communities.find((record) => record.community_id === reportCommunity.properties.id) : undefined;
    const selectedPoint = reportCommunity?.geometry.type === 'Point' ? reportCommunity.geometry.coordinates as [number, number] : undefined;
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
      resilienceSimulation: optional.resilienceSimulation,
      selectedCommunity: reportCommunity ? {
        id: reportCommunity.properties.id,
        name: reportCommunity.properties.name,
        region: reportCommunity.properties.region,
        provider: reportCommunity.properties.provider,
        coverage: reportCommunity.properties.coverage,
        backhaul: reportCommunity.properties.backhaul,
        facilities: reportCommunity.properties.facilities?.length ? reportCommunity.properties.facilities : nearbyFacilities,
        record: selectedRecord,
      } : undefined,
      checklist: ['Download the local map and community pack', 'Confirm emergency contacts', 'Test backup power', 'Test satellite or radio backup', 'Confirm the community meeting point', 'Review road and air access', 'Prepare essential health information', 'Run a no-signal drill'].map((title, index) => ({
        title,
        done: Boolean(loadChecklist()[['local-map', 'contacts', 'power', 'backup-comms', 'meeting-point', 'access', 'health', 'drill'][index]]),
      })),
    });
    setNotice('Decision-support report downloaded as a PDF.');
  }, [core?.facilities.features, current.label, optional.resilienceSimulation, optional.scenario, priorities]);
  useEffect(() => {
    onRegisterExport?.(() => { void generateReport(null); });
    return () => onRegisterExport?.(undefined);
  }, [generateReport, onRegisterExport]);
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
    onExportReport: (communityId: string) => {
      const feature = core?.connectivity.features.find((item) => item.properties.kind === 'community' && item.properties.id === communityId);
      if (feature) void generateReport(feature);
    },
  } : undefined, [mapMode, optional.cycloneExposure, activeExposureFilter, exposureRanking, selectedExposure, exposurePopupId, simulationById, core?.connectivity, generateReport]);
  const topPriority = priorities[0];
  const activePriority = selected?.properties.kind === 'community' ? priorities.find((item) => item.feature.properties.id === selected.properties.id) ?? topPriority : topPriority;
  const navigate = (view: View) => onNavigate?.(view);
  // Keep all hooks above the loading/error returns so their order is stable.
  const bomCycloneYears = useMemo(() => ['2007-2009', '2010-2012', '2013-2015', '2016-2018', '2019-2021', '2022-2024', '2025-2026'], []);

  const switchMapMode = (mode: 'exercise' | 'exposure') => {
    setMapMode(mode);
    setSelected(undefined);
    setExposurePopupId(undefined);
    setSelectedResourceId(undefined);
    setSelectedBomTrackId('');
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
  const sources = Object.values(core.sourceLog.sources ?? {});
  const historicalTracks = optional.historicalTrack?.features.filter((item) => item.properties.kind === 'historical-track') ?? [];

  return <section className="dashboard dashboard-redesign" aria-label="RemoteReady NT dashboard">
    <section className="dashboard-hero" aria-labelledby="dashboard-hero-title" style={{ backgroundImage: heroBackground }}>
      <div className="dashboard-container dashboard-hero-inner">
      <div className="dashboard-hero-content">
        <span className="dashboard-hero-kicker">RemoteReady NT</span>
        <span className="dashboard-hero-subkicker">Emergency connectivity and preparedness</span>
        <h1 id="dashboard-hero-title">Turn community data into <br />preparedness decisions</h1>
        <p>Identify communities that may need verification, compare available connectivity and access evidence, and investigate preparedness gaps.</p>
        <div className="dashboard-hero-actions" aria-label="Dashboard actions">
          <button className="hero-primary-action" onClick={() => document.getElementById('map-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' })} type="button">Explore priority communities <span aria-hidden="true">→</span></button>
        </div>
        <small className="dashboard-hero-disclaimer">Historical and planning information · Verify local conditions</small>
      </div>
      <div className="dashboard-status-grid" aria-label="Available evidence summary">
        <StatusTile icon={<HeroMetricIcon kind="signal" />} label="Communities" value={String(core.connectivity.features.filter((item) => item.properties.kind === 'community').length)} note="Mapped records" tone="blue" />
        <StatusTile icon={<HeroMetricIcon kind="aircraft" />} label="Small cells" value={String(core.connectivity.features.filter((item) => item.properties.kind === 'small-cell').length)} note="Published locations" tone="blue" />
        <StatusTile icon={<HeroMetricIcon kind="building" />} label="Facilities" value={displayableFacilities.length.toLocaleString('en-AU')} note="Named public records" tone="blue" />
        <StatusTile icon={<HeroMetricIcon kind="battery" />} label="Data sources" value={sources.length ? String(sources.length) : '—'} note={sources.length ? `${sources.filter((source) => source.status === 'ok').length} recorded available · ${sources.filter((source) => source.status === 'unavailable').length} source warnings` : 'No source log linked'} tone="blue" />
      </div>
      </div>
    </section>
    <div className="dashboard-container dashboard-workspace">
    {optional.warnings.length > 0 && <p className="data-warning">{optional.warnings.join(' ')}</p>}
    <section className="dashboard-map-section" id="map-section" aria-labelledby="map-section-title">
      <div className="map-section-heading"><span className="eyebrow" id="map-section-title">MAP ANALYSIS</span><div className="map-heading-actions"><div className="map-mode-switch" aria-label="Map view"><button aria-pressed={mapMode === 'exposure'} onClick={() => switchMapMode('exposure')} type="button">Community analysis</button><button aria-pressed={mapMode === 'exercise'} onClick={() => switchMapMode('exercise')} type="button">Cyclone path analysis</button></div></div></div>
      <div className={`dashboard-map-workspace ${outcome && mapMode === 'exercise' ? 'has-simulated-outcome' : ''} ${mapMode === 'exposure' ? 'is-exposure-view' : ''}`}>
        <MapCanvas analysis={exposureMap} analysisMode={mapMode === 'exposure'} bomCycloneTracks={optional.bomCycloneTracks} connectivity={core.connectivity} enabledLayers={layers} facilities={core.facilities} historicalTrack={optional.historicalTrack} onBomTrackSelect={(track) => { setSelectedBomTrackId(track.properties.stormId); if (mapMode === 'exercise') setNotice(`${track.properties.name || 'Unnamed cyclone'} selected · impact range shown.`); }} onSelect={(feature) => { if (mapMode === 'exposure' && feature.properties.kind === 'community') { selectExposureCommunity(feature.properties.id); return; } setSelected(feature); if (mapMode === 'exposure') { setSelectedBomTrackId(''); setSelectedResourceId(undefined); setExposurePopupId(undefined); } }} priorityCommunityId={mapMode === 'exercise' && outcome && !selectedBomTrackId ? activePriority?.feature.properties.id : undefined} selectedBomTrackId={selectedBomTrackId} selectedBomYear={selectedBomYear} selectedFeature={selected} selectedTrackId={selectedTrackId} onTrackSelect={(track) => { const id = track.properties.trackId ?? track.properties.name ?? 'all'; setSelectedTrackId(id); setNotice(`${track.properties.name ?? 'Historical cyclone track'} selected.`); }} stage={stage} />
        {mapMode === 'exercise' && <MapExplorerPanel bomCycloneCount={optional.bomCycloneTracks?.features.length} bomCycloneYears={bomCycloneYears} connectivity={core.connectivity} facilities={core.facilities} historicalTracks={historicalTracks} layers={layers} onBomYearChange={(year) => { setSelectedBomYear(year); setSelectedBomTrackId(''); setLayers((currentLayers) => ({ ...currentLayers, uncertainty: false })); }} onLayerChange={(name, value) => setLayers((currentLayers) => ({ ...currentLayers, [name]: value }))} onSelect={setSelected} onTrackChange={setSelectedTrackId} selectedBomYear={selectedBomYear} selectedTrackId={selectedTrackId} />}
        {mapMode === 'exposure' && <ExposurePanel data={optional.cycloneExposure} error={optional.exposureError} simulation={optional.resilienceSimulation} tracksUnavailable={optional.warnings.includes('BoM cyclone database unavailable.')} filter={activeExposureFilter} results={exposureRanking} selectedCommunityId={selected?.properties.kind === 'community' ? selected.properties.id : undefined} selectedStormId={selectedBomTrackId} onFilterChange={(filter) => { setExposureFilter(filter); setSelectedBomTrackId(''); }} onCommunitySelect={selectExposureCommunity} onStormSelect={(stormId) => { setSelectedBomTrackId(stormId); if (window.innerWidth <= 760) document.getElementById('map-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} />}
        {mapMode === 'exercise' && <div className="dashboard-map-legend"><MapLegend /></div>}
        {mapMode === 'exercise' && selected && <DetailDrawer onClose={() => setSelected(undefined)} onExportReport={selected.properties.kind === 'community' ? () => void generateReport(selected as GeoJsonFeature<ConnectivityProperties>) : undefined} properties={selected.properties} scenarioRecord={selected.properties.kind === 'community' ? optional.scenario?.communities.find((record) => record.community_id === selected.properties.id) : undefined} />}
      </div>
      {mapMode === 'exposure' && <ResiliencePlanningSection key={scoreAnimationVersion} data={optional.resilienceSimulation} error={optional.resilienceError} feature={selected?.properties.kind === 'community' ? selected as GeoJsonFeature<ConnectivityProperties> : undefined} filter={activeExposureFilter} onResourceSelect={setSelectedResourceId} rank={selectedExposure ? exposureRanking.indexOf(selectedExposure) + 1 : 0} result={selectedExposure} selectedResourceId={selectedResourceId} />}
    </section>
    {mapMode === 'exercise' && <section className="dashboard-info-grid" aria-label="RemoteReady NT information summary">
      <InfoCard icon="◉" title="Connectivity"><MetricPair value={String(core.connectivity.features.length)} label="remote locations monitored" /><MetricPair value={String(displayableFacilities.length)} label="essential facilities" /><MetricPair value={String(optional.scenario?.communities.length ?? 0)} label="exercise communities" /><a href="#map-section">View connectivity details →</a></InfoCard>
      <InfoCard icon="▤" title="Readiness"><MetricPair value={String(optional.scenario?.communities.length ?? 0)} label="exercise communities" /><MetricPair value="4" label="scenario stages" /><MetricPair value="1" label="simulation in progress" /><button className="info-link" onClick={() => navigate('preparedness')} type="button">View preparedness information →</button></InfoCard>
      <InfoCard icon="☁" title="Weather and warnings"><MetricPair value="26°C" label="Darwin current weather" /><MetricPair value="Low" label="warning level" /><p className="weather-card-status"><span className="status-dot" />No active emergency warning in demo data</p><button className="info-link" onClick={() => setWeatherOpen(true)} type="button">View weather and warnings →</button></InfoCard>
    </section>}
    {weatherOpen && <InfoOverlay title="Weather and warnings" onClose={() => setWeatherOpen(false)}><div className="weather-detail"><div><span>Darwin, Northern Territory</span><strong>26°C · Partly cloudy</strong><small>Wind 18 km/h · Humidity 68%</small></div><div className="weather-warning-clear"><span className="status-dot" />No active emergency warning</div><p>Demonstration weather data for the competition prototype. Verify current conditions with official Bureau of Meteorology warnings before taking action.</p><small>Last updated: 29 September 2026 · Source: RemoteReady NT demo dataset</small></div></InfoOverlay>}
    </div>
    <footer className="dashboard-footer"><div className="dashboard-container dashboard-footer-inner"><span><strong>RemoteReady NT</strong><small>Emergency communications and preparedness</small></span><span>Prototype only · Verify emergency information locally</span></div></footer>
    {notice && <button className="dashboard-notice" onClick={() => setNotice('')} type="button">{notice} · 点击关闭</button>}
  </section>;
}

function StatusTile({ icon, label, note, tone, value }: { icon: ReactNode; label: string; note: string; tone: string; value: string }) {
  return <article className={`status-tile ${tone}`}><span aria-hidden="true">{icon}</span><strong aria-label={value}><AnimatedMetric value={value} /></strong><div><b>{label}</b>{note && <small>{note}</small>}</div></article>;
}

function AnimatedMetric({ value }: { value: string }) {
  const target = Number(value.replaceAll(',', ''));
  const [count, setCount] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? target : 0);

  useEffect(() => {
    if (!Number.isFinite(target)) return;
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = media?.matches ? 1 : Math.min(1, (now - start) / 1100);
      setCount(Math.round(target * (1 - (1 - progress) ** 3)));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    const finishForReducedMotion = () => {
      if (media?.matches) {
        cancelAnimationFrame(frame);
        setCount(target);
      }
    };
    frame = requestAnimationFrame(tick);
    media?.addEventListener('change', finishForReducedMotion);
    return () => {
      cancelAnimationFrame(frame);
      media?.removeEventListener('change', finishForReducedMotion);
    };
  }, [target]);

  return <span aria-hidden="true">{Number.isFinite(target) ? count.toLocaleString('en-AU') : value}</span>;
}

function HeroMetricIcon({ kind }: { kind: 'signal' | 'aircraft' | 'building' | 'battery' }) {
  const paths = {
    signal: <><circle cx="12" cy="14" r="1.5" /><path d="M12 16v5M7.8 9.8a6 6 0 0 0 0 8.4M16.2 9.8a6 6 0 0 1 0 8.4M4.6 6.6a10.5 10.5 0 0 0 0 14.8M19.4 6.6a10.5 10.5 0 0 1 0 14.8" /></>,
    aircraft: <path d="m12 2 2.2 8.3 6.3 3.7v2l-6.7-1.8L13 21h-2l-.8-6.8L3.5 16v-2l6.3-3.7L12 2Z" />,
    building: <><path d="M4 21V4h16v17M2 21h20M8 8h2m4 0h2M8 12h2m4 0h2M10 21v-4h4v4" /></>,
    battery: <><rect x="3" y="7" width="17" height="11" rx="2" /><path d="M22 10v5M11 9l-2 4h4l-2 3" /></>,
  };
  return <svg className={`hero-metric-icon ${kind}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[kind]}</svg>;
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

function DetailDrawer({ onClose, onExportReport, properties, scenarioRecord }: { onClose: () => void; onExportReport?: () => void; properties: ConnectivityProperties | FacilityProperties; scenarioRecord?: ExerciseCommunity }) {
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
    {isCommunity && onExportReport && <div className="detail-report-action"><button aria-label={`Export ${properties.name} Situation summary as PDF`} className="exposure-popup-link detail-report-button" onClick={onExportReport} type="button"><span><strong>Export Situation summary</strong><small>Download this community’s PDF report</small></span><b aria-hidden="true">↓</b></button></div>}

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
