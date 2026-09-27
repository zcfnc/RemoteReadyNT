import { describe, expect, it } from 'vitest';
import { priorityResults } from './dashboard';
import type { ConnectivityProperties, ExerciseCommunity, FeatureCollection } from '../../types/data';

describe('priorityResults', () => {
  it('ranks exercise communities without claiming an impact probability', () => {
    const communities: FeatureCollection<ConnectivityProperties> = { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [135.5, -12] }, properties: { id: 'galiwinku', name: 'Galiwinku', kind: 'community', provider: 'Telstra', region: 'NT' } }] };
    const record: ExerciseCommunity = { community_id: 'galiwinku', exposure: 'high', essential_service_priority: 'critical', redundancy: 'fragile', access: 'highly_constrained', historical_context: 'context', confidence: 'medium', recommended_resource: 'satellite_terminal', verify_locally: [] };
    expect(priorityResults(communities, [record])[0]?.feature.properties.name).toBe('Galiwinku');
  });
});
