import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DashboardPage } from './DashboardPage';
import { useDashboardData } from '../features/dashboard/useDashboardData';
import { downloadDecisionSupportReport } from '../services/decisionReport';
import type { ConnectivityProperties, CycloneExposureData, FacilityProperties, GeoJsonFeature } from '../types/data';

const testSchool: GeoJsonFeature<FacilityProperties> = { type: 'Feature', geometry: { type: 'Point', coordinates: [134.9, -12.1] }, properties: { id: 'school-1', name: 'Milingimbi School', kind: 'school', label: 'School', source: 'OpenStreetMap contributors' } };

afterEach(cleanup);

vi.mock('../features/dashboard/useDashboardData', () => ({ useDashboardData: vi.fn() }));
vi.mock('../services/decisionReport', () => ({ downloadDecisionSupportReport: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../features/dashboard/MapCanvas', () => ({
  MapCanvas: ({ selectedFeature, selectedBomTrackId, analysisMode, analysis, onSelect }: { selectedFeature?: { properties: { name: string } }; selectedBomTrackId?: string; analysisMode?: boolean; analysis?: { popupCommunityId?: string; onExportReport: (communityId: string) => void }; onSelect: (feature: GeoJsonFeature<ConnectivityProperties>) => void }) => <div data-mode={analysisMode ? 'exposure' : 'exercise'} data-selected={selectedFeature?.properties.name ?? ''} data-storm={selectedBomTrackId ?? ''} data-testid="map-canvas">{analysisMode && <button onClick={() => onSelect(milingimbi)} type="button">Select Milingimbi on map</button>}{analysis?.popupCommunityId && <button onClick={() => analysis.onExportReport(analysis.popupCommunityId!)} type="button">Export selected Situation summary</button>}</div>,
}));
vi.mock('../features/dashboard/MapExplorerPanel', () => ({ MapExplorerPanel: ({ onSelect }: { onSelect: (feature: GeoJsonFeature<ConnectivityProperties | FacilityProperties>) => void }) => <aside><button onClick={() => onSelect(testSchool)} type="button">Select test school</button><button onClick={() => onSelect(milingimbi)} type="button">Select test community</button></aside> }));

const galiwinku = { type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: [134.89, -12.02] as [number, number] }, properties: { id: 'galiwinku', name: 'Galiwinku', kind: 'community' as const, provider: 'Arnhem Fibre Program', region: 'Northern Territory' } };
const milingimbi = { type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: [134.9, -12.1] as [number, number] }, properties: { id: 'milingimbi', name: 'Milingimbi', kind: 'community' as const, provider: 'Arnhem Fibre Program', backhaul: 'Microwave radio', coverage: 'Recorded mobile coverage', population: null, facilities: [], region: 'Northern Territory' } };

const exposureData: CycloneExposureData = {
  schemaVersion: 1,
  metric: 'historical_track_proximity',
  notice: 'Historical paths only.',
  availableYears: { from: 2015, to: 2026 },
  catalogRadiusKm: 300,
  defaultFilter: { fromYear: 2015, toYear: 2026, radiusKm: 100 },
  counts: { communities: 2, cyclones: 1, excludedOtherSystems: 0 },
  communities: [
    { communityId: 'galiwinku', name: 'Galiwinku', coordinates: [134.89, -12.02], encounters: [{ stormId: 'lam', name: 'Lam', year: 2015, start: '2015-02-15', end: '2015-02-21', distanceKm: 20 }] },
    { communityId: 'milingimbi', name: 'Milingimbi', coordinates: [134.9, -12.1], encounters: [{ stormId: 'lam', name: 'Lam', year: 2015, start: '2015-02-15', end: '2015-02-21', distanceKm: 80 }] },
  ],
};

describe('DashboardPage priority action', () => {
  it('keeps the top Situation summary as an all-community report in both map views', async () => {
    vi.mocked(downloadDecisionSupportReport).mockClear();
    vi.mocked(useDashboardData).mockReturnValue({
      core: { connectivity: { type: 'FeatureCollection', features: [galiwinku, milingimbi] }, facilities: { type: 'FeatureCollection', features: [] }, sourceLog: {} },
      optional: { warnings: [], cycloneExposure: exposureData, scenario: { exercise_id: 'test', updated_at: '2026-09-25', notice: 'test', communities: [
        { community_id: 'galiwinku', exposure: 'high', essential_service_priority: 'critical', redundancy: 'limited', access: 'constrained', historical_context: 'officially_documented_impact', confidence: 'medium', recommended_resource: 'satellite_terminal', verify_locally: [] },
        { community_id: 'milingimbi', exposure: 'high', essential_service_priority: 'high', redundancy: 'limited', access: 'constrained', historical_context: 'officially_documented_impact_context', confidence: 'medium', recommended_resource: 'portable_cell', verify_locally: [] },
      ] } },
      error: undefined,
    });

    let exportReport: (() => void) | undefined;
    render(<DashboardPage onRegisterExport={(handler) => { exportReport = handler; }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cyclone path analysis' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select test community' }));
    exportReport?.();
    await waitFor(() => expect(downloadDecisionSupportReport).toHaveBeenCalledTimes(1));
    expect(downloadDecisionSupportReport).toHaveBeenNthCalledWith(1, expect.objectContaining({ selectedCommunity: undefined }));

    fireEvent.click(screen.getByRole('button', { name: 'Community analysis' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select Milingimbi on map' }));
    exportReport?.();
    await waitFor(() => expect(downloadDecisionSupportReport).toHaveBeenCalledTimes(2));
    expect(downloadDecisionSupportReport).toHaveBeenNthCalledWith(2, expect.objectContaining({ selectedCommunity: undefined }));
  });

  it('exports the popup community as a single-community Situation summary', async () => {
    vi.mocked(downloadDecisionSupportReport).mockClear();
    vi.mocked(useDashboardData).mockReturnValue({
      core: { connectivity: { type: 'FeatureCollection', features: [galiwinku, milingimbi] }, facilities: { type: 'FeatureCollection', features: [] }, sourceLog: {} },
      optional: { warnings: [], cycloneExposure: exposureData },
      error: undefined,
    });

    render(<DashboardPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Community analysis' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select Milingimbi on map' }));
    fireEvent.click(screen.getByRole('button', { name: 'Export selected Situation summary' }));

    await waitFor(() => expect(downloadDecisionSupportReport).toHaveBeenCalledWith(expect.objectContaining({
      selectedCommunity: expect.objectContaining({ id: 'milingimbi', name: 'Milingimbi' }),
    })));
  });

  it('exports the community opened in Cyclone path analysis details', async () => {
    vi.mocked(downloadDecisionSupportReport).mockClear();
    vi.mocked(useDashboardData).mockReturnValue({
      core: { connectivity: { type: 'FeatureCollection', features: [galiwinku, milingimbi] }, facilities: { type: 'FeatureCollection', features: [testSchool] }, sourceLog: {} },
      optional: { warnings: [] },
      error: undefined,
    });

    render(<DashboardPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Cyclone path analysis' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select test community' }));
    fireEvent.click(screen.getByRole('button', { name: 'Export Milingimbi Situation summary as PDF' }));
    await waitFor(() => expect(downloadDecisionSupportReport).toHaveBeenCalledWith(expect.objectContaining({
      selectedCommunity: expect.objectContaining({ id: 'milingimbi', name: 'Milingimbi' }),
    })));
    fireEvent.click(screen.getByRole('button', { name: 'Close details' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cyclone path analysis' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select test school' }));
    expect(screen.queryByRole('button', { name: /Export .* Situation summary as PDF/ })).not.toBeInTheDocument();
  });
  it('removes exercise panels while preserving the legend and community details', () => {
    vi.mocked(useDashboardData).mockReturnValue({
      core: { connectivity: { type: 'FeatureCollection', features: [galiwinku, milingimbi] }, facilities: { type: 'FeatureCollection', features: [] }, sourceLog: {} },
      optional: { historicalTrack: undefined, scenario: { exercise_id: 'test', updated_at: '2026-09-25', notice: 'test', communities: [
        { community_id: 'galiwinku', exposure: 'high', essential_service_priority: 'critical', redundancy: 'limited', access: 'constrained', historical_context: 'officially_documented_impact', confidence: 'medium', recommended_resource: 'satellite_terminal', verify_locally: ['Network service status', 'Safe air and sea access'] },
        { community_id: 'milingimbi', exposure: 'high', essential_service_priority: 'high', redundancy: 'limited', access: 'constrained', historical_context: 'officially_documented_impact_context', confidence: 'medium', recommended_resource: 'portable_cell', verify_locally: ['Network service status'] },
      ] }, warnings: [] },
      error: undefined,
    });

    render(<DashboardPage />);
    expect(screen.queryByRole('button', { name: 'How it works' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cyclone path analysis' }));
    expect(screen.queryByRole('heading', { name: /Local radio stations/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Fire danger rating' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /^Weather$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Bushfire' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Social media' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Exercise context' })).not.toBeInTheDocument();
    expect(screen.queryByText('SIMULATED EXERCISE')).not.toBeInTheDocument();
    expect(screen.queryByText('CURRENT EXERCISE ACTION')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Next action/ })).not.toBeInTheDocument();
    const legend = screen.getByLabelText('Map symbol legend');
    expect(within(legend).getByText('Published facilities')).toBeInTheDocument();
    expect(within(legend).getByText('Location; status unconfirmed')).toBeInTheDocument();
    expect(legend.parentElement).toHaveClass('dashboard-map-legend');
    const tabs = within(screen.getByLabelText('Map view')).getAllByRole('button');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Community analysis', 'Cyclone path analysis']);
    fireEvent.click(screen.getByRole('button', { name: 'Cyclone path analysis' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select test community' }));
    expect(screen.getByTestId('map-canvas')).toHaveAttribute('data-selected', 'Milingimbi');
    expect(screen.getByRole('heading', { name: 'Milingimbi' })).toBeInTheDocument();
    expect(screen.getByText('COMMUNITY DETAILS')).toBeInTheDocument();
    expect(screen.getByText('Published location record')).toBeInTheDocument();
    expect(screen.getByText('Arnhem Fibre Program')).toBeInTheDocument();
    expect(screen.getByText('Microwave radio')).toBeInTheDocument();
    expect(screen.getByText('Recorded mobile coverage')).toBeInTheDocument();
    expect(screen.getByText('Not linked')).toBeInTheDocument();
    expect(screen.getByText('officially documented impact context. This exercise label does not describe current conditions.')).toBeInTheDocument();
    expect(screen.getByText('Exercise assumption')).toBeInTheDocument();
    expect(screen.getByText('Essential-service priority')).toBeInTheDocument();
    expect(screen.getByText('No linked facility references are recorded for this community. Nearby map points are not assumed to belong to it.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close details' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows facility source details without inventing community scenario data', () => {
    vi.mocked(useDashboardData).mockReturnValue({
      core: { connectivity: { type: 'FeatureCollection', features: [galiwinku, milingimbi] }, facilities: { type: 'FeatureCollection', features: [testSchool] }, sourceLog: {} },
      optional: { warnings: [], scenario: { exercise_id: 'test', updated_at: '2026-09-25', notice: 'test', communities: [] } },
      error: undefined,
    });

    render(<DashboardPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Cyclone path analysis' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select test school' }));

    expect(screen.getByRole('heading', { name: 'Milingimbi School' })).toBeInTheDocument();
    expect(screen.getByText('ESSENTIAL FACILITY')).toBeInTheDocument();
    expect(screen.getByText('OpenStreetMap contributors')).toBeInTheDocument();
    expect(screen.getByText('No site- or facility-specific operating, capacity or communications assumption is provided.')).toBeInTheDocument();
    expect(screen.queryByText('Mapped essential-service references')).not.toBeInTheDocument();
  });

  it('shows a linked community exercise record after switching map views', () => {
    vi.mocked(useDashboardData).mockReturnValue({
      core: { connectivity: { type: 'FeatureCollection', features: [galiwinku, milingimbi] }, facilities: { type: 'FeatureCollection', features: [] }, sourceLog: {} },
      optional: { warnings: [], scenario: { exercise_id: 'test', updated_at: '2026-09-25', notice: 'test', communities: [
        { community_id: 'milingimbi', exposure: 'high', essential_service_priority: 'high', redundancy: 'limited', access: 'constrained', historical_context: 'officially_documented_impact_context', confidence: 'medium', recommended_resource: 'portable_cell', verify_locally: ['Network service status'] },
      ] } },
      error: undefined,
    });

    render(<DashboardPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Cyclone path analysis' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select test community' }));
    expect(screen.getByText('Exposure')).toBeInTheDocument();
    expect(screen.getByText('Exercise assumption')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Community analysis' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cyclone path analysis' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cyclone path analysis' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select test community' }));
    expect(screen.getByRole('heading', { name: 'Milingimbi' })).toBeInTheDocument();
    expect(screen.getByText('limited')).toBeInTheDocument();
  });

  it('links historical ranking, filters, community selection and existing map tracks', () => {
    vi.mocked(useDashboardData).mockReturnValue({
      core: { connectivity: { type: 'FeatureCollection', features: [galiwinku, milingimbi] }, facilities: { type: 'FeatureCollection', features: [] }, sourceLog: {} },
      optional: { warnings: [], cycloneExposure: exposureData },
      error: undefined,
    });

    render(<DashboardPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Community analysis' }));
    const panel = screen.getByRole('complementary', { name: 'Historical cyclone proximity analysis' });
    expect(screen.getByTestId('map-canvas')).toHaveAttribute('data-mode', 'exposure');
    expect(within(panel).getByText('2015–2026 · within 100 km · 2 points with records')).toBeInTheDocument();

    fireEvent.click(within(panel).getByRole('button', { name: /Galiwinku.*Nearest path 20 km/ }));
    expect(screen.getByTestId('map-canvas')).toHaveAttribute('data-selected', 'Galiwinku');
    fireEvent.click(within(panel).getByRole('button', { name: /Lam.*20 km/ }));
    expect(screen.getByTestId('map-canvas')).toHaveAttribute('data-storm', 'lam');
    fireEvent.click(screen.getByRole('button', { name: 'Select Milingimbi on map' }));
    expect(screen.getByTestId('map-canvas')).toHaveAttribute('data-selected', 'Milingimbi');
    expect(within(panel.querySelector('.exposure-ranking') as HTMLElement).getByRole('button', { name: /Milingimbi/ })).toHaveAttribute('aria-current', 'true');

    fireEvent.change(within(panel).getByLabelText('Proximity radius'), { target: { value: '50' } });
    expect(within(panel).getByText('2015–2026 · within 50 km · 1 point with records')).toBeInTheDocument();
    expect(screen.getByTestId('map-canvas')).toHaveAttribute('data-storm', '');
    fireEvent.click(screen.getByRole('button', { name: 'Select Milingimbi on map' }));
    expect(screen.getByTestId('map-canvas')).toHaveAttribute('data-selected', 'Milingimbi');
    expect(within(panel).getByText('No cyclone track fell within the selected range for this community.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cyclone path analysis' }));
    expect(screen.getByTestId('map-canvas')).toHaveAttribute('data-mode', 'exercise');
    expect(screen.queryByRole('complementary', { name: 'Historical cyclone proximity analysis' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Map symbol legend')).toBeInTheDocument();
    expect(screen.queryByText('CURRENT EXERCISE ACTION')).not.toBeInTheDocument();
  });
});
