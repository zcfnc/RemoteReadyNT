import type { CommunityResilienceScenario, ConnectivityProperties, CycloneExposureData, FeatureCollection, ResilienceDimensionId, ResilienceResourceOption, ResilienceSimulationData } from '../../types/data';
import type { ExposureResult } from './exposure';

export const resilienceDimensionIds: ResilienceDimensionId[] = ['route_redundancy', 'backup_power', 'critical_service_continuity', 'alerts_and_offline', 'operational_readiness'];

export function capacityBand(score: number | undefined): 'lower' | 'middle' | 'higher' | 'unknown' {
  if (score === undefined) return 'unknown';
  if (score < 40) return 'lower';
  if (score < 70) return 'middle';
  return 'higher';
}

export function planningReviewTier(result: ExposureResult, rank: number, scenario?: CommunityResilienceScenario): { label: string; reason: string } {
  if (!scenario) return { label: 'Not assessed', reason: 'Simulated capability data is unavailable.' };
  if (result.count === 0) return { label: 'No proximity record', reason: 'No recorded path approaches within the selected filter; this does not establish zero hazard.' };
  const highFrequency = rank <= 10;
  const lowerCapacity = capacityBand(scenario.baselineScore) === 'lower';
  if (highFrequency && lowerCapacity) return { label: 'Review first', reason: 'High path proximity and lower resilience score.' };
  if (highFrequency || lowerCapacity) return { label: 'Review next', reason: highFrequency ? 'High path proximity.' : 'Lower resilience score.' };
  return { label: 'Context', reason: 'Lower path proximity and a higher resilience score.' };
}

export function calculateScenarioScore(data: ResilienceSimulationData, scenario: CommunityResilienceScenario): number | null {
  let total = 0;
  for (const key of resilienceDimensionIds) {
    const definition = data.dimensions[key];
    const value = scenario.dimensions[key];
    const state = definition?.states.find((item) => item.id === value?.state);
    if (!definition || !value || !state || state.level !== value.level || value.points !== definition.weight * state.level) return null;
    total += value.points;
  }
  return Math.round(total * 10) / 10;
}

export function simulatedResourceOutcome(data: ResilienceSimulationData, scenario: CommunityResilienceScenario, resource: ResilienceResourceOption): { scoreAfter: number; upliftPoints: number; beforeState: string; afterState: string } | null {
  const target = scenario.dimensions[resource.targetDimension];
  const states = data.dimensions[resource.targetDimension]?.states;
  const index = states?.findIndex((state) => state.id === target?.state) ?? -1;
  if (!target || !states || index < 0 || index >= states.length - 1) return null;
  if (Object.entries(resource.prerequisites).some(([key, required]) => scenario.dimensions[key as ResilienceDimensionId]?.level < required)) return null;
  const nextState = states[index + 1];
  const baseline = calculateScenarioScore(data, scenario);
  if (baseline === null) return null;
  const scoreAfter = Math.round((baseline - target.points + data.dimensions[resource.targetDimension].weight * nextState.level) * 10) / 10;
  return { scoreAfter, upliftPoints: Math.round((scoreAfter - baseline) * 10) / 10, beforeState: target.state, afterState: nextState.id };
}

export function validateResilienceSimulation(data: ResilienceSimulationData, connectivity: FeatureCollection<ConnectivityProperties>, exposure: CycloneExposureData): boolean {
  if (!data || data.schemaVersion !== 1 || data.sourceType !== 'simulation' || data.sourceBoundaries?.capabilityAndResources?.sourceType !== 'simulation') return false;
  if (resilienceDimensionIds.reduce((total, key) => total + (data.dimensions?.[key]?.weight ?? 0), 0) !== 100) return false;
  const communityIds = connectivity.features.filter((item) => item.properties.kind === 'community').map((item) => item.properties.id);
  const exposureIds = exposure.communities.map((item) => item.communityId);
  const scenarioIds = data.communities?.map((item) => item.communityId);
  const unique = (values: string[]) => new Set(values).size === values.length;
  if (!scenarioIds || !unique(communityIds) || !unique(exposureIds) || !unique(scenarioIds) || data.counts.coveragePoints !== communityIds.length || scenarioIds.length !== communityIds.length) return false;
  if (communityIds.some((id) => !scenarioIds.includes(id)) || exposureIds.length !== communityIds.length || exposureIds.some((id) => !scenarioIds.includes(id))) return false;
  const resourceIds = data.resourceCatalog?.map((item) => item.id);
  if (!resourceIds || !unique(resourceIds) || resourceIds.some((id) => !id) || data.resourceCatalog.some((item) => item.sourceType !== 'simulation' || item.costUnits <= 0 || !resilienceDimensionIds.includes(item.targetDimension))) return false;
  return data.communities.every((scenario) => {
    if (scenario.sourceType !== 'simulation' || scenario.sourcePoint.deploymentSiteConfirmed || scenario.sourcePoint.sourceType !== 'published_source') return false;
    const baseline = calculateScenarioScore(data, scenario);
    if (baseline === null || baseline !== scenario.baselineScore || baseline < 0 || baseline > 100) return false;
    const evaluations = scenario.resourceEvaluations;
    if (evaluations?.length !== resourceIds.length || !unique(evaluations.map((item) => item.resourceId))) return false;
    return data.resourceCatalog.every((resource) => {
      const evaluation = evaluations.find((item) => item.resourceId === resource.id);
      if (!evaluation || evaluation.deploymentEligible || evaluation.sourceType !== 'simulation') return false;
      const outcome = simulatedResourceOutcome(data, scenario, resource);
      return evaluation.planningEligible === Boolean(outcome)
        && (outcome ? evaluation.scoreAfter === outcome.scoreAfter && evaluation.upliftPoints === outcome.upliftPoints && evaluation.beforeState === outcome.beforeState && evaluation.afterState === outcome.afterState && evaluation.blockedBy.length === 0 : evaluation.scoreAfter === null && evaluation.upliftPoints === null && evaluation.blockedBy.length > 0);
    });
  });
}
