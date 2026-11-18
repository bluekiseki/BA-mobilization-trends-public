import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { StudentFavorTable } from './StudentFavorTable';
import { localeLink } from '~/utils/localeLink';
import type { PublicStudent, PublicSkill, PublicSummon, SummonFollow } from '../data/publicStudent';
import { skillDescriptionParts } from '../data/publicStudent';
import { useIconSheet } from '~/components/common/SheetIcon';
import { iconSheetStyle } from '~/utils/iconSheet';
import { ItemIconView } from '~/components/item/ItemIconView';
import { getPreferenceIcon } from '~/components/student/GiftStudentSheet';
import type { EventData, IconData } from '~/types/plannerData';
import { cdn } from '~/utils/cdn';

let giftIconRequest: Promise<{ iconData: IconData; eventData: EventData }> | null = null;

// The item icons the planner pages use. The files are large, so they load after the page is shown and the gifts read as text meanwhile.
function useGiftIcons(enabled: boolean) {
  const [icons, setIcons] = useState<{ iconData: IconData; eventData: EventData } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    giftIconRequest ??= Promise.all([
      fetch(cdn('/ew/icon_img.json')).then((res): Promise<IconData> => res.json()),
      fetch(cdn('/ew/icon_info.json')).then((res): Promise<EventData['icons']> => res.json()),
    ]).then(([iconData, info]) => ({ iconData, eventData: { icons: info } as EventData }));
    giftIconRequest.then(
      (loaded) => {
        if (alive) setIcons(loaded);
      },
      () => {
        giftIconRequest = null;
      },
    );
    return () => {
      alive = false;
    };
  }, [enabled]);
  return icons;
}

const inputClass = 'rounded border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100';

function SkillText({ skill, level }: { skill: PublicSkill; level: number }) {
  const { t: stat } = useTranslation('stat');
  const buffSheet = useIconSheet('buff');
  return (
    <p className="whitespace-pre-line text-sm leading-7">
      {skillDescriptionParts(skill, level).map((part, index) => {
        if (part.kind === 'text') return part.text;
        if (part.kind === 'value')
          return (
            <strong key={index} className="font-bold text-blue-600 dark:text-blue-400">
              {part.text}
            </strong>
          );
        const style = buffSheet ? iconSheetStyle(buffSheet, part.statKey) : null;
        return (
          <span key={index} className="whitespace-nowrap">
            {style && <span role="img" aria-hidden="true" className="mr-0.5 inline-block aspect-[47/54] h-[1.2em] align-text-bottom" style={style} />}
            <strong className="underline">{stat(part.statKey, { defaultValue: part.name })}</strong>
          </span>
        );
      })}
    </p>
  );
}

const MAX_LEVEL: Record<SummonFollow, number> = { Ex: 5, Public: 10, Passive: 10, ExtraPassive: 10 };

// Without onLevel the block has no selector of its own and just shows the level it follows.
function SkillBlock({ skill, label, level, maxLevel, onLevel }: { skill: PublicSkill; label: string; level: number; maxLevel: number; onLevel?: (level: number) => void }) {
  const { t } = useTranslation('students');
  return (
    <article className="space-y-2 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">{label}</p>
          <h3 className="font-semibold">{skill.Name}</h3>
        </div>
        {onLevel ? (
          <label className="flex items-center gap-2 text-sm">
            {t('level')}
            <select aria-label={`${label} ${t('level')}`} className={inputClass} value={level} onChange={(event) => onLevel(Number(event.target.value))}>
              {Array.from({ length: maxLevel }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {i + 1}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <span className="text-sm tabular-nums text-neutral-500 dark:text-neutral-400">
            {t('level')} {level}
          </span>
        )}
      </div>
      {skill.Cost && (
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          {t('cost')}: {skill.Cost[level - 1]}
        </p>
      )}
      <SkillText skill={skill} level={level} />
    </article>
  );
}

export function StudentSkillsSection({ student, summons }: { student: PublicStudent; summons: PublicSummon[] }) {
  const { t } = useTranslation('students');
  const [weapon, setWeapon] = useState(false);
  const [gear, setGear] = useState(false);
  // One level per student skill; its extra variants and the summon skills that follow it move together
  const [levels, setLevels] = useState<Record<SummonFollow, number>>(MAX_LEVEL);
  const publicSkill = gear ? student.Skills.GearPublic : student.Skills.Public;
  const labels: Record<SummonFollow, string> = { Ex: t('ex'), Public: t('normal'), Passive: t('passive'), ExtraPassive: t('sub') };
  const own: { skill: PublicSkill | undefined; follows: SummonFollow }[] = [
    { skill: student.Skills.Ex, follows: 'Ex' },
    ...(student.Skills.Ex?.ExtraSkills ?? []).map((skill) => ({ skill, follows: 'Ex' as const })),
    { skill: publicSkill, follows: 'Public' },
    ...(publicSkill?.ExtraSkills ?? []).map((skill) => ({ skill, follows: 'Public' as const })),
    { skill: weapon ? student.Skills.WeaponPassive : student.Skills.Passive, follows: 'Passive' },
    { skill: student.Skills.ExtraPassive, follows: 'ExtraPassive' },
  ];
  return (
    <section id="skills" className="scroll-mt-24 border-t border-neutral-200 py-6 dark:border-neutral-700">
      <h2 className="text-xl font-bold">{t('skills')}</h2>
      <div className="mt-3 flex flex-wrap gap-5 text-sm">
        {student.Skills.WeaponPassive && (
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={weapon} onChange={(event) => setWeapon(event.target.checked)} />
            {t('weapon')}
          </label>
        )}
        {student.Skills.GearPublic && (
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={gear} onChange={(event) => setGear(event.target.checked)} />
            {t('gear')}
          </label>
        )}
      </div>
      <div className="grid gap-x-8 divide-y divide-neutral-200 dark:divide-neutral-700 lg:grid-cols-2">
        {/* In game order; each summon skill sits right after the student skill whose level it follows */}
        {(['Ex', 'Public', 'Passive', 'ExtraPassive'] as const).flatMap((follows) => [
          ...own.flatMap((entry, index) =>
            entry.follows === follows && entry.skill
              ? [
                  <SkillBlock
                    key={`${index}-${entry.skill.Name}`}
                    skill={entry.skill}
                    label={labels[follows]}
                    level={levels[follows]}
                    maxLevel={MAX_LEVEL[follows]}
                    onLevel={(level) => setLevels((prev) => ({ ...prev, [follows]: level }))}
                  />,
                ]
              : [],
          ),
          ...summons.flatMap((summon) =>
            summon.skills
              .filter((skill) => skill.follows === follows)
              .map((skill) => (
                <SkillBlock key={`${summon.Id}-${skill.Name}`} skill={skill} label={`${t('summon')} · ${summon.Name} (${labels[follows]})`} level={levels[follows]} maxLevel={MAX_LEVEL[follows]} />
              )),
          ),
        ])}
      </div>
    </section>
  );
}

export function StudentAffectionSection({
  student,
  outfits,
  memorialRank,
  bgm,
  gifts,
  locale,
}: {
  student: PublicStudent;
  outfits: { Id: number; Name: string; FavorStatType: string[]; FavorStatValue: number[][] }[];
  memorialRank: number | null;
  bgm: { id: string; title: string }[];
  gifts: { id: string; name: string; points: number; preferenceLevel: number; rarity: number }[];
  locale: string;
}) {
  const { t } = useTranslation('students');
  const [rank, setRank] = useState(20);
  // Kept as text while typing so the field can be cleared; the rank is clamped on blur
  const [draft, setDraft] = useState('20');
  const giftIcons = useGiftIcons(gifts.length > 0);
  // Grouped by what each gift is worth, the best first
  const giftGroups = [...Map.groupBy(gifts, (gift) => gift.points)].sort((a, b) => b[0] - a[0]);
  return (
    <section id="affection" className="scroll-mt-24 space-y-3 border-t border-neutral-200 py-6 dark:border-neutral-700">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h2 className="text-xl font-bold">{t('affection')}</h2>
        <label className="flex items-center gap-2 text-sm">
          {t('rank')}
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={100}
            aria-label={t('rank')}
            className={`${inputClass} w-20 py-1`}
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              const value = Math.trunc(Number(event.target.value));
              if (value >= 1) setRank(Math.min(100, value));
            }}
            onBlur={() => setDraft(String(rank))}
          />
        </label>
      </div>
      <div>
        <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">{t('bonusNote')}</p>
        <div className="mt-2">
          <StudentFavorTable rank={rank} currentId={student.Id} outfits={[student, ...outfits]} />
        </div>
      </div>
      {!!gifts.length && (
        <div>
          <h3 className="mb-2 text-sm font-semibold">{t('gifts')}</h3>
          {/* The name sits in the tooltip because the icon already identifies the item. */}
          <div className="space-y-2">
            {giftGroups.map(([points, group]) => (
              <div key={points} className="flex items-start gap-3">
                <span className="w-10 shrink-0 pt-1 text-sm font-semibold tabular-nums text-neutral-500 dark:text-neutral-400">+{points}</span>
                <ul className="flex flex-wrap gap-1.5">
                  {group.map((gift) => (
                    <li key={gift.id} className="relative" title={gift.name}>
                      {giftIcons ? (
                        <>
                          <ItemIconView type="Item" itemId={gift.id} amount={0} size={10} eventData={giftIcons.eventData} iconData={giftIcons.iconData} />
                          <img src={getPreferenceIcon(gift.preferenceLevel, gift.rarity)} alt="" className="absolute bottom-0 right-0 h-4 w-4" />
                        </>
                      ) : (
                        <span className="text-sm">{gift.name}</span>
                      )}
                      <span className="sr-only">{gift.name}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
      <dl className="space-y-3 text-sm">
        <div className="flex flex-wrap gap-x-4">
          <dt className="text-neutral-500 dark:text-neutral-400">{t('memorialRank')}</dt>
          <dd>{memorialRank ?? t('unknown')}</dd>
        </div>
        <div className="flex flex-wrap gap-x-4">
          <dt className="text-neutral-500 dark:text-neutral-400">{t('bgm')}</dt>
          <dd>
            {bgm.length
              ? bgm.map((track) => (
                  <Link key={track.id} className="mr-3 text-blue-600 underline dark:text-blue-400" to={localeLink(locale, `/utils/jukebox?bgm=${track.id}`)}>
                    {track.title} <span className="text-neutral-500 dark:text-neutral-400">#{track.id}</span>
                  </Link>
                ))
              : t('unknown')}
          </dd>
        </div>
      </dl>
    </section>
  );
}
