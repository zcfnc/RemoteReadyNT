import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MapExplorerPanel } from './MapExplorerPanel';
import type { FacilityProperties, FeatureCollection } from '../../types/data';

const connectivity = { type: 'FeatureCollection' as const, features: [{ type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: [134.89, -12.02] as [number, number] }, properties: { id: 'galiwinku', name: 'Galiwinku', kind: 'community' as const, provider: 'test', region: 'Arnhem Land' } }] };
const facilities = { type: 'FeatureCollection' as const, features: [] };
const layers = { uncertainty: false, community: true, 'small-cell': false, clinic: false, hospital: false, school: false, community_centre: false };
const facilitiesWithFilteredRecords: FeatureCollection<FacilityProperties> = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', geometry: { type: 'Point', coordinates: [134.9, -12.1] }, properties: { id: 'clinic-1', name: 'Clinic', kind: 'clinic', label: 'Clinic', source: 'test' } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [134.9, -12.1] }, properties: { id: 'hospital-1', name: 'Hospital', kind: 'hospital', label: 'Hospital', source: 'test' } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [134.9, -12.1] }, properties: { id: 'unnamed-clinic', name: 'Unnamed clinic', kind: 'clinic', label: 'Clinic', source: 'test' } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [134.9, -12.1] }, properties: { id: 'school-1', name: 'School', kind: 'school', label: 'School', source: 'test' } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [134.9, -12.1] }, properties: { id: 'centre-1', name: 'Centre', kind: 'community_centre', label: 'Centre', source: 'test' } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [134.9, -12.1] }, properties: { id: 'shelter-1', name: 'Shelter', kind: 'shelter', label: 'Shelter', source: 'test' } },
  ],
};

describe('MapExplorerPanel', () => {
  it('keeps the historical track out of user controls and focuses a searched community', () => {
    const onSelect = vi.fn();
    render(<MapExplorerPanel connectivity={connectivity} facilities={facilities} layers={layers} onLayerChange={vi.fn()} onSelect={onSelect} />);

    expect(screen.queryByText('Historical TC Lam track')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Galiwinku' }));
    expect(onSelect).toHaveBeenCalledWith(connectivity.features[0]);
    expect(screen.getByText('Showing Galiwinku.')).toBeInTheDocument();
  });

  it('opens all layer groups by default and counts only displayable facilities', () => {
    const { container } = render(<MapExplorerPanel connectivity={connectivity} facilities={facilitiesWithFilteredRecords} layers={layers} onLayerChange={vi.fn()} onSelect={vi.fn()} />);
    const panel = within(container);

    expect(panel.getByRole('button', { name: 'Essential services' })).toHaveAttribute('aria-expanded', 'true');
    expect(panel.getByText('Clinics and hospitals')).toBeInTheDocument();
    expect(panel.getByText('2')).toBeInTheDocument();
    expect(panel.getByText('Schools')).toBeInTheDocument();
    expect(panel.getAllByText('1')).toHaveLength(3);
    expect(panel.getByText('Community centres')).toBeInTheDocument();
    expect(panel.getByRole('checkbox', { name: /Clinics and hospitals/ })).not.toBeChecked();
  });
});
