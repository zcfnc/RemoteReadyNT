import type { ConnectivityProperties, GeoJsonFeature, ResilienceSimulationData } from '../../types/data';
import type { ExposureFilter, ExposureResult } from './exposure';
import { capacityBand, planningReviewTier, resilienceDimensionIds, simulatedResourceOutcome } from './resilience';

type Props = {
  data?: ResilienceSimulationData;
  error?: string;
  filter: ExposureFilter;
  result?: ExposureResult;
  rank: number;
  feature?: GeoJsonFeature<ConnectivityProperties>;
  selectedResourceId?: string;
  onResourceSelect: (resourceId: string) => void;
};

function distanceLabel(value: number | null) {
  return value === null ? 'No record' : `${Math.round(value)} km`;
}

function pointReviewLabel(status: string) {
  return status === 'locality_name_requires_review'
    ? 'Place name needs review'
    : 'Point classification needs review';
}

function blockerLabel(value: string, data: ResilienceSimulationData) {
  return value === 'target_already_at_maximum' ? 'Already at maximum' : `${data.dimensions[value as keyof typeof data.dimensions]?.label ?? value} prerequisite not met`;
}

export function ResiliencePlanningSection({ data, error, filter, result, rank, feature, selectedResourceId, onResourceSelect }: Props) {
  const scenario = data?.communities.find((item) => item.communityId === result?.community.communityId);
  const selectedOption = data?.resourceCatalog.find((item) => item.id === selectedResourceId);
  const evaluation = scenario?.resourceEvaluations.find((item) => item.resourceId === selectedResourceId);
  const outcome = data && scenario && selectedOption ? simulatedResourceOutcome(data, scenario, selectedOption) : null;
  const review = result && scenario ? planningReviewTier(result, rank, scenario) : undefined;

  return <section aria-labelledby="resilience-section-title" className="resilience-planning-section" id="resilience-section">
    <header className="resilience-planning-header">
      <div><h2 id="resilience-section-title">Community resilience</h2><p>Historical cyclone paths and communication capability</p></div>
    </header>
    {!data && <p className="resilience-planning-state" role="status">{error ?? 'Loading resilience data…'} Historical proximity remains available above.</p>}
    {data && !result && <p className="resilience-planning-state">Select a point on the map or in the ranking to review its score and resources.</p>}
    {data && result && !scenario && <p className="resilience-planning-state" role="alert">No resilience record is available for this point.</p>}
    {data && result && scenario && <>
      <div className="resilience-selected-heading"><div><h3>{result.community.name}</h3><p>{pointReviewLabel(scenario.sourcePoint.reviewStatus)} · Installation site unconfirmed</p></div><span className={`resilience-capacity-tag ${capacityBand(scenario.baselineScore)}`}>{scenario.baselineScore.toFixed(1)} / 100</span></div>
      <div className="resilience-summary-grid">
        <article aria-label="Historical path proximity evidence" className="resilience-summary-card">
          <h4>Path history</h4>
          <p className="resilience-card-source">{filter.fromYear}–{filter.toYear} · within {filter.radiusKm} km</p>
          <div className="resilience-compact-metrics"><span><strong>{result.count}</strong>path approaches</span><span><strong>{distanceLabel(result.nearestDistanceKm)}</strong>nearest path</span></div>
          {feature && <p className="resilience-card-source">Published location record: {feature.properties.provider || 'provider not supplied'} · {feature.properties.backhaul || 'backhaul not supplied'}. These fields do not establish disaster resilience.</p>}
          <p><strong>{review?.label}</strong> · {review?.reason}</p>
        </article>
        <article aria-label="Resilience score breakdown" className="resilience-summary-card">
          <h4>Resilience score</h4>
          <p className="resilience-card-source">Score by capability dimension</p>
          <ol className="resilience-dimension-list">{resilienceDimensionIds.map((key) => {
            const definition = data.dimensions[key];
            const dimension = scenario.dimensions[key];
            return <li key={key}><div><strong>{definition.label}</strong><span>{dimension.points.toFixed(1)} / {definition.weight}</span></div><progress aria-label={`${definition.label}, ${dimension.points} of ${definition.weight}`} max={definition.weight} value={dimension.points} /></li>;
          })}</ol>
        </article>
      </div>
      <section aria-label="Resource option comparison" className="resilience-resources">
        <div className="resilience-resources-heading"><div><h4>Resource comparison</h4><p>Select one resource to compare its score impact and cost.</p></div></div>
        <div className="resilience-resource-grid">{data.resourceCatalog.map((resource) => {
          const option = scenario.resourceEvaluations.find((item) => item.resourceId === resource.id);
          const available = Boolean(option?.planningEligible);
          return <button aria-pressed={selectedResourceId === resource.id} className={`resilience-resource-option ${available ? 'eligible' : 'blocked'}`} key={resource.id} onClick={() => onResourceSelect(resource.id)} type="button"><strong>{resource.label}</strong><span>{data.dimensions[resource.targetDimension].label}</span><span>{available ? `+${option?.upliftPoints?.toFixed(1)} score` : 'Unavailable'}</span><small>{resource.costUnits} cost units · {available ? 'Compare' : 'View requirements'}</small></button>;
        })}</div>
        {selectedOption && evaluation && <article aria-label={`${selectedOption.label} comparison`} className="resilience-comparison" role="status">
          <h5>{selectedOption.label}</h5>
          {outcome && evaluation.planningEligible ? <><div className="resilience-before-after"><span><small>Current</small><strong>{scenario.baselineScore.toFixed(1)} / 100</strong></span><span aria-hidden="true">→</span><span><small>With {selectedOption.label}</small><strong>{outcome.scoreAfter.toFixed(1)} / 100</strong></span></div><p>{data.dimensions[selectedOption.targetDimension].label}: {outcome.beforeState.replaceAll('_', ' ')} → {outcome.afterState.replaceAll('_', ' ')}.</p></> : <p>Unavailable: {evaluation.blockedBy.map((item) => blockerLabel(item, data)).join('; ')}.</p>}
          <p>Prerequisites: {Object.keys(selectedOption.prerequisites).length ? Object.entries(selectedOption.prerequisites).map(([key, level]) => `${data.dimensions[key as keyof typeof data.dimensions].label} ≥ ${level}`).join('; ') : 'None in the simulation model'}.</p>
          <small>Cost: {selectedOption.costUnits} units</small>
        </article>}
      </section>
      <p className="resilience-data-boundary">Sources: NT location records · Bureau of Meteorology cyclone tracks</p>
    </>}
  </section>;
}
