import { defineProvider } from '../provider.js';
import { httpUrl, readBoundedJson } from './http.js';

export function createOgcApiFeaturesProvider(config = {}) {
  const fetchImpl = config.fetch || globalThis.fetch;
  const root = String(config.root || '').replace(/\/$/, '');
  const collectionId = encodeURIComponent(String(config.collectionId || ''));
  if (!config.id || !root || !collectionId || !config.entityType || typeof fetchImpl !== 'function') {
    throw new TypeError('OGC API Features provider requires id, root, collectionId, entityType, and fetch.');
  }
  const rootUrl = httpUrl(root, 'OGC API root');
  return defineProvider({
    id: config.id,
    datasetId: config.datasetId || config.collectionId,
    datasetVersion: config.datasetVersion || 'live',
    operator: config.operator,
    licenseId: config.licenseId,
    attribution: config.attribution,
    homepage: config.homepage || root,
    capabilities: [config.entityType],
    queryModes: ['bbox'],
    sourceCrs: 'OGC:CRS84',
    query: async (request, options = {}) => {
      const pageSize = Math.min(1000, Math.max(1, Number(config.pageSize) || 500));
      const maxRequests = Math.min(32, Math.max(1, Number(config.maxRequests) || 8));
      let url = `${root}/collections/${collectionId}/items?bbox=${request.bounds.join(',')}&limit=${pageSize}&f=json`;
      let requestCount = 0;
      let transferredBytes = 0;
      const records = [];
      while (url && requestCount < maxRequests) {
        const response = await fetchImpl(url, { signal: options.signal, headers: { Accept: 'application/geo+json, application/json', ...(config.headers || {}) } });
        requestCount += 1;
        if (!response.ok) throw new Error(`OGC API Features HTTP ${response.status}`);
        const parsed = await readBoundedJson(response, config.maxResponseBytes);
        transferredBytes += parsed.bytes;
        const page = parsed.value;
        if (!Array.isArray(page.features)) throw new SyntaxError('OGC API Features response has no features array.');
        page.features.forEach((feature, index) => {
          const suppliedId = feature.id ?? feature.properties?.[config.sourceIdField || 'id'];
          records.push({
            sourceId: String(suppliedId ?? `feature-${requestCount}-${index + 1}`),
            entityType: config.entityType,
            sourceCrs: 'OGC:CRS84',
            geometry: feature.geometry,
            properties: Object.fromEntries(Object.entries(config.fieldMap || {}).flatMap(([source, target]) => feature.properties?.[source] == null ? [] : [[target, feature.properties[source]]])),
            sourceUpdatedAt: feature.properties?.[config.updatedField || 'updated_at'],
            gersId: feature.properties?.[config.gersField || 'gers_id'],
            sourceUrl: url,
            evidenceClass: 'DIRECT_SOURCE',
            warnings: suppliedId == null ? ['generated-source-id-from-response-order'] : []
          });
        });
        const next = (page.links || []).find((link) => link.rel === 'next')?.href || '';
        if (next) {
          const nextUrl = httpUrl(new URL(next, url), 'OGC API next URL');
          if (nextUrl.origin !== rootUrl.origin && config.allowCrossOriginNext !== true) throw new Error('OGC API next link changed origin.');
          url = nextUrl.toString();
        } else url = '';
      }
      return {
        status: records.length ? (url ? 'partial' : 'available') : 'authoritative-empty',
        records,
        coverage: request.bounds,
        sourceUrl: `${root}/collections/${collectionId}`,
        warnings: url ? [`request-budget-exhausted:${maxRequests}`] : [],
        metrics: { requestCount, transferredBytes, fromCache: false }
      };
    }
  });
}
