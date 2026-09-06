import test from 'node:test';
import assert from 'node:assert/strict';
import { deserialize as deserializeFlatGeobuf } from 'flatgeobuf/lib/mjs/geojson.js';
import {
  assessTemporalEvidence,
  createLocalProvider,
  diffSnapshots,
  geodesicAreaSquareMeters,
  inspectEntity,
  queryProvider,
  reconcileEntities,
  reconcileBuildingRelationship,
  reconcileBuildings,
  synthesize,
  synthesizeWorld,
  toCanonicalJson,
  toFlatGeobuf,
  toGeoJson,
  toProvJson,
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

test('snapshots retain normalized source records and expose affected-entity diffs', async () => {
  const before = await synthesize({ bounds, providers: [local('changing', [{
    sourceId: 'one', entityType: 'poi', geometry: { type: 'Point', coordinates: [-76.61, 39.29] }, properties: { name: 'Old name' }
  }])] });
  const after = await synthesize({ bounds, providers: [local('changing', [{
    sourceId: 'one', entityType: 'poi', geometry: { type: 'Point', coordinates: [-76.61, 39.29] }, properties: { name: 'New name' }
  }])] });
  assert.equal(before.sourceRecords[0].sourceId, 'one');
  const diff = diffSnapshots(before, after);
  assert.equal(diff.changed, true);
  assert.deepEqual(diff.sourceRecords.changed, ['source:changing:one']);
  assert.deepEqual(diff.entities.changed, [before.entities[0].id]);
  assert.deepEqual(diff.affectedEntityIds, [before.entities[0].id]);
});

test('retains conflicting direct claims and their provenance', async () => {
  const geometry = rectangle(-76.612, 39.289, -76.611, 39.290);
  const providers = [
    local('a', [{ sourceId: 'a1', entityType: 'building', gersId: 'same', geometry, properties: { height: 10 }, observedAt: '2026-01-01T00:00:00Z', evidenceClass: 'DIRECT_SOURCE' }]),
    local('b', [{ sourceId: 'b1', entityType: 'building', gersId: 'same', geometry, properties: { height: 12 }, observedAt: '2026-02-01T00:00:00Z', evidenceClass: 'DIRECT_SOURCE' }])
  ];
  const result = await synthesize({ bounds, providers });
  const inspection = inspectEntity(result, result.entities[0].id);
  assert.equal(inspection.conflicts[0].property, 'height');
  assert.deepEqual(inspection.claims.filter((claim) => claim.property === 'height').map((claim) => claim.value).sort(), [10, 12]);
  assert.equal(inspection.provenance.length, 2);
  assert.equal(inspection.sourceRecords.length, 2);
  assert.equal(result.entities[0].resolved.height, 12);
  assert.match(inspection.propertySelections.height.reason, /strongest-evidence/);
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

test('generalized reconciliation handles POIs, addresses, parcels, and roads with inspectable scores', () => {
  const point = (id, entityType, coordinates, properties) => ({ id, entityType, geometry: { type: 'Point', coordinates }, properties });
  const cases = [
    [point('left-poi', 'poi', [0, 0], { name: 'Central Library', category: 'library' }), point('right-poi', 'poi', [0.00001, 0], { name: 'Central Library', category: 'library' })],
    [point('left-address', 'address', [0, 0], { address: '10 Main Street' }), point('right-address', 'address', [0.00001, 0], { address: '10 Main Street' })],
    [{ id: 'left-parcel', entityType: 'parcel', geometry: rectangle(0, 0, 0.001, 0.001), properties: {} }, { id: 'right-parcel', entityType: 'parcel', geometry: rectangle(0, 0, 0.001, 0.001), properties: {} }],
    [{ id: 'left-road', entityType: 'road', geometry: { type: 'LineString', coordinates: [[0, 0], [0.001, 0]] }, properties: { name: 'Main Street', class: 'residential' } }, { id: 'right-road', entityType: 'road', geometry: { type: 'LineString', coordinates: [[0, 0], [0.001, 0]] }, properties: { name: 'Main Street', class: 'residential' } }]
  ];
  for (const [left, right] of cases) {
    const result = reconcileEntities([left], [right]);
    assert.equal(result.decisions[0].decision, 'MATCH');
    assert.equal(result.decisions[0].matchedId, right.id);
    assert.ok(result.decisions[0].candidates[0].features.score >= 0.76);
  }
});

test('generalized reconciliation preserves ambiguity and uses a spatial candidate index', () => {
  const left = { id: 'left', entityType: 'poi', geometry: { type: 'Point', coordinates: [0, 0] }, properties: { name: 'Cafe' } };
  const right = ['a', 'b'].map((id) => ({ id, entityType: 'poi', geometry: { type: 'Point', coordinates: [0, 0] }, properties: { name: 'Cafe' } }));
  assert.equal(reconcileEntities([left], right).decisions[0].decision, 'AMBIGUOUS');
  const manyLeft = Array.from({ length: 1000 }, (_, index) => ({ id: `l${index}`, entityType: 'poi', geometry: { type: 'Point', coordinates: [index * 0.01, 0] }, properties: { name: `Place ${index}` } }));
  const manyRight = Array.from({ length: 1000 }, (_, index) => ({ id: `r${index}`, entityType: 'poi', geometry: { type: 'Point', coordinates: [index * 0.01, 0] }, properties: { name: `Place ${index}` } }));
  const indexed = reconcileEntities(manyLeft, manyRight);
  assert.ok(indexed.metrics.candidateCount < 5000, `expected fewer than 5000 candidates, received ${indexed.metrics.candidateCount}`);
  assert.equal(indexed.metrics.index, 'rbush-4');
});

test('generalized reconciliation does not auto-merge a many-to-one target collision', () => {
  const left = ['a', 'b'].map((id) => ({
    id: `left-${id}`, entityType: 'poi', geometry: { type: 'Point', coordinates: [0, 0] }, properties: { name: 'Shared Cafe', category: 'cafe' }
  }));
  const right = [{ id: 'right', entityType: 'poi', geometry: { type: 'Point', coordinates: [0, 0] }, properties: { name: 'Shared Cafe', category: 'cafe' } }];
  const result = reconcileEntities(left, right);
  assert.equal(result.counts.MATCH, 0);
  assert.equal(result.counts.AMBIGUOUS, 2);
  assert.ok(result.decisions.every((decision) => decision.reason === 'many-to-one-candidate-requires-review'));
});

test('building reconciliation safely rejects non-polygon building geometry', () => {
  const polygon = { id: 'polygon', entityType: 'building', geometry: rectangle(0, 0, 0.001, 0.001), properties: {} };
  const point = { id: 'point', entityType: 'building', geometry: { type: 'Point', coordinates: [0.0005, 0.0005] }, properties: {} };
  const result = reconcileEntities([point], [polygon]);
  assert.equal(result.decisions[0].decision, 'NO_MATCH');
  assert.equal(result.decisions[0].reason, 'candidate-below-policy-threshold');
  assert.equal(result.decisions[0].candidates[0].features.score, 0);
});

test('automatic reconciliation merges only accepted cross-provider matches deterministically', async () => {
  const providers = [
    local('left-pois', [{ sourceId: 'one', entityType: 'poi', geometry: { type: 'Point', coordinates: [-76.61, 39.29] }, properties: { name: 'Central Library', category: 'library' } }]),
    local('right-pois', [{ sourceId: 'other', entityType: 'poi', geometry: { type: 'Point', coordinates: [-76.60999, 39.29] }, properties: { name: 'Central Library', category: 'library' } }])
  ];
  const first = await synthesize({ bounds, providers, reconciliation: { enabled: true } });
  const second = await synthesize({ bounds, providers: providers.reverse(), reconciliation: { enabled: true } });
  assert.equal(first.entities.length, 1);
  assert.equal(first.reconciliations[0].counts.MATCH, 1);
  assert.equal(first.fingerprint, second.fingerprint);
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

test('validates topology, retains antimeridian diagnostics, and measures geodesic area', () => {
  const withHole = {
    type: 'Polygon',
    coordinates: [
      [[0, 0], [0.01, 0], [0.01, 0.01], [0, 0.01], [0, 0]],
      [[0.002, 0.002], [0.004, 0.002], [0.004, 0.004], [0.002, 0.004], [0.002, 0.002]]
    ]
  };
  assert.equal(validateGeometry(withHole).valid, true);
  assert.ok(geodesicAreaSquareMeters(withHole) > 1_000_000);
  const bowtie = { type: 'Polygon', coordinates: [[[0, 0], [1, 1], [1, 0], [0, 1], [0, 0]]] };
  assert.equal(validateGeometry(bowtie).valid, false);
  assert.ok(validateGeometry(bowtie).warnings.includes('polygon-ring-self-intersection'));
  const crossing = { type: 'LineString', coordinates: [[179.9, 0], [-179.9, 0]] };
  assert.equal(validateGeometry(crossing).valid, true);
  assert.ok(validateGeometry(crossing).warnings.includes('antimeridian-crossing-not-cut'));
  const collection = { type: 'GeometryCollection', geometries: [{ type: 'Point', coordinates: [0, 0] }, crossing] };
  assert.equal(validateGeometry(collection).valid, true);
  assert.equal(validateGeometry(collection).coordinateCount, 3);
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
  const flatGeobuf = toFlatGeobuf(result);
  assert.ok(flatGeobuf.byteLength > 100);
  const decoded = [];
  for await (const feature of deserializeFlatGeobuf(flatGeobuf)) decoded.push(feature);
  assert.equal(decoded.length, 1);
  assert.equal(decoded[0].properties.name, 'Exported');
  const prov = toProvJson(result);
  assert.equal(Object.keys(prov.wasDerivedFrom).length, 1);
  assert.equal(Object.keys(prov.agent).length, 1);
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
