export type Position = [longitude: number, latitude: number];

export interface GeoJsonFeature<TProperties = Record<string, unknown>> {
  type: 'Feature';
  geometry: { type: 'Point' | 'LineString'; coordinates: Position | Position[] };
  properties: TProperties;
}

export interface FeatureCollection<TProperties = Record<string, unknown>> {
  type: 'FeatureCollection';
  features: Array<GeoJsonFeature<TProperties>>;
}

export interface ConnectivityProperties {
  id: string;
  name: string;
  kind: 'community' | 'small-cell';
  provider: string;
  region: string;
  backhaul?: string | null;
  coverage?: string | null;
  population?: number | null;
  facilities?: string[];
  risk?: string | null;
  resilience?: number | null;
  reason?: string | null;
  action?: string | null;
  offlinePack?: string | null;
  confidence?: string | null;
  [key: string]: unknown;
}

export interface FacilityProperties {
  id: string;
  name: string;
  kind: 'clinic' | 'hospital' | 'school' | 'community_centre' | 'shelter';
  label: string;
  source: string;
}

export interface HistoricalTrackProperties {
  kind: 'historical-track' | 'historical-milestone';
  trackId?: string;
  name?: string;
  label?: string;
  order?: number;
  year?: number;
  category?: string;
  color?: string;
  source?: string;
}

export interface BomCycloneTrackProperties {
  stormId: string;
  name: string;
  start: string;
  end: string;
  positions: number;
  minCentralPressure?: number | null;
  maxWindSpeed?: number | null;
  source: string;
}

export type ExerciseStage =
  | '48_hours_before_simulated_impact'
  | '24_hours_before_simulated_impact'
  | '12_hours_before_simulated_impact'
  | 'simulated_impact_outcome';

export interface ExerciseCommunity {
  community_id: string;
  exposure: 'high' | 'medium_high' | 'medium' | 'low_medium';
  essential_service_priority: 'critical' | 'high' | 'medium';
  redundancy: 'fragile' | 'limited' | 'partial' | 'higher';
  access: 'highly_constrained' | 'constrained' | 'partly_constrained' | 'accessible_with_limits';
  historical_context: string;
  confidence: 'high' | 'medium' | 'low';
  recommended_resource: string;
  verify_locally: string[];
  scenario_source?: 'official_exercise' | 'indicative_public_data';
}

export interface ExerciseScenario {
  exercise_id: string;
  updated_at: string;
  notice: string;
  communities: ExerciseCommunity[];
}

export interface SourceLog {
  last_attempt?: string;
  generated_at?: string;
  counts?: Record<string, number>;
  sources?: Record<string, SourceRecord>;
}

export interface SourceRecord {
  title?: string;
  provider?: string;
  url?: string;
  status?: 'ok' | 'unavailable';
  type?: string;
  records?: number;
  error?: string;
}
