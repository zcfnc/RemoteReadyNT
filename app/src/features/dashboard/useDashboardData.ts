import { useEffect, useState } from 'react';
import { dataService } from '../../services/dataService';
import type { BomCycloneTrackProperties, ExerciseCommunity, ExerciseScenario, FacilityProperties, FeatureCollection, HistoricalTrackProperties, ConnectivityProperties, SourceLog } from '../../types/data';

type CoreData = { connectivity: FeatureCollection<ConnectivityProperties>; facilities: FeatureCollection<FacilityProperties>; sourceLog: SourceLog };
type OptionalData = { historicalTrack?: FeatureCollection<HistoricalTrackProperties>; bomCycloneTracks?: FeatureCollection<BomCycloneTrackProperties>; scenario?: ExerciseScenario; warnings: string[] };

function deriveIndicativeRecords(connectivity: FeatureCollection<ConnectivityProperties>, scenario: ExerciseScenario): ExerciseScenario {
  const existing = new Set(scenario.communities.map((item) => item.community_id));
  const derived = connectivity.features
    .filter((item) => item.properties.kind === 'community' && !existing.has(item.properties.id))
    .map((item) => {
      const props = item.properties;
      const exposure = props.risk === 'High' ? 'high' : props.risk === 'Medium' ? 'medium_high' : 'medium';
      const essential_service_priority = (props.population ?? 0) >= 1000 ? 'critical' : props.facilities?.some((value) => /clinic|health|hospital/i.test(value)) ? 'high' : 'medium';
      const redundancy = props.coverage === 'Basic' ? 'fragile' : props.coverage === 'Moderate' ? 'limited' : 'partial';
      const access = props.facilities?.some((value) => /airport|airstrip/i.test(value)) ? 'partly_constrained' : 'constrained';
      const recommended_resource = redundancy === 'fragile' ? 'satellite_terminal' : redundancy === 'limited' ? 'portable_cell' : 'backup_power_kit';
      return {
        community_id: props.id,
        exposure,
        essential_service_priority,
        redundancy,
        access,
        historical_context: 'not_verified_by_reviewed_sources',
        confidence: 'low',
        recommended_resource,
        verify_locally: ['Network service status', 'Road and air access', 'Community priority needs'],
        scenario_source: 'indicative_public_data',
      } as ExerciseCommunity;
    });
  return { ...scenario, communities: [...scenario.communities.map((item) => ({ ...item, scenario_source: item.scenario_source ?? 'official_exercise' as const })), ...derived] };
}

export function useDashboardData() {
  const [core, setCore] = useState<CoreData>();
  const [optional, setOptional] = useState<OptionalData>({ warnings: [] });
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    void Promise.all([dataService.loadConnectivity(), dataService.loadFacilities(), dataService.loadSourceLog()])
      .then(([connectivity, facilities, sourceLog]) => active && setCore({ connectivity, facilities, sourceLog }))
      .catch(() => active && setError('Core map data could not be loaded. Check the data files and reload.'));
    void Promise.allSettled([dataService.loadHistoricalTrack(), dataService.loadExerciseScenario(), dataService.loadBomCycloneTracks(), dataService.loadConnectivity()]).then(([track, scenario, bomCyclones, connectivity]) => {
      if (!active) return;
      setOptional({
        historicalTrack: track.status === 'fulfilled' ? track.value : undefined,
        bomCycloneTracks: bomCyclones.status === 'fulfilled' ? bomCyclones.value : undefined,
        scenario: scenario.status === 'fulfilled' && connectivity.status === 'fulfilled' ? deriveIndicativeRecords(connectivity.value, scenario.value) : undefined,
        warnings: [track, scenario, bomCyclones].flatMap((result, index) => result.status === 'rejected' ? [index === 0 ? 'Historical track unavailable.' : index === 1 ? 'Exercise scenario unavailable.' : 'BoM cyclone database unavailable.'] : []),
      });
    });
    return () => { active = false; };
  }, []);

  return { core, optional, error };
}
