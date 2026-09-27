import { useEffect, useState } from 'react';
import { dataService } from '../../services/dataService';
import type { ExerciseScenario, FacilityProperties, FeatureCollection, HistoricalTrackProperties, ConnectivityProperties, SourceLog } from '../../types/data';

type CoreData = { connectivity: FeatureCollection<ConnectivityProperties>; facilities: FeatureCollection<FacilityProperties>; sourceLog: SourceLog };
type OptionalData = { historicalTrack?: FeatureCollection<HistoricalTrackProperties>; scenario?: ExerciseScenario; warnings: string[] };

export function useDashboardData() {
  const [core, setCore] = useState<CoreData>();
  const [optional, setOptional] = useState<OptionalData>({ warnings: [] });
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    void Promise.all([dataService.loadConnectivity(), dataService.loadFacilities(), dataService.loadSourceLog()])
      .then(([connectivity, facilities, sourceLog]) => active && setCore({ connectivity, facilities, sourceLog }))
      .catch(() => active && setError('Core map data could not be loaded. Check the data files and reload.'));
    void Promise.allSettled([dataService.loadHistoricalTrack(), dataService.loadExerciseScenario()]).then(([track, scenario]) => {
      if (!active) return;
      setOptional({
        historicalTrack: track.status === 'fulfilled' ? track.value : undefined,
        scenario: scenario.status === 'fulfilled' ? scenario.value : undefined,
        warnings: [track, scenario].flatMap((result, index) => result.status === 'rejected' ? [index === 0 ? 'Historical track unavailable.' : 'Exercise scenario unavailable.'] : []),
      });
    });
    return () => { active = false; };
  }, []);

  return { core, optional, error };
}
