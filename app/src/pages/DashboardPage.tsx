import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ExerciseTimeline } from '../features/dashboard/ExerciseTimeline';
import { MapCanvas } from '../features/dashboard/MapCanvas';
import { MapExplorerPanel } from '../features/dashboard/MapExplorerPanel';
import { priorityResults, stages } from '../features/dashboard/dashboard';
import type { PriorityResult } from '../features/dashboard/dashboard';
import { useDashboardData } from '../features/dashboard/useDashboardData';
import type { ConnectivityProperties, ExerciseCommunity, ExerciseStage, FacilityProperties, GeoJsonFeature } from '../types/data';

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

export function DashboardPage() {
  const { core, optional, error } = useDashboardData();
  const [stage, setStage] = useState<ExerciseStage>('48_hours_before_simulated_impact');
  const [selected, setSelected] = useState<Selected>();
  const [priorityExplanationOpen, setPriorityExplanationOpen] = useState(false);
  const [mobileActionOpen, setMobileActionOpen] = useState(false);
  const [layers, setLayers] = useState<Record<string, boolean>>({ uncertainty: false, community: true, 'small-cell': false, clinic: false, hospital: false, school: false, community_centre: false });
  const current = stages.find((item) => item.id === stage) ?? stages[0];
  const outcome = stage === 'simulated_impact_outcome';
  const priorities = useMemo(() => core && optional.scenario ? priorityResults(core.connectivity, optional.scenario.communities) : [], [core, optional.scenario]);
  const topPriority = priorities[0];
  const stageAction = outcome && topPriority ? `Verify conditions in ${topPriority.feature.properties.name}` : current.action;
  const changeStage = (nextStage: ExerciseStage) => {
    setStage(nextStage);
    setLayers((currentLayers) => ({ ...currentLayers, uncertainty: nextStage !== '48_hours_before_simulated_impact' }));
    setSelected(undefined);
    setPriorityExplanationOpen(false);
    setMobileActionOpen(false);
  };

  if (error) return <section className="page page-dashboard"><div className="dashboard-error"><h1>Map unavailable</h1><p>{error}</p></div></section>;
  if (!core) return <section className="page page-dashboard"><div className="dashboard-loading">Loading map data…</div></section>;

  return <section className="dashboard" aria-label="RemoteReady NT dashboard">
    <header className={`simulation-banner ${outcome ? 'outcome' : ''}`}>
      <span aria-hidden="true">{outcome ? '!' : '◒'}</span><strong>{outcome ? 'Simulation outcome' : 'Historical exercise'}</strong>
      <b>{outcome ? 'Scenario communications site A reported unavailable' : 'TC Lam historical communications resilience exercise'}</b>
      <p>{outcome ? 'Simulated unavailable report · not a real network fault.' : 'Historical TC Lam context with clearly labelled exercise assumptions.'}</p>
    </header>
    <div className="dashboard-metrics"><span><b>{optional.scenario?.communities.length ?? '—'}</b> communities in exercise context</span><span><b>{core.facilities.features.filter((item) => item.properties.name && !item.properties.name.startsWith('Unnamed') && item.properties.kind !== 'shelter').length}</b> essential facilities</span></div>
    {optional.warnings.length > 0 && <p className="data-warning">{optional.warnings.join(' ')}</p>}
    <div className="dashboard-map-workspace">
      <MapCanvas connectivity={core.connectivity} enabledLayers={layers} facilities={core.facilities} historicalTrack={optional.historicalTrack} onSelect={setSelected} priorityCommunityId={outcome ? topPriority?.feature.properties.id : undefined} selectedFeature={selected} stage={stage} />
      <MapExplorerPanel connectivity={core.connectivity} facilities={core.facilities} layers={layers} onLayerChange={(name, value) => setLayers((currentLayers) => ({ ...currentLayers, [name]: value }))} onSelect={setSelected} />
      <section className="exercise-context">
        <span>SIMULATION · NOT LIVE</span>
        <strong>TC Lam communications resilience exercise</strong>
        <small>Stage {stages.findIndex((item) => item.id === stage) + 1} of 4 · {current.title}</small>
      </section>
      <aside className={`priority-card ${mobileActionOpen ? 'mobile-open' : ''}`}>
        <button aria-label="Close next action" className="mobile-action-close" onClick={() => setMobileActionOpen(false)} type="button">×</button>
        <span>{outcome ? 'RECOMMENDED NEXT STEP · MODELLED' : 'CURRENT EXERCISE ACTION'}</span>
        <h1>{stageAction}</h1>
        <p>{outcome ? 'Confirm network status, safe access and community need before considering communications support.' : current.copy}</p>
        {outcome && topPriority && <>
          <p className="priority-label">PRIORITY: {topPriority.feature.properties.name}</p>
          <div className="priority-context">{confidenceLabel(topPriority.record.confidence)} confidence · Verify locally</div>
        </>}
        <div className="priority-actions">
          <button onClick={() => topPriority && setSelected(topPriority.feature)} type="button">{outcome ? `Review ${topPriority?.feature.properties.name ?? 'community'} →` : 'Explore map →'}</button>
          {outcome && topPriority && <button className="why-priority" onClick={() => setPriorityExplanationOpen(true)} type="button">Why this community?</button>}
        </div>
      </aside>
      <button aria-expanded={mobileActionOpen} className="mobile-action-toggle" onClick={() => setMobileActionOpen((isOpen) => !isOpen)} type="button"><span aria-hidden="true">!</span> Next action</button>
      <ExerciseTimeline onStageChange={changeStage} stage={stage} />
      <MapLegend />
      {selected && <DetailDrawer onClose={() => setSelected(undefined)} properties={selected.properties} scenarioRecord={selected.properties.kind === 'community' ? optional.scenario?.communities.find((record) => record.community_id === selected.properties.id) : undefined} />}
      {priorityExplanationOpen && topPriority && <PriorityExplanation onClose={() => setPriorityExplanationOpen(false)} onSelectCommunity={(feature) => { setSelected(feature); setPriorityExplanationOpen(false); }} priorities={priorities} />}
    </div>
  </section>;
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
