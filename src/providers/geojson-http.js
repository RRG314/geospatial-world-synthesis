import { defineProvider } from '../provider.js';
import { httpUrl, readBoundedText } from './http.js';

function geometryCompatible(geometry, entityType) {
  if (!geometry) return false;
  if (entityType === 'poi') return ['Point', 'MultiPoint'].includes(geometry.type);
  if (entityType === 'road') return ['LineString', 'MultiLineString'].includes(geometry.type);
  return ['Polygon', 'MultiPolygon'].includes(geometry.type);
}

export function createGeoJsonHttpProvider(config = {}) {
  const fetchImpl = config.fetch || globalThis.fetch;
  if (!config.id || !config.endpoint || !config.entityType || typeof fetchImpl !== 'function') {
    throw new TypeError('GeoJSON HTTP provider requires id, endpoint, entityType, and fetch.');
  }
  httpUrl(config.endpoint, 'GeoJSON endpoint');
  return defineProvider({
    id: config.id,
    datasetId: config.datasetId || config.id,
    datasetVersion: config.datasetVersion || 'live',
    operator: config.operator,
    licenseId: config.licenseId,
    attribution: config.attribution,
    homepage: config.homepage || config.endpoint,
    capabilities: [config.entityType],
    queryModes: ['bbox'],
    sourceCrs: config.sourceCrs || 'OGC:CRS84',
    query: async (request, options = {}) => {
      const url = typeof config.buildUrl === 'function'
        ? config.buildUrl(config.endpoint, request)
        : `${config.endpoint}${config.endpoint.includes('?') ? '&' : '?'}bbox=${request.bounds.join(',')}`;
      httpUrl(url, 'GeoJSON request URL');
      const response = await fetchImpl(url, { signal: options.signal, headers: { Accept: 'application/geo+json, application/json', ...(config.headers || {}) } });
      const text = await readBoundedText(response, config.maxResponseBytes);
      if (!response.ok) throw new Error(`GeoJSON HTTP ${response.status}: ${text.slice(0, 160)}`);
      let collection;
      try {
        collection = JSON.parse(text);
      } catch (error) {
        throw new SyntaxError(`Invalid JSON response: ${error.message}`);
      }
      if (collection?.type !== 'FeatureCollection' || !Array.isArray(collection.features)) throw new SyntaxError('Invalid GeoJSON FeatureCollection response.');
      const records = collection.features.filter((feature) => geometryCompatible(feature.geometry, config.entityType)).map((feature, index) => {
        const suppliedId = feature.id ?? feature.properties?.[config.sourceIdField || 'id'];
        return {
          sourceId: String(suppliedId ?? `feature-${index + 1}`),
          entityType: config.entityType,
          sourceCrs: config.sourceCrs || 'OGC:CRS84',
          geometry: feature.geometry,
          properties: Object.fromEntries(Object.entries(config.fieldMap || {}).flatMap(([source, target]) => feature.properties?.[source] == null ? [] : [[target, feature.properties[source]]])),
          sourceUpdatedAt: feature.properties?.[config.updatedField || 'updated_at'],
          sourceUrl: url,
          evidenceClass: 'DIRECT_SOURCE',
          warnings: suppliedId == null ? ['generated-source-id-from-response-order'] : []
        };
      });
      return {
        status: records.length ? 'available' : 'authoritative-empty',
        records,
        coverage: request.bounds,
        sourceUrl: url,
        warnings: [],
        metrics: { requestCount: 1, transferredBytes: new TextEncoder().encode(text).length, fromCache: false }
      };
    }
  });
}
