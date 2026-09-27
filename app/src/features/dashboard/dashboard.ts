import type { ConnectivityProperties, ExerciseCommunity, ExerciseStage, FeatureCollection, GeoJsonFeature } from '../../types/data';

export const stages: Array<{ id: ExerciseStage; label: string; title: string; action: string; copy: string }> = [
  { id: '48_hours_before_simulated_impact', label: '48 hours before', title: '48 hours before simulated impact', action: 'Review published location records', copy: 'Identify the seven exercise communities using the historical track and published community locations.' },
  { id: '24_hours_before_simulated_impact', label: '24 hours before', title: '24 hours before simulated impact', action: 'Verify community information', copy: 'Compare scenario exposure, communications redundancy and access assumptions for the exercise communities.' },
  { id: '12_hours_before_simulated_impact', label: '12 hours before', title: '12 hours before simulated impact', action: 'Prepare resources and offline packs', copy: 'Review simulated resources and offline information before the exercise outcome.' },
  { id: 'simulated_impact_outcome', label: 'Simulated outcome', title: 'Simulated impact outcome', action: 'Verify conditions in Galiwinku', copy: 'Confirm network status, safe access and community need before considering communications support.' },
];

const weights = {
  exposure: { high: 30, medium_high: 24, medium: 18, low_medium: 10 },
  essential: { critical: 25, high: 20, medium: 12 },
  redundancy: { fragile: 20, limited: 18, partial: 10, higher: 3 },
  access: { highly_constrained: 15, constrained: 13, partly_constrained: 9, accessible_with_limits: 4 },
  historical: { officially_documented_impact: 10, officially_documented_impact_context: 8, historical_preparedness_context: 6, historical_response_context_only: 4, not_verified_by_reviewed_sources: 0 },
  confidence: { high: 0, medium: -5, low: -10 },
} as const;

export type PriorityFactor = { id: string; title: string; score: number; maximum: number; input: string; effect: string };
export type PriorityResult = { feature: GeoJsonFeature<ConnectivityProperties>; record: ExerciseCommunity; score: number; breakdown: ReturnType<typeof priorityBreakdown> };

export function priorityBreakdown(record: ExerciseCommunity): { factors: PriorityFactor[]; confidencePenalty: number; confidenceMaximum: number } {
  const historicalScore = weights.historical[record.historical_context as keyof typeof weights.historical];
  const factors: PriorityFactor[] = [
    { id: 'exposure', title: 'Scenario exposure', score: weights.exposure[record.exposure], maximum: 30, input: record.exposure.replaceAll('_', ' '), effect: `${record.exposure.replaceAll('_', ' ')} exposure increases this community’s relative priority.` },
    { id: 'essential', title: 'Essential service dependency', score: weights.essential[record.essential_service_priority], maximum: 25, input: record.essential_service_priority, effect: `${record.essential_service_priority} service dependency increases this community’s relative priority.` },
    { id: 'redundancy', title: 'Communications redundancy shortage', score: weights.redundancy[record.redundancy], maximum: 20, input: record.redundancy, effect: `${record.redundancy} communications redundancy increases this community’s relative priority.` },
    { id: 'access', title: 'Access difficulty', score: weights.access[record.access], maximum: 15, input: record.access.replaceAll('_', ' '), effect: `${record.access.replaceAll('_', ' ')} access increases this community’s relative priority.` },
    { id: 'historical', title: 'Historical context', score: historicalScore ?? 0, maximum: 10, input: record.historical_context.replaceAll('_', ' '), effect: historicalScore === undefined ? 'This historical input is not recognised by the scoring model; no historical points are added.' : `${record.historical_context.replaceAll('_', ' ')} contributes to this community’s relative priority.` },
  ];
  return { factors, confidencePenalty: weights.confidence[record.confidence], confidenceMaximum: 10 };
}

export function priorityResults(communities: FeatureCollection<ConnectivityProperties>, records: ExerciseCommunity[]): PriorityResult[] {
  const locations = new Map(communities.features.filter((item) => item.properties.kind === 'community').map((item) => [item.properties.id, item]));
  return records.map((record) => {
    const feature = locations.get(record.community_id);
    if (!feature) return null;
    const breakdown = priorityBreakdown(record);
    const score = breakdown.factors.reduce((total, factor) => total + factor.score, 0) + breakdown.confidencePenalty;
    return { feature, record, score: Math.max(0, score), breakdown };
  }).filter((item): item is NonNullable<typeof item> => item !== null).sort((a, b) => b.score - a.score);
}
