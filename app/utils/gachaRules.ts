// src/utils/gachaRules.ts

// Wakamo=10033, S.Hoshino=10045, Mika=10059
const WAKAMO_MIKA_BANNER_EXCL = [10033, 10045, 10059];
const WAKAMO_S_HANAKO_BANNER_EXCL = [10033, 10045, 10059, 10086, 10074];

export const FES_EXCLUSIONS_BY_PICKUP_ID: Record<number, number[]> = {
  // Aris(Battle)/Kei/Hoshino(Battle)/Shiroko*Terror banner — Wakamo, S.Hoshino, Mika, Hina(Dress) excluded
  10134: WAKAMO_MIKA_BANNER_EXCL,
  10135: WAKAMO_MIKA_BANNER_EXCL,
  10098: WAKAMO_MIKA_BANNER_EXCL,
  10100: WAKAMO_MIKA_BANNER_EXCL,
  10148: WAKAMO_S_HANAKO_BANNER_EXCL,
  20060: WAKAMO_S_HANAKO_BANNER_EXCL,
  10111: WAKAMO_S_HANAKO_BANNER_EXCL,
  20041: WAKAMO_S_HANAKO_BANNER_EXCL,
};

export const FES_EXCLUSIONS = FES_EXCLUSIONS_BY_PICKUP_ID;

// src/utils/gachaRules.ts

/**
 * List of Archived Student IDs
 * * Description: Students classified under 'Archive Recruitment' because they were released long ago or are farmable.
 * They do not appear in the regular pool (off-rate) unless they are the specific pickup target.
 * (However, they can be acquired via Selective Pickup or Archive Recruitment)
 * * Criteria: Initial 3-star and major farmable characters.
 * Actual IDs must match the database; example IDs and comments are used here for explanation.
 */
export const ARCHIVE_STUDENT_IDS = new Set([
  10000, // aru
  10001, // eimi
  10002, // haruna
  10003, // hifumi
  10004, // hina
  10005, // hoshino
  10006, // iori
  10007, // maki
  10008, // neru
  10009, // izumi
  10010, // shiroko
  10011, // shun
  10012, // sumire
  10013, // tsurugi
  10014, // izuna
  10015, // aris
  10016, // midori
  10017, // cherino
  10018, // yuzu
  10019, // azusa
  10020, // koharu
  10024, // shiroko_cycling
  10025, // shun_small
  10029, // natsu

  20001, // karin
  20002, // saya
  20003, // mashiro
  20005, // hifumi_swimsuit
  20006, // saya_casual
  20007, // hatsune_miku
  20008, // ako
  20009, // cherino_onsen
  20010, // nodoka_onsen
  20011, // serika_newyear
  20012, // sena
  20013, // chihiro

  10099, // hoshino_battle (variant, excluded from all gacha)
]);

/**
 * Checks if a student can be included in the 'regular off-rate' pool.
 * @param studentId Student ID
 * @param isLimited Whether the student is a limited character
 * @param isFes Whether the student is a Fest character
 * @returns Returns true if included in the off-rate pool
 */
export const canSpook = (studentId: number, isLimited: boolean, isFes: boolean): boolean => {
  // Limited/FES characters cannot be off-rates (except during FES periods, handled separately by the engine)
  if (isLimited || isFes) return false;

  // Archive characters cannot be off-rates
  if (ARCHIVE_STUDENT_IDS.has(studentId)) return false;

  return true;
};

/**
 * "Recruitment Count Bonus" reward table, based on the official patch notes dated 2026-07-28.
 * Only the two reward types tracked by this planner (limited-time 10-pull tickets and Eligma) are included.
 * Other rewards, such as gift boxes, Tactical Training Blu-rays, Tech Notes, and Keystone Fragments, are ignored.
 * The count is tracked per BannerPeriod and resets for each banner. This simplifies the actual rule, where
 * banners within the same period share the count, and matches the counter behavior used elsewhere in this planner.
 */
const FIRST_TIME_TICKET_COUNTS = new Set([70, 130, 150, 170, 270, 330, 350, 370]);
const FIRST_TIME_ELIGMA: Record<number, number> = { 30: 10, 110: 20, 230: 10, 310: 20 };
const REPEAT_ELIGMA_BY_RELATIVE: Record<number, number> = { 100: 10, 200: 10 };

export const getRecruitCountReward = (count: number): { ticket: number; eligma: number } => {
  if (count <= 390) {
    return { ticket: FIRST_TIME_TICKET_COUNTS.has(count) ? 1 : 0, eligma: FIRST_TIME_ELIGMA[count] ?? 0 };
  }
  // Repeat tier: cycles every 200 counts starting at 391, with rewards at relative positions 100 and 200.
  const relative = ((count - 391) % 200) + 1;
  return { ticket: 0, eligma: REPEAT_ELIGMA_BY_RELATIVE[relative] ?? 0 };
};

/**
 * Smallest FIRST_TIME_TICKET_COUNTS threshold strictly greater than `count`, or undefined once none remain.
 * Both `count` and every threshold are multiples of 10 (pulls always advance in 10s from 0), so the caller
 * can rely on `next - count >= 10` whenever a value is returned — no rounding/overshoot is possible.
 */
export const getNextTicketThreshold = (count: number): number | undefined => {
  let next: number | undefined;
  for (const t of FIRST_TIME_TICKET_COUNTS) {
    if (t > count && (next === undefined || t < next)) next = t;
  }
  return next;
};
