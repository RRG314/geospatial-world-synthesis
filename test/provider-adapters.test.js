import test from 'node:test';
import assert from 'node:assert/strict';
import { queryProvider } from 'geospatial-world-synthesis';
import { createArcGisFeatureServiceProvider, createGeoJsonHttpProvider, createOgcApiFeaturesProvider } from 'geospatial-world-synthesis/providers';

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
