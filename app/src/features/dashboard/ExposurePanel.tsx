import { useState } from 'react';
import type { CycloneExposureData, ResilienceSimulationData } from '../../types/data';
import type { ExposureFilter, ExposureResult } from './exposure';
import { capacityBand } from './resilience';

type Props = {
  data?: CycloneExposureData;
  simulation?: ResilienceSimulationData;
  error?: string;
  tracksUnavailable?: boolean;
  filter: ExposureFilter;
  results: ExposureResult[];
  selectedCommunityId?: string;
  selectedStormId?: string;
  onFilterChange: (filter: ExposureFilter) => void;
  onCommunitySelect: (communityId: string) => void;
  onStormSelect: (stormId: string) => void;
};

function distanceLabel(distance: number | null) {
  return distance === null ? '—' : `${Math.round(distance)} km`;
}

export function ExposurePanel({ data, error, simulation, tracksUnavailable = false, filter, results, selectedCommunityId, selectedStormId, onFilterChange, onCommunitySelect, onStormSelect }: Props) {
  const [showAll, setShowAll] = useState(false);
  const selected = results.find((item) => item.community.communityId === selectedCommunityId);
  const selectedRank = selected ? results.indexOf(selected) + 1 : 0;
  const ranked = results.filter((item) => item.count > 0);
  const displayed = showAll ? results : [
    ...ranked.slice(0, 10),
    ...(selected && selectedRank > 10 ? [selected] : []),
  ];
  const years = data ? Array.from({ length: data.availableYears.to - data.availableYears.from + 1 }, (_, index) => data.availableYears.from + index) : [];
  const radii = [50, 100, 150, 200, 300].filter((radius) => radius <= (data?.catalogRadiusKm ?? 300));

  return <aside className="exposure-panel" aria-label="Historical cyclone proximity analysis">
    <header className="exposure-panel-header"><span>HISTORICAL ANALYSIS</span></header>
    {!data && !error && <p className="exposure-state" role="status">Loading historical proximity data…</p>}
    {error && <p className="exposure-state exposure-error" role="alert">{error} Check the data file and reload.</p>}
    {data && <>
      <div className="exposure-controls">
        <div className="exposure-year-controls">
          <label>From year<select aria-label="Proximity from year" value={filter.fromYear} onChange={(event) => onFilterChange({ ...filter, fromYear: Math.min(Number(event.target.value), filter.toYear) })}>{years.map((year) => <option key={year} value={year}>{year}</option>)}</select></label>
          <label>To year<select aria-label="Proximity to year" value={filter.toYear} onChange={(event) => onFilterChange({ ...filter, toYear: Math.max(Number(event.target.value), filter.fromYear) })}>{years.map((year) => <option key={year} value={year}>{year}</option>)}</select></label>
        </div>
        <label>Path distance<select aria-label="Proximity radius" value={filter.radiusKm} onChange={(event) => onFilterChange({ ...filter, radiusKm: Number(event.target.value) })}>{radii.map((radius) => <option key={radius} value={radius}>Within {radius} km</option>)}</select></label>
        <p className="exposure-filter-summary">{filter.fromYear}–{filter.toYear} · within {filter.radiusKm} km · {ranked.length} {ranked.length === 1 ? 'point' : 'points'} with records</p>
        <p className="exposure-method-summary">Each cyclone counts once per coverage point. Pin badges show path approaches; pin colour shows resilience score.</p>
      </div>
      {tracksUnavailable && <p className="exposure-track-warning" role="status">Ranking is available, but historical map tracks could not be loaded.</p>}
      <div className="exposure-ranking">
        <div className="exposure-section-heading"><h4>Most approached points</h4><span>{showAll ? `All ${results.length}` : 'Top 10'}</span></div>
        {ranked.length === 0 ? <p className="exposure-empty">No paths fall within this range. Try a wider radius or more years.</p> : <ol aria-label="Coverage point historical proximity ranking">{displayed.map((item) => {
          const rank = results.indexOf(item) + 1;
          const scenario = simulation?.communities.find((entry) => entry.communityId === item.community.communityId);
          const scoreBand = capacityBand(scenario?.baselineScore);
          const scoreDescription = scoreBand === 'lower' ? 'Early planning capability' : scoreBand === 'middle' ? 'Developing planning capability' : scoreBand === 'higher' ? 'Strong planning capability' : 'Planning score unavailable';
          return <li key={item.community.communityId}><button aria-current={selectedCommunityId === item.community.communityId ? 'true' : undefined} onClick={() => onCommunitySelect(item.community.communityId)} type="button"><span className="exposure-rank">{rank}</span><span className="exposure-community-name">{item.community.name}<small>Nearest path {distanceLabel(item.nearestDistanceKm)}</small>{scenario && <small>Resilience <span aria-label={`${scoreDescription}, ${scenario.baselineScore.toFixed(1)} out of 100`} className={`exposure-resilience-score ${scoreBand}`} title={scoreDescription}>{scenario.baselineScore.toFixed(1)} / 100</span></small>}</span><strong>{item.count}<small>cyclones</small></strong></button></li>;
        })}</ol>}
        {results.length > 10 && <button className="exposure-show-all" onClick={() => setShowAll((value) => !value)} type="button">{showAll ? 'Show top 10' : `View all ${results.length} communities`}</button>}
      </div>
      <div className="exposure-detail" id="exposure-detail" aria-live="polite">
        {selected ? <>
          <div className="exposure-section-heading"><h4>{selected.community.name}</h4><span>Rank #{selectedRank}</span></div>
          <div className="exposure-detail-metrics"><span><strong>{selected.count}</strong>path approaches</span><span><strong>{distanceLabel(selected.nearestDistanceKm)}</strong>nearest path</span><span><strong>{selected.latestYear ?? '—'}</strong>latest storm start</span></div>
          {selected.encounters.length ? <><p className="exposure-detail-note">Select a cyclone to highlight its existing map track. Distances use the complete recorded path.</p><ul aria-label={`Cyclones near ${selected.community.name}`}>{selected.encounters.map((item) => <li key={item.stormId}><button aria-pressed={selectedStormId === item.stormId} onClick={() => onStormSelect(item.stormId)} type="button"><span><strong>{item.name}</strong><small>{item.year} · {item.stormId}</small></span><b>{distanceLabel(item.distanceKm)}</b></button></li>)}</ul></> : <p className="exposure-empty">No cyclone track fell within the selected range for this community.</p>}
        </> : <p className="exposure-empty">Select a community in the ranking or on the map to inspect its cyclone records.</p>}
      </div>
    </>}
  </aside>;
}
