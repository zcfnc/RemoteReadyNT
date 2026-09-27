import { Circle, CircleMarker, MapContainer, Marker, Polygon, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet';
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

function locationIcon(kind: 'small-cell' | 'clinic' | 'hospital' | 'school' | 'community_centre' | 'shelter', selected = false) {
  return divIcon({
    className: `location-marker-icon ${kind}${selected ? ' selected' : ''}`,
    html: '<span aria-hidden="true"></span>',
    iconSize: [16, 16],
    iconAnchor: [8, 8],
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
    <TileLayer attribution="© OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
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
      const type = item.properties.kind === 'small-cell' ? 'Mobile small cell' : 'Community';
      const tooltip = `${item.properties.name} · ${type}`;
      if (isPriority) return <Marker eventHandlers={{ click: () => onSelect(item) }} icon={priorityIcon(item.properties.name)} key={`${item.properties.kind}-${item.properties.id}`} position={pointPosition(item)} title={`Modelled priority: ${item.properties.name}`}>
        <Tooltip className="remote-node-tooltip" direction="top" offset={[0, -10]} sticky>{tooltip}</Tooltip>
      </Marker>;
      if (item.properties.kind === 'small-cell') return <Marker eventHandlers={{ click: () => onSelect(item) }} icon={locationIcon('small-cell', isSelected)} key={`${item.properties.kind}-${item.properties.id}`} position={pointPosition(item)} title={`Mobile small cell: ${item.properties.name}`}>
        <Tooltip className="remote-node-tooltip" direction="top" offset={[0, -10]} sticky>{tooltip}</Tooltip>
      </Marker>;
      return <CircleMarker center={pointPosition(item)} eventHandlers={{ click: () => onSelect(item) }} key={`${item.properties.kind}-${item.properties.id}`} pathOptions={{ color: isSelected ? '#07334e' : '#fff', fillColor: isSelected ? '#07334e' : '#78949d', fillOpacity: isSelected ? 1 : 0.78, weight: isSelected ? 3 : 1.5 }} radius={isSelected ? 7 : 4.5}>
        <Tooltip className="remote-node-tooltip" direction="top" offset={[0, -8]} sticky>{tooltip}</Tooltip>
      </CircleMarker>;
    })}
    {visibleFacilities.map((item) => <Marker eventHandlers={{ click: () => onSelect(item) }} icon={locationIcon(item.properties.kind, selectedFeature?.properties.id === item.properties.id)} key={item.properties.id} position={pointPosition(item)} title={`${item.properties.label}: ${item.properties.name}`}>
      <Tooltip className="remote-node-tooltip" direction="top" offset={[0, -10]} sticky>{item.properties.name} · {item.properties.label}</Tooltip>
    </Marker>)}
    {outcome && <Marker icon={incidentIcon()} position={[-12.095, 134.945]} title="Simulated unavailable communications site A · exercise only">
      <Tooltip className="remote-node-tooltip" direction="top" offset={[0, -10]} sticky>Communications site A · Simulated incident</Tooltip>
    </Marker>}
  </MapContainer>;
}
