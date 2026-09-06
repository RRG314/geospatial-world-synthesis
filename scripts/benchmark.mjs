import { performance } from 'node:perf_hooks';
import { createLocalProvider, synthesize } from 'geospatial-world-synthesis';

const count = Math.max(100, Math.min(10000, Number(process.argv[2]) || 2000));
const records = Array.from({ length: count }, (_, index) => ({
  sourceId: `poi-${index}`,
  entityType: 'poi',
  geometry: { type: 'Point', coordinates: [-76.62 + (index % 100) * 0.0001, 39.28 + Math.floor(index / 100) * 0.0001] },
  properties: { name: `Fixture ${index}`, category: index % 2 ? 'odd' : 'even' },
  evidenceClass: 'DIRECT_SOURCE'
}));
const provider = createLocalProvider({
  id: 'benchmark-fixture', records, sourceCrs: 'OGC:CRS84', licenseId: 'CC0-1.0', attribution: 'Generated benchmark fixture — CC0-1.0'
});
const samples = [];
let snapshot;
for (let index = 0; index < 5; index += 1) {
  const started = performance.now();
  snapshot = await synthesize({ bounds: [-76.63, 39.27, -76.60, 39.32], providers: [provider], limits: { maxRecordsPerProvider: count } });
  samples.push(performance.now() - started);
}
samples.sort((left, right) => left - right);
console.log(JSON.stringify({
  fixture: 'generated-points', records: count, iterations: samples.length,
  medianMs: Number(samples[Math.floor(samples.length / 2)].toFixed(2)),
  minMs: Number(samples[0].toFixed(2)), maxMs: Number(samples.at(-1).toFixed(2)),
  entityCount: snapshot.entities.length, claimCount: snapshot.claims.length,
  note: 'Synthetic fixture throughput; not real-world accuracy or provider-network performance.'
}, null, 2));
