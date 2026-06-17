// app/components/heatmap/ChartControls.tsx

import { useState, memo, useCallback } from 'react';
import StudentSearchDropdown from '../StudentSearchDropdown';
import { StarRating } from '../StarRating';
import { useChartControlsStore } from '../../store/chartControlsStore';
import { useShallow } from 'zustand/react/shallow';
import TooltipSlider from '../HandleTooltip';
import 'rc-slider/assets/index.css';
import { raidToString, raidToStringTsx } from '../raid/raidToString';

function debounce<T extends unknown[]>(func: (...args: T) => void, wait: number) {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  return (...args: T) => {
    if (timeout !== null) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

import React from 'react';
import { ToggleButtonGroup } from '../ToggleButtonGroup';
import type { Student } from '~/types/data';
import { useTranslation } from 'react-i18next';
import { difficultyInfo, type DifficultySelect } from '../raid/Difficulty';
import type { Locale } from '~/utils/i18n/config';
import { CustomNumberInput } from '../CustomInput';
import StudentProfileCard from '../common/StudentProfileCard';

interface ChartControlsProps {
  students: Record<number, Student>;
  portraitData: Record<number, string> | null;
}

const SliderComponent = ({
  fullXRange,
  labelMap,
  xRange,
  setXRange,
}: {
  fullXRange: [number, number];
  labelMap: Record<number, React.ReactNode>;
  xRange: [number, number];
  setXRange: (range: [number, number]) => void;
}) => {
  const handleSliderChange = useCallback(
    debounce((value: number | number[]) => {
      if (Array.isArray(value)) {
        setXRange([value[0], value[1]]);
      }
    }, 300), // Run in 300ms
    [setXRange],
  );

  return (
    <TooltipSlider
      range
      min={fullXRange[0]}
      max={fullXRange[1]}
      step={1}
      labelMap={labelMap}
      defaultValue={xRange}
      tipProps={{ overlayInnerStyle: { minHeight: 'auto' } }}
      onChange={handleSliderChange}
    />
  );
};

const ChartControls = ({ students, portraitData }: ChartControlsProps) => {
  const { t, i18n } = useTranslation('charts', {
    keyPrefix: 'heatmap.control',
  });
  const { t: t_raids } = useTranslation('raidInfo');
  const locale = i18n.language as Locale;

  const {
    selectedStudentId,
    setSelectedStudentId,
    rankwidth,
    setRankWidth,
    selectedZValues,
    handleZSelectionChange,
    setSelectedZValues,
    heatmapMode,
    setHeatmapMode,
    histogramMode,
    setHistogramMode,
    hideXThreshold,
    setHideXThreshold,
    xRange,
    setXRange,
    fullXRange,
    availableZValueCounter,
    difficulty,
    setDifficulty,
    getFilteredRaidInfoByDifficulty,
  } = useChartControlsStore(
    useShallow((state) => ({
      selectedStudentId: state.selectedStudentId,
      setSelectedStudentId: state.setSelectedStudentId,
      setRankWidth: state.setRankWidth,
      rankwidth: state.rankWidth,
      selectedZValues: state.selectedZValues,
      handleZSelectionChange: state.handleZSelectionChange,
      setSelectedZValues: state.setSelectedZValues,
      heatmapMode: state.heatmapMode,
      setHeatmapMode: state.setHeatmapMode,
      histogramMode: state.histogramMode,
      setHistogramMode: state.setHistogramMode,
      hideXThreshold: state.hideXThreshold,
      setHideXThreshold: state.setHideXThreshold,
      xRange: state.xRange,
      setXRange: state.setXRange,
      fullXRange: state.fullXRange,
      availableZValueCounter: state.availableZValueCounter,
      difficulty: state.difficulty,
      setDifficulty: state.setDifficulty,
      getFilteredRaidInfoByDifficulty: state.getFilteredRaidInfoByDifficulty,
    })),
  );

  const [tempRankWidth, setTempRankWidth] = useState<number>(rankwidth);
  const xLabels = getFilteredRaidInfoByDifficulty();

  const labelMap: Record<number, React.ReactNode> = xLabels.reduce<Record<number, React.ReactNode>>((map, raid, index) => {
    map[index] = raidToString(raid, locale, true);
    return map;
  }, {});

  const handleSelectAllZValues = () => {
    setSelectedZValues(Array.from(availableZValueCounter.keys()));
  };

  const handleDeselectAllZValues = () => {
    setSelectedZValues([]);
  };

  return (
    <div data-component-name="ChartControls">
      <hr className="border-neutral-300 dark:border-neutral-700 my-3 transition-colors duration-300" />
      {/* Student Search + Profile Card */}
      <div className="mb-2">
        <StudentSearchDropdown students={students} selectedStudentId={selectedStudentId} setSelectedStudentId={setSelectedStudentId} />
      </div>
      {selectedStudentId && <StudentProfileCard portraitData={portraitData} />}
      <hr className="border-neutral-300 dark:border-neutral-700 my-3 transition-colors duration-300" />

      {/* Main Controls Grid */}
      <div data-component-name="ChartControls_Main">
        <div>
          {/* Section 1: Display Options */}
          <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-200 mb-2">{t('displayOptions.title')}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <ToggleButtonGroup
              label={t('displayOptions.heatmap')}
              options={[
                { value: 'percent', label: t('heatmap_option_percent') },
                { value: 'absolute', label: t('heatmap_option_absolute') },
              ]}
              selectedValue={heatmapMode}
              onSelect={(val) => setHeatmapMode(val as 'percent' | 'absolute')}
            />
            <ToggleButtonGroup
              label={t('displayOptions.histograms')}
              options={[
                { value: 'percent', label: t('histogram_option_percent') },
                { value: 'absolute', label: t('histogram_option_absolute') },
              ]}
              selectedValue={histogramMode}
              onSelect={(val) => setHistogramMode(val as 'percent' | 'absolute')}
            />
            <div className="flex justify-between items-center">
              <label className="text-sm font-medium text-neutral-600 dark:text-neutral-400 transition-colors duration-300">{t('displayOptions.rankWidth')}</label>
              <div className="flex items-center">
                <CustomNumberInput
                  // type="number"
                  min={1}
                  value={tempRankWidth}
                  onChange={(e) => Number(e) && setTempRankWidth(Number(e))}
                  className="w-16 px-1 py-0.5 text-sm border-neutral-300 dark:border-neutral-600 dark:bg-neutral-700 dark:text-white border rounded-l-md focus:outline-none focus:ring-1 focus:ring-green-500 focus:border-green-500 transition-colors duration-300"
                />
                <button
                  onClick={() => setRankWidth(tempRankWidth)}
                  className="px-3 py-1 bg-ba-btn-blue hover:bg-sky-400 transition-colors w-full shadow-ba text-black rounded-r-md text-xs font-semibold"
                >
                  {t('setButton')}
                </button>
              </div>
            </div>
            <div className="flex justify-between items-center">
              <label className="text-sm font-medium text-neutral-600 dark:text-neutral-400 transition-colors duration-300">{t('displayOptions.X-Threshold')}</label>
              <div className="flex items-center">
                <CustomNumberInput
                  // type="number"
                  min={0}
                  value={hideXThreshold}
                  onChange={(e) => setHideXThreshold(Number(e))}
                  className="w-16 px-1 py-0.5 text-sm border-neutral-300 dark:border-neutral-600 dark:bg-neutral-700 dark:text-white border rounded-l-md focus:outline-none focus:ring-1 focus:ring-green-500 focus:border-green-500 transition-colors duration-300"
                />
                <button
                  onClick={() => setHideXThreshold(hideXThreshold)}
                  className="px-3 py-1.5 bg-ba-btn-blue hover:bg-sky-400 transition-colors w-full shadow-ba text-black rounded-r-md text-xs font-semibold"
                >
                  {t('setButton')}
                </button>
              </div>
            </div>
            <div className="flex justify-between items-center">
              <label htmlFor="squad-type-select" className="text-sm font-medium text-neutral-700 dark:text-neutral-300 whitespace-nowrap">
                {t('difficulty')}
              </label>
              <select
                id="squad-type-select"
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as DifficultySelect)}
                className="p-1 border border-neutral-300 dark:border-neutral-600 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-neutral-700 dark:text-white"
              >
                <option value="All">{t_raids('All')}</option>
                {difficultyInfo.map(({ name }) => (
                  <option value={name} key={name}>
                    {t_raids(name)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div>
          <hr className="border-neutral-300 dark:border-neutral-700 my-2 transition-colors duration-300" />
          <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-200 mb-2">{t('filterByStars.title')}</h3>
          <div className="flex gap-1 mb-2">
            <button
              onClick={handleSelectAllZValues}
              className="px-3 py-1 text-xs font-medium text-black bg-ba-btn-blue rounded-md hover:bg-sky-400 dark:hover:bg-sky-500 transition-colors w-full shadow-ba"
            >
              {t('filterByStars.all')}
            </button>
            <button
              onClick={handleDeselectAllZValues}
              className="px-3 py-1 text-xs font-medium text-neutral-700 dark:text-neutral-300 bg-ba-btn-gray dark:bg-neutral-600 rounded-md hover:bg-neutral-300 dark:hover:bg-neutral-500 transition-colors w-full shadow-ba"
            >
              {t('filterByStars.none')}
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {Array.from(availableZValueCounter.keys())
              .sort((a, b) => a - b)
              .sort((a, b) => {
                const f = (x: number) => (x >= 0 ? x : 10000 + -x);
                return f(a) - f(b);
              })
              .map((z) => {
                const isSelected = selectedZValues.has(z);
                return (
                  <button
                    key={z}
                    onClick={() => handleZSelectionChange(z)}
                    className={`flex place-items-center rounded-md h-6 border transition-all duration-200 px-0.5
                    ${
                      isSelected
                        ? 'bg-white border-neutral-600 shadow-inner dark:bg-neutral-700 dark:border-neutral-400 dark:shadow-none'
                        : 'bg-white text-neutral-700 border-neutral-300 hover:bg-neutral-100 dark:bg-neutral-800 dark:text-neutral-300 dark:border-neutral-600 dark:hover:bg-neutral-700'
                    }`}
                  >
                    <StarRating n={z} />{' '}
                    <span className="flex items-center relative pl-1 text-xs text-neutral-600 dark:text-neutral-400">
                      {' '}
                      {availableZValueCounter.get(z)?.toLocaleString()}
                      {t('filterByStars.count')}
                    </span>
                  </button>
                );
              })}
          </div>
          <hr className="border-neutral-300 dark:border-neutral-700 my-2 transition-colors duration-300" />
        </div>

        <div>
          <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-200 mb-2">{t('raidRange.title')}</h3>
          <div className="w-full text-center text-sm text-neutral-700 dark:text-neutral-400 mb-2 transition-colors duration-300 flex flex-col sm:flex-row justify-center">
            <span>
              <span className="font-semibold text-blue-600 dark:text-blue-400 transition-colors duration-300">{xLabels[Math.max(fullXRange[0], xRange[0])]?.Id}</span>
              <span className="text-xs text-neutral-500 dark:text-neutral-400 ml-1 transition-colors duration-300">{raidToStringTsx(xLabels[Math.max(fullXRange[0], xRange[0])], locale, true)}</span>
            </span>
            <span className="mx-2 font-medium">—</span>
            <span>
              <span className="font-semibold text-blue-600 dark:text-blue-400 transition-colors duration-300">{xLabels[Math.min(fullXRange[1], xRange[1])]?.Id}</span>
              <span className="text-xs text-neutral-500 dark:text-neutral-400 ml-1 transition-colors duration-300">{raidToStringTsx(xLabels[Math.min(fullXRange[1], xRange[1])], locale, true)}</span>
            </span>
          </div>
          <SliderComponent fullXRange={fullXRange} labelMap={labelMap} xRange={xRange} setXRange={setXRange} />
          <hr className="border-neutral-300 dark:border-neutral-700 my-3 transition-colors duration-300" />
        </div>
      </div>
    </div>
  );
};

export default memo(ChartControls);
