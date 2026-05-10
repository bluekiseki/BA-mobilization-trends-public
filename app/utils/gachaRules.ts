// src/utils/gachaRules.ts

export const FES_EXCLUSIONS_BY_PICKUP_ID: Record<number, number[]> = {
  // Example data (Actual IDs need verification)
  // Pickup Student ID : [List of FES student IDs to exclude]
  10134: [10059, 10045, 10033], // On Aris pickup -> Mika, S.Hoshino, Wakamo excluded
  10135: [10059, 10045, 10033], // On Kei pickup -> Same as above
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
