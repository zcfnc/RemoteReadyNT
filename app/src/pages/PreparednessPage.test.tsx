import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PreparednessPage } from './PreparednessPage';
import { dataService } from '../services/dataService';
import { downloadDecisionSupportReport } from '../services/decisionReport';
import type { ConnectivityProperties, ExerciseScenario, FeatureCollection, ResilienceSimulationData } from '../types/data';

vi.mock('../services/dataService', () => ({ dataService: {
  loadConnectivity: vi.fn(), loadExerciseScenario: vi.fn(), loadResilienceSimulation: vi.fn(),
} }));
vi.mock('../services/decisionReport', () => ({ downloadDecisionSupportReport: vi.fn().mockResolvedValue(undefined) }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

const connectivity: FeatureCollection<ConnectivityProperties> = {
  type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [134.89, -12.02] }, properties: {
    id: 'galiwinku', name: 'Galiwinku', kind: 'community', provider: 'Test provider', region: 'Northern Territory', coverage: 'Basic', risk: 'High', facilities: [],
  } }],
};
const exercise: ExerciseScenario = { exercise_id: 'test', updated_at: '2026-09-30', notice: 'Simulation', communities: [] };

describe('Preparedness report export', () => {
  it('provides calculated priorities for the all-communities template', async () => {
    vi.mocked(dataService.loadConnectivity).mockResolvedValue(connectivity);
    vi.mocked(dataService.loadExerciseScenario).mockResolvedValue(exercise);
    vi.mocked(dataService.loadResilienceSimulation).mockResolvedValue({ communities: [] } as unknown as ResilienceSimulationData);
    render(<PreparednessPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Download decision-support report' }));
    await waitFor(() => expect(downloadDecisionSupportReport).toHaveBeenCalledWith(expect.objectContaining({
      priorities: [expect.objectContaining({ record: expect.objectContaining({ community_id: 'galiwinku', scenario_source: 'indicative_public_data' }) })],
    })));
    expect(vi.mocked(downloadDecisionSupportReport).mock.calls[0][0].selectedCommunity).toBeUndefined();
  });

  it('does not export an incomplete report when source data are unavailable', async () => {
    vi.mocked(dataService.loadConnectivity).mockRejectedValue(new Error('offline'));
    vi.mocked(dataService.loadExerciseScenario).mockResolvedValue(exercise);
    vi.mocked(dataService.loadResilienceSimulation).mockResolvedValue({ communities: [] } as unknown as ResilienceSimulationData);
    render(<PreparednessPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Download decision-support report' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Report unavailable'));
    expect(downloadDecisionSupportReport).not.toHaveBeenCalled();
  });
});
