import { BinnedDataRow, ChartData, RaidInfo, RawDataRow } from "@/app/types/data";
import { fetchCacheProcessor } from "@/app/utils/cache";
import { tsvParseRows } from "d3-dsv";
import { raidToString } from "./raidToString";
import { difficultyInfo, DifficultySelect } from "../components/Difficulty";



export interface ProcessChartDataParams {
    selectedStudentId: number | null;
    rankWidth: number;
    hideXThreshold: number;
    xRange: [number, number];
    heatmapMode: 'absolute' | 'percent';
    histogramMode: 'absolute' | 'percent';
    diffculty: DifficultySelect;
    xLabels: RaidInfo[];
    // maxLvJson: Record<number, number>;
    fetchAndProcessWithCache: fetchCacheProcessor<string>
}

export interface ProcessChartDataResult {
    chartDataByZ: Map<number, ChartData>;
    availableZValues: Set<number>;
    fullXRange: [number, number];
}

/**
 * Calculate chart data
 */
export const processChartData = async ({ selectedStudentId, rankWidth, hideXThreshold, xRange, heatmapMode, histogramMode, diffculty:selectedDiffculty, xLabels, fetchAndProcessWithCache }: ProcessChartDataParams): Promise<ProcessChartDataResult> => {
    // console.log('Executing processChartData with params:', {heatmapMode, histogramMode, maxLvJson});

    const mainDataUrl = `/w/map/${selectedStudentId}.tsv.xz`;

    const mainDataText = await fetchAndProcessWithCache(mainDataUrl, res => res.text());
    const rawData: RawDataRow[] = tsvParseRows(mainDataText, (row): RawDataRow => ({
        x: +row[0], y: +row[1], z: +row[2], w: +row[3], diffculty: difficultyInfo[+row[4]].name
    }));

    const binnedRawData: BinnedDataRow[] = rawData.map(row => {
        const bin = Math.floor((row.y - 1) / rankWidth);
        const y_prime = `${bin * rankWidth + 1}-${(bin + 1) * rankWidth}`;
        return { ...row, y_prime };
    });

    

    const finalDataByZ = new Map<number, ChartData>();
    const zValues = [...new Set(binnedRawData.map(d => d.z))].sort((a, b) => a - b);
    const allXBase = [...new Set(binnedRawData.map(d => d.x))].sort((a, b) => a - b);

    const minX = allXBase.length > 0 ? Math.min(...allXBase) : 0;
    const maxX = allXBase.length > 0 ? Math.max(...allXBase, 0) : 150;
    const fullXRange: [number, number] = [minX, maxX]

    // 1st filtering
    const binnedData = binnedRawData.filter(({diffculty})=>{
        if (selectedDiffculty == 'All') return true
        return selectedDiffculty == diffculty
    })

    console.log('binnedData',binnedData, binnedRawData)

    const rawXTotals = new Map<number, number>();
    binnedData.forEach(({ x, w }) => {
        rawXTotals.set(x, (rawXTotals.get(x) || 0) + w);
    });

    const allPossibleX = [...Array(maxX + 1).keys()];
    const allX = allPossibleX
        .filter(x => (rawXTotals.get(x) || 0) >= hideXThreshold * (xLabels[x].MaxLv || 1))
        .filter(x => x >= xRange[0] && x <= xRange[1]);

    const allYPrime = [...new Set(binnedData.map(d => d.y_prime))].sort((a, b) => {
        return parseInt(a.split('-')[0]) - parseInt(b.split('-')[0]);
    }).reverse();

    const allXLabels = allX.map(x => raidToString(xLabels[x], false, true) || x.toString());

    console.log({allPossibleX, allX, allYPrime, allXLabels})

    const totalWMap = new Map<string, number>();
    binnedData.forEach(({ x, y_prime, w }) => {
        const key = `${x}|${y_prime}`;
        totalWMap.set(key, (totalWMap.get(key) || 0) + w);
    });

    const xOverTotals = new Map<number, number>();
    const yOverTotals = new Map<string, number>();
    binnedData.forEach(({ x, y_prime, w }) => {
        const w_normalized = (xLabels[x].MaxLv > 0) ? w / xLabels[x].MaxLv : 0;
        xOverTotals.set(x, (xOverTotals.get(x) || 0) + w_normalized);
        yOverTotals.set(y_prime, (yOverTotals.get(y_prime) || 0) + w_normalized);
    });

    // console.log('proces', {binnedData, allXLabels, xOverTotals, yOverTotals, totalWMap})

    for (const z of zValues) {
        const subset = binnedData.filter(d => d.z === z);
        const wSumMap = new Map<string, number>();
        subset.forEach(({ x, y_prime, w }) => {
            const key = `${x}|${y_prime}`;
            wSumMap.set(key, (wSumMap.get(key) || 0) + w);
        });

        const heatmapZ: (number | null)[][] = allYPrime.map(y_prime =>
            allX.map(x => {
                const key = `${x}|${y_prime}`;
                if (!totalWMap.has(key)) return null;
                const wSum = wSumMap.get(key) || 0;
                if (heatmapMode === 'percent') {
                    const totalW = totalWMap.get(key) || 1;
                    return totalW > 0 ? (wSum / totalW) * 100 : 0;
                } else {
                    return (xLabels[x].MaxLv > 0) ? wSum / xLabels[x].MaxLv : 0;
                }
            })
        );

        const xTotals = new Map<number, number>();
        const yTotals = new Map<string, number>();
        subset.forEach(({ x, y_prime, w }) => {
            const w_normalized = (xLabels[x].MaxLv > 0) ? w / xLabels[x].MaxLv : 0;
            xTotals.set(x, (xTotals.get(x) || 0) + w_normalized);
            yTotals.set(y_prime, (yTotals.get(y_prime) || 0) + w_normalized);
        });

        // console.log('proces',z,{z,xTotals})
        const topBarValues = allX.map(x => {
            const numerator = xTotals.get(x) || 0;
            if (histogramMode === 'percent') {
                const denominator = xOverTotals.get(x) || 1;
                return denominator > 0 ? (numerator / denominator) * 100 : 0;
            }else{
                // if (x < 10) return numerator / 15000;
                // else return numerator / 20000
                if (selectedDiffculty == 'All') return numerator / xLabels[x].Cnt.All
                return numerator / (xLabels[x].Cnt[selectedDiffculty] || xLabels[x].Cnt.All)

            }
        });

        const rightBarValues = allYPrime.map(y => {
            const numerator = yTotals.get(y) || 0;
            if (histogramMode === 'percent') {
                const denominator = yOverTotals.get(y) || 1;
                return denominator > 0 ? (numerator / denominator) * 100 : 0;
            }

            return numerator;
        });

        finalDataByZ.set(z, {
            heatmap: { x: allXLabels, y: allYPrime, z: heatmapZ },
            topBar: { x: allXLabels, values: topBarValues },
            rightBar: { y: allYPrime, values: rightBarValues }
        });
    }


    return {
        chartDataByZ:finalDataByZ,
        availableZValues:new Set(zValues),
        fullXRange,
    };
};
