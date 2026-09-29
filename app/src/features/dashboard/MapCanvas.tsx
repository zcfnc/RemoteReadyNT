import { Circle, MapContainer, Marker, Polyline, Popup, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import { divIcon } from 'leaflet';
import type { LatLngBoundsExpression, LatLngExpression } from 'leaflet';
import { useEffect, useState } from 'react';
import type { BomCycloneTrackProperties, CommunityResilienceScenario, ConnectivityProperties, ExerciseStage, FacilityProperties, FeatureCollection, GeoJsonFeature, HistoricalTrackProperties } from '../../types/data';
import type { ExposureFilter, ExposureResult } from './exposure';
import { capacityBand } from './resilience';
import 'leaflet/dist/leaflet.css';

type MapFeature = GeoJsonFeature<ConnectivityProperties | FacilityProperties>;

type MapCanvasProps = {
  connectivity: FeatureCollection<ConnectivityProperties>;
  facilities: FeatureCollection<FacilityProperties>;
  historicalTrack?: FeatureCollection<HistoricalTrackProperties>;
  bomCycloneTracks?: FeatureCollection<BomCycloneTrackProperties>;
  enabledLayers: Record<string, boolean>;
  stage: ExerciseStage;
  selectedFeature?: MapFeature;
  priorityCommunityId?: string;
  selectedTrackId?: string;
  selectedBomYear?: string;
  selectedBomTrackId?: string;
  onBomTrackSelect?: (track: GeoJsonFeature<BomCycloneTrackProperties>) => void;
  onTrackSelect?: (feature: GeoJsonFeature<HistoricalTrackProperties>) => void;
  onSelect: (feature: MapFeature) => void;
  analysisMode?: boolean;
  analysis?: { fromYear: number; toYear: number; visibleStormIds: Set<string>; relatedStormIds: Set<string>; communityCounts: Map<string, number>; simulationById: Map<string, CommunityResilienceScenario>; filter: ExposureFilter; selectedExposure?: ExposureResult; popupCommunityId?: string; onPopupClose: (communityId: string) => void; onViewRecords: () => void };
};

const ntBounds: LatLngBoundsExpression = [[-26.1, 129], [-10.8, 138.1]];
const exerciseBounds: LatLngBoundsExpression = [[-14.8, 132.4], [-10.35, 138.25]];
const outcomeBounds: LatLngBoundsExpression = [[-14.65, 132.8], [-10.45, 138.2]];
function boundsForStage(stage: ExerciseStage) {
  return stage === 'simulated_impact_outcome' ? outcomeBounds : exerciseBounds;
}

function trackStageFraction(stage: ExerciseStage) {
  if (stage === '48_hours_before_simulated_impact') return 0.25;
  if (stage === '24_hours_before_simulated_impact') return 0.5;
  if (stage === '12_hours_before_simulated_impact') return 0.75;
  return 1;
}

function dailyTrackMarkers(start: string, end: string, pointCount: number) {
  const startTime = Date.parse(start.replace(' ', 'T') + 'Z');
  const endTime = Date.parse(end.replace(' ', 'T') + 'Z');
  const durationDays = Number.isFinite(startTime) && Number.isFinite(endTime)
    ? Math.max(1, Math.ceil((endTime - startTime) / 86400000) + 1)
    : Math.max(1, pointCount);
  return Array.from({ length: Math.min(durationDays, pointCount) }, (_, dayIndex) => ({
    day: dayIndex + 1,
    pointIndex: Math.min(pointCount - 1, Math.round((dayIndex / Math.max(1, durationDays - 1)) * (pointCount - 1))),
  }));
}

function mapPadding() {
  const width = window.innerWidth;
  if (width <= 760) return { paddingTopLeft: [12, 18] as [number, number], paddingBottomRight: [12, 88] as [number, number] };
  return { paddingTopLeft: [320, 35] as [number, number], paddingBottomRight: [390, 115] as [number, number] };
}

function StageViewport({ stage, analysis }: { stage: ExerciseStage; analysis: boolean }) {
  const map = useMap();
  useEffect(() => { map.fitBounds(analysis ? ntBounds : boundsForStage(stage), { ...mapPadding(), maxZoom: 7 }); }, [map, stage, analysis]);
  return null;
}

function SelectedLocation({ feature }: { feature?: MapFeature }) {
  const map = useMap();
  useEffect(() => {
    if (!feature || feature.geometry.type !== 'Point') return;
    map.flyTo(pointPosition(feature), 9, { duration: 0.45 });
  }, [feature, map]);
  return null;
}

function MapTools({ stage, analysis }: { stage: ExerciseStage; analysis: boolean }) {
  const map = useMap();
  const locate = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(({ coords }) => map.flyTo([coords.latitude, coords.longitude], 12), () => undefined);
  };
  const toggleFullscreen = () => {
    const container = map.getContainer();
    if (document.fullscreenElement) void document.exitFullscreen?.();
    else void container.requestFullscreen?.();
  };
  return <div aria-label="Map tools" className="map-tools">
    <button aria-label="Zoom in" onClick={() => map.zoomIn()} type="button">+</button>
    <button aria-label="Zoom out" onClick={() => map.zoomOut()} type="button">−</button>
    <button aria-label="Reset map extent" onClick={() => map.fitBounds(analysis ? ntBounds : boundsForStage(stage), { ...mapPadding(), maxZoom: 7 })} type="button">⌂</button>
    <button aria-label="Show my location" onClick={locate} type="button">◎</button>
    <button aria-label="View map fullscreen" onClick={toggleFullscreen} type="button">⛶</button>
  </div>;
}

function pointPosition(feature: { geometry: { coordinates: unknown } }): LatLngExpression {
  const [longitude, latitude] = feature.geometry.coordinates as [number, number];
  return [latitude, longitude];
}

function milestoneIcon(order: number) {
  return divIcon({
    className: 'historical-milestone-icon',
    html: `<span>${order}</span>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

type LocationKind = 'community' | 'small-cell' | 'clinic' | 'hospital' | 'school' | 'community_centre' | 'shelter';

const locationGlyphs: Record<LocationKind, string> = {
  community: '<path d="M4 10.3 12 4l8 6.3v8.4a1.3 1.3 0 0 1-1.3 1.3H5.3A1.3 1.3 0 0 1 4 18.7z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M9 20v-5.2h6V20M8 10.7h8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  'small-cell': '<path d="M12 5.2v11.5M8.5 20h7M9.3 16.7h5.4M7.6 13.5h8.8M5.8 10.2h12.4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M9.5 6.5 12 3l2.5 3.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  clinic: '<path d="M5 6.5h14v12H5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 8.5v8M8 12.5h8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  hospital: '<path d="M4.5 6.5h15v12h-15zM7.5 4.5h9v2h-9z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 8.5v7M8.5 12h7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  school: '<path d="m3.5 10 8.5-5 8.5 5-8.5 5zM6 12.3v5.2h12v-5.2M9 17.5v-4.2h6v4.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M20.5 10v5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  community_centre: '<path d="M4 10h16M5.5 10v8.5M9 10v8.5M15 10v8.5M18.5 10v8.5M3.5 18.5h17M12 4l8.5 5H3.5z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M12 4V2.8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
  shelter: '<path d="m3.5 18 8.5-13 8.5 13zM12 5v13M7.5 18h9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
};

function locationIcon(kind: LocationKind, selected = false) {
  return divIcon({
    className: `semantic-marker-icon ${kind}${selected ? ' selected' : ''}`,
    html: `<span class="marker-pin" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false">${locationGlyphs[kind]}</svg></span>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

function priorityIcon(_name: string) {
  return divIcon({
    className: 'priority-community-icon',
    html: '<span class="priority-community-pin" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false">' + locationGlyphs.community + '</svg><b>!</b></span>',
    iconSize: [34, 38],
    iconAnchor: [17, 37],
  });
}

function incidentIcon() {
  return divIcon({
    className: 'scenario-incident-icon',
    html: '<span class="incident-dot">!</span><span class="incident-tag">INCIDENT · SITE A</span>',
    iconSize: [126, 34],
    iconAnchor: [12, 17],
  });
}

function exposureCommunityIcon(count: number, selected: boolean, simulatedScore?: number) {
  return divIcon({
    className: `exposure-community-icon capacity-${capacityBand(simulatedScore)} ${count > 0 ? 'has-records' : 'no-records'}${selected ? ' selected' : ''}`,
    html: `<span class="community-pin" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false">${locationGlyphs.community}</svg></span><b class="community-count" aria-hidden="true">${count}</b>`,
    iconSize: [37, 40],
    iconAnchor: [18, 39],
  });
}

function communityClusterIcon(count: number) {
  return divIcon({
    className: 'community-cluster-icon',
    html: '<span class="community-cluster-pin" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false">' + locationGlyphs.community + '</svg><b>' + count + '</b></span>',
    iconSize: [42, 42],
    iconAnchor: [21, 21],
  });
}

function CommunityExposureMarkers({ features, analysis, selectedFeature, onSelect }: { features: GeoJsonFeature<ConnectivityProperties>[]; analysis?: MapCanvasProps['analysis']; selectedFeature?: MapFeature; onSelect: (feature: MapFeature) => void }) {
  const map = useMapEvents({ zoomend: () => setZoom(map.getZoom()) });
  const [zoom, setZoom] = useState(map.getZoom());
  const selectedId = selectedFeature?.properties.kind === 'community' ? selectedFeature.properties.id : undefined;
  const groups = new Map<string, GeoJsonFeature<ConnectivityProperties>[]>();
  for (const feature of features) {
    if (feature.properties.id === selectedId) continue;
    const point = map.project(pointPosition(feature), zoom);
    const key = zoom >= 9 ? feature.properties.id : `${Math.floor(point.x / 44)}:${Math.floor(point.y / 44)}`;
    groups.set(key, [...(groups.get(key) ?? []), feature]);
  }
  if (selectedId) {
    const selected = features.find((feature) => feature.properties.id === selectedId);
    if (selected) groups.set(`selected:${selectedId}`, [selected]);
  }

  return <>{[...groups.entries()].map(([key, group]) => {
    if (group.length > 1) {
      const positions = group.map((feature) => feature.geometry.coordinates as [number, number]);
      const latitude = positions.reduce((total, position) => total + position[1], 0) / positions.length;
      const longitude = positions.reduce((total, position) => total + position[0], 0) / positions.length;
      return <Marker eventHandlers={{ click: () => map.flyTo([latitude, longitude], Math.min(zoom + 2, 10)) }} icon={communityClusterIcon(group.length)} key={`cluster-${key}`} position={[latitude, longitude]} title={`${group.length} communities · zoom in to inspect`}>
        <Tooltip className="remote-node-tooltip" direction="top">{group.length} communities · select to zoom in</Tooltip>
      </Marker>;
    }
    const feature = group[0];
    const isSelected = feature.properties.id === selectedId;
    const count = analysis?.communityCounts.get(feature.properties.id) ?? 0;
    const simulatedScore = analysis?.simulationById.get(feature.properties.id)?.baselineScore;
    return <Marker eventHandlers={{ click: () => onSelect(feature) }} icon={exposureCommunityIcon(count, isSelected, simulatedScore)} key={`exposure-${feature.properties.id}`} position={pointPosition(feature)} title={`${feature.properties.name}: ${count} historical cyclone paths; ${simulatedScore === undefined ? 'resilience score unavailable' : `resilience score ${simulatedScore}/100`}`}>
      <Tooltip className="remote-node-tooltip" direction="top" offset={[0, -10]} sticky>{feature.properties.name} · {count} path approaches · {simulatedScore === undefined ? 'score unavailable' : `resilience ${simulatedScore}/100`}</Tooltip>
    </Marker>;
  })}</>;
}

function exposureValue(value: string | null | undefined) {
  return value?.trim() || 'No data';
}

function CommunityExposurePopup({ feature, analysis }: { feature: GeoJsonFeature<ConnectivityProperties>; analysis: NonNullable<MapCanvasProps['analysis']> }) {
  const result = analysis.selectedExposure?.community.communityId === feature.properties.id ? analysis.selectedExposure : undefined;
  const simulation = analysis.simulationById.get(feature.properties.id);
  return <Popup autoPan closeOnClick={false} eventHandlers={{ remove: () => analysis.onPopupClose(feature.properties.id) }} key={feature.properties.id} keepInView maxWidth={300} minWidth={250} position={pointPosition(feature)}>
    <article aria-label={`${feature.properties.name} coverage point details`} className="exposure-popup-card">
      <span className="exposure-popup-eyebrow">COVERAGE POINT · HISTORICAL PROXIMITY</span>
      <h3>{feature.properties.name}</h3>
      <p className="exposure-popup-period">{analysis.filter.fromYear}–{analysis.filter.toYear} · within {analysis.filter.radiusKm} km</p>
      <div className="exposure-popup-metrics"><span><strong>{result?.count ?? 0}</strong>path approaches</span><span><strong>{result?.nearestDistanceKm == null ? 'No record' : `${Math.round(result.nearestDistanceKm)} km`}</strong>nearest path</span></div>
      <dl><div><dt>Provider</dt><dd>{exposureValue(feature.properties.provider)}</dd></div><div><dt>Mobile coverage</dt><dd>{exposureValue(feature.properties.coverage)}</dd></div><div><dt>Backhaul</dt><dd>{exposureValue(feature.properties.backhaul)}</dd></div><div><dt>Resilience score</dt><dd>{simulation ? `${simulation.baselineScore.toFixed(1)}/100` : 'Unavailable'}</dd></div></dl>
      {simulation && <p className="exposure-popup-review">{simulation.sourcePoint.reviewStatus === 'locality_name_requires_review' ? 'Place name requires review.' : 'Point classification requires review.'} Installation site unconfirmed.</p>}
      <button className="exposure-popup-link" onClick={analysis.onViewRecords} type="button">View score breakdown →</button>
    </article>
  </Popup>;
}

export function MapCanvas({ connectivity, facilities, historicalTrack, bomCycloneTracks, enabledLayers, stage, selectedFeature, priorityCommunityId, selectedTrackId = 'all', selectedBomYear = 'all', selectedBomTrackId = '', onBomTrackSelect, onTrackSelect, onSelect, analysisMode = false, analysis }: MapCanvasProps) {
  const outcome = stage === 'simulated_impact_outcome';
  const selectedBomTrack = bomCycloneTracks?.features.find((track) => track.properties.stormId === selectedBomTrackId);
  const selectedBomEnd = !analysisMode && selectedBomTrack?.geometry.type === 'LineString' ? selectedBomTrack.geometry.coordinates.at(-1) as [number, number] | undefined : undefined;
  const visibleFacilities = analysisMode ? [] : facilities.features.filter((item) => {
    if (item.properties.kind === 'shelter' || item.properties.name.startsWith('Unnamed')) return false;
    return enabledLayers[item.properties.kind] ?? false;
  });

  return <MapContainer bounds={ntBounds} className="leaflet-map" zoomControl={false}>
    <StageViewport analysis={analysisMode} stage={stage} />
    <SelectedLocation feature={selectedFeature} />
    <MapTools analysis={analysisMode} stage={stage} />
    {analysisMode && <div aria-label="Planning map legend" className="resilience-map-legend"><strong>MAP KEY</strong><span><i className="lower" />Lower &lt;40 <i className="middle" />Middle 40–69 <i className="higher" />Higher ≥70</span><span>Orange badge: path approaches</span><span>Grey lines: historical tracks</span><small>Grey house: score unavailable</small></div>}
    <TileLayer attribution="Tiles © Esri — Source: Esri, Garmin, FAO, NOAA, USGS, © OpenStreetMap contributors" url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}" />
    {selectedBomEnd && <Circle center={[selectedBomEnd[1], selectedBomEnd[0]]} radius={62000} pathOptions={{ color: '#d46b2c', weight: 4, dashArray: '13 10', fillColor: '#d46b2c', fillOpacity: 0.12 }} />}
    {bomCycloneTracks?.features.filter((track) => {
      const year = Number(track.properties.start.slice(0, 4));
      if (analysisMode) return Boolean(analysis && year >= analysis.fromYear && year <= analysis.toYear && analysis.visibleStormIds.has(track.properties.stormId));
      if (selectedBomYear === 'all') return year >= 2007;
      const [from, to] = selectedBomYear.split('-').map(Number);
      return year >= from && year <= to;
    }).map((track, index) => {
      if (track.geometry.type !== 'LineString') return null;
      const trackPoints = (track.geometry.coordinates as [number, number][]).map(([longitude, latitude]) => [latitude, longitude] as LatLngExpression);
      const isSelected = selectedBomTrackId === track.properties.stormId;
      const isRelated = analysis?.relatedStormIds.has(track.properties.stormId) ?? false;
      const visiblePointCount = trackPoints.length;
      const visiblePoints = trackPoints.slice(0, visiblePointCount);
      const markerIndexes = dailyTrackMarkers(track.properties.start, track.properties.end, visiblePoints.length);
      return <span key={`bom-${track.properties.stormId}-${index}`}>
        <Polyline eventHandlers={{ click: () => onBomTrackSelect?.(track) }} pathOptions={{ color: isSelected ? '#a83020' : analysisMode ? '#777f86' : '#d46b2c', weight: isSelected ? 5 : isRelated ? 2.5 : analysisMode ? 1.5 : 4, opacity: isSelected ? 0.95 : isRelated ? 0.35 : analysisMode ? 0.16 : 0.38, lineCap: 'round', lineJoin: 'round' }} positions={trackPoints}>
          <Tooltip className="remote-node-tooltip" sticky>{track.properties.name || 'Unnamed cyclone'} · {track.properties.start.slice(0, 10)}–{track.properties.end.slice(0, 10)} · BoM historical database</Tooltip>
        </Polyline>
        {isSelected && visiblePoints.length > 1 && <Polyline pathOptions={{ color: '#b84b1f', weight: 8, opacity: 0.92, lineCap: 'round', lineJoin: 'round' }} positions={visiblePoints} />}
        {isSelected && !analysisMode && markerIndexes.map(({ day, pointIndex }) => <Marker icon={milestoneIcon(day)} key={`${track.properties.stormId}-day-${day}`} position={visiblePoints[pointIndex]}>
          <Tooltip className="remote-node-tooltip" direction="top" offset={[0, -10]} sticky>{track.properties.name || 'Unnamed cyclone'} · Day {day}</Tooltip>
        </Marker>)}
      </span>;
    })}
    {!analysisMode && historicalTrack?.features.filter((feature) => feature.properties.kind === 'historical-track' && feature.geometry.type === 'LineString').map((feature) => {
      const fullTrack = (feature.geometry.coordinates as [number, number][]).map(([longitude, latitude]) => [latitude, longitude] as LatLngExpression);
      const visibleTrack = fullTrack.slice(0, Math.max(2, Math.ceil(fullTrack.length * trackStageFraction(stage))));
      return <Polyline eventHandlers={{ click: () => onTrackSelect?.(feature) }} key={feature.properties.trackId ?? feature.properties.name} pathOptions={{ color: feature.properties.color ?? '#176f91', weight: selectedTrackId === feature.properties.trackId ? 6 : 4, opacity: 0.9 }} positions={visibleTrack}>
        <Tooltip className="remote-node-tooltip" sticky>{feature.properties.name ?? 'TC Lam historical track'} · fixed exercise context</Tooltip>
      </Polyline>;
    })}
    {!analysisMode && historicalTrack?.features.filter((feature) => feature.properties.kind === 'historical-milestone' && feature.geometry.type === 'Point' && (feature.properties.order ?? 0) <= Math.ceil(trackStageFraction(stage) * 3)).map((feature) => <Marker icon={milestoneIcon(feature.properties.order ?? 0)} key={`lam-milestone-${feature.properties.order}`} position={pointPosition(feature)}>
      <Tooltip className="remote-node-tooltip" direction="top" offset={[0, -10]} sticky>{feature.properties.label ?? 'TC Lam stage'}</Tooltip>
    </Marker>)}
    {analysisMode && <CommunityExposureMarkers analysis={analysis} features={connectivity.features.filter((item) => item.properties.kind === 'community')} onSelect={onSelect} selectedFeature={selectedFeature} />}
    {!analysisMode && connectivity.features.filter((item) => enabledLayers[item.properties.kind]).map((item) => {
      const isPriority = !analysisMode && outcome && item.properties.id === priorityCommunityId;
      const isSelected = selectedFeature?.properties.id === item.properties.id;
      const type = item.properties.kind === 'small-cell' ? 'Mobile small cell' : 'Remote community';
      const tooltip = `${item.properties.name} · ${type}`;
      if (isPriority) return <Marker eventHandlers={{ click: () => onSelect(item) }} icon={priorityIcon(item.properties.name)} key={`${item.properties.kind}-${item.properties.id}`} position={pointPosition(item)} title={`Modelled priority: ${item.properties.name}`}>
        <Tooltip className="remote-node-tooltip" direction="top" offset={[0, -10]} sticky>{tooltip}</Tooltip>
      </Marker>;
      if (item.properties.kind === 'small-cell') return <Marker eventHandlers={{ click: () => onSelect(item) }} icon={locationIcon('small-cell', isSelected)} key={`${item.properties.kind}-${item.properties.id}`} position={pointPosition(item)} title={`Mobile small cell: ${item.properties.name}`}>
        <Tooltip className="remote-node-tooltip" direction="top" offset={[0, -10]} sticky>{tooltip}</Tooltip>
      </Marker>;
      return <Marker eventHandlers={{ click: () => onSelect(item) }} icon={locationIcon('community', isSelected)} key={`${item.properties.kind}-${item.properties.id}`} position={pointPosition(item)} title={`Remote community: ${item.properties.name}`}>
        <Tooltip className="remote-node-tooltip" direction="top" offset={[0, -8]} sticky>{tooltip}</Tooltip>
      </Marker>;
    })}
    {analysisMode && analysis?.popupCommunityId && (() => {
      const feature = connectivity.features.find((item) => item.properties.kind === 'community' && item.properties.id === analysis.popupCommunityId);
      return feature ? <CommunityExposurePopup analysis={analysis} feature={feature} key={feature.properties.id} /> : null;
    })()}
    {visibleFacilities.map((item) => <Marker eventHandlers={{ click: () => onSelect(item) }} icon={locationIcon(item.properties.kind, selectedFeature?.properties.id === item.properties.id)} key={item.properties.id} position={pointPosition(item)} title={`${item.properties.label}: ${item.properties.name}`}>
      <Tooltip className="remote-node-tooltip" direction="top" offset={[0, -10]} sticky>{item.properties.name} · {item.properties.label}</Tooltip>
    </Marker>)}
    {selectedBomEnd && <Marker icon={incidentIcon()} position={[selectedBomEnd[1], selectedBomEnd[0]]} title={`Simulated outcome · ${selectedBomTrack?.properties.name || 'Selected cyclone'}`}>
      <Tooltip className="remote-node-tooltip" direction="top" offset={[0, -10]} sticky>Simulated outcome · impact range centred on selected track endpoint</Tooltip>
    </Marker>}
  </MapContainer>;
}
