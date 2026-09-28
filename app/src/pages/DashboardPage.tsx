import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ExerciseTimeline } from '../features/dashboard/ExerciseTimeline';
import { MapCanvas } from '../features/dashboard/MapCanvas';
import { MapExplorerPanel } from '../features/dashboard/MapExplorerPanel';
import { priorityResults, stages } from '../features/dashboard/dashboard';
import type { PriorityResult } from '../features/dashboard/dashboard';
import { useDashboardData } from '../features/dashboard/useDashboardData';
import type { ConnectivityProperties, ExerciseCommunity, ExerciseStage, FacilityProperties, GeoJsonFeature } from '../types/data';
import type { View } from '../app/view';

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
  const [selected, setSelected] = useState<Selected>();
  const [priorityExplanationOpen, setPriorityExplanationOpen] = useState(false);
  const [mobileActionOpen, setMobileActionOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [layers, setLayers] = useState<Record<string, boolean>>({ uncertainty: false, community: true, 'small-cell': false, clinic: false, hospital: false, school: false, community_centre: false });
  const current = stages.find((item) => item.id === stage) ?? stages[0];
  const outcome = stage === 'simulated_impact_outcome';
  const priorities = useMemo(() => core && optional.scenario ? priorityResults(core.connectivity, optional.scenario.communities) : [], [core, optional.scenario]);
  const topPriority = priorities[0];
  const navigate = (view: View) => onNavigate?.(view);
  const showPending = (label: string) => setNotice(`${label}（待实现）`);
  const changeStage = (nextStage: ExerciseStage) => {
    setStage(nextStage);
    setLayers((currentLayers) => ({ ...currentLayers, uncertainty: nextStage !== '48_hours_before_simulated_impact' }));
    setSelected(undefined);
    setPriorityExplanationOpen(false);
    setMobileActionOpen(false);
  };

  if (error) return <section className="page page-dashboard"><div className="dashboard-error"><h1>Map unavailable</h1><p>{error}</p></div></section>;
  if (!core) return <section className="page page-dashboard"><div className="dashboard-loading">Loading map data…</div></section>;

  const displayableFacilities = core.facilities.features.filter((item) => item.properties.name && !item.properties.name.startsWith('Unnamed') && item.properties.kind !== 'shelter');
  const safePointCount = core.facilities.features.filter((item) => ['community_centre', 'shelter'].includes(item.properties.kind) && item.properties.name && !item.properties.name.startsWith('Unnamed')).length;
  const constrainedAccess = optional.scenario?.communities.filter((item) => item.access.includes('constrained')).length ?? 0;
  const sourceWarnings = optional.warnings.length;

  return <section className="dashboard dashboard-redesign" aria-label="RemoteReady NT dashboard">
    <header className={`simulation-banner ${outcome ? 'outcome' : ''}`}>
      <span aria-hidden="true">{outcome ? '!' : '◒'}</span><strong>{outcome ? 'Simulation outcome' : 'Historical exercise'}</strong>
      <b>{outcome ? 'Scenario communications site A reported unavailable' : 'TC Lam historical communications resilience exercise'}</b>
      <p>{outcome ? 'Simulated unavailable report · not a real network fault.' : 'Historical TC Lam context with clearly labelled exercise assumptions.'}</p>
    </header>
    <div className="dashboard-visual-strip" aria-label="RemoteReady NT focus areas">
      <StripTile icon="⌂" label="Remote communities" tone="sand" />
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
      <QuickAction icon="!" label="Emergency updates" pending onClick={() => showPending('Emergency updates')} />
      <QuickAction icon="♟" label="Community recovery" pending onClick={() => showPending('Community recovery')} />
      <QuickAction icon="↓" label="Offline pack" onClick={() => navigate('preparedness')} />
      <QuickAction icon="☎" label="Useful contacts" pending onClick={() => showPending('Useful contacts')} />
    </section>
    {optional.warnings.length > 0 && <p className="data-warning">{optional.warnings.join(' ')}</p>}
    <section className="dashboard-map-section" id="map-section" aria-labelledby="map-section-title">
      <div className="map-section-heading"><div><span className="eyebrow">OPERATIONAL MAP</span><h2 id="map-section-title">Map layers</h2></div><span className="map-section-context">TC Lam exercise · Stage {stages.findIndex((item) => item.id === stage) + 1} of 4</span></div>
      <div className={`dashboard-map-workspace ${outcome ? 'has-simulated-outcome' : ''}`}>
        <MapCanvas connectivity={core.connectivity} enabledLayers={layers} facilities={core.facilities} historicalTrack={optional.historicalTrack} onSelect={setSelected} priorityCommunityId={outcome ? topPriority?.feature.properties.id : undefined} selectedFeature={selected} stage={stage} />
        <MapExplorerPanel connectivity={core.connectivity} facilities={core.facilities} layers={layers} onLayerChange={(name, value) => setLayers((currentLayers) => ({ ...currentLayers, [name]: value }))} onSelect={setSelected} />
        <div className="priority-column">
        <section className="exercise-context" aria-label="Exercise context">
          <div className="exercise-status"><span>SIMULATED EXERCISE</span><span>NOT LIVE</span></div>
          <strong>TC Lam communications resilience</strong>
          <small>Stage {stages.findIndex((item) => item.id === stage) + 1} of 4 · {current.label}</small>
        </section>
        <aside className={`priority-card ${mobileActionOpen ? 'mobile-open' : ''}`}>
          <button aria-label="Close next action" className="mobile-action-close" onClick={() => setMobileActionOpen(false)} type="button">×</button>
          <span>{outcome ? 'NEXT STEP' : 'CURRENT EXERCISE ACTION'}</span>
          <h1 aria-label={outcome && topPriority ? `Verify conditions in ${topPriority.feature.properties.name}` : undefined} className={outcome ? 'outcome-action-title' : 'stage-action-title'}>{outcome && topPriority ? <><span>Verify conditions</span><strong>{topPriority.feature.properties.name}</strong></> : outcome ? 'Verify local conditions' : current.action}</h1>
          <p>{outcome ? 'Confirm network status, safe access and community need before considering communications support.' : current.copy}</p>
          {outcome && topPriority && <>
            <div className="priority-context"><span>Modelled recommendation</span><span>{confidenceLabel(topPriority.record.confidence)} confidence · Verify locally</span></div>
          </>}
          <div className="priority-actions">
            <button onClick={() => topPriority && setSelected(topPriority.feature)} type="button">{outcome ? `Review ${topPriority?.feature.properties.name ?? 'community'} →` : 'Explore map →'}</button>
            {outcome && topPriority && <button aria-label="Open assessment overview" className="why-priority" onClick={() => setPriorityExplanationOpen(true)} type="button">Assessment Overview</button>}
          </div>
        </aside>
        <div className="desktop-map-legend"><MapLegend /></div>
        </div>
        <button aria-expanded={mobileActionOpen} className="mobile-action-toggle" onClick={() => setMobileActionOpen((isOpen) => !isOpen)} type="button"><span aria-hidden="true">!</span> Next action</button>
        <ExerciseTimeline onStageChange={changeStage} stage={stage} />
        {selected && <DetailDrawer onClose={() => setSelected(undefined)} properties={selected.properties} scenarioRecord={selected.properties.kind === 'community' ? optional.scenario?.communities.find((record) => record.community_id === selected.properties.id) : undefined} />}
        {priorityExplanationOpen && topPriority && <PriorityExplanation onClose={() => setPriorityExplanationOpen(false)} onSelectCommunity={(feature) => { setSelected(feature); setPriorityExplanationOpen(false); }} priorities={priorities} />}
      </div>
      <div className="mobile-map-legend"><MapLegend /></div>
    </section>
    <section className="dashboard-action-row" aria-label="Preparedness shortcuts">
      <QuickAction icon="✓" label="Get ready" onClick={() => navigate('preparedness')} />
      <QuickAction icon="▤" label="Situation summary" pending onClick={() => showPending('Situation summary')} />
      <QuickAction icon="♟" label="Community contacts" pending onClick={() => showPending('Community contacts')} />
      <QuickAction icon="▢" label="Preparedness guide" pending onClick={() => showPending('Preparedness guide')} />
    </section>
    <section className="dashboard-info-grid" aria-label="RemoteReady NT information summary">
      <InfoCard icon="◉" title="Connectivity"><MetricPair value={String(core.connectivity.features.length)} label="remote locations monitored" /><MetricPair value={String(displayableFacilities.length)} label="essential facilities" /><MetricPair value={String(optional.scenario?.communities.length ?? 0)} label="exercise communities" /><a href="#map-section">View connectivity details →</a></InfoCard>
      <InfoCard icon="▤" title="Readiness"><MetricPair value={String(optional.scenario?.communities.length ?? 0)} label="exercise communities" /><MetricPair value="4" label="scenario stages" /><MetricPair value="1" label="simulation in progress" /><button className="info-link" onClick={() => navigate('preparedness')} type="button">View preparedness information →</button></InfoCard>
      <InfoCard icon="☁" title="Weather and warnings" pending><MetricPair value="—" label="live warning feed" /><MetricPair value="—" label="current weather" /><p className="pending-copy">Official weather and warning integration（待实现）</p><button className="info-link" onClick={() => showPending('Weather and warnings')} type="button">View weather and warnings →</button></InfoCard>
    </section>
    <div className="neighbour-bar"><button onClick={() => showPending('Neighbouring dashboards')} type="button">▦ Neighbouring dashboards（待实现）</button></div>
    <footer className="dashboard-footer"><span><strong>RemoteReady NT</strong><small>Emergency communications and preparedness</small></span><span>Prototype only · Verify emergency information locally</span></footer>
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

    <DetailSection badge="Historical" title="Historical context">
      <p>{isCommunity && scenarioRecord
        ? `${formatRecord(scenarioRecord.historical_context)}. This exercise label does not describe current conditions.`
        : isCommunity
          ? 'No community-specific historical record is linked in the available exercise data.'
          : 'No site- or facility-specific TC Lam operating record is linked in this exercise.'}</p>
    </DetailSection>

    <DetailSection badge="Exercise assumption" title="Scenario input">
      {isCommunity && scenarioRecord ? <DetailRows rows={[
        ['Exposure', scenarioRecord.exposure],
        ['Essential-service priority', scenarioRecord.essential_service_priority],
        ['Communications redundancy', scenarioRecord.redundancy],
        ['Access', scenarioRecord.access],
        ['Confidence', scenarioRecord.confidence],
        ['Resource option', scenarioRecord.recommended_resource],
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
