import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DataSourcesPage } from './DataSourcesPage';

vi.mock('../features/sources/useSourceData', () => ({
  useSourceData: () => ({
    sourceLog: { last_attempt: '2026-09-18', sources: {}, counts: {} },
    facilities: { type: 'FeatureCollection', features: [] },
    optionalWarnings: [],
    error: undefined,
  }),
}));

afterEach(cleanup);

describe('DataSourcesPage imported datasets', () => {
  it('lists the three local resilience imports with provenance and caveats', () => {
    render(<DataSourcesPage />);

    const catalogue = screen.getByRole('region', { name: 'Imported and reference datasets' });
    const importedCards = within(catalogue).getAllByText('AVAILABLE AT REFRESH');
    expect(importedCards).toHaveLength(3);

    expect(within(catalogue).getByRole('heading', { name: 'STAND Sky Muster satellite deployments' })).toBeInTheDocument();
    expect(within(catalogue).getAllByText('18 Sept 2026')).toHaveLength(3);

    expect(within(catalogue).getByRole('heading', { name: 'MNHP Stage 1 funded base stations' })).toBeInTheDocument();

    expect(within(catalogue).getByRole('heading', { name: 'MNHP Stage 2 funded base stations' })).toBeInTheDocument();
    expect(within(catalogue).queryByText('Local file')).not.toBeInTheDocument();
    expect(within(catalogue).queryByText('License')).not.toBeInTheDocument();
    const officialLinks = within(catalogue).getAllByRole('link', { name: 'Open official source →' });
    expect(officialLinks).toHaveLength(3);
    expect(officialLinks[0]).toHaveAttribute('href', expect.stringContaining('spatial.infrastructure.gov.au'));
    expect(officialLinks[1]).toHaveAttribute('href', expect.stringContaining('data.gov.au'));
  });
});
