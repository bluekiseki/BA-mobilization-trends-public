// Shared loader helpers for the resource-projection pipeline (used by
// planner/resources and planner/inventory route loaders).
import { loadScheduleDataV2 } from '~/utils/calender.data.v2';

/**
 * Build-time schedule tracks the resource-projection pipeline needs, for both
 * servers. `loadScheduleDataV2` parses bundled CSV strings — no network, cheap
 * to call from a route loader.
 */
export function loadResourceProjectionSchedule() {
  const kr = loadScheduleDataV2({ server: 'kr', tracksToLoad: ['event', 'raid', 'multifloor', 'campaign', 'pickup'] });
  const jp = loadScheduleDataV2({ server: 'jp', tracksToLoad: ['event', 'raid', 'multifloor', 'campaign', 'pickup'] });
  return {
    krEvents: kr.tracks.event,
    jpEvents: jp.tracks.event,
    krRaid: kr.tracks.raid,
    jpRaid: jp.tracks.raid,
    krMultifloor: kr.tracks.multifloor,
    jpMultifloor: jp.tracks.multifloor,
    krCampaign: kr.tracks.campaign,
    jpCampaign: jp.tracks.campaign,
    krPickup: kr.tracks.pickup,
    jpPickup: jp.tracks.pickup,
  };
}
