import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useShallow } from 'zustand/shallow';
import { useChartControlsStore } from '~/store/chartControlsStore';
import { getGiftAffectionList } from '~/components/planner/StudentGrowth/giftAffectionList';
import { ItemIcon } from '~/components/planner/common/Icon';
import { HighFlowerBouquetItemIds, LowFlowerBouquetItemIds } from '~/components/planner/StudentGrowth/const';
import type { EventData, IconData, IconInfos, Skill, Student } from '~/types/plannerData';
import { cdn } from '~/utils/cdn';
import { getLocaleShortName, type Locale } from '~/utils/i18n/config';
import { localeLink } from '~/utils/localeLink';
import { HiExternalLink, HiChevronDown, HiChevronUp } from 'react-icons/hi';
import { type_translation } from '../raid/raidToString';
import { TerrainIconGameStyle, type Terrain } from '../raid/teran';
import { formatSkillBuffDesc } from '../planner/StudentGrowth/SkillDisplay';
import { getPreferenceIcon, type GiftEntry } from '../planner/StudentGrowth/GiftStudentSheet';

type FavorStory = {
  favor_rank: number;
  title: Record<string, string>;
  summary: Record<string, string>;
  is_memorial: boolean;
};

interface Props {
  portraitData: Record<number, string> | null;
}

export default function StudentProfileCard({ portraitData }: Props) {
  const [studentData, setStudentsData] = useState<Record<string, Student>>({});
  // const { t, i18n } = useTranslation('planner');
  const { t, i18n } = useTranslation(['planner', 'stat']);
  const { t: t_club } = useTranslation('club');
  const { t: t_chart } = useTranslation('charts');

  const locale = i18n.language as Locale;
  const t_chart_dynamic = t_chart as (key: string) => string;

  const { selectedStudentId: studentId } = useChartControlsStore(
    useShallow((state) => ({
      selectedStudentId: state.selectedStudentId,
    })),
  );

  // const { isDark } = useIsDarkState();
  const [isGiftsOpen, setIsGiftsOpen] = useState(false);
  const [isSkillsOpen, setIsSkillsOpen] = useState(false);
  const [showUW, setShowUW] = useState(false);
  const [showUE, setShowUE] = useState(false);
  const [exLevel, setExLevel] = useState(5);
  const [normalLevel, setNormalLevel] = useState(10);
  const [iconData, setIconData] = useState<IconData>({});
  const [iconInfos, setIconInfos] = useState<IconInfos | null>(null);
  const [favorStories, setFavorStories] = useState<Record<string, FavorStory[]> | null>(null);
  const [storyDetailLevel, setStoryDetailLevel] = useState(0);
  const [revealedTitles, setRevealedTitles] = useState<Set<number>>(new Set());
  const [revealedSummaries, setRevealedSummaries] = useState<Set<number>>(new Set());
  const [hoveredStoryIdx, setHoveredStoryIdx] = useState<number | null>(null);

  const [showGlobalStories, setShowGlobalStories] = useState(locale == 'ja');

  useEffect(() => {
    fetch(cdn(`/schaledb.com/${getLocaleShortName(locale)}.students.min.json`))
      .then((res) => res.json())
      .then((data) => setStudentsData(data as Record<string, Student>))
      .catch(console.error);
  }, [locale]);

  useEffect(() => {
    Promise.all([
      fetch(cdn('/ew/icon_img.json')).then((r) => r.json()),
      fetch(cdn('/ew/icon_info.json')).then((r) => r.json()),
      fetch(cdn('/schaledb.com/student_favor_stories_parsed.json')).then((r) => r.json()),
    ])
      .then(([img, info, stories]) => {
        setIconData(img as IconData);
        setIconInfos(info as IconInfos);
        setFavorStories(stories as Record<string, FavorStory[]>);
      })
      .catch(console.error);
  }, []);

  const student = studentData?.[studentId];
  const portrait = portraitData?.[studentId];

  const eventDataCompat = useMemo(() => (iconInfos ? { icons: iconInfos } : null), [iconInfos]);

  const displayedGifts = useMemo(() => {
    if (!eventDataCompat || !student) return [];
    const all = getGiftAffectionList(student, eventDataCompat as EventData);
    const flowerIds = [...HighFlowerBouquetItemIds, ...LowFlowerBouquetItemIds];
    return all.filter((g) => {
      if (flowerIds.includes(Number(g.id))) return false;
      if (g.rarity === 2) return g.affectionPoints > 20;
      if (g.rarity === 3) return g.affectionPoints > 120;
      return false;
    });
  }, [student, eventDataCompat]);

  const giftsByPref = useMemo(() => {
    const map = new Map<number, GiftEntry[]>();
    for (const g of displayedGifts) {
      if (!map.has(g.preferenceLevel)) map.set(g.preferenceLevel, []);
      const arr = map.get(g.preferenceLevel);
      if (arr) arr.push(g);
    }
    return [...map.entries()].sort((a, b) => b[0] - a[0]);
  }, [displayedGifts]);

  if (!student) return null;

  const typeColors = {
    Bullet: { Explosion: '#b62915', Pierce: '#bc8800', Mystic: '#206d9b', Sonic: '#9a46a8', Chemical: '#137973' },
    Armor: { LightArmor: '#b62915', HeavyArmor: '#bc8800', Unarmed: '#206d9b', ElasticArmor: '#9a46a8', CompositeArmor: '#137973' },
  };

  const squadTypeColors: Record<string, string> = {
    Main: '#cc1a25',
    Support: '#006bff',
  };

  const formatSkillDesc = (data: Skill, level: number) => {
    if (!data.Desc || !data.Parameters) return '';
    const rawDesc = data.Desc.replace(/<\?(\d+)>/g, (match: string, paramIndexStr: string) => {
      const paramIndex = parseInt(paramIndexStr, 10) - 1;
      const val = data.Parameters?.[paramIndex]?.[level - 1];
      return val !== undefined ? `<strong class="text-blue-600 dark:text-blue-400 font-bold">${val}</strong>` : match;
    });
    return formatSkillBuffDesc(rawDesc, t);
  };

  const allSkills = [
    ...(student.Skills.Ex
      ? student.Skills.Ex.ExtraSkills
        ? [{ ...student.Skills.Ex, type: 'EX' }, ...student.Skills.Ex.ExtraSkills.map((s) => ({ ...s, type: 'EX' }))]
        : [{ ...student.Skills.Ex, type: 'EX' }]
      : []),
    showUE && student.Skills.GearPublic ? { ...student.Skills.GearPublic, type: 'Normal+' } : { ...student.Skills.Public, type: 'Normal' },
    showUW && student.Skills.WeaponPassive ? { ...student.Skills.WeaponPassive, type: 'Passive+' } : { ...student.Skills.Passive, type: 'Passive' },
    { ...student.Skills.ExtraPassive, type: 'Sub' },
  ];

  const hasGear = !!student.Skills.GearPublic;

  const SKILL_BADGE: Record<string, string> = {
    EX: 'bg-orange-500 text-white',
    Normal: 'bg-sky-500 text-white',
    'Normal+': 'bg-emerald-500 text-white',
    Passive: 'bg-violet-500 text-white',
    'Passive+': 'bg-amber-500 text-white',
    Sub: 'bg-neutral-400 text-white',
  };

  return (
    <div className="flex flex-col w-full text-left">
      {/* 1. Header Area: Layout photo and information side-by-side */}
      <div className="py-3 px-3 flex flex-row gap-4 border-b border-neutral-200 dark:border-neutral-700 items-start">
        {/* Photo Area: Fixed to the left */}
        <div
          className="relative shrink-0 rounded-full"
          style={{
            backgroundColor: {
              Explosion: '#b62915',
              Pierce: '#bc8800',
              Mystic: '#206d9b',
              Sonic: '#9a46a8',
              Chemical: '#137973',
            }[student.BulletType],
          }}
        >
          {portrait ? (
            <img src={`data:image/webp;base64,${portrait}`} className="w-18 h-18 object-cover  border border-neutral-200 dark:border-neutral-700 rounded-full" alt={student.Name} />
          ) : (
            <div className="w-18 h-18 bg-neutral-200 animate-pulse border border-neutral-200 dark:border-neutral-700" />
          )}
        </div>

        {/* Information Area: Positioned on the right */}
        <div className="flex flex-col grow min-w-0">
          <div className="flex flex-col">
            <div className="flex justify-between items-start gap-2">
              {/* Name Section: Place last name above first name */}
              <div className="flex flex-col min-w-0">
                {student.FamilyName && student.FamilyName !== student.Name && (
                  <span className="text-xs text-neutral-400 font-medium leading-none mb-1 tracking-tight truncate">{student.FamilyName}</span>
                )}
                <h2 className="text-2xl font-bold text-neutral-900 dark:text-white tracking-tighter truncate leading-tight">{student.Name}</h2>
              </div>

              {/* Terrain Aptitude: Compactly placed at the top-right */}
              <div className="flex bg-neutral-100 dark:bg-neutral-700 p-px gap-px shrink-0 border-neutral-100 dark:border-neutral-700">
                <TerrainTiny label={'Street'} value={student.StreetBattleAdaptation} />
                <TerrainTiny label={'Outdoor'} value={student.OutdoorBattleAdaptation} />
                <TerrainTiny label={'Indoor'} value={student.IndoorBattleAdaptation} />
              </div>
            </div>

            {/* Affiliation Info: Placed directly below the name */}
            <p className="text-xs text-neutral-500 font-medium tracking-tight mt-1 opacity-80">
              <span className="whitespace-nowrap">{t_club(student.School, student.School)}</span> / <span className="whitespace-nowrap">{t_club(student.Club, student.School)}</span>
            </p>
          </div>

          {/* Bottom attribute badges and position info */}
          <div className="flex flex-wrap items-center justify-between gap-y-2 mt-3 w-full">
            {/* Attack/Defense types */}
            <div className="flex gap-1">
              <Badge label="ATK" value={type_translation[student.BulletType][getLocaleShortName(locale)]} color={typeColors.Bullet[student.BulletType]} />
              <Badge label="DEF" value={type_translation[student.ArmorType][getLocaleShortName(locale)]} color={typeColors.Armor[student.ArmorType]} />
            </div>

            {/* Unit Type / Tactical Role */}
            <div className="flex items-center gap-1.5 rounded overflow-hidden">
              <span className="text-xs font-bold text-white px-2 py-1" style={{ backgroundColor: squadTypeColors[student.SquadType] || '#666' }}>
                {t_chart_dynamic(`ranking.control.squad_type_${student.SquadType.toLowerCase()}`)}
              </span>
              <span className="text-xs font-bold text-neutral-700 dark:text-neutral-300 px-2 py-1 border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50">
                {t_chart_dynamic(`ranking.control.tactic_role_${student.TacticRole}`)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Favor Gifts */}
      {displayedGifts.length > 0 && (
        <div className="border-b border-neutral-200 dark:border-neutral-700">
          <div onClick={() => setIsGiftsOpen(!isGiftsOpen)} className="flex justify-between items-center w-full px-3 py-3 hover:opacity-70 transition-opacity cursor-pointer">
            <span className="text-base font-semibold text-neutral-700 dark:text-neutral-200">{t('label.favorGifts')}</span>
            <div className="flex items-center gap-2">
              <Link
                to={localeLink(locale, '/utils/favor')}
                onClick={(e) => e.stopPropagation()}
                className="text-xs font-bold text-neutral-400 hover:text-blue-500 transition-colors flex items-center gap-0.5"
              >
                {t('page.favorCalculator')} <HiExternalLink size={10} />
              </Link>
              {isGiftsOpen ? <HiChevronUp className="text-neutral-400" /> : <HiChevronDown className="text-neutral-400" />}
            </div>
          </div>

          {isGiftsOpen && (
            <div className="pb-3 px-3 overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <tbody>
                  {giftsByPref.map(([prefLevel, gifts]) => (
                    // Create each affinity (EXP) group as a single row (tr).
                    <tr
                      key={prefLevel}
                      // Add thin dividers between rows for a clean separation.
                      className="border-b border-neutral-200 dark:border-neutral-700 last:border-0"
                    >
                      <th className="py-2 pr-4 align-middle font-normal whitespace-nowrap w-[1%]">
                        {/* Add flex-col to stack vertically and items-center to center align */}
                        <div className="flex flex-col items-center justify-center gap-1">
                          <img src={getPreferenceIcon(prefLevel, 2)} className="w-4 h-4" alt="" />
                          <span className="text-[11px] font-bold text-neutral-500 dark:text-neutral-400 text-center">+{gifts[0].affectionPoints} EXP</span>
                        </div>
                      </th>

                      {/* Right column: List of gift buttons */}
                      <td className="py-2 align-middle">
                        <div className="flex flex-wrap gap-1">
                          {gifts.map((gift) => (
                            <ItemIcon
                              key={gift.id}
                              type="Item"
                              itemId={gift.id}
                              amount={0}
                              size={10}
                              eventData={eventDataCompat as EventData}
                              iconData={iconData}
                              allStudents={studentData}
                              studentPortraits={portraitData ?? undefined}
                            />
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 3. Skill Area (Single accordion for all) */}
      <div className="flex flex-col border-b border-neutral-200 dark:border-neutral-700">
        <div
          onClick={() => setIsSkillsOpen(!isSkillsOpen)}
          className="flex justify-between items-center w-full px-3 py-3 hover:opacity-70 transition-opacity cursor-pointer"
          role="button"
          onKeyDown={(e) => e.key === 'Enter' && setIsSkillsOpen(!isSkillsOpen)}
        >
          <span className="text-base font-semibold text-neutral-700 dark:text-neutral-200">{t('label.skillInfo')}</span>
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowUW(!showUW);
              }}
              className={`text-xs font-bold px-2 py-1 rounded-sm border transition-colors ${showUW ? 'bg-amber-500 text-white border-amber-500' : 'bg-transparent text-neutral-400 border-neutral-300 dark:border-neutral-600 hover:border-amber-400'}`}
            >
              {t('common.uniqueWeapon')}
            </button>
            {hasGear && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowUE(!showUE);
                }}
                className={`text-xs font-bold px-2 py-1 rounded-sm border transition-colors ${showUE ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-transparent text-neutral-400 border-neutral-300 dark:border-neutral-600 hover:border-emerald-400'}`}
              >
                {t('common.gear')}
              </button>
            )}
            {isSkillsOpen ? <HiChevronUp className="text-neutral-400" /> : <HiChevronDown className="text-neutral-400" />}
          </div>
        </div>

        {isSkillsOpen && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-px border-t border-neutral-200 dark:border-neutral-700">
            {allSkills.map((skill, idx) => (
              <div key={idx} className="p-5 flex flex-col gap-3 bg-white dark:bg-neutral-800 h-full border-b border-r border-neutral-100 dark:border-neutral-700/50 last:border-r-0">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`shrink-0 text-[8px] font-black px-1.5 py-0.5 rounded-sm ${SKILL_BADGE[skill.type] ?? 'bg-neutral-200 dark:bg-neutral-700 text-neutral-500'}`}>
                      {skill.type.includes('+') ? t(`common.${skill.type.replace('+', '').toLowerCase() as 'ex' | 'sub'}`) + '+' : t(`common.${skill.type.toLowerCase() as 'ex' | 'sub'}`)}
                    </span>
                    <span className="text-sm font-bold text-neutral-700 dark:text-neutral-200 truncate leading-tight">{skill.Name}</span>
                  </div>
                  <select
                    value={skill.type === 'EX' ? exLevel : normalLevel}
                    onChange={(e) => (skill.type === 'EX' ? setExLevel : setNormalLevel)(Number(e.target.value))}
                    className="shrink-0 text-xs font-bold bg-transparent outline-none text-neutral-400 hover:text-neutral-900 dark:hover:text-white cursor-pointer"
                  >
                    {Array.from({ length: skill.type === 'EX' ? 5 : 10 }, (_, i) => (
                      <option key={i + 1} value={i + 1} className="dark:bg-neutral-800 text-black dark:text-white">
                        {t('common.level')} {i + 1}
                      </option>
                    ))}
                  </select>
                </div>

                {skill.type === 'EX' && skill.Cost && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-black text-blue-500/80 uppercase tracking-wider bg-blue-50 dark:bg-blue-900/20 px-1 rounded-sm">
                      {t('common.cost')} {skill.Cost[(skill.type === 'EX' ? exLevel : normalLevel) - 1]}
                    </span>
                  </div>
                )}

                <p
                  className="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed overflow-hidden"
                  dangerouslySetInnerHTML={{ __html: formatSkillDesc(skill, skill.type === 'EX' ? exLevel : normalLevel).replaceAll('\n', '<br />') }}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 3.5 Favor Stories */}
      {favorStories &&
        studentId &&
        favorStories[studentId] &&
        Number((favorStories[studentId] as FavorStory[] | undefined)?.length) > 0 &&
        (() => {
          const stories = favorStories[studentId] || [];
          const hasGlobalTranslation = stories.some((s) => s.title['en'] || s.title['zh-Hant']);
          const isJpOnly = !hasGlobalTranslation && locale !== 'ja';
          const allStoryIndices = stories.map((_, i) => i);
          const isTitlesRevealed = revealedTitles.size === stories.length;
          const isSummariesRevealed = revealedSummaries.size === stories.length;

          return (
            <div className="border-b border-neutral-200 dark:border-neutral-700">
              <div className="flex items-center">
                <button
                  onClick={() => setStoryDetailLevel(storyDetailLevel === 0 ? 1 : 0)}
                  className="flex justify-between items-center flex-1 px-3 py-3 hover:opacity-70 transition-opacity cursor-pointer"
                >
                  <span className="text-base font-semibold text-neutral-700 dark:text-neutral-200">{t('label.relationshipStories')}</span>
                  {storyDetailLevel > 0 ? <HiChevronUp className="text-neutral-400" /> : <HiChevronDown className="text-neutral-400" />}
                </button>
                {storyDetailLevel > 0 && (
                  <div className="flex items-center gap-1.5 pr-3">
                    <button
                      onClick={() => {
                        if (isTitlesRevealed) {
                          setRevealedTitles(new Set());
                        } else {
                          setRevealedTitles(new Set(allStoryIndices));
                        }
                      }}
                      className="text-xs font-bold px-2 py-1 rounded-sm border transition-colors bg-transparent text-neutral-400 border-neutral-300 dark:border-neutral-600 hover:border-blue-400"
                    >
                      {isTitlesRevealed ? t('label.story_rank_title') : t('label.story_rank_only')}
                    </button>
                    <button
                      onClick={() => {
                        if (isSummariesRevealed) {
                          setRevealedSummaries(new Set());
                          setRevealedTitles(new Set());
                        } else {
                          setRevealedSummaries(new Set(allStoryIndices));
                          setRevealedTitles(new Set(allStoryIndices));
                        }
                      }}
                      className="text-xs font-bold px-2 py-1 rounded-sm border transition-colors bg-transparent text-neutral-400 border-neutral-300 dark:border-neutral-600 hover:border-blue-400"
                    >
                      {isSummariesRevealed ? t('label.story_summary_hide') : t('label.story_summary_show')}
                    </button>
                    {isJpOnly && (
                      <button
                        onClick={() => setShowGlobalStories(!showGlobalStories)}
                        className="text-xs font-bold px-2 py-1 rounded-sm border transition-colors bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 border-orange-200 dark:border-orange-800"
                      >
                        {showGlobalStories ? t('label.story_global_show') : t('label.story_global_soon')}
                      </button>
                    )}
                  </div>
                )}
              </div>

              {storyDetailLevel > 0 && (
                <div className="pb-3 px-3 pt-1 flex flex-col gap-3">
                  {isJpOnly && !showGlobalStories && (
                    <div className="text-xs text-orange-600 dark:text-orange-400 italic border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/10 rounded p-2">
                      {t('label.global_server_data_pending')}
                    </div>
                  )}
                  {stories.map((story, idx) => {
                    if (isJpOnly && !showGlobalStories) return null;
                    const titleText = story.title[locale] || story.title.ja || story.title.ko;
                    const summaryText = story.summary[locale] || story.summary.ja || story.summary.ko;
                    const isGear = story.favor_rank === 15 || story.favor_rank === 20;

                    const isTitleRevealed = revealedTitles.has(idx) || hoveredStoryIdx === idx;
                    const isSummaryRevealed = revealedSummaries.has(idx) || hoveredStoryIdx === idx;
                    const maskedSummary = '•'.repeat(Math.min(summaryText.length, 60));

                    return (
                      <div
                        key={idx}
                        className="text-xs text-neutral-700 dark:text-neutral-300 leading-relaxed border-l-2 border-neutral-200 dark:border-neutral-700 pl-3"
                        onMouseEnter={() => setHoveredStoryIdx(idx)}
                        onMouseLeave={() => setHoveredStoryIdx(null)}
                      >
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="font-bold text-blue-600 dark:text-blue-400">
                            {t('common.rank')} {story.favor_rank}
                          </span>
                          {isGear && <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400">{t('common.gear')}</span>}
                          {story.is_memorial && (
                            <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300">{t('label.story_memorial')}</span>
                          )}
                        </div>
                        {storyDetailLevel > 0 && (
                          <div
                            className={`font-medium mb-1 text-neutral-800 dark:text-neutral-200 cursor-pointer transition-all duration-200 ${isTitleRevealed ? 'blur-none' : 'blur-sm'}`}
                            onClick={() => setRevealedTitles((prev) => new Set(prev).add(idx))}
                          >
                            {titleText}
                          </div>
                        )}
                        {storyDetailLevel > 0 && (
                          <div
                            className={`text-neutral-600 dark:text-neutral-400 text-xs leading-relaxed cursor-pointer transition-all duration-200 ${isSummaryRevealed ? 'blur-none' : 'blur-sm'}`}
                            onClick={() => setRevealedSummaries((prev) => new Set(prev).add(idx))}
                          >
                            {isSummaryRevealed ? summaryText : maskedSummary}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}

      {/* 4. Footer */}
      <div className="px-3 py-3 flex justify-between items-center text-xs text-neutral-400 tracking-tight">
        <span>
          {t('common.source')}: {t('common.schaledb')}
        </span>
        <a href={`https://schaledb.com/student/${student.PathName}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-blue-500 transition-colors font-bold">
          {t('common.viewOnSchaledb')} <HiExternalLink size={12} />
        </a>
      </div>
    </div>
  );
}

// --- Sub-components ---

function Badge({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex border border-neutral-100 dark:border-neutral-700 rounded">
      <span className="bg-neutral-100 dark:bg-neutral-700 px-1.5 py-1 text-xs font-bold text-neutral-500 border-r border-white dark:border-neutral-800 leading-none flex items-center">{label}</span>
      <span className="px-2 py-1 text-xs font-bold text-white leading-none flex items-center" style={{ backgroundColor: color }}>
        {value}
      </span>
    </div>
  );
}

function TerrainTiny({ label, value }: { label: Terrain; value: number }) {
  const grades = ['D', 'C', 'B', 'A', 'S', 'SS'];
  return (
    <div className="bg-white dark:bg-neutral-800 w-6 h-6 flex flex-col items-center justify-center">
      <span className="text-[7px] text-neutral-400 leading-none mb-0.5">
        {/* {label} */}
        <TerrainIconGameStyle terrain={label} size="14px" />
      </span>
      <span className="text-[10px] font-black text-neutral-800 dark:text-neutral-200 leading-none">{grades[value] || '-'}</span>
    </div>
  );
}
