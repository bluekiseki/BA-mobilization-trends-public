import type { EventData, IconData } from '~/types/plannerData';
import { useTranslation } from 'react-i18next';
import { ItemIcon } from '../../common/Icon';
import { getlocaleMethond } from '../../common/locale';
import type { Locale } from '~/utils/i18n/config';
import type { AvgPtDisplayMode, DreamMakerSimResult } from './type';

interface SimulationResultDisplayProps {
  result: DreamMakerSimResult;
  title: string;
  description: string;
  eventData: EventData;
  iconData: IconData;
  avgPtDisplayMode: AvgPtDisplayMode;
  setAvgPtDisplayMode: (mode: AvgPtDisplayMode) => void;
}

export const SimulationResultDisplay = ({ result, title, description, eventData, iconData, avgPtDisplayMode, setAvgPtDisplayMode }: SimulationResultDisplayProps) => {
  const { t, i18n } = useTranslation('planner', { keyPrefix: 'dream_maker' });
  const { t: t_c } = useTranslation('common');
  const locale = i18n.language as Locale;
  const locale_key = getlocaleMethond('', 'Jp', locale) as 'Jp' | 'Kr' | 'En';
  const dreamData = eventData.minigame_dream;
  if (!dreamData) return null;
  const eventPointItemId = dreamData.info[0].DreamMakerDailyPointId;
  const eventPointItemType = dreamData.info[0].DreamMakerDailyPointParcelTypeStr;
  const eventPointKey = `${eventPointItemType}_${eventPointItemId}`;

  return (
    <div className="pt-4 border-t dark:border-neutral-600 space-y-4">
      <h3 className="font-bold text-base dark:text-neutral-100">{title}</h3>
      <p className="text-xs text-neutral-600 dark:text-neutral-400">{description}</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">
          <h4 className="font-semibold text-red-800 dark:text-red-300 mb-2">{t('calculator.avgCost')}</h4>
          <div className="flex flex-wrap gap-2">
            {Object.entries(result.avgCost).map(([key, amount]) => (
              <ItemIcon key={key} type={key.split('_')[0]} itemId={key.split('_')[1]} amount={amount} size={12} eventData={eventData} iconData={iconData} />
            ))}
          </div>
        </div>
        <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
          <div className="flex justify-between items-center mb-1">
            <h4 className="font-semibold text-blue-800 dark:text-blue-300">{t('calculator.avgEventPoints')}</h4>
            <div className="text-[10px] space-x-1">
              <button onClick={() => setAvgPtDisplayMode('per_sim')} className={`px-1 rounded ${avgPtDisplayMode === 'per_sim' ? 'bg-blue-200' : ''}`}>
                {t('calculator.perSim')}
              </button>
              <button onClick={() => setAvgPtDisplayMode('per_action')} className={`px-1 rounded ${avgPtDisplayMode === 'per_action' ? 'bg-blue-200' : ''}`}>
                {t('calculator.perAction')}
              </button>
              <button onClick={() => setAvgPtDisplayMode('per_day')} className={`px-1 rounded ${avgPtDisplayMode === 'per_day' ? 'bg-blue-200' : ''}`}>
                {t('calculator.perDay')}
              </button>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <ItemIcon
              type={eventPointItemType}
              itemId={String(eventPointItemId)}
              amount={
                avgPtDisplayMode === 'per_action' && result.avgActions > 0
                  ? result.avgEventPoints / result.avgActions
                  : avgPtDisplayMode === 'per_day' && result.avgActions > 0
                    ? result.avgEventPoints / (result.avgActions / dreamData.info[0].DreamMakerActionPoint)
                    : result.avgEventPoints
              }
              size={12}
              eventData={eventData}
              iconData={iconData}
            />
          </div>
          <p className="text-[10px] text-neutral-500 dark:text-neutral-400 mt-1">
            {t('calculator.avgActions', {
              counts: result.avgActions.toFixed(1),
            })}
          </p>
        </div>
      </div>

      <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded-lg">
        <h4 className="font-semibold text-green-800 dark:text-green-300 mb-2">{t('calculator.avgRewards')}</h4>
        <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
          {Object.entries(result.avgRewards)
            .filter(([key, _]) => key !== eventPointKey)
            .sort(([, a], [, b]) => b - a)
            .map(([key, amount]) => (
              <ItemIcon key={key} type={key.split('_')[0]} itemId={key.split('_')[1]} amount={amount} size={12} eventData={eventData} iconData={iconData} />
            ))}
        </div>
      </div>

      <div className="bg-neutral-100 dark:bg-neutral-700 p-3 rounded-lg">
        <h4 className="font-semibold text-neutral-800 dark:text-neutral-200 mb-2">{t('calculator.avgFinalStats')}</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-center">
          {dreamData.parameter.map((p) => (
            <div key={p.ParameterType}>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">{p.LocalizeEtc?.[locale_key]}</p>
              <p className="font-bold">{result.avgFinalStats[p.ParameterType]?.toFixed(0) ?? 'N/A'}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 text-center">
        <div className="bg-purple-50 dark:bg-purple-900/20 p-2 rounded-lg">
          <p className="text-xs font-semibold text-purple-700 dark:text-purple-300">{t('calculator.avgSpecialEndings')}</p>
          <p className="font-bold text-lg">
            {result.avgSpecialEndings.toFixed(2)} {t('calculator.countUnit')}
          </p>
        </div>
        <div className="bg-neutral-100 dark:bg-neutral-700 p-2 rounded-lg">
          <p className="text-xs font-semibold text-neutral-600 dark:text-neutral-300">{t('calculator.avgNormalEndings')}</p>
          <p className="font-bold text-lg">
            {result.avgNormalEndings.toFixed(2)} {t('calculator.countUnit')}
          </p>
        </div>
      </div>

      <div>
        <h4 className="font-semibold text-center mb-2">{t('calculator.loopDetails')}</h4>
        <div className="space-y-1 max-h-48 overflow-y-auto text-xs px-1">
          {Object.entries(result.loopsDetail)
            .sort(([a], [b]) => Number(a) - Number(b))
            .map(([loop, data]) => (
              <div key={loop} className="p-1.5 bg-white dark:bg-neutral-800 rounded shadow-sm border dark:border-neutral-700">
                <div className="flex justify-between items-baseline">
                  <p className="font-bold text-[11px] mb-1">
                    {loop}
                    {t_c('loop')}
                  </p>
                  <p className="text-purple-600 dark:text-purple-400 text-[10px]">
                    {t('calculator.specialEndingRateShort', {
                      rate: (data.specialEndingRate * 100).toFixed(0),
                    })}
                  </p>
                </div>
                <div className="grid grid-cols-5 gap-x-2 text-center">
                  <div className="font-semibold text-neutral-500"></div>
                  {dreamData.parameter.map((p) => (
                    <div key={p.ParameterType} className="font-semibold text-neutral-500 text-[10px]">
                      {p.LocalizeEtc?.[locale_key]}
                    </div>
                  ))}
                  <div className="font-semibold text-neutral-500 text-[10px]">{t_c('start')}</div>
                  {dreamData.parameter.map((p) => (
                    <div key={p.ParameterType}>{data.startStats[p.ParameterType]?.toFixed(0)}</div>
                  ))}
                  <div className="font-semibold text-neutral-500 text-[10px]">{t_c('end')}</div>
                  {dreamData.parameter.map((p) => (
                    <div key={p.ParameterType}>{data.endStats[p.ParameterType]?.toFixed(0)}</div>
                  ))}
                </div>
                <p className="font-semibold text-center text-[11px] mt-1 text-blue-600">
                  {t_c('acquire')} Pt: {data.eventPoints.toFixed(0)}
                </p>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
};
