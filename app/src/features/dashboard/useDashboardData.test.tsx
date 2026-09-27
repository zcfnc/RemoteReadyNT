import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { dataService } from '../../services/dataService';
import { useDashboardData } from './useDashboardData';

vi.mock('../../services/dataService', () => ({ dataService: { loadConnectivity: vi.fn(), loadFacilities: vi.fn(), loadSourceLog: vi.fn(), loadHistoricalTrack: vi.fn(), loadExerciseScenario: vi.fn() } }));

describe('useDashboardData', () => {
  it('keeps core map data available when optional exercise data fails', async () => {
    vi.mocked(dataService.loadConnectivity).mockResolvedValue({ type: 'FeatureCollection', features: [] });
    vi.mocked(dataService.loadFacilities).mockResolvedValue({ type: 'FeatureCollection', features: [] });
    vi.mocked(dataService.loadSourceLog).mockResolvedValue({});
    vi.mocked(dataService.loadHistoricalTrack).mockRejectedValue(new Error('missing'));
    vi.mocked(dataService.loadExerciseScenario).mockRejectedValue(new Error('missing'));
    const { result } = renderHook(useDashboardData);
    await waitFor(() => expect(result.current.core).toBeDefined());
    await waitFor(() => expect(result.current.optional.warnings).toHaveLength(2));
    expect(result.current.error).toBeUndefined();
  });
});
