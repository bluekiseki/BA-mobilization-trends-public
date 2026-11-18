import { buildResourceApIndex, type ResourceApIndex } from '../features/event-planner/logic/resourceApCost';
import { computeJointChart, type JointChartRequest, type JointChartWorkerRequest, type JointChartWorkerResponse } from '../features/event-planner/logic/jointChart';

let index: ResourceApIndex | null = null;
// Only the newest request is worth solving: a user dragging an input queues many, and the older ones are already stale.
let latest: { requestId: number; request: JointChartRequest } | null = null;

function post(message: JointChartWorkerResponse) {
  self.postMessage(message);
}

function run() {
  const job = latest;
  latest = null;
  if (!job) return;
  if (!index) {
    post({ status: 'error', requestId: job.requestId, error: 'not-initialized' });
    return;
  }
  try {
    post({ status: 'ready', requestId: job.requestId, result: computeJointChart(index, job.request) });
  } catch (error) {
    post({ status: 'error', requestId: job.requestId, error: error instanceof Error ? error.message : 'joint-chart-error' });
  }
}

self.onmessage = ({ data }: MessageEvent<JointChartWorkerRequest>) => {
  if (data.type === 'init') {
    index = buildResourceApIndex(data.ctx);
    return;
  }
  latest = { requestId: data.requestId, request: data.request };
  setTimeout(run, 0);
};
