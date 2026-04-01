import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/shallow';
import { useChartControlsStore } from '~/store/chartControlsStore';
import type { Skill, Student } from '~/types/plannerData';
import { cdn } from '~/utils/cdn';
import { getLocaleShortName, type Locale } from '~/utils/i18n/config';
import { HiExternalLink, HiChevronDown, HiChevronUp } from 'react-icons/hi';
import { type_translation } from '../raidToString';
import { TerrainIconGameStyle, type Terrain } from '../teran';
import { formatSkillBuffDesc } from '../planner/StudentGrowth/SkillDisplay';

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

  const { selectedStudentId: studentId } = useChartControlsStore(
    useShallow((state) => ({
      selectedStudentId: state.selectedStudentId,
    })),
  );

  const [isSkillsOpen, setIsSkillsOpen] = useState(false);
  const [exLevel, setExLevel] = useState(5);
  const [normalLevel, setNormalLevel] = useState(10);

  useEffect(() => {
    fetch(cdn(`/schaledb.com/${getLocaleShortName(locale)}.students.min.json`))
      .then((res) => res.json() as any)
      .then((data) => setStudentsData(data))
      .catch(console.error);
  }, [locale]);

  const student = studentData?.[studentId];
  const portrait = portraitData?.[studentId];

  if (!student) return null;

  const typeColors = {
    Bullet: { Explosion: '#b62915', Pierce: '#bc8800', Mystic: '#206d9b', Sonic: '#9a46a8', Chemical: '#137973' },
    Armor: { LightArmor: '#b62915', HeavyArmor: '#bc8800', Unarmed: '#206d9b', ElasticArmor: '#9a46a8', CompositeArmor: '#137973' },
  };

  const formatSkillDesc = (data: Skill, level: number) => {
    if (!data.Desc || !data.Parameters) return '';
    const rawDesc = data.Desc.replace(/<\?(\d+)>/g, (match, paramIndexStr) => {
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
    { ...student.Skills.Public, type: 'Normal' },
    { ...student.Skills.Passive, type: 'Passive' },
    { ...student.Skills.ExtraPassive, type: 'Sub' },
  ];

  return (
    <div className="flex flex-col w-full text-left">
      {/* 1. Header Area: Layout photo and information side-by-side */}
      <div className="py-2 flex flex-row gap-4 border-b border-neutral-200 dark:border-neutral-700 items-start">
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
                  <span className="text-[10px] text-neutral-400 font-medium leading-none mb-1 tracking-tight truncate">{student.FamilyName}</span>
                )}
                <h2 className="text-xl font-bold text-neutral-900 dark:text-white tracking-tighter truncate leading-none">{student.Name}</h2>
              </div>

              {/* Terrain Aptitude: Compactly placed at the top-right */}
              <div className="flex bg-neutral-100 dark:bg-neutral-700 p-px gap-px shrink-0 border-neutral-100 dark:border-neutral-700">
                <TerrainTiny label={'Street'} value={student.StreetBattleAdaptation} />
                <TerrainTiny label={'Outdoor'} value={student.OutdoorBattleAdaptation} />
                <TerrainTiny label={'Indoor'} value={student.IndoorBattleAdaptation} />
              </div>
            </div>

            {/* Affiliation Info: Placed directly below the name */}
            <p className="text-[10px] text-neutral-500 font-medium tracking-tight mt-0.5 opacity-80">
              <span className="whitespace-nowrap">{t_club(student.School, student.School)}</span> / <span className="whitespace-nowrap">{t_club(student.Club, student.School)}</span>
            </p>
          </div>

          {/* Bottom attribute badges and position info */}
          <div className="flex flex-wrap items-center justify-between gap-y-2 mt-3 w-full">
            {/* Attack/Defense types */}
            <div className="flex gap-1">
              <Badge label="ATK" value={type_translation[student.BulletType][getLocaleShortName(locale)]} color={typeColors.Bullet[student.BulletType as keyof typeof typeColors.Bullet]} />
              <Badge label="DEF" value={type_translation[student.ArmorType][getLocaleShortName(locale)]} color={typeColors.Armor[student.ArmorType as keyof typeof typeColors.Armor]} />
            </div>

            {/* Unit Type / Tactical Role */}
            <div className="flex items-center gap-1.5 px-1.5 py-0.5 border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50">
              <span className="text-[10px] font-bold text-neutral-600 dark:text-neutral-300">{t_chart(`ranking.control.squad_type_${student.SquadType.toLowerCase()}` as any)}</span>
              <span className="text-[9px] text-neutral-300 dark:text-neutral-600 font-black">/</span>
              <span className="text-[10px] font-bold text-neutral-600 dark:text-neutral-300">{t_chart(`ranking.control.tactic_role_${student.TacticRole}` as any)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Skill Area (Single accordion for all) */}
      <div className="flex flex-col border-b border-neutral-200 dark:border-neutral-700">
        <button
          onClick={() => setIsSkillsOpen(!isSkillsOpen)}
          className="flex justify-between items-center px-4 py-3 bg-neutral-50/50 dark:bg-neutral-900/20 hover:bg-neutral-100 dark:hover:bg-neutral-900/50 transition-colors cursor-pointer"
        >
          <span className="text-xs font-bold text-neutral-600 dark:text-neutral-300 uppercase tracking-widest">Skill Information</span>
          {isSkillsOpen ? <HiChevronUp className="text-neutral-400" /> : <HiChevronDown className="text-neutral-400" />}
        </button>

        {isSkillsOpen && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 bg-neutral-50 dark:bg-neutral-900/40 gap-px border-t border-neutral-100 dark:border-neutral-700">
            {allSkills.map((skill, idx) => (
              <div key={idx} className="p-4 flex flex-col gap-2 bg-white dark:bg-neutral-800 h-full border-b border-r border-neutral-100 dark:border-neutral-700/50 last:border-r-0">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`shrink-0 text-[8px] font-black px-1.5 py-0.5 rounded-sm ${skill.type === 'EX' ? 'bg-orange-500 text-white' : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-500'}`}
                    >
                      {t(`common.${skill.type.toLowerCase() as 'ex' | 'sub'}`)}
                    </span>
                    <span className="text-[12px] font-bold text-neutral-700 dark:text-neutral-200 truncate leading-tight">{skill.Name}</span>
                  </div>
                  <select
                    value={skill.type === 'EX' ? exLevel : normalLevel}
                    onChange={(e) => (skill.type === 'EX' ? setExLevel : setNormalLevel)(Number(e.target.value))}
                    className="shrink-0 text-[10px] font-bold bg-transparent outline-none text-neutral-400 hover:text-neutral-900 dark:hover:text-white cursor-pointer"
                  >
                    {Array.from({ length: skill.type === 'EX' ? 5 : 10 }, (_, i) => (
                      <option key={i + 1} value={i + 1} className="dark:bg-neutral-800 text-black dark:text-white">
                        Lv.{i + 1}
                      </option>
                    ))}
                  </select>
                </div>

                {skill.type === 'EX' && skill.Cost && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] font-black text-blue-500/80 uppercase tracking-wider bg-blue-50 dark:bg-blue-900/20 px-1 rounded-sm">
                      Cost {skill.Cost[(skill.type === 'EX' ? exLevel : normalLevel) - 1]}
                    </span>
                  </div>
                )}

                <p
                  className="text-[11px] text-neutral-500 dark:text-neutral-400 leading-relaxed overflow-hidden"
                  dangerouslySetInnerHTML={{ __html: formatSkillDesc(skill, skill.type === 'EX' ? exLevel : normalLevel) }}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 3. Footer */}
      <div className="px-4 py-3 flex justify-between items-center text-[9px] text-neutral-400 tracking-tighter">
        <span>Source: SchaleDB</span>
        <a href={`https://schaledb.com/student/${student.PathName}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-blue-500 transition-colors font-bold">
          View on SchaleDB <HiExternalLink size={12} />
        </a>
      </div>
    </div>
  );
}

// --- Sub-components ---

function Badge({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex border border-neutral-100 dark:border-neutral-700">
      <span className="bg-neutral-100 dark:bg-neutral-700 px-1 py-0.5 text-[9px] font-bold text-neutral-500 border-r border-white dark:border-neutral-800 leading-none flex items-center">{label}</span>
      <span className="px-1.5 py-0.5 text-[9px] font-bold text-white leading-none flex items-center" style={{ backgroundColor: color }}>
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
