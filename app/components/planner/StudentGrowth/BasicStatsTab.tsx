// // app/components/planner/StudentGrowth/BasicStatsTab.tsx
// import { useTranslation } from 'react-i18next';
// import { CustomNumberInput } from '~/components/CustomInput';
// import type { GrowthPlan } from '~/store/planner/useGlobalStore';
// import type { Student } from '~/types/plannerData';

// export const BasicStatsTab = ({ plan, studentInfo, handlePlanChange, handleRankChange, rankOptions }: {
//     plan: GrowthPlan;
//     studentInfo: Student;
//     handlePlanChange: (field: string, value: any, isNumeric?: boolean) => void,
//     handleRankChange: (type: "current" | "target", value: string) => void,
//     rankOptions: {
//         value: string;
//         label: string;
//     }[]

// }) => {
//     const baseStarGrade = studentInfo?.StarGrade || 1;
//     const currentRankValue = plan.current.uw > 0 ? `uw_${plan.current.uw}` : `star_${plan.current.star}`;
//     const targetRankValue = plan.target.uw > 0 ? `uw_${plan.target.uw}` : `star_${plan.target.star}`;
//     const { t } = useTranslation("planner");

//     return (
//         <>
//             <div className="space-y-2 text-sm">

//                 <div className="flex items-center gap-2 mb-2 text-center font-semibold">
//                     <span className="w-24 shrink-0"></span>
//                     <h3 className="flex-1 text-gray-700 dark:text-neutral-300">{t('common.current')}</h3>
//                     <span className="w-8 shrink-0"></span>
//                     <h3 className="flex-1 text-blue-600 dark:text-blue-400">{t('common.target')}</h3>
//                 </div>

//                 <div className="flex items-center gap-2">
//                     <label className="w-24 shrink-0 font-semibold">{t('basicStatsTab.level')}</label>
//                     <div className="flex-1">
//                         <CustomNumberInput min={1} max={90} value={plan.current.level} onChange={e => handlePlanChange('current.level', e, true)} className="w-full p-1 border rounded dark:bg-neutral-700 dark:border-neutral-600" />
//                     </div>
//                     <span className="w-8 text-center text-gray-400 font-bold text-lg shrink-0">→</span>
//                     <div className="flex-1">
//                         <CustomNumberInput min={plan.current.level} max={90} value={plan.target.level} onChange={e => handlePlanChange('target.level', e, true)} className="w-full p-1 border rounded dark:bg-neutral-700 dark:border-neutral-600" />
//                     </div>
//                 </div>

//                 <div className="flex items-center gap-2">
//                     <label className="w-24 shrink-0 font-semibold">{t('basicStatsTab.rank')}</label>
//                     <div className="flex-1">
//                         <select value={currentRankValue} onChange={e => handleRankChange('current', e.target.value)} className="w-full p-1.5 border rounded bg-white dark:bg-neutral-700 dark:border-neutral-600">
//                             {rankOptions.map(opt => {
//                                 const [type, level] = opt.value.split('_');
//                                 if (type === 'star' && Number(level) < baseStarGrade) return null;
//                                 return <option key={opt.value} value={opt.value}>{opt.label}</option>;
//                             })}
//                         </select>
//                     </div>
//                     <span className="w-8 text-center text-gray-400 font-bold text-lg shrink-0">→</span>
//                     <div className="flex-1">
//                         <select value={targetRankValue} onChange={e => handleRankChange('target', e.target.value)} className="w-full p-1.5 border rounded bg-white dark:bg-neutral-700 dark:border-neutral-600">
//                             {rankOptions.map(opt => {
//                                 const [type, level] = opt.value.split('_');
//                                 if (type === 'star' && Number(level) < baseStarGrade) return null;
//                                 const optRank = opt.value.startsWith('uw') ? 5 + Number(level) : Number(level);
//                                 const currentRank = currentRankValue.startsWith('uw') ? 5 + Number(currentRankValue.split('_')[1]) : Number(currentRankValue.split('_')[1]);
//                                 if (optRank < currentRank) return null;
//                                 return <option key={opt.value} value={opt.value}>{opt.label}</option>;
//                             })}
//                         </select>
//                     </div>
//                 </div>

//                 <div className="flex items-center gap-2">
//                     <label className="w-24 shrink-0 font-semibold">{t('basicStatsTab.affectionRank')}</label>
//                     <div className="flex-1">
//                         <CustomNumberInput min={1} max={plan.current.uw ? 100 : (plan.current.star < 3 ? 10 : 20)} value={plan.current.affection} onChange={e => handlePlanChange('current.affection', e, true)} className="w-full p-1 border rounded dark:bg-neutral-700 dark:border-neutral-600" />
//                     </div>
//                     <span className="w-8 text-center text-gray-400 font-bold text-lg shrink-0">→</span>
//                     <div className="flex-1">
//                         <CustomNumberInput min={plan.current.affection} max={plan.target.uw ? 100 : (plan.target.star < 3 ? 10 : 20)} value={plan.target.affection} onChange={e => handlePlanChange('target.affection', e, true)} className="w-full p-1 border rounded dark:bg-neutral-700 dark:border-neutral-600" />
//                     </div>
//                 </div>
//             </div>
//             <div className="mt-4 border-t dark:border-neutral-700 pt-3">
//                 <h4 className="font-semibold text-sm mb-2">{t('basicStatsTab.growthOptionsTitle')}</h4>
//                 <div className="p-3 rounded-md bg-white dark:bg-neutral-800 border dark:border-neutral-700">

//                     <div className="flex items-center gap-4">
//                         <label className="font-semibold shrink-0">{t('basicStatsTab.ownedEleph')}</label>
//                         <div className="flex-1 max-w-[120px] ml-auto">
//                             <CustomNumberInput
//                                 min={0}
//                                 max={99999}
//                                 value={plan.current.eleph}
//                                 onChange={e => handlePlanChange('current.eleph', e, true)}
//                                 className="w-full p-1 border rounded dark:bg-neutral-700 dark:border-neutral-600 text-center"
//                             />
//                         </div>
//                     </div>

//                     <label className="flex items-center gap-2 cursor-pointer">
//                         <input
//                             type="checkbox"
//                             className="h-4 w-4 rounded"
//                             checked={plan.useEligmaForStar}
//                             onChange={e => handlePlanChange('useEligmaForStar', e.target.checked)}
//                         />
//                         <span>{t('basicStatsTab.useEligmaForRankUp')}</span>
//                     </label>

//                     {plan.useEligmaForStar && (
//                         <div className="grid grid-cols-2 gap-4 mt-3 pl-6 text-xs">
//                             <div>
//                                 <label className="font-semibold mb-1 block">{t('basicStatsTab.currentElephPrice')}</label>
//                                 <select
//                                     value={plan.eligmaInfo?.price || 1}
//                                     onChange={e => handlePlanChange('eligmaInfo.price', e.target.value, true)}
//                                     className="w-full p-1.5 border rounded bg-white dark:bg-neutral-700 dark:border-neutral-600"
//                                 >
//                                     {[1, 2, 3, 4, 5].map(p => <option key={p} value={p}>{p}</option>)}
//                                 </select>
//                             </div>
//                             <div>
//                                 <label className="font-semibold mb-1 block">{t('basicStatsTab.purchasableEleph')}</label>
//                                 <input
//                                     type="number"
//                                     value={plan.eligmaInfo?.stock || 0}
//                                     onChange={e => handlePlanChange('eligmaInfo.stock', e.target.value, true)}
//                                     className="w-full p-1.5 border rounded bg-white dark:bg-neutral-700 dark:border-neutral-600"
//                                 />
//                             </div>
//                         </div>
//                     )}
//                 </div>
//             </div>
//         </>
//     );
// };

// app/components/planner/StudentGrowth/BasicStatsTab.tsx

import { useTranslation } from 'react-i18next';
import { CustomNumberInput } from '~/components/CustomInput';
import { MinMaxControls } from './MinMaxControls';
import type { GrowthPlan } from '~/store/planner/useGlobalStore';
import type { Student } from '~/types/plannerData';
import { FiCheck } from 'react-icons/fi';

interface BasicStatsTabProps {
  plan: GrowthPlan;
  studentInfo: Student;
  handlePlanChange: (field: string, value: string | number | boolean, isNumeric?: boolean) => void;
  handleRankChange: (type: 'current' | 'target', value: string) => void;
  rankOptions: { value: string; label: string }[];
  handleBatchUpdate: (field: string, value: unknown) => void;
}

export const BasicStatsTab = ({
  plan,
  studentInfo,
  handlePlanChange,
  handleRankChange,
  rankOptions,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  handleBatchUpdate,
}: BasicStatsTabProps) => {
  const { t } = useTranslation('planner');
  const baseStar = studentInfo?.StarGrade || 1;

  // Helpers
  const setLevel = (target: 'current' | 'target', val: number) => handlePlanChange(`${target}.level`, val, true);
  const setAffection = (target: 'current' | 'target', val: number) => handlePlanChange(`${target}.affection`, val, true);

  const currentInputClass =
    'w-full p-1.5 text-sm border border-gray-200 rounded bg-white dark:bg-neutral-800 dark:border-neutral-600 text-center appearance-none font-medium outline-none focus:ring-1 focus:ring-gray-300 transition-all';
  const targetInputClass =
    'w-full p-1.5 text-sm border border-blue-200 rounded bg-white text-blue-600 font-bold dark:bg-neutral-800 dark:border-blue-900/50 dark:text-blue-400 text-center appearance-none outline-none focus:ring-1 focus:ring-blue-300 transition-all';

  // Grid Row Wrapper
  const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="py-4 first:pt-0 grid grid-cols-[70px_1fr_1fr] gap-3 items-center">
      <div className="text-xs font-bold text-gray-500 dark:text-neutral-400 tracking-wide truncate text-center">{label}</div>
      {children}
    </div>
  );

  return (
    <div className="flex flex-col">
      {/* Main Stats Rows */}
      <div className="divide-y divide-gray-100 dark:divide-neutral-800 mb-6">
        {/* --- Level Row --- */}
        <Row label={t('basicStatsTab.level')}>
          {/* Current */}
          <div>
            <MinMaxControls onMin={() => setLevel('current', 1)} onMax={() => setLevel('current', 90)} />
            <CustomNumberInput min={1} max={90} value={plan.current.level} onChange={(v) => setLevel('current', Number(v))} className={currentInputClass} />
          </div>
          {/* Target */}
          <div>
            <MinMaxControls isTarget onMin={() => setLevel('target', plan.current.level)} onMax={() => setLevel('target', 90)} />
            <CustomNumberInput min={plan.current.level} max={90} value={plan.target.level} onChange={(v) => setLevel('target', Number(v))} className={targetInputClass} />
          </div>
        </Row>

        {/* --- Rank Row --- */}
        <Row label={t('basicStatsTab.rank')}>
          {/* Current */}
          <div>
            <MinMaxControls onMin={() => handleRankChange('current', `star_${baseStar}`)} onMax={() => handleRankChange('current', 'uw_3')} />
            <select value={plan.current.uw > 0 ? `uw_${plan.current.uw}` : `star_${plan.current.star}`} onChange={(e) => handleRankChange('current', e.target.value)} className={currentInputClass}>
              {rankOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          {/* Target */}
          <div>
            <MinMaxControls
              isTarget
              onMin={() => handleRankChange('target', plan.current.uw > 0 ? `uw_${plan.current.uw}` : `star_${plan.current.star}`)}
              onMax={() => handleRankChange('target', 'uw_3')}
            />
            <select value={plan.target.uw > 0 ? `uw_${plan.target.uw}` : `star_${plan.target.star}`} onChange={(e) => handleRankChange('target', e.target.value)} className={targetInputClass}>
              {rankOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </Row>

        {/* --- Affection Row --- */}
        <Row label={t('basicStatsTab.affectionRank')}>
          {/* Current */}
          <div>
            <MinMaxControls onMin={() => setAffection('current', 1)} onMax={() => setAffection('current', 100)} />
            <CustomNumberInput min={1} max={100} value={plan.current.affection} onChange={(v) => setAffection('current', Number(v))} className={currentInputClass} />
          </div>
          {/* Target */}
          <div>
            <MinMaxControls isTarget onMin={() => setAffection('target', plan.current.affection)} onMax={() => setAffection('target', 100)} />
            <CustomNumberInput min={1} max={100} value={plan.target.affection} onChange={(v) => setAffection('target', Number(v))} className={targetInputClass} />
          </div>
        </Row>
      </div>

      {/* Eligma Options (Flat Panel) */}
      <div
        onClick={() => handlePlanChange('useEligmaForStar', !plan.useEligmaForStar)}
        className={`
              group relative flex flex-col sm:flex-row gap-4 p-3 rounded-lg border transition-all cursor-pointer select-none
              ${
                plan.useEligmaForStar
                  ? 'bg-blue-50/50 border-blue-100 dark:bg-blue-900/10 dark:border-blue-800'
                  : 'bg-white border-gray-100 hover:border-gray-200 dark:bg-neutral-800/50 dark:border-neutral-700'
              }
          `}
      >
        {/* Checkbox Area */}
        <div className="flex items-center gap-3 shrink-0 h-8">
          <div
            className={`
              w-4 h-4 rounded flex items-center justify-center border transition-colors
              ${plan.useEligmaForStar ? 'bg-blue-500 border-blue-500 text-white' : 'bg-white border-gray-300 text-transparent dark:bg-neutral-700 dark:border-neutral-600'}
          `}
          >
            <FiCheck size={10} strokeWidth={4} />
          </div>
          <span className={`text-xs font-bold ${plan.useEligmaForStar ? 'text-blue-700 dark:text-blue-300' : 'text-gray-500 dark:text-gray-400'}`}>{t('basicStatsTab.useEligmaForRankUp')}</span>
        </div>

        {/* Expanded Options */}
        {plan.useEligmaForStar && (
          <div className="flex flex-1 gap-3 animate-in fade-in slide-in-from-left-2 items-center" onClick={(e) => e.stopPropagation()}>
            <div className="w-px h-8 bg-blue-200 dark:bg-blue-800 hidden sm:block"></div>

            {/* Eleph Price */}
            <div className="flex-1">
              <label className="block text-[10px] font-medium text-blue-600/70 dark:text-blue-300/70 mb-1 truncate">{t('basicStatsTab.currentElephPrice')}</label>
              <select
                value={plan.eligmaInfo?.price || 1}
                onChange={(e) => handlePlanChange('eligmaInfo.price', e.target.value, true)}
                className="w-full bg-white dark:bg-neutral-900 border border-blue-200 dark:border-blue-800 rounded py-1 px-2 text-xs text-blue-900 dark:text-blue-100 focus:ring-1 focus:ring-blue-400 outline-none"
              >
                {[1, 2, 3, 4, 5].map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>

            {/* Eleph Stock */}
            <div className="flex-1">
              <label className="block text-[10px] font-medium text-blue-600/70 dark:text-blue-300/70 mb-1 truncate">{t('basicStatsTab.purchasableEleph')}</label>
              <input
                type="number"
                value={plan.eligmaInfo?.stock || 0}
                onChange={(e) => handlePlanChange('eligmaInfo.stock', e.target.value, true)}
                className="w-full bg-white dark:bg-neutral-900 border border-blue-200 dark:border-blue-800 rounded py-1 px-2 text-xs text-blue-900 dark:text-blue-100 focus:ring-1 focus:ring-blue-400 outline-none"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
