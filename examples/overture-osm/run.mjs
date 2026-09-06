import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { synthesize, toCanonicalJson, toGeoJson } from 'geospatial-world-synthesis';
import { createOpenStreetMapMapProvider } from 'geospatial-world-synthesis/providers';
import { createOvertureMapsProvider } from 'geospatial-world-synthesis/node';

const bounds = [-73.986, 40.7478, -73.9852, 40.7488];
const overtureRelease = process.env.OVERTURE_RELEASE || '2026-08-19.0';
const directory = resolve('output/overture-osm');
await mkdir(directory, { recursive: true });
const overture = createOvertureMapsProvider({
  id: 'overture-buildings', release: overtureRelease,
  command: process.env.OVERTURE_COMMAND || 'uvx'
});
const osm = createOpenStreetMapMapProvider({ id: 'openstreetmap', capabilities: ['building'] });
const snapshot = await synthesize({
  bounds, providers: [overture, osm], reconciliation: { enabled: true },
  limits: { providerTimeoutMs: 30_000, maxRecordsPerProvider: 5_000 }
});
assert.equal(snapshot.providerSummary.filter((provider) => provider.status === 'available').length, 2);
assert.ok(snapshot.reconciliations[0].counts.MATCH > 0);
const osmIds = new Set(snapshot.sourceRecords.filter((record) => record.providerId === 'openstreetmap').map((record) => record.id));
const expected = snapshot.sourceRecords.filter((record) => record.providerId === 'overture-buildings').flatMap((record) => (record.properties.upstreamSources || []).flatMap((source) => {
  const match = source.dataset === 'OpenStreetMap' && /^w(\d+)@/.exec(source.record_id || '');
  const osmId = match ? `source:openstreetmap:way/${match[1]}` : '';
  return osmIds.has(osmId) ? [{ osmId, overtureId: record.id }] : [];
}));
const decisions = snapshot.reconciliations.flatMap((result) => result.decisions || []);
const groundTruthCorrect = expected.filter((pair) => decisions.some((decision) => decision.decision === 'MATCH' && decision.sourceId === pair.osmId && decision.matchedId === pair.overtureId)).length;
assert.ok(expected.length > 0);
assert.equal(groundTruthCorrect, expected.length);
await writeFile(resolve(directory, 'world.json'), `${toCanonicalJson(snapshot)}\n`);
await writeFile(resolve(directory, 'world.geojson'), `${JSON.stringify(toGeoJson(snapshot), null, 2)}\n`);
console.log(JSON.stringify({ overtureRelease, providers: snapshot.providerSummary, reconciliation: snapshot.reconciliations[0].counts, groundTruthAvailable: expected.length, groundTruthCorrect, entities: snapshot.entities.length }, null, 2));
