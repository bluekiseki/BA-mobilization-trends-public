import { useTranslation } from 'react-i18next';
import { CombatTypeIcon } from '~/components/common/CombatTypeIcon';
import { type_translation, typecolor } from '~/components/raid/raidToString';
import { TerrainIconGameStyle, type Terrain } from '~/components/raid/teran';
import { BULLET_COLORS, SQUAD_TYPE_COLORS } from '~/utils/gameColors';
import { getLocaleShortName, type Locale } from '~/utils/i18n/config';
import type { PublicStudent } from '../data/publicStudent';

// Terrain aptitude grades indexed by the data value (0 = D .. 5 = SS)
export const GRADES = ['D', 'C', 'B', 'A', 'S', 'SS'];

function TypeBadge({ kind, label, value, color }: { kind: 'attack' | 'defense'; label: string; value: string; color: string }) {
  return (
    <div className="flex overflow-hidden rounded border border-neutral-200 dark:border-neutral-700">
      <span className="flex items-center bg-neutral-100 px-1.5 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200">
        <CombatTypeIcon kind={kind} title={label} className="h-3.5 w-3.5" />
      </span>
      <span className="flex items-center px-2 py-1 text-xs font-bold text-white" style={{ backgroundColor: color }}>
        {value}
      </span>
    </div>
  );
}

// `boost` is the grade the unique weapon adds; the grade is shown as a range when it applies
function TerrainGrade({ terrain, label, value, boost = 0 }: { terrain: Terrain; label: string; value: number; boost?: number }) {
  const top = Math.min(value + boost, GRADES.length - 1);
  const text = top > value ? `${GRADES[value] ?? '-'}-${GRADES[top]}` : (GRADES[value] ?? '-');
  return (
    <div className="flex items-center gap-1.5">
      <TerrainIconGameStyle terrain={terrain} size="18px" label={label} />
      <span className="text-sm font-black tabular-nums">{text}</span>
    </div>
  );
}

// Attack/armor type (in-game colors), squad, role and terrain aptitude of a student.
export function StudentTraits({ student, locale }: { student: PublicStudent; locale: Locale }) {
  const { t } = useTranslation('students');
  const { t: game } = useTranslation('game');
  const short = getLocaleShortName(locale);
  const typeName = (value: string) => type_translation[value as keyof typeof type_translation]?.[short] ?? value;
  const role = student.TacticRole.charAt(0).toLowerCase() + student.TacticRole.slice(1);
  const squad = student.SquadType.charAt(0).toLowerCase() + student.SquadType.slice(1);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <div className="flex gap-1">
        <TypeBadge kind="attack" label={t('attackShort')} value={typeName(student.BulletType)} color={BULLET_COLORS[student.BulletType] ?? '#666'} />
        <TypeBadge kind="defense" label={t('defenseShort')} value={typeName(student.ArmorType)} color={typecolor[student.ArmorType as keyof typeof typecolor] ?? '#666'} />
      </div>
      <div className="flex overflow-hidden rounded text-xs font-bold">
        <span className="px-2 py-1 text-white" style={{ backgroundColor: SQUAD_TYPE_COLORS[student.SquadType as keyof typeof SQUAD_TYPE_COLORS] ?? '#666' }}>
          {game(`squad_type.${squad}`, { defaultValue: student.SquadType })}
        </span>
        <span className="border border-neutral-200 bg-neutral-50 px-2 py-1 text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
          {game(`tactic_roles.${role}`, { defaultValue: student.TacticRole })}
        </span>
      </div>
      <div className="flex items-center gap-2.5" aria-label={t('terrain')}>
        <TerrainGrade terrain="Street" label={t('urban')} value={student.StreetBattleAdaptation} boost={student.Weapon?.AdaptationType === 'Street' ? (student.Weapon.AdaptationValue ?? 0) : 0} />
        <TerrainGrade terrain="Outdoor" label={t('outdoor')} value={student.OutdoorBattleAdaptation} boost={student.Weapon?.AdaptationType === 'Outdoor' ? (student.Weapon.AdaptationValue ?? 0) : 0} />
        <TerrainGrade terrain="Indoor" label={t('indoor')} value={student.IndoorBattleAdaptation} boost={student.Weapon?.AdaptationType === 'Indoor' ? (student.Weapon.AdaptationValue ?? 0) : 0} />
      </div>
    </div>
  );
}
