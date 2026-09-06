import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { synthesize, toCanonicalJson, toGeoJson } from 'geospatial-world-synthesis';
import { createOpenStreetMapMapProvider } from 'geospatial-world-synthesis/providers';

const bounds = [-73.986, 40.7478, -73.9852, 40.7488];
const provider = createOpenStreetMapMapProvider({
  id: 'openstreetmap',
  capabilities: ['address', 'building', 'poi', 'road']
});
const snapshot = await synthesize({ bounds, providers: [provider], limits: { providerTimeoutMs: 30_000, maxRecordsPerProvider: 5_000 } });
assert.equal(snapshot.providerSummary[0].status, 'available');
assert.ok(snapshot.entities.length > 0);
assert.equal(snapshot.attributions[0].licenseId, 'ODbL-1.0');
const directory = resolve('output/openstreetmap');
await mkdir(directory, { recursive: true });
await writeFile(resolve(directory, 'world.json'), `${toCanonicalJson(snapshot)}\n`);
await writeFile(resolve(directory, 'world.geojson'), `${JSON.stringify(toGeoJson(snapshot), null, 2)}\n`);
console.log(JSON.stringify({ entities: snapshot.entities.length, sourceRecords: snapshot.sourceRecords.length, status: snapshot.providerSummary[0].status, attribution: snapshot.attributions[0] }, null, 2));
