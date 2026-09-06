import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assessTemporalEvidence,
  createLocalProvider,
  inspectEntity,
  queryProvider,
  reconcileBuildingRelationship,
  reconcileBuildings,
  synthesize,
  synthesizeWorld,
  toCanonicalJson,
  toGeoJson,
  transformGeometry,
  validateGeometry
} from 'geospatial-world-synthesis';

const bounds = [-76.62, 39.28, -76.60, 39.30];
const rectangle = (west, south, east, north) => ({
  type: 'Polygon', coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]]
});

function local(id, records, options = {}) {
  return createLocalProvider({
    id, records, sourceCrs: options.sourceCrs || 'OGC:CRS84',
    capabilities: options.capabilities,
    licenseId: options.licenseId || 'CC0-1.0', attribution: `${id} example`, retrievedAt: options.retrievedAt
  });
}

test('package root exposes a complete bounded synthesis path', async () => {
  const provider = local('catalog', [{
    sourceId: 'one', entityType: 'poi', geometry: { type: 'Point', coordinates: [-76.61, 39.29] },
    properties: { name: 'Place' }, evidenceClass: 'DIRECT_SOURCE'
  }]);
  const result = await synthesize({ bounds, providers: [provider], requestedCapabilities: ['poi'] });
  assert.equal(result.entities[0].resolved.name, 'Place');
  assert.equal(result.providerSummary[0].status, 'available');
  assert.equal(result.attributions[0].licenseId, 'CC0-1.0');
  assert.deepEqual(result.request.bounds, bounds);
});

test('canonical fingerprint ignores provider order and retrieval time', async () => {
  const geometry = rectangle(-76.612, 39.289, -76.611, 39.290);
  const record = (sourceId, height) => ({ sourceId, entityType: 'building', gersId: 'shared-1', geometry, properties: { height }, evidenceClass: 'DIRECT_SOURCE' });
  const first = await queryProvider(local('a', [record('a1', 10)], { retrievedAt: '2026-01-01T00:00:00Z' }), { bounds });
  const second = await queryProvider(local('b', [record('b1', 12)], { retrievedAt: '2026-02-01T00:00:00Z' }), { bounds });
  const forward = synthesizeWorld({ providerResults: [first, second] });
  const reverse = synthesizeWorld({ providerResults: [second, first] });
  assert.equal(forward.fingerprint, reverse.fingerprint);
  const laterFirst = await queryProvider(local('a', [record('a1', 10)], { retrievedAt: '2027-01-01T00:00:00Z' }), { bounds });
  assert.equal(forward.fingerprint, synthesizeWorld({ providerResults: [laterFirst, second] }).fingerprint);
});

test('retains conflicting direct claims and their provenance', async () => {
  const geometry = rectangle(-76.612, 39.289, -76.611, 39.290);
  const providers = [
    local('a', [{ sourceId: 'a1', entityType: 'building', gersId: 'same', geometry, properties: { height: 10 }, evidenceClass: 'DIRECT_SOURCE' }]),
    local('b', [{ sourceId: 'b1', entityType: 'building', gersId: 'same', geometry, properties: { height: 12 }, evidenceClass: 'DIRECT_SOURCE' }])
  ];
  const result = await synthesize({ bounds, providers });
  const inspection = inspectEntity(result, result.entities[0].id);
  assert.equal(inspection.conflicts[0].property, 'height');
  assert.deepEqual(inspection.claims.filter((claim) => claim.property === 'height').map((claim) => claim.value).sort(), [10, 12]);
  assert.equal(inspection.provenance.length, 2);
});

test('does not force an ambiguous building merge', async () => {
  const geometry = rectangle(-76.612, 39.289, -76.611, 39.290);
  const left = await queryProvider(local('left', [{ sourceId: 'one', entityType: 'building', geometry, properties: { name: 'Depot' } }]), { bounds });
  const right = await queryProvider(local('right', [
    { sourceId: 'a', entityType: 'building', geometry, properties: { name: 'Depot' } },
    { sourceId: 'b', entityType: 'building', geometry, properties: { name: 'Depot' } }
  ]), { bounds });
  const reconciliation = reconcileBuildings(left.records, right.records);
  assert.equal(reconciliation.decisions[0].decision, 'AMBIGUOUS');
  assert.equal(synthesizeWorld({ providerResults: [left, right], reconciliations: [reconciliation] }).entities.length, 3);
});

test('represents one-to-many, many-to-one, and building-part relationships', async () => {
  const outline = { id: 'outline', entityType: 'building', geometry: rectangle(0, 0, 0.002, 0.001), properties: {} };
  const parts = [
    { id: 'part-a', entityType: 'building', geometry: rectangle(0, 0, 0.001, 0.001), properties: { buildingPart: 'yes' } },
    { id: 'part-b', entityType: 'building', geometry: rectangle(0.001, 0, 0.002, 0.001), properties: { buildingPart: 'yes' } }
  ];
  assert.equal(reconcileBuildingRelationship([outline], parts).decision, 'BUILDING_PART');
  const outlines = parts.map((record) => ({ ...record, properties: {} }));
  assert.equal(reconcileBuildingRelationship([outline], outlines).decision, 'ONE_TO_MANY');
  assert.equal(reconcileBuildingRelationship(outlines, [outline]).decision, 'MANY_TO_ONE');
});

test('normalizes projected coordinates and rejects unknown CRS', async () => {
  const point = { type: 'Point', coordinates: [-76.61, 39.29] };
  const projected = transformGeometry(point, 'OGC:CRS84', 'EPSG:3857');
  const provider = local('projected', [{ sourceId: 'p', entityType: 'poi', sourceCrs: 'EPSG:3857', geometry: projected, properties: {} }], { sourceCrs: 'EPSG:3857' });
  const result = await queryProvider(provider, { bounds });
  assert.ok(Math.abs(result.records[0].geometry.coordinates[0] - point.coordinates[0]) < 1e-6);
  const invalid = local('invalid-crs', [{ sourceId: 'x', entityType: 'poi', sourceCrs: 'EPSG:999999', geometry: point, properties: {} }], { sourceCrs: 'EPSG:999999' });
  await assert.rejects(queryProvider(invalid, { bounds }), /Unknown source CRS/);
});

test('rejects malformed, unsupported, and over-limit geometry', () => {
  assert.equal(validateGeometry({ type: 'GeometryCollection', coordinates: [] }).valid, false);
  assert.equal(validateGeometry({ type: 'Point', coordinates: [Number.NaN, 1] }).valid, false);
  assert.equal(validateGeometry({ type: 'LineString', coordinates: [[0, 0]] }).valid, false);
  assert.equal(validateGeometry({ type: 'LineString', coordinates: [[0, 0], [1, 1]] }, { maxCoordinates: 1 }).valid, false);
});

test('derives building-parcel and POI-building relationships', async () => {
  const provider = local('spatial', [
    { sourceId: 'parcel', entityType: 'parcel', geometry: rectangle(-76.613, 39.288, -76.610, 39.292), properties: {} },
    { sourceId: 'building', entityType: 'building', geometry: rectangle(-76.612, 39.289, -76.611, 39.291), properties: {} },
    { sourceId: 'poi', entityType: 'poi', geometry: { type: 'Point', coordinates: [-76.6115, 39.29] }, properties: {} }
  ]);
  const result = await synthesize({ bounds, providers: [provider] });
  assert.equal(result.entities.find((entity) => entity.type === 'building').relationships[0].type, 'located_on_parcel');
  assert.equal(result.entities.find((entity) => entity.type === 'poi').relationships[0].type, 'located_in_building');
});

test('degrades a failed provider without fabricating its claims', async () => {
  const good = local('good', [{ sourceId: 'one', entityType: 'poi', geometry: { type: 'Point', coordinates: [-76.61, 39.29] }, properties: { name: 'Kept' } }]);
  const failed = { ...local('failed', [], { capabilities: ['poi'] }), query: async () => { throw new Error('HTTP 429 rate limit'); } };
  const result = await synthesize({ bounds, providers: [good, failed] });
  assert.equal(result.providerSummary.find((provider) => provider.providerId === 'failed').status, 'rate_limited');
  assert.equal(result.entities.length, 1);
  assert.equal(result.provenance.some((record) => record.providerId === 'failed'), false);
});

test('reports provider timeouts as degradation', async () => {
  const slow = { ...local('slow', [], { capabilities: ['poi'] }), query: async (_request, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  }) };
  const result = await synthesize({ bounds, providers: [slow], limits: { providerTimeoutMs: 10 } });
  assert.equal(result.providerSummary[0].status, 'timeout');
});

test('temporal evidence requires explicit lineage for supersession', () => {
  const result = assessTemporalEvidence([
    { id: 'old', lineageId: 'source:1', revision: 1, fingerprint: 'a' },
    { id: 'new', lineageId: 'source:1', revision: 2, fingerprint: 'b' },
    { id: 'independent', providerId: 'other', fingerprint: 'c' }
  ]);
  assert.equal(result.find((item) => item.id === 'old').status, 'SUPERSEDED');
  assert.equal(result.find((item) => item.id === 'new').status, 'UNRESOLVED_TEMPORAL_CONFLICT');
  assert.equal(result.find((item) => item.id === 'independent').status, 'UNRESOLVED_TEMPORAL_CONFLICT');
});

test('canonical JSON and GeoJSON exports are independently parseable', async () => {
  const result = await synthesize({ bounds, providers: [local('export', [{ sourceId: 'one', entityType: 'poi', geometry: { type: 'Point', coordinates: [-76.61, 39.29] }, properties: { name: 'Exported' } }])] });
  assert.equal(JSON.parse(toCanonicalJson(result)).fingerprint, result.fingerprint);
  const geojson = JSON.parse(JSON.stringify(toGeoJson(result)));
  assert.equal(geojson.type, 'FeatureCollection');
  assert.equal(geojson.features[0].type, 'Feature');
  assert.equal(geojson['gws:attributions'][0].providerId, 'export');
});

test('resource limits are enforced before unbounded provider use', async () => {
  const provider = local('limited', Array.from({ length: 5 }, (_, index) => ({
    sourceId: String(index), entityType: 'poi', geometry: { type: 'Point', coordinates: [-76.61, 39.29] }, properties: {}
  })));
  const result = await synthesize({ bounds, providers: [provider], limits: { maxRecordsPerProvider: 2 } });
  assert.equal(result.providerSummary[0].status, 'partial');
  assert.equal(result.entities.length, 2);
  await assert.rejects(synthesize({ bounds, providers: [provider, provider], limits: { maxProviders: 1 } }), /exceeds maxProviders/);
});

test('requested capabilities filter mixed providers and duplicate IDs fail', async () => {
  const mixed = local('mixed', [
    { sourceId: 'place', entityType: 'poi', geometry: { type: 'Point', coordinates: [-76.61, 39.29] }, properties: {} },
    { sourceId: 'road', entityType: 'road', geometry: { type: 'LineString', coordinates: [[-76.61, 39.29], [-76.60, 39.30]] }, properties: {} }
  ]);
  const filtered = await synthesize({ bounds, providers: [mixed], requestedCapabilities: ['poi'] });
  assert.deepEqual(filtered.entities.map((entity) => entity.type), ['poi']);
  const duplicate = local('duplicate', [
    { sourceId: 'same', entityType: 'poi', geometry: { type: 'Point', coordinates: [-76.61, 39.29] }, properties: {} },
    { sourceId: 'same', entityType: 'poi', geometry: { type: 'Point', coordinates: [-76.60, 39.30] }, properties: {} }
  ]);
  await assert.rejects(queryProvider(duplicate, { bounds }), /duplicate source IDs/);
});

test('credentials are redacted from provenance and degraded errors', async () => {
  const provider = createLocalProvider({
    id: 'redaction', sourceCrs: 'OGC:CRS84', capabilities: ['poi'], records: [{
      sourceId: 'one', entityType: 'poi', geometry: { type: 'Point', coordinates: [-76.61, 39.29] }, properties: {},
      sourceUrl: 'https://example.test/items?api_key=top-secret&view=public'
    }]
  });
  const result = await synthesize({ bounds, providers: [provider] });
  assert.equal(result.provenance[0].sourceUrl.includes('top-secret'), false);
  const failing = { ...provider, id: 'redaction-error', query: async () => { throw new Error('GET https://example.test/items?token=top-secret failed Bearer abc.def'); } };
  const degraded = await synthesize({ bounds, providers: [failing] });
  assert.equal(degraded.providerSummary[0].error.message.includes('top-secret'), false);
  assert.match(degraded.providerSummary[0].error.message, /REDACTED/);
});

test('source properties must be bounded JSON values', async () => {
  const invalid = local('invalid-properties', [{
    sourceId: 'one', entityType: 'poi', geometry: { type: 'Point', coordinates: [-76.61, 39.29] }, properties: { height: Number.POSITIVE_INFINITY }
  }]);
  await assert.rejects(queryProvider(invalid, { bounds }), /Property numbers must be finite/);
  const tooLarge = local('large-properties', [{
    sourceId: 'one', entityType: 'poi', geometry: { type: 'Point', coordinates: [-76.61, 39.29] }, properties: { description: 'x'.repeat(2000) }
  }]);
  await assert.rejects(queryProvider(tooLarge, { bounds }, { maxPropertyBytesPerRecord: 1024 }), /exceed 1024 bytes/);
});
