import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { getDifficultyFromScoreAndBoss } from '~/components/Difficulty';
import { calculateTimeFromScore } from '~/utils/calculateTimeFromScore';
import type { GameServer } from '~/types/data';
import { getBackgroundRatingColor, getCharacterStarValue, type Character, type PortraitData, type ReportEntryRank, type StudentData } from '../common';
import { formatTimeToTimestamp } from '~/utils/time';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, LabelList } from 'recharts';
import { useIsDarkState } from '~/store/isDarkState';
import { StudentIcon } from '../studentIcon';
import { StarRating } from '~/components/StarRatingProps';
const CustomBarLabel = (props: any) => {
  const { x, y, width, height, value, total } = props;

  if (value === 0 || !total || width < 35) {
    return null;
  }

  const percentage = ((value / total) * 100).toFixed(1);
  const cx = x + width / 2;
  const cy = y + height / 2;

  return (
    <g transform={`translate(${cx}, ${cy})`}>
      <text x={0} y={0} textAnchor="middle" dominantBaseline="central" fill="white" fontWeight="bold" fontSize="8">
        {/* First line of text */}
        <tspan x="0" dy="-0.7em">
          {value}
        </tspan>
        {/* Second line of text */}
        <tspan x="0" dy="1.4em">
          {percentage}%
        </tspan>
      </text>
    </g>
  );
};

const HistogramTooltip = (props: any) => {
  const { active, payload, label } = props;
  const { t } = useTranslation('dashboard');

  if (active && payload && payload.length) {
    const data = payload[0].payload;

    return (
      <div className="bg-white/90 dark:bg-neutral-800/90 backdrop-blur-sm p-2 border dark:border-neutral-600 rounded-md shadow-lg text-sm space-y-1">
        <p className="font-bold text-center border-b pb-1 mb-1">{label}</p>
        {data.all !== undefined && <p className="font-semibold">{t('tooltipPlayers', { count: data.all.toLocaleString() })}</p>}
        {data.all === undefined &&
          (() => {
            const totalInBin = payload.reduce((sum: number, p: any) => sum + p.value, 0);
            if (totalInBin === 0) return null;

            return payload
              .filter((p: any) => p.value > 0)
              .map((p: any) => (
                <div key={p.dataKey} className="flex items-center gap-1.5">
                  <span className="block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.fill }}></span>
                  <span>
                    <StarRating n={Number(p.dataKey)} />
                  </span>
                  <span className="font-bold">{p.value.toLocaleString()}</span>
                  <span className="text-gray-600 dark:text-gray-400">{`(${((p.value / totalInBin) * 100).toFixed(1)}%)`}</span>
                </div>
              ));
          })()}
      </div>
    );
  }
  return null;
};

export const StarRatingDistributionBarChart: React.FC<{
  studentChartInfo: {
    data: any[];
    total: number;
  };
  studentId: number;
  studentData: StudentData;
  portraitData: PortraitData;
}> = ({ studentChartInfo, studentId, studentData, portraitData }) => {
  if (!studentChartInfo || !studentChartInfo.data.length) {
    return null;
  }

  const { isDark } = useIsDarkState();
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const handleMouseEnter = (index: number) => {
    setActiveIndex(index);
  };

  const handleMouseLeave = () => {
    setActiveIndex(null);
  };

  const chartDataWithTotal = studentChartInfo.data.map((d) => ({
    ...d,
    total: studentChartInfo.total,
  }));

  const dataKeys = Object.keys(chartDataWithTotal[0]).filter((key) => key !== 'total' && key != 'name');

  return (
    <>
      <div className="shrink-0 w-10">
        <StudentIcon character={{ id: studentId } as Character} student={studentData[studentId]} portraitData={portraitData} />
      </div>
      <div className="grow h-10">
        <ResponsiveContainer width="100%" height={40}>
          <BarChart data={chartDataWithTotal} layout="vertical" margin={{ top: 5, right: 0, left: 0, bottom: 5 }}>
            <XAxis type="number" hide domain={[0, studentChartInfo.total]} />
            <YAxis type="category" dataKey="name" hide />
            <Tooltip
              isAnimationActive={false}
              content={({ payload, label, active }) => {
                if (active && payload && payload.length) {
                  const data = payload.filter((v) => activeIndex == v.dataKey.replace('★', ''))?.[0]; // Data from the current hover bar
                  if (!data) return null;
                  const value = data.value; // Number of persons of star lavel
                  const total = data.payload.total; // Total headcount

                  if (!total || value === 0) {
                    return null;
                  }

                  const percentage = ((value / total) * 100).toFixed(1);

                  return (
                    <div className="bg-white/90 dark:bg-neutral-800/90 backdrop-blur-sm p-2 border dark:border-neutral-600 rounded-md shadow-lg text-sm">
                      <div className="flex items-center gap-1.5">
                        <span className="block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: data.fill }}></span>

                        <span>
                          <StarRating n={Number(data.dataKey.replace('★', ''))} />
                        </span>
                        <span className="font-bold">{`${value.toLocaleString()}`}</span>
                        <span className="text-gray-600 dark:text-gray-400">{`(${percentage}%)`}</span>
                      </div>
                    </div>
                  );
                }

                return null;
              }}
              cursor={{ fill: 'rgba(150, 150, 150, 0.1)' }} // Hover Background Effect
            />
            {dataKeys
              .sort((x, y) => {
                let a = parseInt(x, 10);
                let b = parseInt(y, 10);
                let a_ = a < 0 ? -a + 1000 : a;
                let b_ = b < 0 ? -b + 1000 : b;
                return a_ - b_;
              })
              .map((key, index) => {
                // Extract the number 8 from '8★'.
                const star = parseInt(key, 10);
                return (
                  <Bar
                    key={key}
                    dataKey={key}
                    stackId="a"
                    fill={getBackgroundRatingColor(star, isDark) || '#ccc'}
                    onMouseEnter={() => handleMouseEnter(star)}
                    onMouseLeave={handleMouseLeave}
                    isAnimationActive={false}
                  >
                    <LabelList
                      dataKey={key}
                      content={React.cloneElement(<CustomBarLabel />, {
                        total: studentChartInfo.total,
                      })}
                    />
                  </Bar>
                );
              })}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  );
};

export const CompositionDetailView: React.FC<{
  comp: any;
  entries: ReportEntryRank[];
  studentData: StudentData;
  boss: string;
  server: GameServer;
  id: string;
  portraitData: PortraitData;
  onClose: () => void;
}> = ({ comp, entries, studentData, boss, server, id, portraitData, onClose }) => {
  const { t } = useTranslation('dashboard');
  const [selectedStudentId, setSelectedStudentId] = useState<'all' | number>('all');
  const [dataType, setDataType] = useState<'score' | 'time' | 'rank'>('rank');
  const { isDark } = useIsDarkState();

  if (entries.length == 0) return null;

  const isTimeViewable = useMemo(() => {
    const firstDifficulty = getDifficultyFromScoreAndBoss(entries[0].s, server, id);
    return entries.every((e) => getDifficultyFromScoreAndBoss(e.s, server, id) === firstDifficulty);
  }, [entries]);

  // Best score / Best Calculator
  const { maxScore, minTime, maxDifficulty } = useMemo(() => {
    const scores = entries.map((e) => e.s);
    const maxScore = Math.max(...scores);
    const minTime = calculateTimeFromScore(maxScore, boss, server, id);
    const maxDifficulty = getDifficultyFromScoreAndBoss(entries[0].s, server, id);
    return { maxScore, minTime, maxDifficulty };
  }, [entries, isTimeViewable, boss, server, id]);

  // Calculate histogram and star distribution data
  const { histogram, starDistributionData, starRatings } = useMemo(() => {
    if (entries.length === 0) return { histogram: [], starDistributionData: {}, starRatings: [] };

    const availableStars = new Set<number>();
    const studentStarCounts: Map<number, { [starKey: string]: number }> = new Map();
    comp.ids.forEach((id: number) => studentStarCounts.set(id, {}));

    for (const entry of entries) {
      const allChars = entry.t.flatMap((team) => [...team.m, ...team.s]).filter((c): c is Character => !!c);

      allChars.forEach((char) => {
        const star = getCharacterStarValue(char);

        if (typeof star !== 'number' || isNaN(star)) {
          return;
        }

        availableStars.add(star);
        const starKey = `${star}★`;
        const currentStudentCounts: { [key: string]: number } = studentStarCounts.get(char.id) || {};
        currentStudentCounts[starKey] = (currentStudentCounts[starKey] || 0) + 1;
        studentStarCounts.set(char.id, currentStudentCounts);
      });
    }
    const dynamicStarRatings = Array.from(availableStars).sort((a, b) => a - b);

    // 2. Initialize variable for data collection
    const bins = new Map<number, any>();
    const binSize = (() => {
      if (dataType === 'score') {
        const scoreRange = entries[0].s - entries[entries.length - 1].s;
        return 10 ** ((Math.log10(scoreRange) - 2) | 0);
      }
      if (dataType === 'time') {
        return 5; // 5s
      }
      // dataType == 'rank'
      const rankRange = entries[entries.length - 1].typeRanking - entries[0].typeRanking;
      if (rankRange <= 0) return 100;
      return Math.max(10, 10 ** (Math.floor(Math.log10(rankRange)) - 1));
    })();

    for (const entry of entries) {
      const value = (() => {
        if (dataType === 'score') return entry.s;
        if (dataType === 'time') return isTimeViewable ? calculateTimeFromScore(entry.s, boss, server, id) || 0 : 0;
        return entry.typeRanking; // 'rank'
      })();

      const binIndex = Math.floor(value / binSize);
      const currentBin = bins.get(binIndex) || { count: 0 };

      if (selectedStudentId === 'all') {
        currentBin.count += 1; // For 'All', just count entries
      } else {
        const studentChars = entry.t.flatMap((team) => [...team.m, ...team.s]).filter((c): c is Character => !!c && c.id === selectedStudentId);
        studentChars.forEach((char) => {
          const star = getCharacterStarValue(char);
          if (!currentBin[star]) currentBin[star] = 0;
          currentBin[star] += 1;
        });
      }
      bins.set(binIndex, currentBin);
    }
    // 4. Converting data to Recharts format
    const histogramData = Array.from(bins.entries())
      .map(([binIndex, starData]) => {
        const start = binIndex * binSize;

        const name = (() => {
          if (dataType === 'score') return `${(start / 1_000_000).toFixed(3)}M`;
          if (dataType === 'time') return formatTimeToTimestamp(start);
          // 'rank'
          const end = start + binSize;
          return `${start.toLocaleString()}-${end.toLocaleString()}`;
        })();

        if (selectedStudentId == 'all') {
          return { name, all: starData.count };
        }
        const binObject: { name: string; [key: number]: number } = { name };
        dynamicStarRatings.forEach((star) => {
          binObject[star] = starData[star] || 0;
        });
        return binObject;
      })
      .sort((a, b) => {
        const valA = dataType === 'score' ? parseFloat(a.name) : a.name.split(':').reduce((acc, time) => 60 * acc + +time, 0);
        const valB = dataType === 'score' ? parseFloat(b.name) : b.name.split(':').reduce((acc, time) => 60 * acc + +time, 0);
        return valA - valB;
      });

    const finalStudentStarData: {
      [id: number]: { data: any[]; total: number };
    } = {};
    studentStarCounts.forEach((counts, id) => {
      // Summing the number of students by star-level
      const total = Object.values(counts).reduce((sum, count) => sum + count, 0);

      if (total > 0) {
        const dataWithYAxisKey = {
          ...counts,
          name: studentData[id]?.Name || `ID: ${id}`, // Use the student name as the key on the Y-axis
        };

        finalStudentStarData[id] = {
          data: [dataWithYAxisKey],
          total: total,
        };
      }
    });

    return {
      histogram: histogramData,
      starDistributionData: finalStudentStarData,
      starRatings: dynamicStarRatings,
    };
  }, [entries, selectedStudentId, dataType, isTimeViewable, boss, server, id, isDark]);

  const studentsToDisplay = selectedStudentId === 'all' ? comp.ids : [selectedStudentId];
  return (
    <div className="w-full mt-2 p-2 sm:p-4 border border-teal-500 rounded-lg bg-white dark:bg-neutral-800 shadow-xl space-y-4">
      <div className="flex justify-between items-center">
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          <div className="text-xs">
            <span className="font-bold">{t('maxScore')}: </span> {maxDifficulty.toUpperCase()} {maxScore.toLocaleString()}
          </div>
          {minTime !== undefined && (
            <div className="text-xs">
              <span className="font-bold">{t('minTime')}: </span>
              {formatTimeToTimestamp(minTime)}
            </div>
          )}
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="text-lg font-bold hover:text-red-500 transition-colors"
        >
          ✕
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 p-2 rounded-md bg-gray-50 dark:bg-neutral-700/50">
        <div>
          <label className="text-xs font-bold">{t('viewByStudent')}</label>

          <div className="flex flex-wrap items-center gap-2 mt-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setSelectedStudentId('all');
              }}
              className={`px-2.5 py-1 text-xs rounded ${selectedStudentId === 'all' ? 'bg-sky-500 text-white font-bold' : 'bg-gray-200 dark:bg-neutral-600'}`}
            >
              {t('viewAllStudents')}
            </button>
            {comp.ids.map((sid: number) => (
              <button
                key={sid}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedStudentId(sid);
                }}
                className={`w-10 rounded-full transition-all duration-200 ${selectedStudentId === sid ? 'ring-2 ring-sky-500 ring-offset-2 dark:ring-offset-neutral-800' : 'opacity-60 hover:opacity-100'}`}
                title={studentData[sid]?.Name}
              >
                <StudentIcon character={{ id: sid } as Character} student={studentData[sid]} portraitData={portraitData} />
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-xs font-bold">{t('dataType')}</label>
          <div className="flex gap-1 mt-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setDataType('rank');
              }}
              className={`px-2 py-0.5 text-xs rounded ${dataType === 'rank' ? 'bg-sky-500 text-white' : 'bg-gray-200 dark:bg-neutral-600'}`}
            >
              {t('byRank')}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setDataType('score');
              }}
              className={`px-2 py-0.5 text-xs rounded ${dataType === 'score' ? 'bg-sky-500 text-white' : 'bg-gray-200 dark:bg-neutral-600'}`}
            >
              {t('byScore')}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setDataType('time');
              }}
              className={`px-2 py-0.5 text-xs rounded disabled:opacity-50 ${dataType === 'time' ? 'bg-sky-500 text-white' : 'bg-gray-200 dark:bg-neutral-600'}`}
              disabled={!isTimeViewable}
            >
              {t('byTime')}
            </button>
          </div>
          {!isTimeViewable && <div className="text-xs text-yellow-600 dark:text-yellow-400 mt-1.5">{t('timeViewUnavailableNotice')}</div>}
        </div>
      </div>
      {/* Chart Area */}

      <div>
        <h4 className="font-bold text-center mb-2">{dataType === 'score' ? t('scoreDistribution') : dataType === 'time' ? t('timeDistribution') : t('rankDistribution')}</h4>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={histogram} barGap={0}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" fontSize={10} />
            <YAxis />
            {/* <Legend formatter={(value) => <StarRating n={Number(value)} />} /> */}
            {starRatings.map((star) => (
              <Bar key={star} dataKey={star} stackId="a" fill={getBackgroundRatingColor(star, isDark) || '#ccc'} />
            ))}
            (selectedStudentId=='all' &&
            <Bar key={'all'} dataKey={'all'} stackId="a" fill={isDark == 'dark' ? '#ccc' : '#777'} />
            )
            <Tooltip content={<HistogramTooltip />} cursor={{ fill: 'rgba(150, 150, 150, 0.1)' }} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      {/* Star Distribution Bar Chart */}
      <div>
        <h4 className="font-bold text-center mb-2">{t('starRatingDistribution')}</h4>
        <div className="space-y-4">
          {studentsToDisplay.map((studentId: number) => {
            const studentChartInfo = starDistributionData[studentId];
            return (
              <div key={studentId} className="flex items-center gap-2">
                <StarRatingDistributionBarChart studentChartInfo={studentChartInfo} studentId={studentId} studentData={studentData} portraitData={portraitData} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
