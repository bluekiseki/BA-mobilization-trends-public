import React from 'react';
import type { Student } from '~/types/data';
import { StarRating } from '../StarRating';
import { useState } from 'react';
import { useIsDarkState } from '~/store/isDarkState';
import { useTranslation } from 'react-i18next';

const barHeight = 30;
const barSpacing = 5;

const ratingColors: { [key: number]: string } = {
  1: '#D90429',
  2: '#F46F00',
  3: '#F7B801',
  4: '#00A36C',
  5: '#00829B',
  6: '#0052A2',
  7: '#4A4293',
  8: '#8C008C',
  9: '#D40078',
  10: '#E32249',
};

const getBackgroundRatingColor = (index: number, theme: 'light' | 'dark' | null) => {
  const color = ratingColors[Math.abs(index)];
  if (!color) {
    return 'rgba(0, 0, 0, 0.1)';
  }

  const isDark = theme == 'dark';

  if (index < 0) {
    const r = parseInt(color.substring(1, 3), 16);
    const g = parseInt(color.substring(3, 5), 16);
    const b = parseInt(color.substring(5, 7), 16);
    const alpha = 0.3;
    const alpha_dark = 0.55;
    const t = (x: number) => (isDark ? x * alpha_dark : 255 - (255 - x) * alpha);
    // return `rgba(${r}, ${g}, ${b}, 0.15)`;
    return `rgba(${t(r)}, ${t(g)}, ${t(b)})`;
  }

  return color;
};

interface RankingChartProps {
  svgWidth: number;
  containerRef: React.RefObject<HTMLDivElement | null>;
  processedData: {
    processedRatings: {
      rating: number;
      value: number;
      width: number;
      x: number;
      percent: string;
      label: string;
    }[];
    rank: number;
    id: number;
    name: string;
    bullettype: Student['BulletType'];
    total: number;
    count: number;
    portrait: Student['Portrait'];
    ratings: {
      [key: string]: number;
    };
  }[];
  displayMode: 'average' | 'total';
  isRelativeMode: boolean;
}

export const RankingChart = ({ svgWidth, containerRef, processedData, displayMode, isRelativeMode }: RankingChartProps) => {
  const [tooltip, setTooltip] = useState<{
    visible: boolean;
    content: React.ReactNode;
    x: number;
    y: number;
  }>({ visible: false, content: '', x: 0, y: 0 });
  const { isDark } = useIsDarkState();
  const { t } = useTranslation('charts', { keyPrefix: 'ranking' });

  const barTooltipHandler = (item: (typeof processedData)[number], rating: number) => (e: React.MouseEvent) => {
    const tooltipContent = (
      <div
        style={{
          background: 'white',
          padding: '6px 9px',
          borderRadius: '6px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
          width: 'max-content',
        }}
      >
        <div className="flex flex-row items-center pb-2">
          <div
            className="flex items-center justify-center shrink-0" // 'shrink-0' to prevent shrinking
            style={{
              width: '44px',
              height: '44px',
              backgroundColor: {
                Explosion: '#b62915',
                Pierce: '#bc8800',
                Mystic: '#206d9b',
                Sonic: '#9a46a8',
                Chemical: '#137973',
              }[item.bullettype],
            }}
          >
            <img src={`data:image/webp;base64,${item.portrait}`} alt={`${item.name}'s icon`} width={40} height={40} className="" />
          </div>
          <div className="font-semibold px-4 text-neutral-800 mb-1">{item.name}</div>
        </div>

        {item.processedRatings.map((r, idx) => (
          <div key={idx} className={'grid text-sm pr-2 pl-2 pb-0.5 gap-x-2 ' + (rating == r.rating ? 'bg-black text-white font-bold' : '')} style={{ gridTemplateColumns: 'auto auto 1fr 1fr' }}>
            <React.Fragment key={idx}>
              {/* <span className={(rating==r.rating ? "bg-black text-white font-bold" : '')}> */}
              <div style={{ color: getBackgroundRatingColor(r.rating, isDark) }}> ⬤ </div>
              {/* ⬤ ● */}
              <div className="text-right text-neutral-800">
                <StarRating n={r.rating} />
              </div>
              <div className={'text-right text-neutral-600 ' + (rating == r.rating ? 'text-white' : '')}>
                {displayMode == 'average' ? r.value.toFixed(2) : r.value.toLocaleString()}
                {t('unit_cnt')}
              </div>
              <div className={'text-right text-neutral-600 ' + (rating == r.rating ? 'text-white' : '')}>({r.percent})</div>
              {/* </span> */}
            </React.Fragment>
          </div>
        ))}
      </div>
    );

    const mouseX = e.clientX;
    const mouseY = e.clientY;
    setTooltip({
      visible: true,
      content: tooltipContent,
      x: mouseX,
      y: mouseY,
    });
  };

  return (
    <>
      <div className="mb-4">
        <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400 transition-colors duration-300">{isRelativeMode ? t('desp_percent') : t('desp_absolute')}</p>
      </div>
      <div data-component-name="RankingChart" className="mb-4" ref={containerRef}>
        <svg
          width={svgWidth}
          height={(barHeight + barSpacing) * processedData.length + 50}
          // The viewBox width remains a fixed logical size (e.g., 800) for consistent scaling
          viewBox={`0 0 ${svgWidth} ${(barHeight + barSpacing) * processedData.length + 50}`}
          className="overflow-visible"
        >
          {processedData
            .map((v, i) => ({ ...v, allRank: i }))
            .sort((a, b) => a.id - b.id)
            .map((item, _index) => (
              // {processedData.map((v,i)=>({...v, allRank: i})).map((item, index) => (
              <g
                // key={index}
                key={item.id}
                // transform={`translate(0, ${item.allRank * (barHeight + barSpacing)})`} // it is not working at safari
                style={{
                  transform: `translateY(${item.allRank * (barHeight + barSpacing)}px)`,
                }}
                className="transition-transform duration-500 ease-in-out"
              >
                <rect
                  x="0"
                  fill={
                    {
                      Explosion: '#b62915',
                      Pierce: '#bc8800',
                      Mystic: '#206d9b',
                      Sonic: '#9a46a8',
                      Chemical: '#137973',
                    }[item.bullettype]
                  }
                  width="30"
                  height="30"
                />
                <image x="0" href={`data:image/webp;base64,${item.portrait}`} width="30" height="30" />

                {/* Bars and Labels */}
                {item.processedRatings.map((rating, i) => (
                  <React.Fragment key={i}>
                    <g onMouseLeave={() => setTooltip({ ...tooltip, visible: false })}>
                      {/* Bar */}
                      <rect
                        x={29 + 10 + rating.x}
                        y="0"
                        width={rating.width}
                        height={barHeight}
                        fill={getBackgroundRatingColor(rating.rating, isDark)}
                        className="transition-all duration-500 ease-in-out"
                        rx="4"
                        ry="4"
                        onMouseEnter={barTooltipHandler(item, rating.rating)}
                        onMouseMove={barTooltipHandler(item, rating.rating)}
                        onClick={barTooltipHandler(item, rating.rating)}
                      />
                      {/* Label - Only show if the bar is wide enough to fit the text */}
                      {rating.width > 40 && (
                        <text
                          x={29 + 10 + rating.x + rating.width / 2}
                          y={barHeight / 2}
                          dy="0.35em"
                          textAnchor="middle"
                          className={'font-semibold text-xs transition-opacity duration-300 ' + (rating.rating > 0 && isDark != 'dark' ? 'fill-white' : 'fill-white')}
                          onMouseEnter={barTooltipHandler(item, rating.rating)}
                          onMouseMove={barTooltipHandler(item, rating.rating)}
                          onClick={barTooltipHandler(item, rating.rating)}
                        >
                          {rating.label}
                        </text>
                      )}
                    </g>
                  </React.Fragment>
                ))}

                {/* Data Labels (Total or Percentage) */}
                <text x={svgWidth - 0} y={barHeight / 2} dy="0.35em" textAnchor="end" fill="currentColor" className="font-bold text-sm fill-neutral-800 dark:fill-neutral-300">
                  {displayMode === 'average' ? item.total.toFixed(2) : item.total.toLocaleString()}
                  {t('unit_cnt')}
                </text>
              </g>
            ))}
        </svg>
      </div>

      {tooltip.visible && (
        <div
          style={{
            position: 'fixed',
            left: tooltip.x,
            top: tooltip.y,
            transform: tooltip.x > window.innerWidth / 2 ? 'translate(-110%, -30%)' : 'translate(+10%, -30%)',
            pointerEvents: 'none',
            zIndex: 1000,
          }}
        >
          {tooltip.content}
          {/* {tooltip.x} {tooltip.y} */}
        </div>
      )}

      {/* Legend */}
      <div className="flex justify-center mt-6 space-x-2 sm:space-x-4 flex-wrap">
        {Object.entries(ratingColors).map(([rating, color]) => (
          <div key={rating} className="flex items-center my-1">
            <div className="w-3 h-3 sm:w-4 sm:h-4 rounded-full mr-1 sm:mr-2" style={{ backgroundColor: color }}></div>
            <span className="text-xs sm:text-sm font-medium text-neutral-700">
              <StarRating n={parseInt(rating)} />
            </span>
          </div>
        ))}
      </div>
    </>
  );
};
