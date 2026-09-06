import { defineProvider } from '../provider.js';
import { httpUrl, readBoundedJson } from './http.js';

function arcgisGeometry(feature, geometryType) {
  const geometry = feature.geometry || {};
  if (geometryType === 'esriGeometryPolygon') return { type: 'Polygon', coordinates: geometry.rings || [] };
  if (geometryType === 'esriGeometryPolyline') {
    return geometry.paths?.length === 1
      ? { type: 'LineString', coordinates: geometry.paths[0] }
      : { type: 'MultiLineString', coordinates: geometry.paths || [] };
  }
  if (geometryType === 'esriGeometryPoint') return { type: 'Point', coordinates: [geometry.x, geometry.y] };
  throw new TypeError(`Unsupported ArcGIS geometry type: ${geometryType}. Curves and multipatches are not supported.`);
}

export function createArcGisFeatureServiceProvider(config = {}) {
  const fetchImpl = config.fetch || globalThis.fetch;
  const layerUrl = String(config.layerUrl || '').replace(/\/$/, '');
  if (!config.id || !layerUrl || !config.entityType || typeof fetchImpl !== 'function') {
    throw new TypeError('ArcGIS provider requires id, layerUrl, entityType, and fetch.');
  }
  httpUrl(layerUrl, 'ArcGIS layer URL');
  const publicFields = [...new Set(config.publicFields || [])];
  const sourceIdField = String(config.sourceIdField || 'OBJECTID');
  return defineProvider({
    id: config.id,
    datasetId: config.datasetId,
    datasetVersion: config.datasetVersion || 'live',
    operator: config.operator,
    licenseId: config.licenseId,
    attribution: config.attribution,
    homepage: config.homepage || layerUrl,
    capabilities: [config.entityType],
    queryModes: ['bbox'],
    sourceCrs: 'EPSG:4326',
    query: async (request, options = {}) => {
      const metadataResponse = await fetchImpl(`${layerUrl}?f=json`, { signal: options.signal, headers: config.headers || {} });
      if (!metadataResponse.ok) throw new Error(`ArcGIS metadata HTTP ${metadataResponse.status}`);
      const metadataPayload = await readBoundedJson(metadataResponse, config.maxResponseBytes);
      const metadata = metadataPayload.value;
      let transferredBytes = metadataPayload.bytes;
      const pageSize = Math.min(2000, Math.max(1, Number(config.pageSize) || Math.min(Number(metadata.maxRecordCount) || 500, 500)));
      const maxRequests = Math.min(32, Math.max(1, Number(config.maxRequests) || 8));
      const fields = [...new Set([sourceIdField, ...publicFields])];
      const records = [];
      let offset = 0;
      let requestCount = 1;
      let exceeded = true;
      while (exceeded && requestCount < maxRequests) {
        const params = new URLSearchParams({
          f: 'json', where: config.where || '1=1', outFields: fields.join(','), returnGeometry: 'true',
          geometry: request.bounds.join(','), geometryType: 'esriGeometryEnvelope', spatialRel: 'esriSpatialRelIntersects',
          inSR: '4326', outSR: '4326', resultOffset: String(offset), resultRecordCount: String(pageSize), orderByFields: sourceIdField
        });
        const response = await fetchImpl(`${layerUrl}/query?${params}`, { signal: options.signal, headers: config.headers || {} });
        requestCount += 1;
        if (!response.ok) throw new Error(`ArcGIS query HTTP ${response.status}`);
        const pagePayload = await readBoundedJson(response, config.maxResponseBytes);
        const page = pagePayload.value;
        transferredBytes += pagePayload.bytes;
        if (page.error) throw new Error(`ArcGIS query failed: ${page.error.message || page.error.code}`);
        (page.features || []).forEach((feature) => records.push({
          sourceId: feature.attributes?.[sourceIdField] == null ? '' : String(feature.attributes[sourceIdField]),
          entityType: config.entityType,
          sourceCrs: 'EPSG:4326',
          geometry: arcgisGeometry(feature, metadata.geometryType),
          properties: Object.fromEntries(publicFields.flatMap((field) => feature.attributes?.[field] == null ? [] : [[config.fieldMap?.[field] || field, feature.attributes[field]]])),
          sourceUrl: layerUrl,
          evidenceClass: 'DIRECT_SOURCE'
        }));
        exceeded = page.exceededTransferLimit === true;
        offset += pageSize;
      }
      return {
        status: records.length ? (exceeded ? 'partial' : 'available') : 'authoritative-empty',
        records,
        coverage: request.bounds,
        sourceUrl: layerUrl,
        warnings: exceeded ? [`request-budget-exhausted:${maxRequests}`] : [],
        metrics: { requestCount, transferredBytes, fromCache: false }
      };
    }
  });
}
