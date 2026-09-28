import { Circle, MapContainer, Marker, Polygon, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet';
import { divIcon } from 'leaflet';
import type { LatLngBoundsExpression, LatLngExpression } from 'leaflet';
import { useEffect } from 'react';
import type { ConnectivityProperties, ExerciseStage, FacilityProperties, FeatureCollection, GeoJsonFeature, HistoricalTrackProperties } from '../../types/data';
import 'leaflet/dist/leaflet.css';

type MapFeature = GeoJsonFeature<ConnectivityProperties | FacilityProperties>;

type MapCanvasProps = {
  connectivity: FeatureCollection<ConnectivityProperties>;
  facilities: FeatureCollection<FacilityProperties>;
  historicalTrack?: FeatureCollection<HistoricalTrackProperties>;
  enabledLayers: Record<string, boolean>;
  stage: ExerciseStage;
  selectedFeature?: MapFeature;
  priorityCommunityId?: string;
  onSelect: (feature: MapFeature) => void;
};

const ntBounds: LatLngBoundsExpression = [[-26.1, 129], [-10.8, 138.1]];
const exerciseBounds: LatLngBoundsExpression = [[-14.8, 132.4], [-10.35, 138.25]];
const outcomeBounds: LatLngBoundsExpression = [[-14.65, 132.8], [-10.45, 138.2]];
// The exercise JSON has no uncertainty geometry; this illustrative outline is a
// presentation overlay around the historical track, not a forecast polygon.
const uncertaintyBounds: LatLngExpression[] = [
  [-11.15, 137.05], [-11.62, 136.25], [-12.12, 135.72], [-12.72, 134.95],
  [-13.32, 134.48], [-13.48, 133.9], [-12.82, 133.55], [-12.25, 133.95],
  [-11.82, 134.48], [-11.44, 135.25], [-10.95, 136.45], [-11.15, 137.05],
];

function boundsForStage(stage: ExerciseStage) {
  return stage === 'simulated_impact_outcome' ? outcomeBounds : exerciseBounds;
}

function mapPadding() {
  const width = window.innerWidth;
  if (width <= 760) return { paddingTopLeft: [12, 18] as [number, number], paddingBottomRight: [12, 88] as [number, number] };
  return { paddingTopLeft: [320, 35] as [number, number], paddingBottomRight: [390, 115] as [number, number] };
}

function StageViewport({ stage }: { stage: ExerciseStage }) {
  const map = useMap();
  useEffect(() => { map.fitBounds(boundsForStage(stage), { ...mapPadding(), maxZoom: 7 }); }, [map, stage]);
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

function MapTools({ stage }: { stage: ExerciseStage }) {
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
    <button aria-label="Reset map extent" onClick={() => map.fitBounds(boundsForStage(stage), { ...mapPadding(), maxZoom: 7 })} type="button">⌂</button>
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

function priorityIcon(name: string) {
  const safeName = name.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character);
  return divIcon({
    className: 'priority-community-icon',
    html: `<span class="priority-dot"></span><span class="priority-tag">PRIORITY · ${safeName}</span>`,
    iconSize: [124, 34],
    iconAnchor: [13, 34],
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

export function MapCanvas({ connectivity, facilities, historicalTrack, enabledLayers, stage, selectedFeature, priorityCommunityId, onSelect }: MapCanvasProps) {
  const outcome = stage === 'simulated_impact_outcome';
  const track = historicalTrack?.features.find((item) => item.properties.kind === 'historical-track');
  const milestones = historicalTrack?.features.filter((item) => item.properties.kind === 'historical-milestone' && item.geometry.type === 'Point') ?? [];
  const trackPoints = track?.geometry.type === 'LineString'
    ? (track.geometry.coordinates as [number, number][]).map(([longitude, latitude]) => [latitude, longitude] as LatLngExpression)
    : [];
  const visibleFacilities = facilities.features.filter((item) => {
    if (item.properties.kind === 'shelter' || item.properties.name.startsWith('Unnamed')) return false;
    return enabledLayers[item.properties.kind] ?? false;
  });

  return <MapContainer bounds={ntBounds} className="leaflet-map" zoomControl={false}>
    <StageViewport stage={stage} />
    <SelectedLocation feature={selectedFeature} />
    <MapTools stage={stage} />
    <TileLayer attribution="Tiles © Esri — Source: Esri, Garmin, FAO, NOAA, USGS, © OpenStreetMap contributors" url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}" />
    {enabledLayers.uncertainty && !outcome && <Polygon positions={uncertaintyBounds} pathOptions={{ color: '#0879a6', weight: 3, dashArray: '8 8', fillColor: '#32a4c9', fillOpacity: 0.12, lineCap: 'round', lineJoin: 'round' }} />}
    {outcome && <Circle center={[-12.095, 134.945]} radius={62000} pathOptions={{ color: '#bf3131', weight: 5, dashArray: '13 10', fillColor: '#bf3131', fillOpacity: 0.09 }} />}
    {trackPoints.length > 0 && <>
      <Polyline pathOptions={{ color: '#e8f1f4', weight: 12, opacity: 0.92, lineCap: 'round', lineJoin: 'round' }} positions={trackPoints} />
      <Polyline pathOptions={{ color: '#176f91', weight: 7, opacity: 0.96, lineCap: 'round', lineJoin: 'round' }} positions={trackPoints} />
    </>}
    {milestones.map((item) => <Marker icon={milestoneIcon(item.properties.order ?? 0)} key={`milestone-${item.properties.order}`} position={pointPosition(item)} title={`Historical stage ${item.properties.order ?? ''}`}>
      <Tooltip className="remote-node-tooltip" direction="top" offset={[0, -10]} sticky>Historical stage {item.properties.order ?? ''} · Milestone</Tooltip>
    </Marker>)}
    {connectivity.features.filter((item) => enabledLayers[item.properties.kind]).map((item) => {
      const isPriority = outcome && item.properties.id === priorityCommunityId;
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
    {visibleFacilities.map((item) => <Marker eventHandlers={{ click: () => onSelect(item) }} icon={locationIcon(item.properties.kind, selectedFeature?.properties.id === item.properties.id)} key={item.properties.id} position={pointPosition(item)} title={`${item.properties.label}: ${item.properties.name}`}>
      <Tooltip className="remote-node-tooltip" direction="top" offset={[0, -10]} sticky>{item.properties.name} · {item.properties.label}</Tooltip>
    </Marker>)}
    {outcome && <Marker icon={incidentIcon()} position={[-12.095, 134.945]} title="Simulated unavailable communications site A · exercise only">
      <Tooltip className="remote-node-tooltip" direction="top" offset={[0, -10]} sticky>Communications site A · Simulated incident</Tooltip>
    </Marker>}
  </MapContainer>;
}
