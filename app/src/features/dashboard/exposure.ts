import type { CommunityCycloneExposure, CycloneEncounter, CycloneExposureData } from '../../types/data';

export type ExposureFilter = { fromYear: number; toYear: number; radiusKm: number };

export type ExposureResult = {
  community: CommunityCycloneExposure;
  encounters: CycloneEncounter[];
  count: number;
  nearestDistanceKm: number | null;
  latestYear: number | null;
};

export function exposureResults(data: CycloneExposureData, filter: ExposureFilter): ExposureResult[] {
  return data.communities.map((community) => {
    const encounters = community.encounters
      .filter((item) => item.year >= filter.fromYear && item.year <= filter.toYear && item.distanceKm <= filter.radiusKm)
      .sort((left, right) => left.distanceKm - right.distanceKm || left.stormId.localeCompare(right.stormId));
    return {
      community,
      encounters,
      count: encounters.length,
      nearestDistanceKm: encounters[0]?.distanceKm ?? null,
      latestYear: encounters.length ? Math.max(...encounters.map((item) => item.year)) : null,
    };
  }).sort((left, right) => right.count - left.count
    || (left.nearestDistanceKm ?? Infinity) - (right.nearestDistanceKm ?? Infinity)
    || left.community.name.localeCompare(right.community.name)
    || left.community.communityId.localeCompare(right.community.communityId));
}
