import { useTranslation } from 'react-i18next';
import { getFavorStatAt } from '~/utils/student/favorStats';

const STAT_KEYS = { AttackPower: 'Buff_ATK', MaxHP: 'Buff_MAXHP', DefensePower: 'Buff_DEF', HealPower: 'Buff_HealPower' } as const;
type Outfit = { Id: number; Name: string; FavorStatType: string[]; FavorStatValue: number[][] };

/** Which stats each outfit raises with bond rank, at the chosen rank. */
export function StudentFavorTable({ rank, currentId, outfits }: { rank: number; currentId: number; outfits: Outfit[] }) {
  const { t } = useTranslation('students');
  const { t: stat } = useTranslation('stat');
  const types = (Object.keys(STAT_KEYS) as (keyof typeof STAT_KEYS)[]).filter((type) => outfits.some((outfit) => outfit.FavorStatType.includes(type)));
  const rows = outfits.map((outfit) => {
    const bonuses = getFavorStatAt(outfit.FavorStatValue, rank);
    return { outfit, values: types.map((type) => bonuses[outfit.FavorStatType.indexOf(type)] ?? null) };
  });
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm tabular-nums">
        <thead>
          <tr className="border-b border-neutral-200 text-right dark:border-neutral-700">
            <th scope="col" className="py-1 pl-2 pr-3 text-left font-semibold">
              {t('outfits')}
            </th>
            {types.map((type) => (
              <th key={type} scope="col" className="px-3 py-1 font-semibold">
                {stat(STAT_KEYS[type])}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ outfit, values }) => (
            <tr
              key={outfit.Id}
              aria-current={outfit.Id === currentId || undefined}
              className={`border-b border-neutral-100 text-right dark:border-neutral-800 ${outfit.Id === currentId ? 'bg-neutral-100 font-bold dark:bg-neutral-800' : ''}`}
            >
              <th scope="row" className="py-1 pl-2 pr-3 text-left font-[inherit]">
                {outfit.Name}
              </th>
              {values.map((value, i) => (
                <td key={types[i]} className={`px-3 py-1 ${value === null ? 'text-neutral-400 dark:text-neutral-600' : ''}`}>
                  {value === null ? '-' : `+${value}`}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
