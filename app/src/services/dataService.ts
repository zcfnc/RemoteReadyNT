import type {
  ConnectivityProperties,
  ExerciseScenario,
  FacilityProperties,
  FeatureCollection,
  HistoricalTrackProperties,
  BomCycloneTrackProperties,
  SourceLog,
} from '../types/data';

const DATA_ROOT = '/data';

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${DATA_ROOT}/${path}`);
  if (!response.ok) throw new Error(`${path} returned ${response.status}`);
  return response.json() as Promise<T>;
}

export const dataService = {
  loadConnectivity: () => fetchJson<FeatureCollection<ConnectivityProperties>>('connectivity.geojson'),
  loadFacilities: () => fetchJson<FeatureCollection<FacilityProperties>>('facilities.geojson'),
  loadSourceLog: () => fetchJson<SourceLog>('download_log.json'),
  loadHistoricalTrack: () => fetchJson<FeatureCollection<HistoricalTrackProperties>>('tc-lam-track.geojson'),
  loadBomCycloneTracks: () => fetchJson<FeatureCollection<BomCycloneTrackProperties>>('bom-tropical-cyclone-tracks.geojson'),
  loadExerciseScenario: () => fetchJson<ExerciseScenario>('lam-exercise-scenario.json'),
};
