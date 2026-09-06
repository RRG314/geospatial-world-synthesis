import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { queryProvider } from 'geospatial-world-synthesis';
import {
  createArcGisFeatureServiceProvider,
  createGeoJsonHttpProvider,
  createLocalFileProvider,
  createOgcApiFeaturesProvider,
  createOpenStreetMapMapProvider,
  createOpenStreetMapProvider,
  withProviderCache
} from 'geospatial-world-synthesis/providers';

const bounds = [-1, -1, 1, 1];

test('GeoJSON HTTP adapter maps only allowlisted fields', async () => {
  const fetch = async () => ({ ok: true, text: async () => JSON.stringify({
    type: 'FeatureCollection', features: [{ id: 'one', type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: { public_type: 'tree', private_owner: 'excluded' } }]
  }) });
  const provider = createGeoJsonHttpProvider({ id: 'geojson', endpoint: 'https://example.test/data', entityType: 'poi', fieldMap: { public_type: 'type' }, fetch });
  const result = await queryProvider(provider, { bounds });
  assert.deepEqual(result.records[0].properties, { type: 'tree' });
  assert.equal(JSON.stringify(result).includes('excluded'), false);
});

test('OGC API Features adapter follows bounded next links', async () => {
  const pages = [
    { type: 'FeatureCollection', features: [{ id: 'one', geometry: { type: 'Point', coordinates: [0, 0] }, properties: { kind: 'shop' } }], links: [{ rel: 'next', href: '/page-2' }] },
    { type: 'FeatureCollection', features: [{ id: 'two', geometry: { type: 'Point', coordinates: [0.1, 0.1] }, properties: { kind: 'clinic' } }], links: [] }
  ];
  const fetch = async () => ({ ok: true, text: async () => JSON.stringify(pages.shift()) });
  const provider = createOgcApiFeaturesProvider({ id: 'ogc', root: 'https://example.test', collectionId: 'places', entityType: 'poi', fieldMap: { kind: 'type' }, fetch });
  const result = await queryProvider(provider, { bounds });
  assert.equal(result.records.length, 2);
  assert.equal(result.metrics.requestCount, 2);
});

test('ArcGIS adapter paginates and maps configured fields', async () => {
  const responses = [
    { geometryType: 'esriGeometryPoint', maxRecordCount: 1 },
    { exceededTransferLimit: true, features: [{ attributes: { OBJECTID: 1, USE: 'tree', OWNER: 'excluded' }, geometry: { x: 0, y: 0 } }] },
    { exceededTransferLimit: false, features: [{ attributes: { OBJECTID: 2, USE: 'bench', OWNER: 'excluded' }, geometry: { x: 0.1, y: 0.1 } }] }
  ];
  const fetch = async () => ({ ok: true, text: async () => JSON.stringify(responses.shift()) });
  const provider = createArcGisFeatureServiceProvider({ id: 'arcgis', layerUrl: 'https://example.test/FeatureServer/0', entityType: 'poi', publicFields: ['USE'], fieldMap: { USE: 'type' }, fetch, pageSize: 1 });
  const result = await queryProvider(provider, { bounds });
  assert.equal(result.records.length, 2);
  assert.deepEqual(result.records[0].properties, { type: 'tree' });
  assert.equal(JSON.stringify(result).includes('excluded'), false);
});

test('network adapters reject non-HTTP URLs and oversized responses', async () => {
  assert.throws(() => createGeoJsonHttpProvider({ id: 'bad', endpoint: 'file:///tmp/data.geojson', entityType: 'poi', fieldMap: {}, fetch: async () => null }), /http or https/);
  const fetch = async () => ({ ok: true, headers: { get: () => '99999999' }, text: async () => '{}' });
  const provider = createGeoJsonHttpProvider({ id: 'large', endpoint: 'https://example.test/data', entityType: 'poi', fieldMap: {}, fetch, maxResponseBytes: 1024 });
  await assert.rejects(queryProvider(provider, { bounds }), /exceeds 1024 bytes/);
});

test('OpenStreetMap adapter issues a bounded Overpass query and preserves ODbL attribution', async () => {
  let request;
  const payload = {
    elements: [
      { type: 'node', id: 1, lon: 0, lat: 0, tags: { amenity: 'library', name: 'Central Library' } },
      { type: 'way', id: 2, tags: { building: 'yes', name: 'Library' }, geometry: [
        { lon: -0.001, lat: -0.001 }, { lon: 0.001, lat: -0.001 }, { lon: 0.001, lat: 0.001 }, { lon: -0.001, lat: -0.001 }
      ] },
      { type: 'node', id: 3, lon: 0.2, lat: 0.2, tags: { amenity: 'cafe' } }
    ]
  };
  const fetch = async (url, options) => {
    request = { url, options };
    return { ok: true, status: 200, headers: { get: () => null }, text: async () => JSON.stringify(payload) };
  };
  const provider = createOpenStreetMapProvider({ id: 'osm', capabilities: ['building', 'poi'], fetch });
  const result = await queryProvider(provider, { bounds, requestedCapabilities: ['building', 'poi'] });
  assert.equal(request.url, 'https://overpass-api.de/api/interpreter');
  assert.match(String(request.options.body), /%28-1%2C-1%2C1%2C1%29/);
  assert.equal(result.records.length, 3);
  assert.equal(result.licenseId, 'ODbL-1.0');
  assert.equal(result.attribution, '© OpenStreetMap contributors');
  assert.equal(result.records[0].aliases[0].namespace, 'openstreetmap');
});

test('OpenStreetMap map API adapter parses real API-shaped XML with bounded requests', async () => {
  const xml = `<?xml version="1.0"?><osm version="0.6">
    <node id="1" lat="0" lon="0" timestamp="2026-01-01T00:00:00Z"><tag k="amenity" v="library"/><tag k="name" v="Library"/></node>
    <node id="2" lat="0" lon="0"/><node id="3" lat="0" lon="0.001"/><node id="4" lat="0.001" lon="0.001"/><node id="5" lat="0" lon="0"/>
    <way id="8" timestamp="2026-01-02T00:00:00Z"><nd ref="2"/><nd ref="3"/><nd ref="4"/><nd ref="5"/><tag k="building" v="yes"/><tag k="name" v="Hall"/></way>
  </osm>`;
  let requestedUrl;
  const fetch = async (url) => {
    requestedUrl = String(url);
    return { ok: true, status: 200, headers: { get: () => null }, text: async () => xml };
  };
  const provider = createOpenStreetMapMapProvider({ id: 'osm-api', capabilities: ['building', 'poi'], fetch });
  const result = await queryProvider(provider, { bounds: [0, 0, 0.01, 0.01], requestedCapabilities: ['building', 'poi'] });
  assert.match(requestedUrl, /bbox=0%2C0%2C0.01%2C0.01/);
  assert.equal(result.records.length, 2);
  assert.equal(result.records.find((record) => record.entityType === 'building').geometry.type, 'Polygon');
  assert.equal(result.licenseId, 'ODbL-1.0');
});

test('local-file adapter reads bounded GeoJSON without exposing its filesystem path', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'gws-local-file-'));
  const path = join(directory, 'places.geojson');
  try {
    await writeFile(path, JSON.stringify({
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', id: 'inside', geometry: { type: 'Point', coordinates: [0, 0] }, properties: { kind: 'library', secret: 'excluded', dataLicense: 'CC-BY-4.0', dataAttribution: 'Example authority', dataUrl: 'https://example.test/inside' } },
        { type: 'Feature', id: 'outside', geometry: { type: 'Point', coordinates: [10, 10] }, properties: { kind: 'cafe' } }
      ]
    }));
    const provider = createLocalFileProvider({
      id: 'file', path, entityType: 'poi', publicFields: ['kind'], fieldMap: { kind: 'type' }, licenseId: 'CC0-1.0',
      licenseField: 'dataLicense', attributionField: 'dataAttribution', sourceUrlField: 'dataUrl'
    });
    const result = await queryProvider(provider, { bounds });
    assert.deepEqual(result.records.map((record) => record.sourceId), ['inside']);
    assert.deepEqual(result.records[0].properties, { type: 'library' });
    assert.equal(result.records[0].provenance.licenseId, 'CC-BY-4.0');
    assert.equal(result.records[0].provenance.attribution, 'Example authority');
    assert.equal(result.records[0].provenance.sourceUrl, 'https://example.test/inside');
    assert.equal(JSON.stringify(result).includes(directory), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('provider cache keys bounded requests and reports cache hits', async () => {
  let requests = 0;
  const values = new Map();
  const base = createGeoJsonHttpProvider({
    id: 'cached', endpoint: 'https://example.test/data', entityType: 'poi', fieldMap: {},
    fetch: async () => {
      requests += 1;
      return { ok: true, headers: { get: () => null }, text: async () => JSON.stringify({ type: 'FeatureCollection', features: [] }) };
    }
  });
  const provider = withProviderCache(base, { get: (key) => values.get(key), set: (key, value) => values.set(key, value) }, { ttlMs: 1000 });
  const first = await queryProvider(provider, { bounds });
  const second = await queryProvider(provider, { bounds });
  assert.equal(requests, 1);
  assert.equal(first.metrics.fromCache, false);
  assert.equal(second.metrics.fromCache, true);
});
