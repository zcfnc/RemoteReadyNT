import { useEffect, useRef, useState, type CSSProperties } from 'react';
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

function useAnimatedNumber(target: number, duration = 800, delay = 0) {
  const reducedMotionQuery = '(prefers-reduced-motion: reduce)';
  const [reducedMotion, setReducedMotion] = useState(() => typeof window !== 'undefined' && window.matchMedia?.(reducedMotionQuery).matches);
  const [value, setValue] = useState(() => reducedMotion ? target : 0);
  const valueRef = useRef(value);

  useEffect(() => {
    const media = window.matchMedia?.(reducedMotionQuery);
    if (!media) return;
    const updatePreference = () => setReducedMotion(media.matches);
    updatePreference();
    media.addEventListener?.('change', updatePreference);
    return () => media.removeEventListener?.('change', updatePreference);
  }, []);

  useEffect(() => {
    if (reducedMotion) {
      valueRef.current = target;
      setValue(target);
      return;
    }

    const startValue = valueRef.current;
    let frame = 0;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - progress) ** 3;
      const next = startValue + (target - startValue) * eased;
      valueRef.current = next;
      setValue(next);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    const begin = () => { frame = requestAnimationFrame(tick); };
    timeout = delay ? setTimeout(begin, delay) : undefined;
    if (!delay) begin();

    return () => {
      cancelAnimationFrame(frame);
      if (timeout) clearTimeout(timeout);
    };
  }, [delay, duration, reducedMotion, target]);

  return value;
}

function AnimatedDimension({ label, points, weight, delay }: { label: string; points: number; weight: number; delay: number }) {
  const animatedPoints = useAnimatedNumber(points, 720, delay);
  const displayedPoints = Math.max(0, Math.min(weight, animatedPoints));
  const percentage = Math.min(100, Math.max(0, displayedPoints / weight * 100));
  return <div className="resilience-dimension-content"><div><strong>{label}</strong><span>{displayedPoints.toFixed(1)} / {weight}</span></div><div aria-label={`${label}, ${points} of ${weight}`} aria-valuemax={weight} aria-valuemin={0} aria-valuenow={points} className="resilience-dimension-track" role="progressbar"><span style={{ width: `${percentage}%` }}/></div></div>;
}

function AnimatedScore({ value, duration = 800 }: { value: number; duration?: number }) {
  return <>{useAnimatedNumber(value, duration).toFixed(1)}</>;
}

function AnimatedUplift({ value }: { value?: number }) {
  const animatedValue = useAnimatedNumber(value ?? 0, 550);
  return <span className="resilience-resource-status resilience-uplift">+{animatedValue.toFixed(1)} score</span>;
}

function CapabilityIcon({ name }: { name: string }) {
  const glyphs: Record<string, string> = {
    cyclone: '<path d="M12 3c-4 0-6 4-3 6 2 1 4-1 3-3-1-1-3 0-2 2m5-4c5 2 5 7 1 8-2 0-3-2-1-3 1-1 3 1 2 2m-11 4c2-4 7-3 7 1 0 2-3 3-4 1-1-2 1-3 3-2m5 4c-4 2-8 0-7-4"/>',
    location: '<path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
    record: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 7h6M9 11h6m-6 4h4"/>',
    route_redundancy: '<path d="M12 3 4 7v5c0 5 3.4 8 8 9 4.6-1 8-4 8-9V7l-8-4Z"/><path d="M8 12h8M12 8v8"/>',
    backup_power: '<rect x="4" y="7" width="16" height="11" rx="2"/><path d="M9 7V5h6v2m-3 3-2 3h3l-1 3 3-4h-3l1-2"/>',
    critical_service_continuity: '<path d="M12 3 4 6v5c0 5 3.4 8 8 10 4.6-2 8-5 8-10V6l-8-3Z"/><path d="M8 12h8m-4-4v8"/>',
    alerts_and_offline: '<path d="M4 10v4h3l8 4V6l-8 4H4Zm11-1a4 4 0 0 1 0 6m2-9a7 7 0 0 1 0 12"/>',
    operational_readiness: '<path d="m14 6 4-3 3 3-3 4-3-1-7 7-1 3-3 1 1-4 7-7-1-3Z"/>',
    independent_satellite_backup: '<path d="m4 20 7-7m-5-1 6-6 5 5-6 6m1-10 3-3 5 5-3 3M3 21h18"/>',
  };
  return <span className="resilience-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: glyphs[name] ?? glyphs.critical_service_continuity }} /></span>;
}

export function ResiliencePlanningSection({ data, error, filter, result, rank, feature, selectedResourceId, onResourceSelect }: Props) {
  const scenario = data?.communities.find((item) => item.communityId === result?.community.communityId);
  const selectedOption = data?.resourceCatalog.find((item) => item.id === selectedResourceId);
  const evaluation = scenario?.resourceEvaluations.find((item) => item.resourceId === selectedResourceId);
  const outcome = data && scenario && selectedOption ? simulatedResourceOutcome(data, scenario, selectedOption) : null;
  const review = result && scenario ? planningReviewTier(result, rank, scenario) : undefined;
  const animatedBaseline = useAnimatedNumber(scenario?.baselineScore ?? 0);

  return <section aria-labelledby="resilience-section-title" className="resilience-planning-section" id="resilience-section">
    <header className="resilience-planning-header">
      <div><h2 id="resilience-section-title">Community resilience</h2><p>Historical cyclone paths and communication capability</p></div>
    </header>
    {!data && <p className="resilience-planning-state" role="status">{error ?? 'Loading resilience data…'} Historical proximity remains available above.</p>}
    {data && !result && <p className="resilience-planning-state">Select a point on the map or in the ranking to review its score and resources.</p>}
    {data && result && !scenario && <p className="resilience-planning-state" role="alert">No resilience record is available for this point.</p>}
    {data && result && scenario && <>
      <div className="resilience-selected-heading"><div><h3>{result.community.name}</h3><p>{pointReviewLabel(scenario.sourcePoint.reviewStatus)} · Installation site unconfirmed</p></div><span className={`resilience-capacity-tag ${capacityBand(scenario.baselineScore)}`}>{animatedBaseline.toFixed(1)} / 100</span></div>
      <div className="resilience-summary-grid">
        <article aria-label="Historical path proximity evidence" className="resilience-summary-card">
          <h4>Path history</h4>
          <p className="resilience-card-source">{filter.fromYear}–{filter.toYear} · within {filter.radiusKm} km</p>
          <div className="resilience-compact-metrics"><span><CapabilityIcon name="cyclone"/><strong>{result.count}</strong>path approaches</span><span><CapabilityIcon name="location"/><strong>{distanceLabel(result.nearestDistanceKm)}</strong>nearest path</span></div>
          {feature && <p className="resilience-card-source resilience-published-record"><CapabilityIcon name="record"/><span>Published location record: {feature.properties.provider || 'provider not supplied'} · {feature.properties.backhaul || 'backhaul not supplied'}</span></p>}
          <p className="resilience-review-next"><strong>{review?.label}</strong><span> · {review?.reason}</span></p>
        </article>
        <article aria-label="Resilience score breakdown" className="resilience-summary-card">
          <div className="resilience-score-heading"><div><h4>Resilience score</h4>
          <p className="resilience-card-source">Score by capability dimension</p>
          </div><div className={`resilience-score-ring ${capacityBand(scenario.baselineScore)}`} style={{ '--score-pct': `${animatedBaseline}%` } as CSSProperties} aria-label={`Total score ${scenario.baselineScore.toFixed(1)} out of 100`}><span><strong>{animatedBaseline.toFixed(1)}</strong><small>/ 100</small></span></div></div>
          <ol className="resilience-dimension-list">{resilienceDimensionIds.map((key, index) => {
            const definition = data.dimensions[key];
            const dimension = scenario.dimensions[key];
            return <li key={`${scenario.communityId}-${key}`}><CapabilityIcon name={key}/><AnimatedDimension delay={index * 90} label={definition.label} points={dimension.points} weight={definition.weight}/></li>;
          })}</ol>
        </article>
      </div>
      <section aria-label="Resource option comparison" className="resilience-resources">
        <div className="resilience-resources-heading"><div><h4>Resource comparison</h4><p>Select one resource to compare its score impact and cost.</p></div></div>
        <div className="resilience-resource-grid">{data.resourceCatalog.map((resource) => {
          const option = scenario.resourceEvaluations.find((item) => item.resourceId === resource.id);
          const available = Boolean(option?.planningEligible);
          return <button aria-pressed={selectedResourceId === resource.id} className={`resilience-resource-option ${available ? 'eligible' : 'blocked'}`} key={resource.id} onClick={() => onResourceSelect(resource.id)} type="button"><CapabilityIcon name={resource.id === 'independent_satellite_backup' ? resource.id : resource.targetDimension}/><strong>{resource.label}</strong>{available ? <AnimatedUplift value={option?.upliftPoints ?? undefined}/> : <span className="resilience-resource-status">Unavailable</span>}<span className="resilience-resource-cost">{resource.costUnits} cost {resource.costUnits === 1 ? 'unit' : 'units'}</span><small>{available ? 'Compare' : 'View requirements'} <b aria-hidden="true">→</b></small></button>;
        })}</div>
        {selectedOption && evaluation && <article aria-label={`${selectedOption.label} comparison`} className="resilience-comparison" role="status">
          <h5>{selectedOption.label}</h5>
          {outcome && evaluation.planningEligible ? <><div className="resilience-before-after"><span><small>Current</small><strong><AnimatedScore value={scenario.baselineScore}/> / 100</strong></span><span aria-hidden="true">→</span><span><small>With {selectedOption.label}</small><strong><AnimatedScore value={outcome.scoreAfter}/> / 100</strong></span></div><p>{data.dimensions[selectedOption.targetDimension].label}: {outcome.beforeState.replaceAll('_', ' ')} → {outcome.afterState.replaceAll('_', ' ')}.</p></> : <p>Unavailable: {evaluation.blockedBy.map((item) => blockerLabel(item, data)).join('; ')}.</p>}
          <p>Prerequisites: {Object.keys(selectedOption.prerequisites).length ? Object.entries(selectedOption.prerequisites).map(([key, level]) => `${data.dimensions[key as keyof typeof data.dimensions].label} ≥ ${level}`).join('; ') : 'None in the simulation model'}.</p>
          <small>Cost: {selectedOption.costUnits} units</small>
        </article>}
      </section>
      <p className="resilience-data-boundary">Sources: NT location records · Bureau of Meteorology cyclone tracks</p>
    </>}
  </section>;
}
