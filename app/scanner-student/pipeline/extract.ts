import { NAMEPLATE, SUB_FIELDS } from './calibration';
import { classifyArmor, classifyBullet, classifySquad, classifyTerrain, countStars, findPotentialBadges } from './classify';
import { classifyEquipmentTypesBatch } from './equipment';
import { crop, fractionBox, unionBoxes } from './image';
import { locateAnchors, locatePanelBorders } from './layout';
import { filterByEquipment, matchStudents, parsePosition, rankByPortrait, uniqueEquipmentMatch } from './match';
import { recognizeBatch } from './ocr';
import { loadImageData } from './video';
import { getSections } from './sections';
import { parseTier } from './tier';
import type { Anchors, CandidateFrame, ExtractionTiming, FixedLayout, SkillState, StudentRecord, StudentResult } from '../types';

const digits = (value: string) => {
  const found = value.match(/\d+/g);
  return found ? Number(found.join('')) : null;
};
const parseSkill = (raw: string): SkillState => ({ raw, max: /MAX/i.test(raw), level: /MAX/i.test(raw) ? null : digits(raw) });

// Skill level caps are fixed by skill type, not per-student. Confirmed against
// app/data/growthData.ts: skillLevelUpCredit has 9 entries (levels 2-10) for Normal/Passive/Sub,
// exSkillLevelUpCredit has 4 entries (levels 2-5) for EX.
const SKILL_MAX_LEVEL = { ex: 5, normal: 10, passive: 10, sub: 10 } as const;
const resolveSkillLevel = (key: keyof typeof SKILL_MAX_LEVEL, skill: SkillState): number | null => (skill.max ? SKILL_MAX_LEVEL[key] : skill.level);

export const extractStudent = async (
  candidate: CandidateFrame,
  database: StudentRecord[],
  fixedLayout: FixedLayout | null,
  onTiming: ((timing: ExtractionTiming) => void) | undefined,
  loadPortrait: Parameters<typeof rankByPortrait>[3],
): Promise<StudentResult> => {
  const startedAt = performance.now();
  const image = await loadImageData(candidate.blob);
  const anchors: Anchors | null = fixedLayout?.anchors ?? locateAnchors(image);
  const borders = fixedLayout?.panelBorders ?? locatePanelBorders(image);
  if (!anchors || !borders) throw new Error(`Student UI layout not found at ${candidate.time.toFixed(1)}s`);
  const layoutAt = performance.now();
  const anchorBox = unionBoxes([
    anchors.damageBadge,
    anchors.armorBadge,
    ...anchors.moodCircles.map((circle) => ({ x: circle.x - circle.radius, y: circle.y - circle.radius, width: circle.radius * 2, height: circle.radius * 2 })),
  ]);
  const panel = getSections(image, borders[0], borders[1]);
  const starGrade = countStars(image, fractionBox(anchorBox, NAMEPLATE.starGrade));
  const weaponStars = countStars(image, fractionBox(panel.weapon, SUB_FIELDS.weaponStar), true);
  const bullet = classifyBullet(image, anchors.damageBadge);
  const armor = classifyArmor(image, anchors.armorBadge);
  const terrain = anchors.moodCircles.map((circle) => classifyTerrain(image, circle));
  const squad = classifySquad(crop(image, fractionBox(anchorBox, NAMEPLATE.squadType)));

  const labels: string[] = ['level', 'bondRank', 'position', 'weaponLevel'];
  const ocrCrops: ImageData[] = [
    crop(image, fractionBox(anchorBox, NAMEPLATE.level)),
    crop(image, fractionBox(anchorBox, NAMEPLATE.bondRank)),
    crop(image, fractionBox(anchorBox, NAMEPLATE.position)),
    crop(image, fractionBox(panel.weapon, SUB_FIELDS.weaponLevel)),
  ];
  SUB_FIELDS.skills.forEach((spec, index) => {
    labels.push(`skill${index}`);
    ocrCrops.push(crop(image, fractionBox(panel.skill, spec)));
  });
  SUB_FIELDS.equipmentTier.forEach((spec, index) => {
    labels.push(`equipment${index}`);
    ocrCrops.push(crop(image, fractionBox(panel.equipment, spec)));
  });
  labels.push('gear');
  ocrCrops.push(crop(image, fractionBox(panel.equipment, SUB_FIELDS.gearTier)));
  const potentialBadges = findPotentialBadges(crop(image, panel.stat));
  potentialBadges.forEach(({ quadrant, image: badge }) => {
    labels.push(`potential:${quadrant}`);
    ocrCrops.push(badge);
  });
  const equipmentIconCrops = SUB_FIELDS.equipmentIcon.map((spec) => crop(image, fractionBox(panel.equipment, spec)));
  const preparedAt = performance.now();
  // ONNX Runtime Web's WASM backend cannot run two inference sessions at
  // once (Firefox reports "Session already started"). Keep model runs
  // sequential; students themselves are already processed sequentially.
  const recognizedText = await recognizeBatch(ocrCrops);
  const ocrAt = performance.now();
  const equipmentPredictions = await classifyEquipmentTypesBatch(equipmentIconCrops);
  const equipmentAt = performance.now();
  const text = Object.fromEntries(labels.map((label) => [label, ''])) as Record<string, string>;
  recognizedText.forEach((value, index) => {
    text[labels[index]] = value;
  });
  const position = parsePosition(text.position);
  const equipmentTypes = equipmentPredictions.map((prediction) => prediction.type);
  const equipmentTiers = SUB_FIELDS.equipmentTier.map((_spec, index) => parseTier(text[`equipment${index}`], 10));
  let matches = matchStudents(database, { bullet, armor, squad, position, stars: starGrade, terrain, weaponStars });
  let terrainConflict = false;
  if (!matches.length) {
    const categoricalMatches = matchStudents(database, { bullet, armor, squad, position, stars: starGrade });
    const equipmentMatch = equipmentTiers.every((tier) => tier !== null) ? uniqueEquipmentMatch(categoricalMatches, equipmentTypes) : [];
    if (equipmentMatch.length === 1) {
      matches = equipmentMatch;
      terrainConflict = true;
    }
    console.warn(
      terrainConflict
        ? '[BA Student Status] Terrain classification conflicted; recovered the single candidate matching all three equipment slots.'
        : '[BA Student Status] No student candidates. Compare matching inputs with the reference pipeline.',
      {
        frameIndex: candidate.frameIndex,
        time: candidate.time,
        databaseSize: database.length,
        observed: { bullet, armor, squad, position, positionRaw: text.position, stars: starGrade, terrain, weaponStars },
        equipment: { types: equipmentTypes, tiers: equipmentTiers },
        categoricalCandidates: categoricalMatches.map((student) => `${student.Name}(#${student.Id})`),
        recoveredStudent: equipmentMatch[0] ? `${equipmentMatch[0].Name}(#${equipmentMatch[0].Id})` : null,
      },
    );
  }
  if (matches.length > 1 && equipmentTiers.every((tier) => tier !== null)) {
    matches = filterByEquipment(matches, equipmentTypes);
  }
  const ranked = matches.length > 1 ? await rankByPortrait(image, borders[0], matches, loadPortrait) : matches.map((student) => ({ student, score: null }));
  const winner = ranked[0] ?? null;
  const equipmentRaw = SUB_FIELDS.equipmentTier.map((_spec, index) => ({
    type: equipmentTiers[index] === null ? null : (equipmentPredictions[index]?.type ?? winner?.student.Equipment[index] ?? null),
    tier: equipmentTiers[index],
    raw: text[`equipment${index}`],
  }));
  const skillKeys = ['ex', 'normal', 'passive', 'sub'] as const;
  const skills = Object.fromEntries(skillKeys.map((key, index) => [key, parseSkill(text[`skill${index}`])])) as Record<(typeof skillKeys)[number], SkillState>;
  // `defense` is a quadrant-detection artifact (no such in-game stat); kept in raw only. See GROWTHPLAN_MAPPING.md.
  const potentialRaw = { hp: '', attack: '', defense: '', heal: '' };
  potentialBadges.forEach(({ quadrant }) => {
    potentialRaw[quadrant] = text[`potential:${quadrant}`];
  });
  const giftTier = parseTier(text.gear, 2);
  // 'defense' has no real overlay field (see findPotentialBadges) — it never gets a review box.
  const potentialOverlayField = { hp: 'potentialHp', attack: 'potentialAtk', heal: 'potentialHeal' } as const;
  const reviewOverlay: StudentResult['reviewOverlay'] = [
    { field: 'level', box: fractionBox(anchorBox, NAMEPLATE.level) },
    { field: 'star', box: fractionBox(anchorBox, NAMEPLATE.starGrade) },
    { field: 'uw', box: fractionBox(panel.weapon, SUB_FIELDS.weaponStar) },
    { field: 'uwLevel', box: fractionBox(panel.weapon, SUB_FIELDS.weaponLevel) },
    { field: 'affection', box: fractionBox(anchorBox, NAMEPLATE.bondRank) },
    ...SUB_FIELDS.skills.map((spec, index) => ({ field: (['ex', 'normal', 'passive', 'sub'] as const)[index], box: fractionBox(panel.skill, spec) })),
    ...SUB_FIELDS.equipmentTier.map((spec, index) => ({ field: (['equipment1', 'equipment2', 'equipment3'] as const)[index], box: fractionBox(panel.equipment, spec) })),
    { field: 'gear', box: fractionBox(panel.equipment, SUB_FIELDS.gearTier) },
    ...potentialBadges
      .filter((badge): badge is typeof badge & { quadrant: keyof typeof potentialOverlayField } => badge.quadrant in potentialOverlayField)
      .map((badge) => ({
        field: potentialOverlayField[badge.quadrant],
        box: { x: panel.stat.x + badge.box.x, y: panel.stat.y + badge.box.y, width: badge.box.width, height: badge.box.height },
      })),
  ];
  const result: StudentResult = {
    frameIndex: candidate.frameIndex,
    time: candidate.time,
    previewUrl: URL.createObjectURL(candidate.blob),
    sourceSize: { width: image.width, height: image.height },
    reviewOverlay,
    student: winner ? { id: winner.student.Id, name: winner.student.Name, confidence: winner.score } : null,
    candidates: matches.length,
    current: {
      level: digits(text.level),
      star: starGrade,
      uw: weaponStars,
      uwLevel: digits(text.weaponLevel),
      ex: resolveSkillLevel('ex', skills.ex),
      normal: resolveSkillLevel('normal', skills.normal),
      passive: resolveSkillLevel('passive', skills.passive),
      sub: resolveSkillLevel('sub', skills.sub),
      affection: digits(text.bondRank),
      affectionExp: 0,
      eleph: 0,
      equipment: [equipmentRaw[0].tier, equipmentRaw[1].tier, equipmentRaw[2].tier],
      gear: giftTier,
      potential: { hp: digits(potentialRaw.hp), atk: digits(potentialRaw.attack), heal: digits(potentialRaw.heal) },
    },
    raw: {
      skills,
      equipment: equipmentRaw,
      potential: potentialRaw,
      gear: { equipped: giftTier ? true : null, raw: text.gear },
    },
    debug: { bulletType: bullet, armorType: armor, position, positionRaw: text.position, squadType: squad, terrain, terrainConflict, layout: fixedLayout ? 'voted' : 'per-frame' },
  };
  const finishedAt = performance.now();
  onTiming?.({
    decodeLayoutMs: layoutAt - startedAt,
    prepareMs: preparedAt - layoutAt,
    ocrMs: ocrAt - preparedAt,
    equipmentMs: equipmentAt - ocrAt,
    matchingMs: finishedAt - equipmentAt,
    totalMs: finishedAt - startedAt,
  });
  return result;
};
