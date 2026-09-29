import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DashboardPage } from './DashboardPage';
import { useDashboardData } from '../features/dashboard/useDashboardData';
import type { ConnectivityProperties, CycloneExposureData, FacilityProperties, GeoJsonFeature } from '../types/data';

const testSchool: GeoJsonFeature<FacilityProperties> = { type: 'Feature', geometry: { type: 'Point', coordinates: [134.9, -12.1] }, properties: { id: 'school-1', name: 'Milingimbi School', kind: 'school', label: 'School', source: 'OpenStreetMap contributors' } };

afterEach(cleanup);

vi.mock('../features/dashboard/useDashboardData', () => ({ useDashboardData: vi.fn() }));
vi.mock('../features/dashboard/MapCanvas', () => ({
  MapCanvas: ({ selectedFeature, selectedBomTrackId, analysisMode, onSelect }: { selectedFeature?: { properties: { name: string } }; selectedBomTrackId?: string; analysisMode?: boolean; onSelect: (feature: GeoJsonFeature<ConnectivityProperties>) => void }) => <div data-mode={analysisMode ? 'exposure' : 'exercise'} data-selected={selectedFeature?.properties.name ?? ''} data-storm={selectedBomTrackId ?? ''} data-testid="map-canvas">{analysisMode && <button onClick={() => onSelect(milingimbi)} type="button">Select Milingimbi on map</button>}</div>,
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
  it('keeps review and priority explanation as separate actions', () => {
    vi.mocked(useDashboardData).mockReturnValue({
      core: { connectivity: { type: 'FeatureCollection', features: [galiwinku, milingimbi] }, facilities: { type: 'FeatureCollection', features: [] }, sourceLog: {} },
      optional: { historicalTrack: undefined, scenario: { exercise_id: 'test', updated_at: '2026-09-25', notice: 'test', communities: [
        { community_id: 'galiwinku', exposure: 'high', essential_service_priority: 'critical', redundancy: 'limited', access: 'constrained', historical_context: 'officially_documented_impact', confidence: 'medium', recommended_resource: 'satellite_terminal', verify_locally: ['Network service status', 'Safe air and sea access'] },
        { community_id: 'milingimbi', exposure: 'high', essential_service_priority: 'high', redundancy: 'limited', access: 'constrained', historical_context: 'officially_documented_impact_context', confidence: 'medium', recommended_resource: 'portable_cell', verify_locally: ['Network service status'] },
      ] }, warnings: [] },
      error: undefined,
    });

    render(<DashboardPage />);
    const quickActions = within(screen.getByRole('region', { name: 'Dashboard quick actions' }));
    expect(quickActions.queryByRole('button', { name: 'Cyclone track' })).not.toBeInTheDocument();
    expect(quickActions.queryByRole('button', { name: 'Data sources' })).not.toBeInTheDocument();
    expect(quickActions.queryByRole('button', { name: 'Radio and satellite' })).not.toBeInTheDocument();
    expect(quickActions.queryByRole('button', { name: 'Preparedness checklist' })).not.toBeInTheDocument();
    expect(quickActions.getByRole('button', { name: 'Offline pack' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Local radio stations/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Fire danger rating' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /^Weather$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Bushfire' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Social media' })).not.toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Exercise context' })).getByText('Stage 1 of 4 · 48 hours before')).toBeInTheDocument();
    expect(screen.getByText('CURRENT EXERCISE ACTION')).toBeInTheDocument();
    expect(screen.queryByText('Modelled recommendation')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /simulated outcome/i }));

    expect(within(screen.getByRole('region', { name: 'Exercise context' })).getByText('Stage 4 of 4 · Simulated outcome')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Verify conditions in Galiwinku' })).toBeInTheDocument();
    expect(screen.getByText('Modelled recommendation')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open assessment overview' })).toHaveTextContent('Assessment Overview');
    fireEvent.click(screen.getByRole('button', { name: 'Open assessment overview' }));
    expect(screen.getByRole('dialog', { name: 'Galiwinku' })).toBeInTheDocument();
    expect(screen.getByText('Indicative Priority Score: 91.0 / 100')).toBeInTheDocument();
    expect(screen.getByText('#1 Galiwinku')).toBeInTheDocument();
    expect(screen.getByText('Scenario exposure')).toBeInTheDocument();
    expect(screen.getByText('Historical context')).toBeInTheDocument();
    expect(screen.getByText('Confidence penalty')).toBeInTheDocument();
    const milingimbiCandidate = screen.getByRole('button', { name: /Select Milingimbi, rank 2/ });
    expect((milingimbiCandidate as HTMLButtonElement).tabIndex).toBe(0);
    fireEvent.click(milingimbiCandidate);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
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
    fireEvent.click(screen.getByRole('button', { name: 'Open assessment overview' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close priority explanation' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Review Galiwinku →' }));
    expect(screen.getByTestId('map-canvas')).toHaveAttribute('data-selected', 'Galiwinku');
    expect(screen.getByText('COMMUNITY DETAILS')).toBeInTheDocument();
    expect(screen.getByText('Network service status')).toBeInTheDocument();
  });

  it('shows facility source details without inventing community scenario data', () => {
    vi.mocked(useDashboardData).mockReturnValue({
      core: { connectivity: { type: 'FeatureCollection', features: [galiwinku, milingimbi] }, facilities: { type: 'FeatureCollection', features: [testSchool] }, sourceLog: {} },
      optional: { warnings: [], scenario: { exercise_id: 'test', updated_at: '2026-09-25', notice: 'test', communities: [] } },
      error: undefined,
    });

    render(<DashboardPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Select test school' }));

    expect(screen.getByRole('heading', { name: 'Milingimbi School' })).toBeInTheDocument();
    expect(screen.getByText('ESSENTIAL FACILITY')).toBeInTheDocument();
    expect(screen.getByText('OpenStreetMap contributors')).toBeInTheDocument();
    expect(screen.getByText('No site- or facility-specific operating, capacity or communications assumption is provided.')).toBeInTheDocument();
    expect(screen.queryByText('Mapped essential-service references')).not.toBeInTheDocument();
  });

  it('shows a linked community exercise record before the simulated outcome', () => {
    vi.mocked(useDashboardData).mockReturnValue({
      core: { connectivity: { type: 'FeatureCollection', features: [galiwinku, milingimbi] }, facilities: { type: 'FeatureCollection', features: [] }, sourceLog: {} },
      optional: { warnings: [], scenario: { exercise_id: 'test', updated_at: '2026-09-25', notice: 'test', communities: [
        { community_id: 'milingimbi', exposure: 'high', essential_service_priority: 'high', redundancy: 'limited', access: 'constrained', historical_context: 'officially_documented_impact_context', confidence: 'medium', recommended_resource: 'portable_cell', verify_locally: ['Network service status'] },
      ] } },
      error: undefined,
    });

    render(<DashboardPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Select test community' }));
    expect(screen.getByText('Exposure')).toBeInTheDocument();
    expect(screen.getByText('Exercise assumption')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /24 hours before/ }));
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

    fireEvent.change(within(panel).getByLabelText('Proximity radius'), { target: { value: '50' } });
    expect(within(panel).getByText('2015–2026 · within 50 km · 1 point with records')).toBeInTheDocument();
    expect(screen.getByTestId('map-canvas')).toHaveAttribute('data-storm', '');
    fireEvent.click(screen.getByRole('button', { name: 'Select Milingimbi on map' }));
    expect(screen.getByTestId('map-canvas')).toHaveAttribute('data-selected', 'Milingimbi');
    expect(within(panel).getByText('No cyclone track fell within the selected range for this community.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cyclone path analysis' }));
    expect(screen.getByTestId('map-canvas')).toHaveAttribute('data-mode', 'exercise');
    expect(screen.queryByRole('complementary', { name: 'Historical cyclone proximity analysis' })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /simulated outcome/i })).toBeInTheDocument();
  });
});
