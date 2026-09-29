import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { readFileSync } from 'node:fs';
import exposureJson from '../../../public/data/community-cyclone-exposure.json';
import simulationJson from '../../../public/data/community-resilience-simulation.json';
import type { ConnectivityProperties, CycloneExposureData, FeatureCollection, ResilienceSimulationData } from '../../types/data';
import { ResiliencePlanningSection } from './ResiliencePlanningSection';
import { exposureResults } from './exposure';
import { calculateScenarioScore, capacityBand, simulatedResourceOutcome, validateResilienceSimulation } from './resilience';

const connectivity = JSON.parse(readFileSync('public/data/connectivity.geojson', 'utf8')) as FeatureCollection<ConnectivityProperties>;
const exposure = exposureJson as unknown as CycloneExposureData;
const simulation = simulationJson as unknown as ResilienceSimulationData;

describe('simulated resilience planning data', () => {
  it('covers the same points as historical proximity without claiming field verification', () => {
    expect(validateResilienceSimulation(simulation, connectivity, exposure)).toBe(true);
    expect(simulation.communities).toHaveLength(64);
    expect(simulation.communities.every((item) => item.sourcePoint.deploymentSiteConfirmed === false)).toBe(true);
    expect(simulation.counts.simulatedDimensions).toBe(287);
    expect(simulation.counts.evidenceScoredDimensions).toBe(33);
    expect(simulation.sourceType).toBe('mixed');
    expect(simulation.communities.find((item) => item.communityId === 'galiwinku')?.dimensions.route_redundancy.evidenceStatus).toBe('matched_published_evidence');
    expect(simulation.communities.find((item) => item.communityId === 'minjilang')?.dimensions.backup_power.evidenceStatus).toBe('matched_published_evidence');
    expect(Object.values(simulation.dimensions).every((dimension) => dimension.simulationReason && dimension.sourcesReviewed.length > 0)).toBe(true);
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

  it('shows source-supported states and concise explanations without website links', () => {
    const filter = exposure.defaultFilter;
    const result = exposureResults(exposure, filter).find((item) => item.community.communityId === 'galiwinku')!;
    const feature = connectivity.features.find((item) => item.properties.id === result.community.communityId)!;
    render(createElement(ResiliencePlanningSection, { data: simulation, filter, result, rank: 1, feature, onResourceSelect: () => undefined }));

    expect(screen.getAllByText('Simulated')).toHaveLength(4);
    expect(screen.getAllByText('Source data')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'More about Backup communication route' }));
    expect(screen.getByText(/Shepherdson College is listed for public access 0.5 km/i)).toBeInTheDocument();
    expect(screen.getByText(/not been independently verified in the field/i)).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('button', { name: 'More about Backup communication route' }), { key: 'Escape' });
    expect(screen.getByRole('button', { name: 'More about Backup communication route' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('synchronizes the selected resource preview with the score and affected dimension', () => {
    const filter = exposure.defaultFilter;
    const result = exposureResults(exposure, filter).find((item) => item.community.communityId === 'bynoe')!;
    const feature = connectivity.features.find((item) => item.properties.id === 'bynoe')!;
    render(createElement(ResiliencePlanningSection, {
      data: simulation,
      filter,
      result,
      rank: 1,
      feature,
      selectedResourceId: 'critical_service_comms_kit',
      onResourceSelect: () => undefined,
    }));

    expect(screen.getByLabelText('Simulated scenario score 82.5 out of 100')).toBeInTheDocument();
    expect(screen.getByText('Simulated preview · Critical-service comms kit')).toBeInTheDocument();
    expect(screen.getByText('Simulated preview')).toBeInTheDocument();
    expect(screen.getByText('Critical service communications plan: partial plan → tested plan. This is a modelled change, not a guaranteed outcome.')).toBeInTheDocument();
  });
});
