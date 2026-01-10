import { useState, useCallback, useMemo, useEffect } from 'react';
import { ItemIcon } from './common/Icon';
import type { EventData, IconData, Mission, Stage } from '~/types/plannerData';
import { usePlanForEvent } from '~/store/planner/useEventPlanStore';
import { useTranslation } from 'react-i18next';
import { ChevronIcon } from '../Icon';
import type { Locale } from '~/utils/i18n/config';

export type MissionResult = {
    rewards: Record<string, number>;
};

interface MissionPlannerProps {
    eventId: number;
    eventData: EventData;
    iconData: IconData;
    allStages: (Stage & { type: string })[];
    onCalculate: (result: MissionResult | null) => void;
}

type MissionType = 'DailyMission' | 'Achievement';


const formatMissionDescription = (mission: Mission, allStages: (Stage & { type: string })[], locale: Locale): string => {


    let desc = locale == 'ko' ? mission.Description.Kr :locale == 'ja' ? mission.Description.Jp : locale == 'en' ?mission.Description.En : mission.Description.Tw || mission.Description.Jp;

    desc = desc.replace('{2}', mission.CompleteConditionCount.toString());


    // {1}, {0} -> Replace with Stage Information
    const stageIdParam = mission?.CompleteConditionParameter?.find(p => p > 20000);
    if (stageIdParam) {
        const stageInfo = allStages.find(s => s.Id === stageIdParam);
        if (stageInfo) {
            const stageName = stageInfo.Name.split('_').pop()?.replace('Stage', '') || '';


            const typeMap: Record<string, string> = {
                story: 'Story',
                stage: 'Quest',
                challenge: 'Challenge'
            };
            const stageType = typeMap[stageInfo.type] || stageInfo.type;

            desc = desc.replace('{0}', stageName.trim()).replace('{1}', stageType);

        }
    }

    // e.g., "Complete {0} or more challenge missions")
    desc = desc.replace('{0}', mission.CompleteConditionCount.toString());

    return desc;
};


export const MissionPlanner = ({
    eventId,
    eventData,
    iconData,
    allStages,
    onCalculate,
}: MissionPlannerProps) => {
    const [isCollapsed, setIsCollapsed] = useState(false);

    const { completedMissions, durationDays, setCompletedMissions, setDurationDays } = usePlanForEvent(eventId);

    const { t, i18n } = useTranslation("planner");
    const locale = i18n.language as Locale


    const missionData = eventData.mission || [];

    const missionTypes = useMemo(() => {
        const types: Record<number, MissionType> = {};
        missionData.forEach(mission => {
            if (mission.CategoryStr === 'Daily') {
                types[mission.Id] = 'DailyMission';
            } else if (mission.CategoryStr === 'EventAchievement') {
                types[mission.Id] = 'Achievement';
            } else if (mission.CategoryStr === 'EventFixed') {
                const dependencies = mission.CompleteConditionParameter.filter(p => p > 20000);
                if (dependencies.length > 0 && dependencies.every(depId => missionData.find(m => m.Id === depId)?.CategoryStr === 'Daily')) {
                    types[mission.Id] = 'DailyMission'; // If all sub missions are "Daily Mission", this is also "Daily Mission"
                } else {
                    types[mission.Id] = 'Achievement';
                }
            } else {
                types[mission.Id] = 'Achievement';
            }
        });
        return types;
    }, [missionData]);

    // Transfer results to the calculation results
    useEffect(() => {
        const rewards: Record<string, number> = {};
        completedMissions?.forEach(missionId => {
            const mission = missionData.find(m => m.Id === missionId);
            if (!mission) return;

            const missionType = missionTypes[missionId];
            const multiplier = missionType === 'DailyMission' ? (durationDays || 0) : 1;

            mission.MissionRewardParcelId.forEach((rewardId, index) => {
                const key = `${mission.MissionRewardParcelTypeStr[index]}_${rewardId}`;
                const amount = mission.MissionRewardAmount[index];
                rewards[key] = (rewards[key] || 0) + (amount * multiplier);
            });
        });
        onCalculate({ rewards });
    }, [completedMissions, durationDays, missionData, missionTypes, onCalculate]);

    if (completedMissions === undefined || durationDays === undefined) return null


    const handleToggleMission = useCallback((missionId: number) => {
        setCompletedMissions((prev => {
            const newSet = new Set(prev);
            if (newSet.has(missionId)) {
                newSet.delete(missionId);
            } else {
                newSet.add(missionId);
            }
            return newSet;
        })(completedMissions));
    }, [setCompletedMissions]);

    const handleSelectAll = useCallback(() => {
        const allMissionIds = new Set(eventData.mission?.map(m => m.Id) || []);
        setCompletedMissions(allMissionIds);
    }, [eventData, setCompletedMissions]);
    const handleDeselectAll = useCallback(() => { setCompletedMissions(new Set()); }, []);

    if (missionData.length === 0) return null;

    return (
        <>
            <div className="flex justify-between items-center cursor-pointer group" onClick={() => setIsCollapsed(prev => !prev)}>
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{t('mission.title')}</h2>
                <span className="text-2xl transition-transform duration-300 group-hover:scale-110"><ChevronIcon className={isCollapsed ? "rotate-180" : ""} /></span>
            </div>

            {!isCollapsed && (
                <div className="mt-4">
                    <div className="flex justify-between items-center gap-2 mb-4 flex-wrap">
                        {/* DailyMission Period Input UI */}
                        <div className="flex items-center gap-2">
                            <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 shrink-0">{t('mission.dailyMissionDuration')}</label>
                            <input
                                type="number"
                                value={durationDays}
                                onChange={e => setDurationDays(parseInt(e.target.value) || 0)}
                                className="w-20 p-1 border rounded-md text-sm bg-transparent dark:border-neutral-600 dark:text-gray-200"
                            />
                            <span className="text-sm text-gray-600 dark:text-gray-400">{t('mission.unitDay')}</span>
                        </div>
                        <div className="flex justify-end gap-2">
                            <button onClick={handleSelectAll} className="bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 text-white text-xs font-bold py-1 px-3 rounded-md">
                                {t('mission.clearAll')}
                            </button>
                            <button onClick={handleDeselectAll} className="bg-gray-400 hover:bg-gray-500 dark:bg-neutral-600 dark:hover:bg-neutral-700 text-white text-xs font-bold py-1 px-3 rounded-md">
                                {t('button.deselectAll')}
                            </button>
                        </div>
                    </div>
                    <div className="divide-y dark:divide-neutral-700 overflow-y-auto pr-2">
                        {missionData.map(mission => {
                            const missionType = missionTypes[mission.Id];
                            return (
                                <div key={mission.Id} className="py-2 px-1 flex items-center gap-3">

                                    <div className="flex items-center gap-4 flex-1 min-w-0">

                                        <input
                                            type="checkbox"
                                            checked={completedMissions.includes(mission.Id)}
                                            onChange={() => handleToggleMission(mission.Id)}
                                            className="h-5 w-5 rounded border-gray-300 dark:border-neutral-600 text-blue-600 focus:ring-blue-500 shrink-0 bg-transparent"
                                        />
                                        <div className="flex items-center gap-2 truncate">
                                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 whitespace-nowrap ${missionType === 'DailyMission' ? 'bg-green-200 text-green-800 dark:bg-green-900/60 dark:text-green-300' :
                                                'bg-yellow-200 text-yellow-800 dark:bg-yellow-900/60 dark:text-yellow-300'
                                                }`}>
                                                {t(`mission.${missionType}`, { defaultValue: missionType })}
                                            </span>
                                            <p className="text-sm text-gray-800 dark:text-gray-200 truncate">
                                                {formatMissionDescription(mission, allStages, locale)}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap gap-1.5 justify-end shrink-0 ml-auto">
                                        {mission.MissionRewardParcelId.map((rewardId, index) => (
                                            <ItemIcon
                                                key={index}
                                                type={mission.MissionRewardParcelTypeStr[index]}
                                                itemId={String(rewardId)}
                                                amount={mission.MissionRewardAmount[index]}
                                                size={10}
                                                eventData={eventData}
                                                iconData={iconData}
                                            />
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </>
    );
};