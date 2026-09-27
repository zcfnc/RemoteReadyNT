import { useEffect, useState } from 'react';
import { dataService } from '../../services/dataService';
import type { FeatureCollection, FacilityProperties, SourceLog } from '../../types/data';

export function useSourceData() {
  const [sourceLog, setSourceLog] = useState<SourceLog>();
  const [facilities, setFacilities] = useState<FeatureCollection<FacilityProperties>>();
  const [optionalWarnings, setOptionalWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string>();
  useEffect(() => {
    let active = true;
    void Promise.all([dataService.loadSourceLog(), dataService.loadFacilities()]).then(([log, facilityData]) => {
      if (active) { setSourceLog(log); setFacilities(facilityData); }
    }).catch(() => active && setError('Core source data could not be loaded. Check the data files and reload.'));
    void Promise.allSettled([dataService.loadHistoricalTrack(), dataService.loadExerciseScenario()]).then((results) => {
      if (!active) return;
      setOptionalWarnings(results.flatMap((result, index) => result.status === 'rejected' ? [index === 0 ? 'Historical track data is unavailable.' : 'Exercise scenario inputs are unavailable.'] : []));
    });
    return () => { active = false; };
  }, []);
  return { sourceLog, facilities, optionalWarnings, error };
}
