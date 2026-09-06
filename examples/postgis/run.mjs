import assert from 'node:assert/strict';
import pg from 'pg';
import { createLocalProvider, synthesize } from 'geospatial-world-synthesis';
import { createPostgisStore } from 'geospatial-world-synthesis/node';

if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL to a disposable PostGIS database before running this example.');
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  const store = createPostgisStore(client, { schema: 'gws_example', worldId: 'example' });
  await store.initialize();
  const snapshot = await synthesize({ bounds: [-1, -1, 1, 1], providers: [createLocalProvider({
    id: 'postgis-example', sourceCrs: 'OGC:CRS84', capabilities: ['poi'], licenseId: 'CC0-1.0',
    attribution: 'Fictional PostGIS example — CC0-1.0', records: [
      { sourceId: 'one', entityType: 'poi', geometry: { type: 'Point', coordinates: [0, 0] }, properties: { name: 'Stored place' } }
    ]
  })] });
  const saved = await store.save(snapshot);
  const loaded = await store.load();
  assert.equal(loaded.fingerprint, snapshot.fingerprint);
  console.log(JSON.stringify({ postgisVersionValidated: true, fingerprint: saved.fingerprint, history: await store.history() }, null, 2));
} finally {
  await client.end();
}
