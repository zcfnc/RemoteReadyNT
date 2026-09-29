import { useMemo, useState, type ReactNode } from 'react';
import type { ConnectivityProperties, FacilityProperties, FeatureCollection, GeoJsonFeature, HistoricalTrackProperties } from '../../types/data';

type MapFeature = GeoJsonFeature<ConnectivityProperties | FacilityProperties>;

type Props = {
  connectivity: FeatureCollection<ConnectivityProperties>;
  facilities: FeatureCollection<FacilityProperties>;
  layers: Record<string, boolean>;
  onLayerChange: (name: string, value: boolean) => void;
  onSelect: (feature: MapFeature) => void;
  historicalTracks?: GeoJsonFeature<HistoricalTrackProperties>[];
  bomCycloneCount?: number;
  bomCycloneYears?: string[];
  selectedBomYear?: string;
  onBomYearChange?: (year: string) => void;
  selectedTrackId?: string;
  onTrackChange?: (trackId: string) => void;
};

export function MapExplorerPanel({ connectivity, facilities, layers, onLayerChange, onSelect, historicalTracks = [], bomCycloneCount = 0, bomCycloneYears = [], selectedBomYear = 'all', onBomYearChange, selectedTrackId = 'all', onTrackChange }: Props) {
  const [query, setQuery] = useState('');
  const [searchMessage, setSearchMessage] = useState('');
  const [openGroups, setOpenGroups] = useState({ exercise: true, connectivity: true, services: true });
  const communities = connectivity.features.filter((item) => item.properties.kind === 'community');
  const counts = useMemo(() => {
    const displayable = facilities.features.filter((item) => item.properties.kind !== 'shelter' && item.properties.name && !item.properties.name.startsWith('Unnamed'));
    return {
      health: displayable.filter((item) => ['clinic', 'hospital'].includes(item.properties.kind)).length,
      schools: displayable.filter((item) => item.properties.kind === 'school').length,
      services: displayable.filter((item) => item.properties.kind === 'community_centre').length,
    };
  }, [facilities]);
  const toggleGroup = (group: keyof typeof openGroups) => setOpenGroups((current) => ({ ...current, [group]: !current[group] }));

  const search = (value = query) => {
    const normalised = value.trim().toLowerCase();
    if (!normalised) return setSearchMessage('Enter a community, site or facility name.');
    const match = [...connectivity.features, ...facilities.features].find((item) => item.properties.name.toLowerCase().includes(normalised));
    if (!match) return setSearchMessage(`No location found for “${value.trim()}”.`);
    setQuery(match.properties.name);
    setSearchMessage(`Showing ${match.properties.name}.`);
    onSelect(match);
  };

  return <aside className="map-explorer" aria-label="Map exploration controls">
    <p className="eyebrow">MAP EXPLORATION</p>
    <form className="map-search" onSubmit={(event) => { event.preventDefault(); search(); }}>
      <label htmlFor="map-search-input">Search communities, sites or facilities</label>
      <div>
        <input id="map-search-input" onChange={(event) => setQuery(event.target.value)} placeholder="Search Galiwinku" type="search" value={query} />
        <button aria-label="Search map" type="submit">→</button>
      </div>
      <p aria-live="polite" className="search-feedback">{searchMessage}</p>
      <div className="exercise-focus"><span>Exercise focus</span><div className="exercise-focus-actions"><button onClick={() => search('Galiwinku')} type="button">Galiwinku</button><button onClick={() => search('Milingimbi')} type="button">Milingimbi</button></div></div>
    </form>
    <LayerGroup expanded={openGroups.exercise} onToggle={() => toggleGroup('exercise')} title="Exercise context">
      {bomCycloneCount > 0 && <label className="track-filter"><span>Historical cyclone track</span><select aria-label="Select historical cyclone track period" value={selectedBomYear} onChange={(event) => onBomYearChange?.(event.target.value)}>{bomCycloneYears.map((year) => <option key={year} value={year}>{year}</option>)}</select></label>}
    </LayerGroup>
    <LayerGroup expanded={openGroups.connectivity} onToggle={() => toggleGroup('connectivity')} title="Connectivity">
      <Layer checked={layers.community} count={communities.length} label="Remote communities" onChange={(value) => onLayerChange('community', value)} />
      <Layer checked={layers['small-cell']} label="Mobile small cells" onChange={(value) => onLayerChange('small-cell', value)} />
    </LayerGroup>
    <LayerGroup expanded={openGroups.services} onToggle={() => toggleGroup('services')} title="Essential services">
      <Layer checked={layers.clinic || layers.hospital} count={counts.health} label="Clinics and hospitals" onChange={(value) => { onLayerChange('clinic', value); onLayerChange('hospital', value); }} />
      <Layer checked={layers.school} count={counts.schools} label="Schools" onChange={(value) => onLayerChange('school', value)} />
      <Layer checked={layers.community_centre} count={counts.services} label="Community centres" onChange={(value) => onLayerChange('community_centre', value)} />
    </LayerGroup>
  </aside>;
}

function LayerGroup({ children, expanded, onToggle, title }: { children: ReactNode; expanded: boolean; onToggle: () => void; title: string }) {
  return <section className="layer-group">
    <button aria-expanded={expanded} className="layer-group-toggle" onClick={onToggle} type="button"><span>{title}</span><span aria-hidden="true">⌃</span></button>
    {expanded && <div className="layer-group-content">{children}</div>}
  </section>;
}

function Layer({ checked, count, label, onChange }: { checked: boolean; count?: number; label: string; onChange: (value: boolean) => void }) {
  return <label className="layer"><input checked={checked} onChange={(event) => onChange(event.target.checked)} type="checkbox" /><span className="layer-label">{label}</span>{count !== undefined && <span className="layer-count">{count}</span>}</label>;
}
