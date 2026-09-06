import { defineProvider } from '../provider.js';
import { intersectsBbox } from '../geometry.js';

export function createLocalProvider(config = {}) {
  if (!config.id || !Array.isArray(config.records)) throw new TypeError('Local provider requires id and records.');
  const records = structuredClone(config.records);
  return defineProvider({
    id: config.id,
    datasetId: config.datasetId || `${config.id}-local`,
    datasetVersion: config.datasetVersion || '1',
    operator: config.operator || 'Local data author',
    licenseId: config.licenseId || 'unknown',
    attribution: config.attribution || '',
    homepage: config.homepage || '',
    capabilities: config.capabilities || [...new Set(records.map((record) => record.entityType))],
    queryModes: ['bbox', 'id'],
    sourceCrs: config.sourceCrs || '',
    query: async (request = {}) => {
      const selected = records.filter((record) => {
        if (request.ids?.length && !request.ids.includes(record.sourceId)) return false;
        const sourceCrs = String(record.sourceCrs || config.sourceCrs || '').toUpperCase();
        const geometryUsesCr84Axes = sourceCrs === 'OGC:CRS84' || sourceCrs === 'EPSG:4326';
        return !request.bounds || !record.geometry || !geometryUsesCr84Axes || intersectsBbox(record.geometry, request.bounds);
      });
      return {
        status: selected.length ? 'available' : 'authoritative-empty',
        records: selected,
        coverage: request.bounds || null,
        retrievedAt: config.retrievedAt || '',
        warnings: config.warnings || [],
        metrics: { requestCount: 0, transferredBytes: JSON.stringify(selected).length, fromCache: true }
      };
    }
  });
}
