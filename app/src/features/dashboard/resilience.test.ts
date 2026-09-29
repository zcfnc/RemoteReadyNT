import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import exposureJson from '../../../public/data/community-cyclone-exposure.json';
import simulationJson from '../../../public/data/community-resilience-simulation.json';
import type { ConnectivityProperties, CycloneExposureData, FeatureCollection, ResilienceSimulationData } from '../../types/data';
import { calculateScenarioScore, capacityBand, simulatedResourceOutcome, validateResilienceSimulation } from './resilience';

const connectivity = JSON.parse(readFileSync('public/data/connectivity.geojson', 'utf8')) as FeatureCollection<ConnectivityProperties>;
const exposure = exposureJson as unknown as CycloneExposureData;
const simulation = simulationJson as unknown as ResilienceSimulationData;

describe('simulated resilience planning data', () => {
  it('covers the same points as historical proximity without claiming field verification', () => {
    expect(validateResilienceSimulation(simulation, connectivity, exposure)).toBe(true);
    expect(simulation.communities).toHaveLength(64);
    expect(simulation.communities.every((item) => item.sourcePoint.deploymentSiteConfirmed === false)).toBe(true);
  });

  it('recalculates one resource option without changing the baseline', () => {
    const bynoe = simulation.communities.find((item) => item.communityId === 'bynoe')!;
    const baseline = calculateScenarioScore(simulation, bynoe);
    const eligible = simulation.resourceCatalog.find((item) => item.id === 'critical_service_comms_kit')!;
    const blocked = simulation.resourceCatalog.find((item) => item.id === 'independent_satellite_backup')!;
    expect(baseline).toBe(72.5);
    expect(capacityBand(baseline!)).toBe('higher');
    expect(simulatedResourceOutcome(simulation, bynoe, eligible)?.scoreAfter).toBe(82.5);
    expect(simulatedResourceOutcome(simulation, bynoe, blocked)).toBeNull();
    expect(calculateScenarioScore(simulation, bynoe)).toBe(baseline);
  });

  it('rejects a scenario that presents a site as deployment-confirmed', () => {
    const changed = structuredClone(simulation);
    changed.communities[0].sourcePoint.deploymentSiteConfirmed = true as false;
    expect(validateResilienceSimulation(changed, connectivity, exposure)).toBe(false);
  });
});
