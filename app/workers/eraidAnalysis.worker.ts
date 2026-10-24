import { XzReadableStream } from 'xz-decompress';
import type { AnalysisWorkerRequest, AnalysisWorkerResponse, ERaidCombinationIndexV1 } from '../features/raid-stats/dashboard/types/eraidAnalysis';
import { aggregateCombinationHistogram, aggregateCombinations, scoresSha256, validateCombinationIndex } from '../features/raid-stats/dashboard/eraidAnalysis';
import { processStream } from '../utils/xorProcess';

let state: { scores: Int32Array; ids: Uint16Array; profiles: ERaidCombinationIndexV1['profiles']; armorTypes: ERaidCombinationIndexV1['armorTypes']; tiers: Record<string, number> } | null = null;
let latest: Exclude<AnalysisWorkerRequest, { type: 'histogram' }> | null = null;
let histogramRequest: Extract<AnalysisWorkerRequest, { type: 'histogram' }> | null = null;

function reply() {
  if (!state || !latest) return;
  const data = { ...aggregateCombinations(state.scores, state.ids, state.profiles, state.tiers, latest.filters), armorTypes: state.armorTypes };
  self.postMessage({ status: 'ready', requestId: latest.requestId, data } satisfies AnalysisWorkerResponse);
}

function replyHistogram() {
  if (!state || !histogramRequest) return;
  const data = histogramRequest.query ? aggregateCombinationHistogram(state.scores, state.ids, state.profiles, state.tiers, histogramRequest.query) : null;
  self.postMessage({ status: 'histogram', requestId: histogramRequest.requestId, data } satisfies AnalysisWorkerResponse);
}

self.onmessage = async ({ data: message }: MessageEvent<AnalysisWorkerRequest>) => {
  if (message.type === 'histogram') {
    histogramRequest = message;
    try {
      replyHistogram();
    } catch (error) {
      self.postMessage({ status: 'error', requestId: latest?.requestId ?? message.requestId, error: error instanceof Error ? error.message : 'histogram-error' } satisfies AnalysisWorkerResponse);
    }
    return;
  }
  latest = message;
  try {
    if (message.type === 'filter') {
      reply();
      return;
    }
    state = null;
    const response = await fetch(message.url, { cache: message.reload ? 'reload' : 'default' });
    if (!response.ok || !response.body) throw new Error(`index-fetch-${response.status}`);
    const decoded: unknown = await new Response(new XzReadableStream(processStream(response.body))).json();
    const index = validateCombinationIndex(decoded, message.server, message.season, message.scores.length);
    if ((await scoresSha256(message.scores)) !== index.baseScoresSha256) throw new Error('index-scores-mismatch');
    for (let i = 1; i < message.scores.length; i++) {
      if (message.scores[i] > message.scores[i - 1]) throw new Error('scores-not-sorted');
    }
    state = { scores: message.scores, ids: Uint16Array.from(index.profileIds), profiles: index.profiles, armorTypes: index.armorTypes, tiers: message.tierCounter };
    reply();
    replyHistogram();
  } catch (error) {
    self.postMessage({ status: 'error', requestId: latest?.requestId ?? message.requestId, error: error instanceof Error ? error.message : 'index-error' } satisfies AnalysisWorkerResponse);
  }
};
