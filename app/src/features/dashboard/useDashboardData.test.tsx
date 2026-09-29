import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { dataService } from '../../services/dataService';
import { useDashboardData } from './useDashboardData';

vi.mock('../../services/dataService', () => ({ dataService: { loadConnectivity: vi.fn(), loadFacilities: vi.fn(), loadSourceLog: vi.fn(), loadHistoricalTrack: vi.fn(), loadExerciseScenario: vi.fn(), loadBomCycloneTracks: vi.fn(), loadCycloneExposure: vi.fn(), loadResilienceSimulation: vi.fn() } }));

describe('useDashboardData', () => {
  it('keeps core map data available when optional exercise data fails', async () => {
    vi.mocked(dataService.loadConnectivity).mockResolvedValue({ type: 'FeatureCollection', features: [] });
    vi.mocked(dataService.loadFacilities).mockResolvedValue({ type: 'FeatureCollection', features: [] });
    vi.mocked(dataService.loadSourceLog).mockResolvedValue({});
    vi.mocked(dataService.loadHistoricalTrack).mockRejectedValue(new Error('missing'));
    vi.mocked(dataService.loadExerciseScenario).mockRejectedValue(new Error('missing'));
    vi.mocked(dataService.loadBomCycloneTracks).mockResolvedValue({ type: 'FeatureCollection', features: [] });
    vi.mocked(dataService.loadCycloneExposure).mockRejectedValue(new Error('missing'));
    vi.mocked(dataService.loadResilienceSimulation).mockRejectedValue(new Error('missing'));
    const { result } = renderHook(useDashboardData);
    await waitFor(() => expect(result.current.core).toBeDefined());
    await waitFor(() => expect(result.current.optional.warnings).toHaveLength(2));
    expect(result.current.optional.exposureError).toBeDefined();
    expect(result.current.error).toBeUndefined();
  });

  it('keeps historical proximity available when the simulation file is malformed', async () => {
    const connectivity = { type: 'FeatureCollection' as const, features: [] };
    const exposure = { schemaVersion: 1, metric: 'historical_track_proximity' as const, notice: '', availableYears: { from: 2007, to: 2026 }, catalogRadiusKm: 300, defaultFilter: { fromYear: 2007, toYear: 2026, radiusKm: 100 }, counts: { communities: 0, cyclones: 0, excludedOtherSystems: 0 }, communities: [] };
    vi.mocked(dataService.loadConnectivity).mockResolvedValue(connectivity);
    vi.mocked(dataService.loadFacilities).mockResolvedValue(connectivity);
    vi.mocked(dataService.loadSourceLog).mockResolvedValue({});
    vi.mocked(dataService.loadHistoricalTrack).mockRejectedValue(new Error('missing'));
    vi.mocked(dataService.loadExerciseScenario).mockRejectedValue(new Error('missing'));
    vi.mocked(dataService.loadBomCycloneTracks).mockResolvedValue(connectivity);
    vi.mocked(dataService.loadCycloneExposure).mockResolvedValue(exposure);
    vi.mocked(dataService.loadResilienceSimulation).mockResolvedValue({ schemaVersion: 1, sourceType: 'simulation' } as never);
    const { result } = renderHook(useDashboardData);
    await waitFor(() => expect(result.current.optional.cycloneExposure).toEqual(exposure));
    expect(result.current.optional.resilienceSimulation).toBeUndefined();
    expect(result.current.optional.resilienceError).toMatch(/unavailable or does not match/);
    expect(result.current.error).toBeUndefined();
  });
});
