import { performance } from 'node:perf_hooks';
import { reconcileEntities } from 'geospatial-world-synthesis';

const count = Math.max(100, Math.min(1_000_000, Number(process.argv[2]) || 10_000));
const columns = Math.ceil(Math.sqrt(count));
const record = (prefix, index, offset = 0) => ({
  id: `${prefix}-${index}`,
  sourceId: `${prefix}-${index}`,
  providerId: prefix,
  entityType: 'poi',
  geometry: { type: 'Point', coordinates: [-120 + index % columns * 0.001 + offset, 30 + Math.floor(index / columns) * 0.001] },
  properties: { name: `Place ${index}`, category: index % 3 === 0 ? 'library' : 'shop' }
});

const baselineMemory = process.memoryUsage().rss;
const left = Array.from({ length: count }, (_, index) => record('left', index));
const right = Array.from({ length: count }, (_, index) => record('right', index, 0.00001));
const startedAt = performance.now();
const result = reconcileEntities(left, right, { maxReportedCandidates: 1 });
const elapsedMs = performance.now() - startedAt;
const matches = result.counts.MATCH;
const falseMerges = result.decisions.filter((decision) => decision.decision === 'MATCH' && Number(decision.sourceId.split('-').at(-1)) !== Number(decision.matchedId.split('-').at(-1))).length;
const precision = matches ? (matches - falseMerges) / matches : 0;
const recall = (matches - falseMerges) / count;
const maxRssBytes = process.resourceUsage().maxRSS * 1024;

console.log(JSON.stringify({
  fixture: 'deterministic-grid-poi-pairs',
  license: 'CC0-1.0',
  recordsPerSource: count,
  totalInputRecords: count * 2,
  reconciliationMs: Number(elapsedMs.toFixed(2)),
  recordsPerSecond: Math.round(count / (elapsedMs / 1000)),
  candidateCount: result.metrics.candidateCount,
  allPairsCandidateCount: count * count,
  candidateReduction: Number((1 - result.metrics.candidateCount / (count * count)).toFixed(8)),
  matches,
  ambiguous: result.counts.AMBIGUOUS,
  noMatch: result.counts.NO_MATCH,
  falseMerges,
  precision: Number(precision.toFixed(6)),
  recall: Number(recall.toFixed(6)),
  f1: precision + recall ? Number((2 * precision * recall / (precision + recall)).toFixed(6)) : 0,
  rssGrowthBytes: Math.max(0, process.memoryUsage().rss - baselineMemory),
  maxRssBytes,
  decisionJsonBytes: Buffer.byteLength(JSON.stringify(result)),
  index: result.metrics.index,
  limitations: 'Generated point-pair throughput and known-correspondence accuracy; excludes provider I/O, polygons, and messy real-world labels.'
}, null, 2));
