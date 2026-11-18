import jpEventCsv from '~/data/jp/schedule/event.csv?raw';
import jpGroupCsv from '~/data/jp/schedule/groupStory.csv?raw';
import jpMainCsv from '~/data/jp/schedule/mainstory.csv?raw';
import jpMiniCsv from '~/data/jp/schedule/miniStory.csv?raw';
import jpPickupCsv from '~/data/jp/schedule/pickup.csv?raw';
import glEventCsv from '~/data/kr/schedule/event.csv?raw';
import glGroupCsv from '~/data/kr/schedule/groupStory.csv?raw';
import glMainCsv from '~/data/kr/schedule/mainstory.csv?raw';
import glMiniCsv from '~/data/kr/schedule/miniStory.csv?raw';
import glPickupCsv from '~/data/kr/schedule/pickup.csv?raw';
import { parseCsvString } from '~/utils/calender.data';
import type { EventRow, GroupRow, MainRow, MiniRow, PickupRow, Server, ServerSchedule } from '../logic/releaseDates';

function parse(main: string, group: string, mini: string, event: string, pickup: string): ServerSchedule {
  return {
    main: parseCsvString<MainRow>(main),
    group: parseCsvString<GroupRow>(group),
    mini: parseCsvString<MiniRow>(mini),
    event: parseCsvString<EventRow>(event),
    pickup: parseCsvString<PickupRow>(pickup),
  };
}

export const STORY_SCHEDULES: Record<Server, ServerSchedule> = {
  jp: parse(jpMainCsv, jpGroupCsv, jpMiniCsv, jpEventCsv, jpPickupCsv),
  gl: parse(glMainCsv, glGroupCsv, glMiniCsv, glEventCsv, glPickupCsv),
};
