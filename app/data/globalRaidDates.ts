import krRaidCsvRaw from '~/data/kr/schedule/raid.csv?raw';
import krEraidCsvRaw from '~/data/kr/schedule/eraid.csv?raw';
import { parseCsvString } from '~/utils/calender.data';

const DIFF_ID_GL_JP = 3;

export const getKstTime = (dateString: string, timeZoneString = '+09:00') => {
  // Convert to ISO 8601 format by replacing spaces with 'T' and appending '+09:00' for browser compatibility.
  const isoString = dateString.trim().replace(' ', 'T') + timeZoneString; //'+09:00';
  return new Date(isoString).getTime();
};

export function getCurrentGlobalraid(): string[] {
  const now = Date.now(); // Absolute timestamp of the current time

  // 1. Parse Total Assault (Raid) data
  const raids = parseCsvString<{
    season: number;
    startTime: string;
    endTime: string;
    boss: string;
    maxDifficulty: string;
    prediction?: string;
  }>(krRaidCsvRaw);

  // 2. Parse Elimination Raid (E-Raid) data
  const eRaids = parseCsvString<{
    season: number;
    startTime: string;
    endTime: string;
    boss1: string;
    boss2: string;
    boss3: string;
    difficulty1: string;
    difficulty2: string;
    difficulty3: string;
    prediction?: string;
  }>(krEraidCsvRaw);

  const upcomingEvents: { id: string; startTime: number }[] = [];

  // 3. Find the nearest Total Assault that is ongoing or scheduled
  // Filter items where endTime is in the future based on KST, and sort in ascending order
  const nextRaid = raids.filter((r) => getKstTime(r.endTime) > now).sort((a, b) => getKstTime(a.startTime) - getKstTime(b.startTime))[0];

  if (nextRaid) {
    upcomingEvents.push({
      id: `R${nextRaid.season + DIFF_ID_GL_JP}`,
      startTime: getKstTime(nextRaid.startTime),
    });
  }

  // 4. Find the nearest Elimination Raid that is ongoing or scheduled
  const nextERaid = eRaids.filter((r) => getKstTime(r.endTime) > now).sort((a, b) => getKstTime(a.startTime) - getKstTime(b.startTime))[0];

  if (nextERaid) {
    upcomingEvents.push({
      id: `E${nextERaid.season}`,
      startTime: getKstTime(nextERaid.startTime),
    });
  }

  // 5. Sort both schedules by start time (ascending) and return only the ID string array
  return upcomingEvents.sort((a, b) => a.startTime - b.startTime).map((event) => event.id);
}
