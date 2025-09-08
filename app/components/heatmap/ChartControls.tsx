// ./app/components/ChartControls.tsx

import { useState, memo, useCallback } from 'react';
import { RaidInfo, Student } from '../../types/data';
import StudentSearchDropdown from '../StudentSearchDropdown';
import { StarRating } from '../StarRatingProps';
import { useChartControlsStore } from '../../store/chartControlsStore'
import { useShallow } from 'zustand/react/shallow';
import TooltipSlider from '../HandleTooltip';
import 'rc-slider/assets/index.css';
import { raidToString } from '../../utils/raidToString';
import { debounce } from 'lodash';


import React from 'react';
import { useTranslations } from 'next-intl';
import { ToggleButtonGroup } from '../ToggleButtonGroupProps';
import { difficultyInfo, DifficultySelect } from '../Difficulty';


interface ChartControlsProps {
  students: Record<number, Student>;
  xLabels: RaidInfo[];
  // availableZValues: number[];
}

const SliderComponent = ({ fullXRange, labelMap, xRange, setXRange }: {
  fullXRange: [number, number],
  labelMap: Record<number, React.ReactNode>,
  xRange: [number, number],
  setXRange: (range: [number, number]) => void
}) => {
  const handleSliderChange = useCallback(
    debounce((value: number | number[]) => {
      if (Array.isArray(value)) {
        setXRange([value[0], value[1]]);
      }
    }, 300), // Run in 300ms
    [setXRange]
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


const ChartControls = ({
  students,
  xLabels,
  //   availableZValues
}: ChartControlsProps) => {
  // console.log('ChartControls is rendering...');

  const t = useTranslations('charts.heatmap.control')
  const t_raids = useTranslations('raidInfo')

  const {
    selectedStudentId,
    setSelectedStudentId,
    // tempRankWidth,
    // setTempRankWidth,
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
    availableZValues,
    diffculty,
    setDiffculty,
  } = useChartControlsStore(useShallow(state => ({
    selectedStudentId: state.selectedStudentId,
    setSelectedStudentId: state.setSelectedStudentId,
    // tempRankWidth: state.tempRankWidth,
    // setTempRankWidth: state.setTempRankWidth,
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
    availableZValues: state.availableZValues,
    diffculty: state.diffculty,
    setDiffculty: state.setDiffculty,
  })));

  const [tempRankWidth, setTempRankWidth] = useState<number>(rankwidth);

  const labelMap: Record<number, React.ReactNode> = xLabels.reduce((map, raid, index) => {
    map[index] = raidToString(raid, true);
    return map;
  }, {} as Record<number, React.ReactNode>);

  const handleSelectAllZValues = () => {
    setSelectedZValues(Array.from(availableZValues));
  };


  const handleDeselectAllZValues = () => {
    setSelectedZValues([]);
  };

  const toggleOptions = [
    { value: 'percent', label: '%' },
    { value: 'absolute', label: 'Abs.' },
  ];


  return (
    <>
      <hr className="border-gray-300 dark:border-gray-700 my-3 transition-colors duration-300" />
      {/* Student Search - Full Width */}
      <div className="mb-2">
        <StudentSearchDropdown
          students={students}
          selectedStudentId={selectedStudentId}
          setSelectedStudentId={setSelectedStudentId}
        />
      </div>
      <hr className="border-gray-300 dark:border-gray-700 my-3 transition-colors duration-300" />

      {/* Main Controls Grid */}
      <div>
        <div>
          {/* Section 1: Display Options */}
          <h3 className="font-semibold text-gray-800 dark:text-white text-sm transition-colors duration-300">{t('displayOptions.title')}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <ToggleButtonGroup
              label={t('displayOptions.heatmap')}
              options={toggleOptions}
              selectedValue={heatmapMode}
              onSelect={(val) => setHeatmapMode(val as 'percent' | 'absolute')}
            />
            <ToggleButtonGroup
              label={t('displayOptions.histograms')}
              options={toggleOptions}
              selectedValue={histogramMode}
              onSelect={(val) => setHistogramMode(val as 'percent' | 'absolute')}
            />
            <div className="flex justify-between items-center">
              <label className="text-sm font-medium text-gray-600 dark:text-gray-400 transition-colors duration-300">{t('displayOptions.rankWidth')}</label>
              <div className="flex items-center">
                <input
                  type="number"
                  min={1}
                  value={tempRankWidth}
                  onChange={e => Number(e.target.value) && setTempRankWidth(Number(e.target.value))}
                  className="w-16 p-1 text-sm border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white border rounded-l-md focus:outline-none focus:ring-1 focus:ring-green-500 focus:border-green-500 transition-colors duration-300"
                />
                <button
                  onClick={() => setRankWidth(tempRankWidth)}
                  className="px-3 py-1 bg-bluearchive-botton-blue dark:bg-sky-600 hover:bg-sky-400 dark:hover:bg-sky-500 transition-colors dark:text-white w-full shadow-bluearchive text-black rounded-r-md text-sm font-semibold"
                >
                  {(t('setButton'))}
                </button>
              </div>
            </div>
            <div className="flex justify-between items-center">
              <label className="text-sm font-medium text-gray-600 dark:text-gray-400 transition-colors duration-300">{t('displayOptions.X-Threshold')}</label>
              <div className="flex items-center">
                <input
                  type="number"
                  min={1}
                  value={hideXThreshold}
                  onChange={e => setHideXThreshold(Number(e.target.value))}
                  className="w-16 p-1.5 text-sm border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white border rounded-l-md focus:outline-none focus:ring-1 focus:ring-green-500 focus:border-green-500 transition-colors duration-300"
                />
                <button
                  onClick={() => setHideXThreshold(hideXThreshold)}
                  className="px-3 py-1.5 bg-bluearchive-botton-blue dark:bg-sky-600 hover:bg-sky-400 dark:hover:bg-sky-500 transition-colors dark:text-white w-full shadow-bluearchive text-black rounded-r-md text-sm font-semibold"
                >
                  {(t('setButton'))}
                </button>
              </div>
            </div>
            <div className="flex justify-between items-center">

              <label htmlFor="squad-type-select" className="text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">{t('diffculty')}</label>
              <select
                id="squad-type-select"
                value={diffculty}
                onChange={(e) => setDiffculty(e.target.value as DifficultySelect)}
                className="p-1 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
              >
                <option value="All">{t_raids('All')}</option>
                {difficultyInfo.map(({ name }) => <option value={name} key={name}>{t_raids(name)}</option>)}
              </select>

            </div>
          </div>
        </div>

        <div>
          <hr className="border-gray-300 dark:border-gray-700 my-2 transition-colors duration-300" />
          <h3 className="font-semibold text-gray-800 dark:text-white text-sm mb-1 transition-colors duration-300">{t('filterByStars.title')}</h3>
          <div className="flex gap-1 mb-2">
            <button
              onClick={handleSelectAllZValues}
              className="px-3 py-1 text-xs font-medium text-black bg-bluearchive-botton-blue dark:bg-sky-600 dark:text-white rounded-md hover:bg-sky-400 dark:hover:bg-sky-500 transition-colors w-full shadow-bluearchive"
            >
              {t('filterByStars.all')}
            </button>
            <button
              onClick={handleDeselectAllZValues}
              className="px-3 py-1 text-xs font-medium text-gray-700 dark:text-gray-300 bg-bluearchive-botton-gray dark:bg-gray-600 rounded-md hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors w-full shadow-bluearchive"
            >
              {t('filterByStars.none')}
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {Array.from(availableZValues)
              .sort((a, b) => a - b)
              .sort((a, b) => {
                const f = (x: number) => x >= 0 ? x : 10000 + -x
                return f(a) - f(b)
              })
              .map(z => {
                const isSelected = selectedZValues.has(z);
                return (
                  <button
                    key={z}
                    onClick={() => handleZSelectionChange(z)}
                    className={`inline-grid place-items-center rounded-md w-7.5 h-6 border transition-all duration-200 
                    ${isSelected
                        ? 'bg-white border-gray-600 shadow-inner dark:bg-gray-700 dark:border-gray-400 dark:shadow-none'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700'
                      }`}
                  >
                    <StarRating n={z} />
                  </button>
                );
              })}
          </div>
          <hr className="border-gray-300 dark:border-gray-700 my-2 transition-colors duration-300" />
        </div>

        <div>
          <h3 className="font-semibold text-gray-800 dark:text-white text-sm mb-2 transition-colors duration-300">{t('raidRange.title')}</h3>
          <div className="w-full text-center text-sm text-gray-700 dark:text-gray-400 mb-2 transition-colors duration-300 flex flex-col sm:flex-row justify-center">
            <span><span className="font-semibold text-blue-600 dark:text-blue-400 transition-colors duration-300">
              {xLabels[Math.max(fullXRange[0], xRange[0])]?.Id}
            </span>
              <span className="text-xs text-gray-500 dark:text-gray-400 ml-1 transition-colors duration-300">
                {/* <RaidNoWrapFormatter
                  raid={xLabels[Math.max(fullXRange[0], xRange[0])]}
                /> */}
                {raidToString(xLabels[Math.max(fullXRange[0], xRange[0])], true)}
              </span>
            </span>
            <span className="mx-2 font-medium">—</span>
            <span>
              <span className="font-semibold text-blue-600 dark:text-blue-400 transition-colors duration-300">
                {xLabels[Math.min(fullXRange[1], xRange[1])]?.Id}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400 ml-1 transition-colors duration-300">
                {/* <RaidNoWrapFormatter
                  raid={xLabels[Math.min(fullXRange[1], xRange[1])]}
                /> */}
                {raidToString(xLabels[Math.min(fullXRange[1], xRange[1])], true)}
              </span>
            </span>
          </div>
          <SliderComponent
            fullXRange={fullXRange}
            labelMap={labelMap}
            xRange={xRange}
            setXRange={setXRange}
          />
          <hr className="border-gray-300 dark:border-gray-700 my-3 transition-colors duration-300" />
        </div>
      </div>
    </>

  );
};

export default memo(ChartControls);