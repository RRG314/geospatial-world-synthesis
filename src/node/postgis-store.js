import { diffSnapshots } from '../diff.js';

function schemaName(value) {
  const name = String(value || 'gws');
  if (!/^[a-z_][a-z0-9_]*$/i.test(name)) throw new TypeError('PostGIS schema must be a simple SQL identifier.');
  return `"${name}"`;
}

const COLLECTIONS = Object.freeze({
  sourceRecords: 'current_source_records',
  entities: 'current_entities',
  claims: 'current_claims',
  provenance: 'current_provenance'
});

export function createPostgisStore(client, options = {}) {
  if (!client || typeof client.query !== 'function') throw new TypeError('PostGIS store requires a client with query(text, values).');
  const schema = schemaName(options.schema);
  const worldId = String(options.worldId || 'default');

  async function initialize() {
    await client.query('SELECT PostGIS_Version()');
    await client.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
    await client.query(`CREATE TABLE IF NOT EXISTS ${schema}.snapshots (
      world_id text NOT NULL, fingerprint text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), data jsonb NOT NULL,
      PRIMARY KEY (world_id, fingerprint)
    )`);
    for (const table of Object.values(COLLECTIONS)) {
      await client.query(`CREATE TABLE IF NOT EXISTS ${schema}.${table} (
        world_id text NOT NULL, id text NOT NULL, data jsonb NOT NULL, geom geometry(Geometry, 4326), updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (world_id, id)
      )`);
      await client.query(`CREATE INDEX IF NOT EXISTS ${table}_geom_gix ON ${schema}.${table} USING gist (geom)`);
    }
  }

  async function load() {
    const result = await client.query(`SELECT data FROM ${schema}.snapshots WHERE world_id = $1 ORDER BY created_at DESC, fingerprint DESC LIMIT 1`, [worldId]);
    return result.rows?.[0]?.data || null;
  }

  async function applyCollection(name, changes, after) {
    const table = COLLECTIONS[name];
    const removed = changes.removed;
    if (removed.length) await client.query(`DELETE FROM ${schema}.${table} WHERE world_id = $1 AND id = ANY($2::text[])`, [worldId, removed]);
    const byId = new Map((after[name] || []).map((item) => [item.id, item]));
    for (const id of [...changes.added, ...changes.changed]) {
      const item = byId.get(id);
      const geometry = item?.geometry ? JSON.stringify(item.geometry) : null;
      await client.query(`INSERT INTO ${schema}.${table} (world_id, id, data, geom) VALUES ($1, $2, $3::jsonb, CASE WHEN $4::text IS NULL THEN NULL ELSE ST_SetSRID(ST_GeomFromGeoJSON($4), 4326) END)
        ON CONFLICT (world_id, id) DO UPDATE SET data = EXCLUDED.data, geom = EXCLUDED.geom, updated_at = now()`, [worldId, id, JSON.stringify(item), geometry]);
    }
  }

  async function save(snapshot) {
    if (!snapshot?.fingerprint) throw new TypeError('PostGIS store requires a synthesis snapshot.');
    await client.query('BEGIN');
    try {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`gws:${worldId}`]);
      const before = await load();
      const empty = { fingerprint: '', entities: [], sourceRecords: [], claims: [], provenance: [] };
      const diff = diffSnapshots(before || empty, snapshot);
      for (const name of Object.keys(COLLECTIONS)) await applyCollection(name, diff[name], snapshot);
      await client.query(`INSERT INTO ${schema}.snapshots (world_id, fingerprint, data) VALUES ($1, $2, $3::jsonb) ON CONFLICT DO NOTHING`, [worldId, snapshot.fingerprint, JSON.stringify(snapshot)]);
      await client.query('COMMIT');
      return { fingerprint: snapshot.fingerprint, diff };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }

  async function history(limit = 20) {
    const bounded = Math.min(1000, Math.max(1, Number(limit) || 20));
    const result = await client.query(`SELECT fingerprint, created_at FROM ${schema}.snapshots WHERE world_id = $1 ORDER BY created_at DESC, fingerprint DESC LIMIT $2`, [worldId, bounded]);
    return result.rows || [];
  }

  return Object.freeze({ kind: 'postgis', worldId, initialize, save, load, history, applyIncremental: async (_before, after) => save(after) });
}
