import { z } from 'zod';

const skillSchema = z.object({
  Name: z.string(),
  Desc: z.string(),
  Parameters: z.array(z.array(z.string())).default([]),
  Cost: z.array(z.number()).optional(),
});
const exSchema = skillSchema.extend({ ExtraSkills: z.array(skillSchema).optional() });
// Public and bond gear skills can also carry upgraded variants
const publicSchema = exSchema;
// A summon's own skills; the basic attacks have no text and are dropped when the catalog is read
const summonSkillSchema = z.object({ Name: z.string().optional(), Desc: z.string().optional(), Parameters: z.array(z.array(z.string())).default([]), Type: z.string().optional() });
export const summonSchema = z.object({ Id: z.number(), Name: z.string(), Skills: z.array(summonSkillSchema).default([]) });
/** The student skill whose level a summon skill follows in game: EX, Normal (Public), Enhanced (Passive) or Sub (ExtraPassive). */
export type SummonFollow = 'Ex' | 'Public' | 'Passive' | 'ExtraPassive';
export type PublicSummonSkill = PublicSkill & { follows: SummonFollow };
export type PublicSummon = { Id: number; Name: string; skills: PublicSummonSkill[] };
const FOLLOWS: Record<string, SummonFollow> = { Ex: 'Ex', Public: 'Public', GearPublic: 'Public', Passive: 'Passive', WeaponPassive: 'Passive', ExtraPassive: 'ExtraPassive' };
/** Keeps the summon skills that have a description and a student skill to follow, which are the only ones worth showing. */
export function summonDisplay(summon: z.infer<typeof summonSchema>): PublicSummon {
  const skills = summon.Skills.flatMap((skill) => {
    const follows = FOLLOWS[skill.Type ?? ''];
    return skill.Name && skill.Desc && follows ? [{ Name: skill.Name, Desc: skill.Desc, Parameters: skill.Parameters, follows }] : [];
  });
  return { Id: summon.Id, Name: summon.Name, skills };
}
export const publicStudentSchema = z.object({
  Id: z.number().int().positive(),
  Name: z.string(),
  // Slug of the student's page on SchaleDB
  PathName: z.string().default(''),
  SearchTags: z.array(z.string()).default([]),
  School: z.string(),
  Club: z.string(),
  SquadType: z.string(),
  TacticRole: z.string(),
  BulletType: z.string(),
  ArmorType: z.string(),
  StarGrade: z.number(),
  // Whether the student is out on [JP, Global, CN]
  IsReleased: z.array(z.boolean()).default([]),
  StreetBattleAdaptation: z.number(),
  OutdoorBattleAdaptation: z.number(),
  IndoorBattleAdaptation: z.number(),
  ProfileIntroduction: z.string().default(''),
  CharacterVoice: z.string().default(''),
  CharHeightMetric: z.string().default(''),
  // Listing sort keys
  DefaultOrder: z.number().nullish(),
  BirthDay: z.string().default(''),
  AttackPower100: z.number().default(0),
  MaxHP100: z.number().default(0),
  DefensePower100: z.number().default(0),
  HealPower100: z.number().default(0),
  Hobby: z.string().default(''),
  CharacterAge: z.string().default(''),
  FamilyName: z.string().default(''),
  // Reading of the family name; only the Japanese data has it
  FamilyNameRuby: z.string().default(''),
  Birthday: z.string().default(''),
  FavorStatType: z.array(z.string()).default([]),
  FavorStatValue: z.array(z.array(z.number())).default([]),
  // Id of the memorial lobby track in the jukebox database; 0 or missing when the student has none
  MemoryLobbyBGM: z.number().nullish(),
  FavorItemTags: z.array(z.string()).default([]),
  FavorItemUniqueTags: z.array(z.string()).default([]),
  FavorAlts: z.array(z.number()).default([]),
  // The unique weapon raises one terrain grade
  Weapon: z.object({ AdaptationType: z.enum(['Street', 'Outdoor', 'Indoor']).nullish(), AdaptationValue: z.number().nullish() }).nullish(),
  Skills: z.object({
    Ex: exSchema.optional(),
    Public: publicSchema.optional(),
    Passive: skillSchema.optional(),
    ExtraPassive: skillSchema.optional(),
    WeaponPassive: skillSchema.optional(),
    GearPublic: publicSchema.optional(),
  }),
  // Which summons the student's skills create
  Summons: z.array(z.object({ Id: z.number(), SourceSkill: z.string() })).default([]),
});
export type PublicStudent = z.infer<typeof publicStudentSchema>;
export type PublicSkill = z.infer<typeof skillSchema>;
// The fields of the listing; a card needs none of the skills, so parsing only these keeps a whole catalog cheap to read
export const studentSummarySchema = publicStudentSchema.pick({
  Id: true,
  Name: true,
  FamilyName: true,
  SearchTags: true,
  School: true,
  Club: true,
  BulletType: true,
  ArmorType: true,
  TacticRole: true,
  SquadType: true,
  StarGrade: true,
  StreetBattleAdaptation: true,
  OutdoorBattleAdaptation: true,
  IndoorBattleAdaptation: true,
  Weapon: true,
  DefaultOrder: true,
  BirthDay: true,
  CharHeightMetric: true,
  AttackPower100: true,
  MaxHP100: true,
  DefensePower100: true,
  HealPower100: true,
});
export type StudentSummary = z.infer<typeof studentSummarySchema>;
export function studentSummary(student: StudentSummary) {
  const {
    Id,
    Name,
    FamilyName,
    SearchTags,
    School,
    Club,
    BulletType,
    ArmorType,
    TacticRole,
    SquadType,
    StarGrade,
    StreetBattleAdaptation,
    OutdoorBattleAdaptation,
    IndoorBattleAdaptation,
    Weapon,
    DefaultOrder,
    BirthDay,
    CharHeightMetric,
    AttackPower100,
    MaxHP100,
    DefensePower100,
    HealPower100,
  } = student;
  return {
    Id,
    Name,
    FamilyName,
    SearchTags,
    School,
    Club,
    BulletType,
    ArmorType,
    TacticRole,
    SquadType,
    StarGrade,
    StreetBattleAdaptation,
    OutdoorBattleAdaptation,
    IndoorBattleAdaptation,
    Weapon,
    DefaultOrder,
    BirthDay,
    CharHeightMetric,
    AttackPower100,
    MaxHP100,
    DefensePower100,
    HealPower100,
  };
}
export function skillDescription(skill: PublicSkill, level: number, translate: (key: string, fallback: string) => string): string {
  return skill.Desc.replace(/<\?(\d+)>/g, (match, index: string) => skill.Parameters[Number(index) - 1]?.[level - 1] ?? match)
    .replace(/<kb:(\d+)>/g, '$1')
    .replace(/<([bdsc]):(\w+)>/g, (_, prefix: string, name: string) => translate(`${({ b: 'Buff_', d: 'Debuff_', s: 'Special_', c: 'CC_' } as Record<string, string>)[prefix]}${name}`, name))
    .replace(/<[^>]*>/g, '')
    .replace(/\\n/g, '\n');
}

export type SkillDescriptionPart = { kind: 'text'; text: string } | { kind: 'value'; text: string } | { kind: 'tag'; statKey: string; name: string };

const TAG_PREFIXES: Record<string, string> = { b: 'Buff_', d: 'Debuff_', s: 'Special_', c: 'CC_' };
// Parameters may contain numbers or description fragments with tags and line breaks.
const isPlainValue = (value: string) => /^[\d.,%+\-~/x×() ]+$/.test(value) && /\d/.test(value);

function tokenizeDescription(desc: string, skill: PublicSkill, level: number, depth: number): SkillDescriptionPart[] {
  // Keeps every tag this renderer knows (<?n>, <b|d|s|c:Name>, <kb:n>) and drops the rest
  return desc
    .replace(/<(?![?bdsc][:?\d]|kb:)[^>]*>/g, '')
    .split(/(<\?\d+>|<[bdsc]:\w+>|<kb:\d+>|\\n)/)
    .filter(Boolean)
    .flatMap((token): SkillDescriptionPart[] => {
      const param = /^<\?(\d+)>$/.exec(token);
      if (param) {
        const value = skill.Parameters[Number(param[1]) - 1]?.[level - 1];
        if (value === undefined) return [{ kind: 'text', text: token }];
        if (isPlainValue(value)) return [{ kind: 'value', text: value }];
        return depth < 2 ? tokenizeDescription(value, skill, level, depth + 1) : [{ kind: 'text', text: value }];
      }
      const knockback = /^<kb:(\d+)>$/.exec(token);
      if (knockback) return [{ kind: 'value', text: knockback[1] }];
      const tag = /^<([bdsc]):(\w+)>$/.exec(token);
      if (tag) return [{ kind: 'tag', statKey: `${TAG_PREFIXES[tag[1]]}${tag[2]}`, name: tag[2] }];
      return [{ kind: 'text', text: token === '\\n' ? '\n' : token }];
    });
}

// Same substitutions as skillDescription, but keeps parameter values and buff tags distinguishable so they can be styled and given icons.
export function skillDescriptionParts(skill: PublicSkill, level: number): SkillDescriptionPart[] {
  return tokenizeDescription(skill.Desc, skill, level, 0);
}
