import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { synthesize } from 'geospatial-world-synthesis';
import { createOpenStreetMapMapProvider } from 'geospatial-world-synthesis/providers';
import { createOvertureMapsProvider } from 'geospatial-world-synthesis/node';

const release = process.env.OVERTURE_RELEASE || '2026-08-19.0';
const areas = [
  { id: 'london-centre', country: 'United Kingdom', context: 'dense urban', bounds: [-0.1280, 51.5000, -0.1240, 51.5020] },
  { id: 'paris-centre', country: 'France', context: 'dense urban', bounds: [2.2930, 48.8575, 2.2960, 48.8595] },
  { id: 'sydney-harbour', country: 'Australia', context: 'waterfront landmark', bounds: [151.2140, -33.8580, 151.2170, -33.8550] },
  { id: 'boulder-neighbourhood', country: 'United States', context: 'low-rise neighbourhood', bounds: [-105.2710, 40.0140, -105.2680, 40.0170] },
  { id: 'north-yorkshire-rural', country: 'United Kingdom', context: 'rural', bounds: [-1.1180, 54.1190, -1.1130, 54.1240] }
];

const directory = resolve('output/live-overture-osm-evaluation');
await mkdir(directory, { recursive: true });
const summaries = [];
for (const area of areas) {
  const overture = createOvertureMapsProvider({
    id: 'overture-buildings', release, command: process.env.OVERTURE_COMMAND || 'uvx',
    includeSourceAliases: false
  });
  const osm = createOpenStreetMapMapProvider({ id: 'openstreetmap', capabilities: ['building'] });
  const snapshot = await synthesize({
    bounds: area.bounds, providers: [overture, osm], reconciliation: { enabled: true },
    limits: { providerTimeoutMs: 30_000, maxRecordsPerProvider: 5_000 }
  });
  const osmIds = new Set(snapshot.sourceRecords.filter((record) => record.providerId === 'openstreetmap').map((record) => record.id));
  const linkedPairs = snapshot.sourceRecords.filter((record) => record.providerId === 'overture-buildings').flatMap((record) => (record.properties.upstreamSources || []).flatMap((source) => {
    const match = source.dataset === 'OpenStreetMap' && /^w(\d+)@/.exec(source.record_id || '');
    const osmId = match ? `source:openstreetmap:way/${match[1]}` : '';
    return osmIds.has(osmId) ? [{ osmId, overtureId: record.id }] : [];
  }));
  const decisions = snapshot.reconciliations.flatMap((result) => result.decisions || []);
  const matchedLinkedPairs = linkedPairs.filter((pair) => decisions.some((decision) =>
    decision.decision === 'MATCH' && decision.sourceId === pair.osmId && decision.matchedId === pair.overtureId)).length;
  assert.ok(linkedPairs.length > 0, `${area.id} supplied no comparable OSM-linked building ways.`);
  summaries.push({
    ...area,
    overtureRecords: snapshot.sourceRecords.filter((record) => record.providerId === 'overture-buildings').length,
    osmBuildingWays: osmIds.size,
    upstreamLinkedPairs: linkedPairs.length,
    matchedLinkedPairs,
    linkedPairRecall: matchedLinkedPairs / linkedPairs.length,
    matcherCounts: snapshot.reconciliations[0].counts,
    providerWarnings: snapshot.providerSummary.flatMap((provider) => provider.warnings)
  });
}

const upstreamLinkedPairs = summaries.reduce((sum, area) => sum + area.upstreamLinkedPairs, 0);
const matchedLinkedPairs = summaries.reduce((sum, area) => sum + area.matchedLinkedPairs, 0);
const report = {
  release,
  acquiredAt: new Date().toISOString(),
  method: 'Compare matcher decisions with Overture building source records that explicitly reference an OSM way returned by the bounded OSM map API.',
  areas: summaries,
  totals: { upstreamLinkedPairs, matchedLinkedPairs, linkedPairRecall: matchedLinkedPairs / upstreamLinkedPairs },
  limitations: 'Upstream source linkage supplies positive correspondences only. It is not independent ground truth and cannot measure precision, false merges, ambiguity quality, or unlinked buildings.'
};
await writeFile(resolve(directory, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
