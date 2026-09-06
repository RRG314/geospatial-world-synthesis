import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLocalProvider, queryProvider, synthesize } from 'geospatial-world-synthesis';
import { createJsonDirectoryStore, createOvertureMapsProvider, createPostgisStore } from 'geospatial-world-synthesis/node';

const bounds = [-1, -1, 1, 1];
const snapshot = (name) => synthesize({ bounds, providers: [createLocalProvider({
  id: 'store-source', sourceCrs: 'OGC:CRS84', capabilities: ['poi'], licenseId: 'CC0-1.0', records: [
    { sourceId: 'one', entityType: 'poi', geometry: { type: 'Point', coordinates: [0, 0] }, properties: { name } }
  ]
})] });

test('JSON directory store saves, lists, loads, and reports incremental changes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'gws-store-'));
  try {
    const store = createJsonDirectoryStore(directory);
    const before = await snapshot('Before');
    const after = await snapshot('After');
    await store.save(before);
    const incremental = await store.applyIncremental(before, after);
    assert.equal(incremental.diff.changed, true);
    assert.deepEqual(await store.list(), [before.fingerprint, after.fingerprint].sort());
    assert.equal((await store.load(after.fingerprint)).entities[0].resolved.name, 'After');
    assert.equal((await store.load()).entities[0].resolved.name, 'After');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('PostGIS store validates PostGIS and incrementally upserts normalized state', async () => {
  const calls = [];
  let current = null;
  const client = { query: async (text, values = []) => {
    calls.push({ text, values });
    if (/SELECT data FROM/.test(text)) return { rows: current ? [{ data: current }] : [] };
    if (/INSERT INTO .*\.snapshots/.test(text)) current = JSON.parse(values[2]);
    return { rows: [] };
  } };
  const store = createPostgisStore(client, { schema: 'public_world', worldId: 'test' });
  await store.initialize();
  const before = await snapshot('Before');
  const after = await snapshot('After');
  await store.save(before);
  const result = await store.save(after);
  assert.equal(result.diff.changed, true);
  assert.deepEqual(result.diff.affectedEntityIds, [before.entities[0].id]);
  assert.ok(calls.some(({ text }) => text === 'SELECT PostGIS_Version()'));
  assert.ok(calls.some(({ text }) => text.includes('ST_GeomFromGeoJSON')));
  assert.equal(calls.some(({ text }) => /DELETE FROM .*current_entities/.test(text)), false);
  assert.throws(() => createPostgisStore(client, { schema: 'bad;drop schema' }), /simple SQL identifier/);
});

test('Overture Maps provider performs a bounded pinned download and retains upstream identity', async () => {
  let request;
  const provider = createOvertureMapsProvider({
    id: 'overture', release: '2026-08-19.0',
    download: async (context) => {
      request = context;
      await writeFile(context.outputPath, JSON.stringify({
        type: 'FeatureCollection',
        features: [{
          type: 'Feature', id: 'gers-building-1',
          geometry: { type: 'Polygon', coordinates: [[[0, 0], [0.001, 0], [0.001, 0.001], [0, 0]]] },
          properties: { height: 12, sources: [{ dataset: 'OpenStreetMap', record_id: 'w123@4', update_time: '2026-08-01T00:00:00Z', license: 'ODbL-1.0' }] }
        }]
      }));
    }
  });
  const result = await queryProvider(provider, { bounds: [0, 0, 0.01, 0.01] });
  assert.deepEqual(request.bounds, [0, 0, 0.01, 0.01]);
  assert.equal(request.release, '2026-08-19.0');
  assert.equal(result.records[0].gersId, 'gers-building-1');
  assert.deepEqual(result.records[0].aliases, [{ namespace: 'openstreetmap', id: 'way/123' }]);
  assert.equal(result.records[0].provenance.licenseId, 'ODbL-1.0');
  assert.equal(result.records[0].provenance.sourceUpdatedAt, '2026-08-01T00:00:00Z');
  assert.equal(result.records[0].properties.upstreamSources[0].record_id, 'w123@4');
});
