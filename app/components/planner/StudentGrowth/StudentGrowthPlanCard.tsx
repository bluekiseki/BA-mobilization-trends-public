// StudentGrowthPlanCard.tsx
import { useMemo, useCallback } from 'react';
import { useRef } from 'react';
import { useEffect } from 'react';
import { useState } from 'react';
import { useGlobalStore, type GrowthPlan } from '~/store/planner/useGlobalStore';
import type { EventData, IconData, IconInfos, Skill, Student, StudentData, StudentPortraitData } from '~/types/plannerData';
import eventList from "~/data/jp/eventList.json";
import { useTranslation } from 'react-i18next';
import { BasicStatsTab } from './BasicStatsTab';
import { SkillsTab } from './SkillsTab.tsx';
import { EquipmentTab } from './EquipmentTab';
import { PotentialTab } from './PotentialTab';
import { AffectionTab, HighFlowerBouquetItemIds, LowFlowerBouquetItemIds } from './FaverTab';
import StudentSearchDropdown from '~/components/StudentSearchDropdown';

interface StudentGrowthPlanCardProps {
    plan: GrowthPlan;
    allStudents: StudentData;
    studentPortraits: StudentPortraitData;
    studentOptions: [string, Student][];
    eventData?: EventData;
    iconData?: IconData;
    iconInfos?: IconInfos;
    onClose: () => void;
}


// --- Helper constants and components ---
export const uwMaxLevelMap: Record<number, number> = { 0: 1, 1: 30, 2: 40, 3: 50, 4: 60, 5: 70 };
export const TIER_OPTIONS = Array.from({ length: 10 }, (_, i) => i + 1);
export const TIER_TO_LEVEL: Record<number, number> = {
    1: 10, 2: 20, 3: 30, 4: 40, 5: 45,
    6: 50, 7: 55, 8: 60, 9: 65, 10: 70
};


const formatSkillBuffDesc = (str:string)=>{
    const { t } = useTranslation("stat");
   return str.replace(/<b:(\w+)>/g, (match, paramIndexStr) => {
        const i18nKey = `Buff_${paramIndexStr}`
        return `<strong>${t(i18nKey, match)}</strong>`
    }).replace(/<d:(\w+)>/g, (match, paramIndexStr) => {
        const i18nKey = `Debuff_${paramIndexStr}`
        return `<strong>${t(i18nKey, match)}</strong>`
    }).replace(/<s:(\w+)>/g, (match, paramIndexStr) => {
        const i18nKey = `Special_${paramIndexStr}`
        return `<strong>${t(i18nKey, match)}</strong>`
    }).replace(/<c:(\w+)>/g, (match, paramIndexStr) => {
        const i18nKey = `CC_${paramIndexStr}`
        return `<strong>${t(i18nKey, match)}</strong>`
    }).replace(/\\n/g, '<br/>');
}

export const SkillDisplay = ({ studentInfo, skillKey, skillLabel, currentLevel, targetLevel, currentUW, targetUW, skillData, currentRank, targetRank }: {
    studentInfo: Student;
    skillKey: 'Ex' | 'Public' | 'Passive' | 'ExtraPassive';
    skillLabel: string;
    currentLevel: number;
    targetLevel: number;
    currentUW: number;
    targetUW: number;
    skillData: Skill | undefined;
    currentRank: number,
    targetRank: number,
}) => {
    let currentSkillData: Skill | undefined = skillData;
    let targetSkillData: Skill | undefined = skillData;

    let skill_desp_diff = false


    const { t, i18n } = useTranslation("stat");
    // let currentSkillData: Skill | undefined = studentInfo.Skills[skillKey];
    // let targetSkillData: Skill | undefined = studentInfo.Skills[skillKey];

    if (skillKey === 'Passive') {
        if (currentUW >= 2 && studentInfo.Skills.WeaponPassive) {
            currentSkillData = studentInfo.Skills.WeaponPassive;
        }
        if (targetUW >= 2 && studentInfo.Skills.WeaponPassive) {
            targetSkillData = studentInfo.Skills.WeaponPassive;
        }
        if (
            (currentUW >= 2 ) != (targetUW >= 2 )
        ){
            skill_desp_diff = true
        }
    }

    if (skillKey === 'Public' && studentInfo.Skills.GearPublic){
        if (currentRank >= 20 && studentInfo.Skills.GearPublic) {
            currentSkillData = studentInfo.Skills.GearPublic;
        }
        if (targetRank >= 20 && studentInfo.Skills.GearPublic) {
            targetSkillData = studentInfo.Skills.GearPublic;
        }
        if (
            (currentRank >= 20 ) != (targetRank >= 20 )
        ){
            skill_desp_diff = true
        }
    }


    if (!currentSkillData || !targetSkillData) return null;

    const formatSkillDesc = (skillData: Skill, level: number) => {
        if (!skillData.Desc || !skillData.Parameters) return '';
        return formatSkillBuffDesc(skillData.Desc.replace(/<\?(\d)>/g, (match, paramIndexStr) => {
            const paramIndex = parseInt(paramIndexStr, 10) - 1;
            const levelIndex = level - 1;
            if (skillData.Parameters[paramIndex] && skillData.Parameters[paramIndex][levelIndex] !== undefined) {
                return `<strong class="text-blue-600 dark:text-blue-400">${skillData.Parameters[paramIndex][levelIndex]}</strong>`;
            }
            return match;
        }))
    };

    const formatSkillDiffDesc = (skillData: Skill, level: [number, number]) => {
        if (!skillData.Desc || !skillData.Parameters) return '';

        return formatSkillBuffDesc(skillData.Desc.replace(/<\?(\d)>/g, (match, paramIndexStr) => {
            const paramIndex = parseInt(paramIndexStr, 10) - 1;
            const levelIndex = [level[0] - 1, level[1] - 1]; // [current, target]

            if (!skillData.Parameters[paramIndex] ||
                skillData.Parameters[paramIndex][levelIndex[0]] === undefined ||
                skillData.Parameters[paramIndex][levelIndex[1]] === undefined) {

                const val = skillData.Parameters[paramIndex]?.[levelIndex[0]];
                if (val !== undefined) {
                    return `<strong class="text-neutral-700 dark:text-neutral-300 font-normal">${val}</strong>`;
                }
                return match;
            }
            const valBefore = skillData.Parameters[paramIndex][levelIndex[0]];
            const valAfter = skillData.Parameters[paramIndex][levelIndex[1]];
            return `<strong class="font-bold">` +
                `<span class="text-neutral-500 dark:text-neutral-400">${valBefore}</span>` +
                `<span class="text-neutral-400 dark:text-neutral-500 mx-0.5">→</span>` +
                `<span class="text-blue-600 dark:text-blue-400">${valAfter}</span>` +
                `</strong>`;

        }))
    };

    const currentDesc = formatSkillDesc(currentSkillData, currentLevel);
    const targetDesc = formatSkillDesc(targetSkillData, targetLevel);
    const changeDesc = formatSkillDiffDesc(targetSkillData, [currentLevel, targetLevel]);

    const currentCost = skillKey === 'Ex' ? currentSkillData.Cost?.[currentLevel - 1] : null;
    const targetCost = skillKey === 'Ex' ? targetSkillData.Cost?.[targetLevel - 1] : null;

    return (
        <div className="p-2 bg-white dark:bg-neutral-800 rounded border border-gray-200 dark:border-neutral-700 text-xs flex flex-col h-full">

            <div className="font-bold flex justify-between items-baseline mb-1">
                <div className="flex items-center gap-2">
                    <span className="bg-gray-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">{skillLabel}</span>
                    <span className="grow text-gray-900 dark:text-neutral-200">{targetSkillData.Name}</span>
                </div>

                {/* Show EX skill cost */}
                {skillKey === 'Ex' && currentCost != null && currentCost != undefined && (
                    <div className="text-sm shrink-0">
                        <span className="font-semibold text-gray-500 dark:text-gray-400">{currentCost}</span>
                        {targetCost !== currentCost && (
                            <span className="font-bold text-blue-600 dark:text-blue-400"> → {targetCost}</span>
                        )}
                        <span className="text-yellow-500 dark:text-yellow-400 ml-1">Cost</span>
                    </div>
                )}
            </div>

            {/* Skill Description */}
            <div className="font-light text-gray-700 dark:text-neutral-300 space-y-1 grow bg-gray-50 dark:bg-neutral-700/50 p-1.5 rounded">

                {(currentLevel == targetLevel && !skill_desp_diff) &&
                    <div dangerouslySetInnerHTML={{ __html: currentDesc }} />
                }

                {/* If the goal level is higher, show the goal skill description */}
                {(currentLevel < targetLevel || skill_desp_diff) && (
                    <>
                        {skill_desp_diff ?
                            <>
                                <div dangerouslySetInnerHTML={{ __html: currentDesc }} />
                                <div className="text-center text-gray-400 dark:text-neutral-500 text-lg leading-none">↓</div>
                                <div className="p-1.5 bg-blue-50 dark:bg-blue-900/50 rounded" dangerouslySetInnerHTML={{ __html: targetDesc }} />
                            </> :
                            <div dangerouslySetInnerHTML={{ __html: changeDesc }} />

                        }
                    </>
                )}
            </div>
        </div>
    );
};


export const StudentGrowthPlanCard = ({ plan, allStudents, studentPortraits, studentOptions, eventData, iconData, onClose }: StudentGrowthPlanCardProps) => {
    const { removePlan, updatePlan, toggleEventInclusion } = useGlobalStore();
    const [searchTerm, setSearchTerm] = useState('');
    const [isDropdownVisible, setIsDropdownVisible] = useState(false);
    const [activeTab, setActiveTab] = useState('stats');

    const dropdownRef = useRef<HTMLDivElement>(null);

    const studentInfo = plan.studentId ? allStudents[plan.studentId] : null;
    const baseStarGrade = studentInfo?.StarGrade || 1;

    const { t } = useTranslation("planner");

    useEffect(() => {
        // studentPortraits.
        Object.entries(allStudents).map(([studentId, student]) => {
            student.Portrait = studentPortraits[parseInt(studentId)]
        })
    })

    useEffect(() => {
        if (
            baseStarGrade > plan.current.star
        ) {

            updatePlan(plan.uuid, 'current.star', baseStarGrade)
        }
    })
    const handlePlanChange = useCallback((field: string, value: any, isNumeric = false) => {
        let finalValue = value;
        if (isNumeric) {
            finalValue = Number(value) || 0;
        }
        updatePlan(plan.uuid, field, finalValue);
    }, [updatePlan, plan.uuid]);


    const handleRankChange = useCallback((type: 'current' | 'target', value: string) => {
        const [rankType, rankLevelStr] = value.split('_');
        const rankLevel = Number(rankLevelStr);
        if (rankType === 'star') {
            updatePlan(plan.uuid, `${type}.star`, rankLevel);
            updatePlan(plan.uuid, `${type}.uw`, 0);
            updatePlan(plan.uuid, `${type}.uwLevel`, 1);
        } else { // 'uw'
            updatePlan(plan.uuid, `${type}.star`, 5);
            updatePlan(plan.uuid, `${type}.uw`, rankLevel);
        }
    }, [updatePlan, plan.uuid]);



    const rankOptions = useMemo(() => [
        ...Array.from({ length: 5 }, (_, i) => ({ value: `star_${i + 1}`, label: `${i + 1}★` })),
        ...Array.from({ length: 4 }, (_, i) => ({ value: `uw_${i + 1}`, label: `UE ${i + 1}★` })),
    ], []);

    const handleEquipmentChange = useCallback((type: 'current' | 'target', slotIndex: number, value: number) => {
        const newEquipment = [...plan[type].equipment];
        newEquipment[slotIndex] = value;
        updatePlan(plan.uuid, `${type}.equipment`, newEquipment);
    }, [updatePlan, plan.uuid, plan]);

    const handlePotentialChange = useCallback((type: 'current' | 'target', stat: 'hp' | 'atk' | 'heal', value: number) => {
        const newPotential = { ...plan[type].potential, [stat]: value };
        updatePlan(plan.uuid, `${type}.potential`, newPotential);
    }, [updatePlan, plan.uuid, plan]);


    const sortedEvents = useMemo(() => Object.entries(eventList).map(([id, details]) => ({ id: Number(id), name: `${Number(id) > 10000 ? `[${t('common.rerun')}] ` : ''}${details.Kr}` })).sort((a, b) => a.name.localeCompare(b.name)), []);

    const filteredEvents = useMemo(() => {
        if (searchTerm.trim() === '') return sortedEvents;
        return sortedEvents.filter(event =>
            !plan.includedInEvents.includes(event.id) && // Exclude already selected events
            event.name.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [searchTerm, sortedEvents, plan.includedInEvents]);

    const handleAddEvent = (eventId: number) => {
        toggleEventInclusion(plan.uuid, eventId);
        setSearchTerm('');
        setIsDropdownVisible(false);
    };

    // Close when you click outside the drop-down
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsDropdownVisible(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);


    const giftAffectionList = useMemo(() => {
        if (!plan.studentId || !eventData?.icons.Item) return [];

        const studentInfo = allStudents[plan.studentId];
        const studentTags = [...(studentInfo.FavorItemTags || []), ...(studentInfo.FavorItemUniqueTags || [])];

        const allGifts = Object.entries(eventData?.icons.Item)
            .filter(([, itemData]) => itemData.ItemCategory === 6)
            .map(([itemId, itemData]) => {
                const matchCount = itemData.TagsStr?.filter(tag => studentTags.includes(tag)).length || 0;
                let preferenceLevel = matchCount + 1 + Number(itemData.Rarity === 3); // Start from stage 1 (Normal)
                let affectionPoints = 0;

                // 5996 5997
                if (HighFlowerBouquetItemIds.includes(Number(itemId))) {
                    affectionPoints = 240;
                    preferenceLevel = 4
                } else if (LowFlowerBouquetItemIds.includes(Number(itemId))) {
                    affectionPoints = 60;
                    preferenceLevel = 3

                }

                else if (itemData.Rarity === 3) { // purple gift
                    if (preferenceLevel >= 4) affectionPoints = 240;
                    else if (preferenceLevel === 3) affectionPoints = 180;
                    else affectionPoints = 120; // Level 1 and 2, 120 points
                } else { // normal gift (Rarity === 2)
                    if (preferenceLevel >= 4) affectionPoints = 80;
                    else if (preferenceLevel === 3) affectionPoints = 60;
                    else if (preferenceLevel === 2) affectionPoints = 40;
                    else affectionPoints = 20; // Stage 1
                }

                return {
                    id: itemId,
                    type: 'Item',
                    rarity: itemData.Rarity,
                    affectionPoints,
                    preferenceLevel
                };
            });

        return allGifts.sort((a, b) => b.rarity - a.rarity || b.affectionPoints - a.affectionPoints);

    }, [plan.studentId, allStudents, iconData]);

    const canEnablePotentialCurrent = plan.current.level >= 90 && plan.current.uw > 0;
    const canEnablePotentialTarget = plan.target.level >= 90 && plan.target.uw > 0;

    const tabData = [
        { id: 'stats', name: t('growthCard.stats') },
        { id: 'skills', name: t('growthCard.skills') },
        { id: 'equipment', name: t('growthCard.equipment') },
        { id: 'potential', name: t('growthCard.potential') },
        { id: 'affection', name: t('growthCard.affection') },
    ];


    return (
        <div className="p-0 sm:p-4 sm:border sm:rounded-lg sm:bg-gray-50 sm:shadow-sm sm:dark:bg-neutral-800 sm:border-gray-200 sm:dark:border-neutral-700 text-black dark:text-neutral-200">
            <div className="flex flex-col sm:flex-row justify-between items-start mb-3 gap-3">
                <div className="flex items-center gap-2 w-full sm:w-auto flex-1">
                    {plan.studentId && studentPortraits[plan.studentId] && (
                        <img src={`data:image/webp;base64,${studentPortraits[plan.studentId]}`} alt="portrait" className="w-12 h-12 rounded-full object-cover border-2 border-gray-300 dark:border-neutral-600 shrink-0" />
                    )}
                    <div className="w-full">
                        <StudentSearchDropdown
                            students={allStudents}
                            selectedStudentId={plan.studentId}
                            setSelectedStudentId={studentId => handlePlanChange('studentId', Number(studentId))} />
                    </div>
                </div>
                <div className="flex flex-row items-end gap-2 self-end sm:self-auto shrink-0">
                    <button onClick={onClose} className="bg-blue-500 hover:bg-blue-600 text-white font-bold text-xs py-1 px-3 rounded">
                        {t('common.close')}
                    </button>
                    <button onClick={() => { removePlan(plan.uuid); onClose() }} className="bg-red-500 hover:bg-red-600 text-white font-bold text-xs py-1 px-2 rounded">
                        {t('common.remove')}
                    </button>
                </div>
            </div>

            <div className="flex border-b border-gray-200 dark:border-neutral-700 mb-4 overflow-x-auto overflow-y-hidden whitespace-nowrap">
                {tabData.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`px-4 py-2 text-sm font-semibold -mb-px border-b-2 shrink-0 ${activeTab === tab.id
                            ? 'border-blue-500 text-blue-600 dark:border-blue-500 dark:text-blue-400'
                            : 'border-transparent text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-neutral-600'
                            }`}
                    >
                        {tab.name}
                    </button>
                ))}
            </div>


            <div className="min-h-[150px]">
                {studentInfo ? (<>
                    {activeTab === 'stats' && (
                        <BasicStatsTab
                            plan={plan}
                            studentInfo={studentInfo}
                            handlePlanChange={handlePlanChange}
                            handleRankChange={handleRankChange}
                            rankOptions={rankOptions}
                        />
                    )}
                    {activeTab === 'skills' && <SkillsTab plan={plan} studentInfo={studentInfo} handlePlanChange={handlePlanChange} />}
                    {activeTab === 'equipment' && <EquipmentTab plan={plan} studentInfo={studentInfo} handleEquipmentChange={handleEquipmentChange} />}
                    {activeTab === 'potential' && <PotentialTab plan={plan} handlePotentialChange={handlePotentialChange} canEnablePotentialCurrent={canEnablePotentialCurrent} canEnablePotentialTarget={canEnablePotentialTarget} />}
                    {activeTab === 'affection' && eventData?.icons.Item && iconData && (
                        <AffectionTab
                            plan={plan}
                            giftAffectionList={giftAffectionList}
                            eventData={eventData}
                            iconData={iconData}
                            handlePlanChange={handlePlanChange}
                        />
                    )}
                </>
                ) : (
                    <div className="flex items-center justify-center w-full h-full min-h-[150px] text-gray-500 dark:text-gray-400 text-sm">
                        <p>{t('plannerCard.selectStudentPrompt', "selectStudentPrompt")}</p>
                    </div>
                )}
            </div>



            <div className="mt-4 border-t border-gray-200 dark:border-neutral-700 pt-3" ref={dropdownRef}>
                <h4 className="font-semibold text-sm mb-2">{t('growthCard.includeInEventsQuestion')}</h4>
                <div className="relative">
                    <div className="flex flex-wrap gap-2 p-2 border rounded-md bg-white dark:bg-neutral-700 border-gray-300 dark:border-neutral-600 min-h-[40px]">
                        {plan.includedInEvents.map(eventId => {
                            const eventName = sortedEvents.find(e => e.id === eventId)?.name || `Event ${eventId}`;
                            return (
                                <div key={eventId} className="flex items-center gap-1.5 bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 text-xs font-semibold px-2 py-1 rounded-full">
                                    <span>{eventName}</span>
                                    <button onClick={() => toggleEventInclusion(plan.uuid, eventId)}
                                        className="grow p-1 text-sm focus:outline-none bg-transparent"                                    >
                                        &times;
                                    </button>
                                </div>
                            );
                        })}
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            onFocus={() => setIsDropdownVisible(true)}
                            placeholder={t("growthCard.searchEventsPlaceholder")}
                            className="grow p-1 text-sm focus:outline-none"
                        />
                    </div>

                    {isDropdownVisible && filteredEvents.length > 0 && (
                        <div className="absolute top-full left-0 w-full mt-1 bg-white dark:bg-neutral-800 border border-gray-300 dark:border-neutral-600 rounded-md shadow-lg max-h-48 overflow-y-auto overflow-x-hidden z-10">

                            {filteredEvents.map(event => (
                                <button
                                    key={event.id}
                                    onClick={() => handleAddEvent(event.id)}
                                    className="w-full text-left px-3 py-2 text-sm text-black dark:text-neutral-200 hover:bg-gray-100 dark:hover:bg-neutral-700"
                                >
                                    {event.name}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
