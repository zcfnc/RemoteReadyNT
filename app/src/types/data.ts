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

export interface CycloneEncounter {
  stormId: string;
  name: string;
  year: number;
  start: string;
  end: string;
  distanceKm: number;
}

export interface CommunityCycloneExposure {
  communityId: string;
  name: string;
  coordinates: Position;
  encounters: CycloneEncounter[];
}

export interface CycloneExposureData {
  schemaVersion: number;
  metric: 'historical_track_proximity';
  notice: string;
  availableYears: { from: number; to: number };
  catalogRadiusKm: number;
  defaultFilter: { fromYear: number; toYear: number; radiusKm: number };
  counts: { communities: number; cyclones: number; excludedOtherSystems: number };
  communities: CommunityCycloneExposure[];
}

export type ResilienceDimensionId = 'route_redundancy' | 'backup_power' | 'critical_service_continuity' | 'alerts_and_offline' | 'operational_readiness';

export interface ResilienceDimensionDefinition {
  label: string;
  weight: number;
  states: Array<{ id: string; level: number }>;
  simulationReason: string;
  sourcesReviewed: ResilienceEvidenceSource[];
}

export interface ResilienceEvidenceSource {
  name: string;
  url: string;
  date: string | null;
  file: string | null;
  limitation: string;
  recordId?: string;
}

export interface ResilienceDimensionScore {
  sourceType: 'evidence' | 'simulation';
  evidenceStatus: 'matched_published_evidence' | 'no_community_level_verified_evidence';
  evidenceSummary?: string;
  simulationReason?: string | null;
  sourcesReviewed?: ResilienceEvidenceSource[];
  state: string;
  level: number;
  points: number;
}

export interface ResilienceResourceOption {
  id: string;
  label: string;
  targetDimension: ResilienceDimensionId;
  prerequisites: Partial<Record<ResilienceDimensionId, number>>;
  costUnits: number;
  caveat: string;
  sourceType: 'simulation';
  effect: string;
}

export interface CommunityResilienceScenario {
  communityId: string;
  sourceType: 'simulation' | 'mixed' | 'evidence';
  sourcePoint: { sourceType: 'published_source'; sourceFile: string; coordinateRole: string; reviewStatus: string; reviewReference: string | null; deploymentSiteConfirmed: false };
  dimensions: Record<ResilienceDimensionId, ResilienceDimensionScore>;
  baselineScore: number;
  gapDimensions: ResilienceDimensionId[];
  resourceEvaluations: Array<{ resourceId: string; sourceType: 'simulation'; planningEligible: boolean; deploymentEligible: false; blockedBy: string[]; targetDimension: ResilienceDimensionId; beforeState: string; afterState: string | null; scoreAfter: number | null; upliftPoints: number | null }>;
}

export interface ResilienceSimulationData {
  schemaVersion: 1;
  modelVersion: string;
  sourceType: 'simulation' | 'mixed' | 'evidence';
  notice: string;
  sourceBoundaries: { communityPoints: { sourceType: 'published_source'; file: string; generatedAt: string | null; provider: string | null; upstreamRecordDate: string | null; dateCaveat: string }; cycloneProximity: { sourceType: 'published_derived'; file: string; metric: string; trackProvider: string | null; trackGeneratedAt: string | null }; capabilityAndResources: { sourceType: 'simulation' | 'mixed' | 'evidence'; modelVersion: string } };
  method: { score: string; assumptionAssignment: string; resourceEffect: string; missingActualData: string; costUnits: string };
  dimensions: Record<ResilienceDimensionId, ResilienceDimensionDefinition>;
  resourceCatalog: ResilienceResourceOption[];
  counts: { coveragePoints: number; simulatedDimensions: number; evidenceScoredDimensions: number };
  communities: CommunityResilienceScenario[];
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
