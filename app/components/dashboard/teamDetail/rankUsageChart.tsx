import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useIsDarkState } from '~/store/isDarkState';
import { getBackgroundRatingColor, getCharacterStarValue, type Character, type PortraitData, type ReportEntryRank, type StudentData } from '../common';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { StarRating } from '~/components/StarRatingProps';
import { StudentIcon } from '../studentIcon';

const HASH_COLORS = [
  '#FF6633',
  '#FFB399',
  '#FF33FF',
  '#FFFF99',
  '#00B3E6',
  '#E6B333',
  '#3366E6',
  '#999966',
  '#99FF99',
  '#B34D4D',
  '#80B300',
  '#809900',
  '#E6B3B3',
  '#6680B3',
  '#66991A',
  '#FF99E6',
  '#CCFF1A',
  '#FF1A66',
  '#E6331A',
  '#33FFCC',
  '#66994D',
  '#B366CC',
  '#4D8000',
  '#B33300',
  '#CC80CC',
  '#66664D',
  '#991AFF',
  '#E666FF',
  '#4DB3FF',
  '#1AB399',
  '#E666B3',
  '#33991A',
  '#CC9999',
  '#B3B31A',
  '#00E680',
  '#4D8066',
  '#809980',
  '#E6FF80',
  '#1AFF33',
  '#999933',
  '#FF3380',
  '#CCCC00',
  '#66E64D',
  '#4D80CC',
  '#9900B3',
  '#E64D66',
  '#4DB380',
  '#FF4D4D',
  '#99E6E6',
  '#6666FF',
];
const getColorForString = (str: string, is_etc: boolean) => {
  if (is_etc) return '#8884d8'; // Set a consistent color for "Other"
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return HASH_COLORS[Math.abs(hash) % HASH_COLORS.length];
};

export const RankUsageChart: React.FC<{
  data: ReportEntryRank[];
  studentData: StudentData;
  portraitData: PortraitData;
}> = ({ data, studentData, portraitData }) => {
  const [selectedCharId, setSelectedCharId] = useState<number | null>(null);
  const [activeIndex, setActiveIndex] = useState<number | null | string>(null);
  const { isDark } = useIsDarkState();
  const startRank = data[0].typeRanking;
  const { t } = useTranslation('dashboard');
  const { t: t_c } = useTranslation('common');

  console.log('[RankUsageChart] data', data);

  // --- Data Processing ---
  const defaultChartData = useMemo(() => {
    if (selectedCharId !== null || data.length === 0) return { chartData: [], allStudentNames: [] };

    // const maxRank = data[data.length - 1]?.r || 0;
    // const bucketSize = Math.ceil(maxRank / 20) || 1;
    const bucketSize = Math.max(50, Math.ceil(data.length / 500) * 10 || 1);
    const buckets = new Map<number, { total: number; students: Map<string, number> }>();

    data.forEach((entry) => {
      const bucketStart = Math.floor((entry.typeRanking - 1) / bucketSize) * bucketSize + 1;
      if (!buckets.has(bucketStart)) buckets.set(bucketStart, { total: 0, students: new Map() });

      const bucket = buckets.get(bucketStart)!;
      bucket.total++;

      const uniqueChars = new Set(entry.t.flatMap((team) => [...team.m, ...team.s].filter((v) => v && Object.keys(v).length).map((c) => c.id)));
      uniqueChars.forEach((id) => {
        const studentName = studentData[id]?.Name;
        if (studentName) {
          bucket.students.set(studentName, (bucket.students.get(studentName) || 0) + 1);
        }
      });
    });

    const allTopStudents = new Set<string>();
    const finalChartData = Array.from(buckets.entries()).map(([start, bucketData]) => {
      const result: { [key: string]: any } = {
        rank: `${startRank + start}-${startRank + start + bucketSize - 1}`,
      };
      let othersCount = 0;

      bucketData.students.forEach((count, name) => {
        if (count < bucketData.total * 0.5) {
          othersCount += count;
        } else {
          result[name] = (count / bucketData.total) * 100;
          allTopStudents.add(name);
        }
      });

      if (othersCount > 0) {
        result[t('etc', 'etc')] = (othersCount / bucketData.total) * 100;
      }
      return result;
    });

    const studentNamesForLegend = Array.from(allTopStudents).sort();
    if (finalChartData.some((d) => d[t('etc', 'etc')])) {
      studentNamesForLegend.push(t('etc', 'etc'));
    }

    return {
      chartData: finalChartData,
      allStudentNames: studentNamesForLegend,
    };
  }, [data, studentData, selectedCharId]);

  const singleCharChartData = useMemo(() => {
    // This calculation runs only when a character IS selected
    if (selectedCharId === null || data.length === 0) return [];
    const maxRank = data[data.length - 1]?.typeRanking || 0;
    const bucketSize = Math.max(50, Math.ceil(maxRank / 1000) * 10 || 1);
    const buckets = new Map<number, { total: number; stars: Map<number, number> }>();
    data.forEach((entry) => {
      const bucketStart = Math.floor((entry.typeRanking - 1) / bucketSize) * bucketSize + 1;
      if (!buckets.has(bucketStart)) buckets.set(bucketStart, { total: 0, stars: new Map() });
      const bucket = buckets.get(bucketStart)!;
      bucket.total++;
      entry.t.forEach((team) =>
        [...team.m, ...team.s]
          .filter((v) => v && Object.keys(v).length)
          .forEach((char) => {
            if (char.id === selectedCharId) {
              const starValue = getCharacterStarValue(char);
              bucket.stars.set(starValue, (bucket.stars.get(starValue) || 0) + 1);
            }
          }),
      );
    });
    return Array.from(buckets.entries()).map(([start, d]) => {
      const result: { [key: string]: any } = {
        rank: `${start}-${start + bucketSize - 1}`,
      };
      d.stars.forEach((count, star) => (result[star] = (count / d.total) * 100));
      return result;
    });
  }, [data, selectedCharId]);

  const pickRateData = useMemo(() => {
    const counts = new Map<number, number>();
    data.forEach((entry) => {
      // const uniqueChars = new Set(entry.t.flatMap(team => [...team.m, ...team.s].filter(v => v && Object.keys(v).length).map(c => c.id)));
      // uniqueChars.forEach(id => counts.set(id, (counts.get(id) || 0) + 1));
      entry.t.flatMap((team) => [...team.m, ...team.s].filter((v) => v && Object.keys(v).length).map((c) => c.id)).forEach((id) => counts.set(id, (counts.get(id) || 0) + 1));
    });
    const total = data.length;
    if (total === 0) return [];
    return Array.from(counts.entries())
      .map(([id, count]) => ({ id, count, rate: (count / total) * 100 }))
      .sort((a, b) => b.count - a.count);
  }, [data]);

  const starLevelsForSelectedChar = useMemo(
    () => Array.from(new Set(singleCharChartData.flatMap((e) => Object.keys(e).filter((k) => k !== 'rank')))).sort((a, b) => Number(b) - Number(a)),
    [singleCharChartData],
  );

  const handleSelectChar = (id: number) => setSelectedCharId((prevId) => (prevId === id ? null : id));

  const cardTitle = (
    <div className="flex justify-between items-center w-full">
      <span>
        {selectedCharId
          ? `IN ${data[0].typeRanking} - ${data[data.length - 1].typeRanking} - ${studentData[selectedCharId]?.Name}`
          : `IN ${data[0].typeRanking} - ${data[data.length - 1].typeRanking}`}
      </span>
      {selectedCharId && (
        <button onClick={() => setSelectedCharId(null)} className="text-sm bg-neutral-600 px-3 py-1 rounded hover:bg-neutral-500 text-neutral-100">
          {t_c('viewAll')}
        </button>
      )}
    </div>
  );

  const handleMouseEnter = (index: number | string) => {
    setActiveIndex(index);
  };

  const handleMouseLeave = () => {
    setActiveIndex(null);
  };

  const defaultChartDataMax = Math.max(
    ...defaultChartData.chartData.map((item) =>
      Object.entries(item)
        .filter(([a, b]) => a != 'rank')
        .map(([a, b]) => b)
        .reduce((a, b) => a + b, 0),
    ),
  );

  const defaultChartDataTick = defaultChartDataMax > 1500 ? new Array(Math.ceil(defaultChartDataMax / 600)).fill(0).map((v, i) => i * 600) : undefined;

  return (
    <>
      {cardTitle}
      <div className="h-full flex flex-col">
        <div className="grow h-80">
          {selectedCharId === null ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={defaultChartData.chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
                <XAxis dataKey="rank" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" unit="%" ticks={defaultChartDataTick} />
                <Tooltip
                  content={({ payload, label, active }) => {
                    if (active && payload?.length) {
                      return (
                        <div className="rounded border bg-white p-2 text-sm shadow-md dark:border-neutral-600 dark:bg-neutral-800">
                          <div className="mb-2 font-semibold text-neutral-900 dark:text-white">{label}</div>

                          <div className="space-y-0.5">
                            {payload
                              .filter((a) => a.name !== t('etc', 'etc'))
                              .sort((a, b) => b.value - a.value)
                              .map((entry, i) => {
                                const color = getColorForString(entry.name, entry.name === t('etc', 'etc'));

                                return (
                                  <div
                                    key={i}
                                    className="w-full min-w-[150px]"
                                    style={{
                                      backgroundColor: entry.name == activeIndex ? `color-mix(in oklab, ${color} 20%, transparent)` : '',
                                    }}
                                  >
                                    <div className="mt-1 flex items-center justify-between text-xs">
                                      <span className="font-medium text-neutral-600 dark:text-neutral-300">{entry.name}</span>
                                      <span className="font-bold text-neutral-800 dark:text-neutral-100">{entry.value.toFixed(2)}%</span>
                                    </div>
                                    <div className="h-0.5 w-full rounded-full bg-neutral-200 dark:bg-neutral-700">
                                      <div
                                        className="h-0.5 rounded-full"
                                        style={{
                                          width: `${entry.value}%`,
                                          backgroundColor: color,
                                        }}
                                      />
                                    </div>
                                  </div>
                                );
                              })}
                          </div>
                          <div className="mt-2 border-t border-neutral-200 pt-2 text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">...</div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                {/* <Legend /> */}
                {defaultChartData.allStudentNames.map((name) => (
                  <Bar
                    key={name}
                    dataKey={name}
                    stackId="a"
                    fill={getColorForString(name, name == t('etc', 'etc'))}
                    onMouseEnter={() => handleMouseEnter(name)}
                    onMouseLeave={handleMouseLeave}
                    name={name}
                  />
                ))}
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((y) => (
                  <ReferenceLine key={y} y={y * 600} stroke={isDark == 'dark' ? 'white' : 'black'} strokeDasharray="3 3">
                    {/* <Label value="1200%" position="insideTopRight" fill="red" fontSize={12} /> */}
                  </ReferenceLine>
                ))}

                {/* <ReferenceLine y={1200} stroke={isDark == 'dark' ? "white" : "black"} strokeDasharray="3 3">
                                    {/* <Label value="1200%" position="insideTopRight" fill="red" fontSize={12} /> */}
                {/* </ReferenceLine>  */}
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={singleCharChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
                <XAxis dataKey="rank" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" unit="%" domain={[0, 100]} />
                {/* <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155' }} /> */}
                <Tooltip
                  content={({ payload, label, active }) => {
                    if (label && payload?.length) {
                      return (
                        <div className="rounded border bg-white p-2 text-sm text-neutral-700 shadow-md dark:border-neutral-600 dark:bg-neutral-800 dark:text-white">
                          <div className="font-bold">{studentData[selectedCharId]?.Name}</div>
                          <div> {label}</div>

                          {payload
                            .filter((entry, i) => entry.value)
                            .map((entry, i) => {
                              const starNumber = Number(entry.name.replace('★ ', ''));

                              return (
                                <div key={i} className="w-full min-w-[150px] space-y-0.5 ">
                                  <div className="mt-1.5 -mb-1.5 flex items-center justify-between text-xs ">
                                    <span className="text-neutral-500 dark:text-neutral-400">
                                      <StarRating n={starNumber} />
                                    </span>
                                    <span className="font-bold text-neutral-800 dark:text-neutral-200">{entry.value.toFixed(2)}%</span>
                                  </div>

                                  <div className="h-1 w-full rounded bg-neutral-200 dark:bg-neutral-600">
                                    <div
                                      className="h-1 rounded"
                                      style={{
                                        width: `${entry.value}%`,
                                        backgroundColor: getBackgroundRatingColor(starNumber, isDark),
                                      }}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                {starLevelsForSelectedChar.map((star) => (
                  <Area
                    key={star}
                    type="monotone"
                    dataKey={star}
                    stackId="1"
                    name={`★ ${star}`}
                    stroke={getBackgroundRatingColor(Number(star), isDark)}
                    fill={getBackgroundRatingColor(Number(star), isDark)}
                    connectNulls={true}
                  />
                ))}
                <ReferenceLine y={100} stroke={isDark == 'dark' ? 'white' : 'black'} strokeDasharray="3 3">
                  {/* <Label value="100%" position="insideTopRight" fill="red" fontSize={12} /> */}
                </ReferenceLine>
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="shrink-0 pt-3 mt-3 border-t border-neutral-200 dark:border-neutral-600">
          <div className="flex flex-wrap justify-center gap-1">
            {pickRateData.map((char) => (
              <div
                key={char.id}
                onClick={() => handleSelectChar(char.id)}
                className={`flex flex-col items-center w-13 p-0 rounded-sm cursor-pointer transition-all ${selectedCharId === char.id ? 'bg-teal-500/30' : 'hover:bg-neutral-200 dark:hover:bg-neutral-700'}`}
              >
                <div className="w-12 h-12">
                  <StudentIcon character={{ id: char.id } as Character} student={studentData[char.id]} portraitData={portraitData} />
                </div>
                <span className="font-bold text-neutral-800 text-[0.7em] dark:text-white mt-1">{char.rate.toFixed(2)}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
};
