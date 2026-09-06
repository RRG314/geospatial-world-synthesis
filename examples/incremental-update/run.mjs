import assert from 'node:assert/strict';
import { createLocalProvider, diffSnapshots, synthesize } from 'geospatial-world-synthesis';
import { createJsonDirectoryStore } from 'geospatial-world-synthesis/node';

const bounds = [-1, -1, 1, 1];
const world = (records) => synthesize({ bounds, providers: [createLocalProvider({
  id: 'survey', datasetId: 'incremental-example', sourceCrs: 'OGC:CRS84', licenseId: 'CC0-1.0',
  attribution: 'Fictional incremental example — CC0-1.0', capabilities: ['poi'], records
})] });
const before = await world([
  { sourceId: 'one', entityType: 'poi', geometry: { type: 'Point', coordinates: [0, 0] }, properties: { name: 'Library', status: 'planned' } },
  { sourceId: 'two', entityType: 'poi', geometry: { type: 'Point', coordinates: [0.2, 0.2] }, properties: { name: 'Clinic' } }
]);
const after = await world([
  { sourceId: 'one', entityType: 'poi', geometry: { type: 'Point', coordinates: [0, 0] }, properties: { name: 'Library', status: 'open' } },
  { sourceId: 'two', entityType: 'poi', geometry: { type: 'Point', coordinates: [0.2, 0.2] }, properties: { name: 'Clinic' } }
]);
const diff = diffSnapshots(before, after);
assert.equal(diff.affectedEntityIds.length, 1);
const store = createJsonDirectoryStore('output/incremental-update/snapshots');
await store.save(before);
const update = await store.applyIncremental(before, after);
assert.deepEqual(update.diff.affectedEntityIds, diff.affectedEntityIds);
console.log(JSON.stringify(diff, null, 2));
