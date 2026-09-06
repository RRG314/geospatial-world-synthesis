import { transformGeometry } from './crs.js';
import { validateGeometry } from './geometry.js';
import { createProvenance, EVIDENCE_CLASSES } from './evidence.js';
import { deepFreeze, stableHash } from './stable.js';
import { ProviderError, classifyProviderError, safeErrorMessage } from './errors.js';

export const ENTITY_TYPES = Object.freeze(['building', 'road', 'parcel', 'water', 'landuse', 'poi', 'terrain']);
export const PROVIDER_STATUSES = Object.freeze(['available', 'authoritative-empty', 'partial', 'rate_limited', 'timeout', 'unavailable', 'invalid_response']);

export function validateBounds(bounds) {
  if (!Array.isArray(bounds) || bounds.length !== 4 || bounds.some((value) => !Number.isFinite(Number(value)))) {
    throw new TypeError('Bounds must be [west, south, east, north] finite numbers.');
  }
  const normalized = bounds.map(Number);
  const [west, south, east, north] = normalized;
  if (west < -180 || east > 180 || south < -90 || north > 90 || west >= east || south >= north) {
    throw new RangeError('Bounds must be ordered CRS84 coordinates within [-180,-90,180,90].');
  }
  return deepFreeze(normalized);
}

export function defineProvider(definition = {}) {
  const id = String(definition.id || '').trim();
  if (!id || typeof definition.query !== 'function') throw new TypeError('Provider requires a stable id and query(request, options).');
  const capabilities = [...new Set(definition.capabilities || [])].sort();
  if (!capabilities.length) throw new TypeError(`Provider ${id} requires at least one capability.`);
  capabilities.forEach((type) => {
    if (!ENTITY_TYPES.includes(type)) throw new TypeError(`Unsupported provider capability: ${type}.`);
  });
  return deepFreeze({
    id,
    datasetId: String(definition.datasetId || id),
    datasetVersion: String(definition.datasetVersion || 'unknown'),
    operator: String(definition.operator || ''),
    licenseId: String(definition.licenseId || 'unknown'),
    attribution: String(definition.attribution || ''),
    homepage: String(definition.homepage || ''),
    capabilities,
    queryModes: [...new Set(definition.queryModes || ['bbox'])].sort(),
    sourceCrs: String(definition.sourceCrs || ''),
    cacheTtlMs: Math.max(0, Number(definition.cacheTtlMs) || 0),
    privacy: String(definition.privacy || 'public'),
    query: definition.query
  });
}

function validateJsonValue(value, depth = 0) {
  if (depth > 20) throw new TypeError('Property value exceeds the maximum nesting depth.');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Property numbers must be finite.');
    return;
  }
  if (Array.isArray(value)) return value.forEach((item) => validateJsonValue(item, depth + 1));
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) !== null && Object.getPrototypeOf(value) !== Object.prototype) {
    throw new TypeError('Property values must use plain JSON objects.');
  }
  if (value && typeof value === 'object') return Object.values(value).forEach((item) => validateJsonValue(item, depth + 1));
  throw new TypeError('Property values must be JSON-compatible.');
}

function normalizeProperties(value, limits) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const entries = Object.entries(value).filter(([, property]) => property != null);
  const maxProperties = Math.max(1, Number(limits.maxPropertiesPerRecord) || 256);
  if (entries.length > maxProperties) throw new RangeError(`Source record exceeds the ${maxProperties}-property limit.`);
  entries.forEach(([, property]) => validateJsonValue(property));
  const properties = Object.fromEntries(entries);
  const maxBytes = Math.max(1024, Number(limits.maxPropertyBytesPerRecord) || 100000);
  if (new TextEncoder().encode(JSON.stringify(properties)).length > maxBytes) throw new RangeError(`Source record properties exceed ${maxBytes} bytes.`);
  return properties;
}

export function normalizeSourceRecord(record = {}, provider, context = {}, limits = {}) {
  const sourceId = String(record.sourceId || record.id || '').trim();
  const entityType = String(record.entityType || '').toLowerCase();
  const sourceCrs = String(record.sourceCrs || provider?.sourceCrs || '').toUpperCase();
  if (!sourceId || !ENTITY_TYPES.includes(entityType)) throw new TypeError('Source record requires sourceId and a supported entityType.');
  if (!sourceCrs) throw new TypeError(`Source record ${sourceId} has no declared CRS.`);
  const maxCoordinates = Math.max(1, Number(limits.maxCoordinatesPerGeometry) || 100000);
  const geometry = record.geometry ? transformGeometry(record.geometry, sourceCrs, 'OGC:CRS84', { maxCoordinates }) : null;
  const geometryValidation = geometry ? validateGeometry(geometry, { maxCoordinates }) : { valid: true, warnings: [] };
  const warnings = [...new Set([...(record.warnings || []), ...geometryValidation.warnings])].sort();
  const properties = normalizeProperties(record.properties, limits);
  const provenance = createProvenance({
    providerId: provider.id,
    operator: provider.operator,
    datasetId: provider.datasetId,
    datasetVersion: record.datasetVersion || provider.datasetVersion,
    sourceRecordId: sourceId,
    sourceUrl: record.sourceUrl || context.sourceUrl,
    licenseId: record.licenseId || provider.licenseId,
    attribution: record.attribution || provider.attribution,
    sourceCrs,
    outputCrs: 'OGC:CRS84',
    retrievedAt: record.retrievedAt || context.retrievedAt,
    observedAt: record.observedAt,
    validAt: record.validAt,
    validFrom: record.validFrom,
    validTo: record.validTo,
    sourceUpdatedAt: record.sourceUpdatedAt,
    privacy: record.privacy || provider.privacy,
    warnings,
    activity: record.activity || (sourceCrs === 'OGC:CRS84' ? null : {
      id: `crs-transform:${sourceCrs}:OGC:CRS84`, method: 'proj4-coordinate-transform', version: '1', inputIds: [`${provider.id}:${sourceId}`]
    })
  });
  const evidenceClass = EVIDENCE_CLASSES.includes(record.evidenceClass) ? record.evidenceClass : 'UNKNOWN';
  return deepFreeze({
    schemaVersion: 1,
    id: `source:${provider.id}:${sourceId}`,
    providerId: provider.id,
    datasetId: provider.datasetId,
    sourceId,
    entityType,
    geometry: geometryValidation.valid ? geometry : null,
    rejectedGeometry: geometryValidation.valid ? null : geometry,
    geometryValidation,
    properties,
    aliases: (record.aliases || []).map((alias) => ({ namespace: String(alias.namespace), id: String(alias.id) })),
    gersId: String(record.gersId || ''),
    evidenceClass,
    provenance,
    fingerprint: stableHash({ providerId: provider.id, sourceId, entityType, geometry, properties })
  });
}

export async function queryProvider(provider, request = {}, options = {}) {
  if (!provider?.id || typeof provider.query !== 'function') throw new TypeError('queryProvider requires a provider created by defineProvider().');
  const bounds = request.bounds || request.bbox;
  if (bounds) validateBounds(bounds);
  const maxRecords = Math.max(1, Number(options.maxRecords) || 5000);
  const startedAt = performance.now();
  let raw;
  try {
    raw = await provider.query({ ...request, bounds, bbox: bounds }, options);
  } catch (error) {
    const status = classifyProviderError(error);
    throw new ProviderError(provider.id, status, `Provider ${provider.id} ${status.replace('_', ' ')}: ${safeErrorMessage(error)}`, { cause: error });
  }
  if (!raw || !Array.isArray(raw.records)) {
    throw new ProviderError(provider.id, 'invalid_response', `Provider ${provider.id} returned no records array.`);
  }
  const truncated = raw.records.length > maxRecords;
  const retrievedAt = String(raw.retrievedAt || new Date().toISOString());
  let records;
  try {
    const normalized = raw.records.slice(0, maxRecords).map((record) => normalizeSourceRecord(record, provider, {
      retrievedAt, sourceUrl: raw.sourceUrl
    }, options));
    const unsupported = normalized.find((record) => !provider.capabilities.includes(record.entityType));
    if (unsupported) throw new TypeError(`Record ${unsupported.sourceId} has undeclared capability ${unsupported.entityType}.`);
    const ids = normalized.map((record) => record.id);
    if (new Set(ids).size !== ids.length) throw new TypeError('Provider returned duplicate source IDs.');
    const requestedCapabilities = request.requestedCapabilities || [];
    records = requestedCapabilities.length ? normalized.filter((record) => requestedCapabilities.includes(record.entityType)) : normalized;
  } catch (error) {
    throw new ProviderError(provider.id, 'invalid_response', `Provider ${provider.id} returned an invalid source record: ${error.message}`, { cause: error });
  }
  const status = truncated ? 'partial' : (PROVIDER_STATUSES.includes(raw.status) ? raw.status : (records.length ? 'available' : 'authoritative-empty'));
  return deepFreeze({
    providerId: provider.id,
    datasetId: provider.datasetId,
    operator: provider.operator,
    licenseId: provider.licenseId,
    attribution: provider.attribution,
    homepage: provider.homepage,
    status,
    records: records.sort((left, right) => left.id.localeCompare(right.id)),
    coverage: raw.coverage || bounds || null,
    warnings: [...new Set([...(raw.warnings || []), ...(truncated ? [`record-limit-exceeded:${maxRecords}`] : [])])].sort(),
    error: null,
    metrics: {
      durationMs: Math.max(0, performance.now() - startedAt),
      requestCount: Number.isFinite(Number(raw.metrics?.requestCount)) ? Number(raw.metrics.requestCount) : 1,
      transferredBytes: Number(raw.metrics?.transferredBytes) || 0,
      fromCache: raw.metrics?.fromCache === true
    }
  });
}

export function failedProviderResult(provider, error, durationMs = 0) {
  const status = error instanceof ProviderError ? error.status : classifyProviderError(error);
  return deepFreeze({
    providerId: provider.id,
    datasetId: provider.datasetId,
    operator: provider.operator,
    licenseId: provider.licenseId,
    attribution: provider.attribution,
    homepage: provider.homepage,
    status,
    records: [],
    coverage: null,
    warnings: [],
    error: { code: error?.code || `PROVIDER_${status.toUpperCase()}`, message: safeErrorMessage(error) },
    metrics: { durationMs: Math.max(0, durationMs), requestCount: 0, transferredBytes: 0, fromCache: false }
  });
}
