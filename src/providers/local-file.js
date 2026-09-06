import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { defineProvider } from '../provider.js';
import { intersectsBbox } from '../geometry.js';
import { transformGeometry } from '../crs.js';

function featureRecord(feature, index, config) {
  const sourceIdField = config.sourceIdField || 'id';
  const sourceId = feature.id ?? feature.properties?.[sourceIdField];
  if (sourceId == null) throw new TypeError(`Feature ${index + 1} has no stable id.`);
  const entityType = config.entityType || feature.properties?.[config.entityTypeField || '_gws:entityType'];
  if (!entityType) throw new TypeError(`Feature ${sourceId} has no entity type.`);
  const fieldMap = config.fieldMap || {};
  const publicFields = config.publicFields || Object.keys(fieldMap);
  const properties = publicFields.length
    ? Object.fromEntries(publicFields.flatMap((field) => feature.properties?.[field] == null ? [] : [[fieldMap[field] || field, feature.properties[field]]]))
    : Object.fromEntries(Object.entries(feature.properties || {}).filter(([field]) => ![sourceIdField, config.entityTypeField || '_gws:entityType'].includes(field)));
  return {
    sourceId: String(sourceId),
    entityType: String(entityType),
    sourceCrs: config.sourceCrs || 'OGC:CRS84',
    geometry: feature.geometry,
    properties,
    aliases: feature.properties?.[config.aliasesField || '_gws:aliases'] || [],
    gersId: config.featureIdIsGers === true ? String(feature.id) : feature.properties?.[config.gersField || 'gers_id'],
    licenseId: feature.properties?.[config.licenseField || '_gws:licenseId'] || config.licenseId,
    attribution: feature.properties?.[config.attributionField || '_gws:attribution'] || config.attribution,
    sourceUrl: feature.properties?.[config.sourceUrlField || '_gws:sourceUrl'] || config.sourceUrl || '',
    sourceUpdatedAt: feature.properties?.[config.updatedField || 'updated_at'],
    evidenceClass: 'DIRECT_SOURCE'
  };
}

function recordsFromDocument(document, config) {
  if (document?.type === 'FeatureCollection' && Array.isArray(document.features)) {
    return document.features.map((feature, index) => featureRecord(feature, index, config));
  }
  if (Array.isArray(document)) return document;
  if (Array.isArray(document?.records)) return document.records;
  throw new SyntaxError('Local file must contain a GeoJSON FeatureCollection, source-record array, or { records } object.');
}

export function createLocalFileProvider(config = {}) {
  const filePath = resolve(String(config.path || ''));
  const capabilities = [...new Set(config.capabilities || (config.entityType ? [config.entityType] : []))];
  if (!config.id || !config.path || !capabilities.length) throw new TypeError('Local file provider requires id, path, and capabilities or entityType.');
  return defineProvider({
    id: config.id,
    datasetId: config.datasetId || basename(filePath),
    datasetVersion: config.datasetVersion || 'local',
    operator: config.operator,
    licenseId: config.licenseId,
    attribution: config.attribution,
    homepage: config.homepage,
    capabilities,
    queryModes: ['bbox'],
    sourceCrs: config.sourceCrs || 'OGC:CRS84',
    query: async (request) => {
      const text = await readFile(filePath, 'utf8');
      if (new TextEncoder().encode(text).length > Math.max(1024, Number(config.maxFileBytes) || 100 * 1024 * 1024)) {
        throw new RangeError('Local source file exceeds maxFileBytes.');
      }
      let document;
      try { document = JSON.parse(text); } catch (error) { throw new SyntaxError(`Invalid JSON response: ${error.message}`); }
      const sourceRecords = recordsFromDocument(document, config);
      const records = sourceRecords.filter((record) => {
        if (!record.geometry || !request.bounds) return true;
        const normalized = transformGeometry(record.geometry, record.sourceCrs || config.sourceCrs || 'OGC:CRS84');
        return intersectsBbox(normalized, request.bounds);
      }).map((record) => ({ ...record, sourceUrl: record.sourceUrl || config.sourceUrl || '', evidenceClass: record.evidenceClass || 'DIRECT_SOURCE' }));
      return {
        status: records.length ? 'available' : 'authoritative-empty',
        records,
        coverage: request.bounds,
        sourceUrl: config.sourceUrl || '',
        warnings: [],
        metrics: { requestCount: 0, transferredBytes: new TextEncoder().encode(text).length, fromCache: true }
      };
    }
  });
}
