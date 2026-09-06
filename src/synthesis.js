import { createClaim, evidenceRank, resolveClaims } from './evidence.js';
import { measureCoverage } from './coverage.js';
import { deriveSpatialRelationships } from './relationships.js';
import { attributionSummary } from './attribution.js';
import { canonicalJson, deepFreeze, stableHash } from './stable.js';
import { failedProviderResult, queryProvider, validateBounds } from './provider.js';
import { SynthesisError } from './errors.js';
import { reconcileEntities } from './entity-reconciliation.js';

export const SYNTHESIS_VERSION = 1;
export const OUTPUT_SCHEMA_VERSION = 1;

function identityKey(record) {
  return record.gersId ? `gers:${record.gersId}` : `${record.providerId}:${record.sourceId}`;
}

function canonicalId(records) {
  const gers = records.map((record) => record.gersId).filter(Boolean).sort()[0];
  if (gers) return { id: `gws:${records[0].entityType}:gers:${gers}`, scope: 'gers' };
  const anchors = records.map((record) => `${record.providerId}:${record.sourceId}`).sort();
  return { id: `gws:${records[0].entityType}:${stableHash(anchors)}`, scope: records.length === 1 ? 'source' : 'synthesis' };
}

function groupRecords(records, reconciliations = []) {
  const parent = new Map(records.map((record) => [record.id, record.id]));
  const find = (id) => {
    const current = parent.get(id);
    if (current === id) return id;
    const root = find(current);
    parent.set(id, root);
    return root;
  };
  const union = (left, right) => {
    const roots = [find(left), find(right)].sort();
    if (roots[0] !== roots[1]) parent.set(roots[1], roots[0]);
  };
  const byIdentity = new Map();
  for (const record of records) {
    const key = identityKey(record);
    const prior = byIdentity.get(key);
    if (prior) union(prior.id, record.id);
    else byIdentity.set(key, record);
  }
  for (const item of reconciliations.flatMap((result) => result.decisions || []).filter((decision) => decision.decision === 'MATCH' && decision.matchedId)) {
    if (parent.has(item.sourceId) && parent.has(item.matchedId)) union(item.sourceId, item.matchedId);
  }
  const groups = new Map();
  for (const record of records) {
    const root = find(record.id);
    groups.set(root, [...(groups.get(root) || []), record]);
  }
  return [...groups.values()].map((group) => group.sort((left, right) => left.id.localeCompare(right.id)));
}

export function synthesizeWorld(input = {}) {
  const providerResults = (input.providerResults || []).slice().sort((left, right) => left.providerId.localeCompare(right.providerId));
  const records = providerResults.flatMap((result) => result.records || []).sort((left, right) => left.id.localeCompare(right.id));
  const claims = [];
  const unresolvedEntities = groupRecords(records, input.reconciliations || []).map((group) => {
    const identity = canonicalId(group);
    const aliases = group.flatMap((record) => [
      { namespace: record.providerId, id: record.sourceId, providerId: record.providerId },
      ...(record.gersId ? [{ namespace: 'overture-gers', id: record.gersId, providerId: record.providerId }] : []),
      ...(record.aliases || []).map((alias) => ({ ...alias, providerId: record.providerId }))
    ]).sort((left, right) => `${left.namespace}:${left.id}`.localeCompare(`${right.namespace}:${right.id}`));
    for (const record of group) {
      for (const [property, value] of Object.entries(record.properties || {}).sort(([left], [right]) => left.localeCompare(right))) {
        claims.push(createClaim({
          entityId: identity.id,
          property,
          value,
          evidenceClass: record.evidenceClass,
          provenanceId: record.provenance.id,
          retrievedAt: record.provenance.retrievedAt,
          observedAt: record.provenance.observedAt,
          validAt: record.provenance.validAt,
          validFrom: record.provenance.validFrom,
          validTo: record.provenance.validTo,
          sourceUpdatedAt: record.provenance.sourceUpdatedAt
        }));
      }
    }
    const entityClaims = claims.filter((claim) => claim.entityId === identity.id);
    const resolution = resolveClaims(entityClaims);
    const geometryRecord = group.find((record) => record.geometry) || null;
    return {
      schemaVersion: OUTPUT_SCHEMA_VERSION,
      id: identity.id,
      type: group[0].entityType,
      identityScope: identity.scope,
      aliases,
      geometry: geometryRecord?.geometry || null,
      geometrySourceId: geometryRecord?.id || null,
      claimIds: entityClaims.map((claim) => claim.id).sort(),
      resolved: resolution.resolved,
      resolution: resolution.resolutions,
      conflicts: resolution.conflicts,
      relationships: [],
      lifecycle: { revision: SYNTHESIS_VERSION },
      evidenceSummary: {
        sourceCount: group.length,
        providerCount: new Set(group.map((record) => record.providerId)).size,
        strongestClass: entityClaims.slice().sort((left, right) => evidenceRank(left.evidenceClass) - evidenceRank(right.evidenceClass))[0]?.evidenceClass || 'UNKNOWN',
        provenanceComplete: group.every((record) => record.provenance.licenseId !== 'unknown')
      }
    };
  }).sort((left, right) => left.id.localeCompare(right.id));
  const entities = deriveSpatialRelationships(unresolvedEntities);
  claims.sort((left, right) => left.id.localeCompare(right.id));
  const provenance = [...new Map(records.map((record) => [record.provenance.id, record.provenance])).values()]
    .sort((left, right) => left.id.localeCompare(right.id));
  const providerSummary = providerResults.map((result) => ({
    providerId: result.providerId,
    datasetId: result.datasetId || result.providerId,
    operator: result.operator || '',
    licenseId: result.licenseId || 'unknown',
    attribution: result.attribution || '',
    homepage: result.homepage || '',
    status: result.status,
    recordCount: result.records.length,
    coverage: result.coverage,
    warnings: result.warnings,
    error: result.error || null,
    metrics: result.metrics
  }));
  const partial = {
    schemaVersion: OUTPUT_SCHEMA_VERSION,
    synthesisVersion: SYNTHESIS_VERSION,
    entities,
    sourceRecords: records,
    claims,
    provenance,
    providerSummary,
    reconciliations: input.reconciliations || []
  };
  const coverage = measureCoverage(partial);
  const attributions = attributionSummary(provenance);
  const fingerprint = stableHash({
    ...partial,
    sourceRecords: records.map(({ provenance: { retrievedAt: _retrievedAt, ...recordProvenance }, ...record }) => ({ ...record, provenance: recordProvenance })),
    reconciliations: partial.reconciliations.map(({ metrics, ...reconciliation }) => reconciliation),
    claims: claims.map(({ retrievedAt, ...claim }) => claim),
    provenance: provenance.map(({ retrievedAt, ...record }) => record),
    providerSummary: providerSummary.map(({ metrics, ...value }) => value)
  });
  return deepFreeze({ ...partial, coverage, attributions, fingerprint, canonicalBytes: canonicalJson({ entities, sourceRecords: records, claims, provenance }).length });
}

function linkedAbortController(signal, timeoutMs) {
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason || new Error('Synthesis cancelled.'));
  if (signal?.aborted) abort();
  else signal?.addEventListener('abort', abort, { once: true });
  const timer = timeoutMs > 0 ? setTimeout(() => controller.abort(new Error(`Provider timeout after ${timeoutMs} ms.`)), timeoutMs) : null;
  return { controller, release: () => { if (timer) clearTimeout(timer); signal?.removeEventListener?.('abort', abort); } };
}

export async function synthesize(options = {}) {
  const bounds = validateBounds(options.bounds);
  const providers = options.providers || [];
  if (!Array.isArray(providers) || providers.length === 0) throw new TypeError('synthesize() requires at least one provider.');
  const limits = {
    maxProviders: Math.max(1, Number(options.limits?.maxProviders) || 8),
    maxRecordsPerProvider: Math.max(1, Number(options.limits?.maxRecordsPerProvider) || 5000),
    maxCoordinatesPerGeometry: Math.max(1, Number(options.limits?.maxCoordinatesPerGeometry) || 100000),
    maxPropertiesPerRecord: Math.max(1, Number(options.limits?.maxPropertiesPerRecord) || 256),
    maxPropertyBytesPerRecord: Math.max(1024, Number(options.limits?.maxPropertyBytesPerRecord) || 100000),
    providerTimeoutMs: Math.max(0, Number(options.limits?.providerTimeoutMs) || 15000)
  };
  if (providers.length > limits.maxProviders) throw new SynthesisError(`Provider count ${providers.length} exceeds maxProviders ${limits.maxProviders}.`, { code: 'RESOURCE_LIMIT' });
  const requestedCapabilities = [...new Set(options.requestedCapabilities || [])].sort();
  const selectedProviders = requestedCapabilities.length
    ? providers.filter((provider) => provider.capabilities.some((capability) => requestedCapabilities.includes(capability)))
    : providers;
  if (!selectedProviders.length) throw new SynthesisError('No provider supports the requested capabilities.', { code: 'NO_CAPABLE_PROVIDER' });
  const providerResults = (await Promise.all(selectedProviders.map(async (provider) => {
    const startedAt = performance.now();
    const linked = linkedAbortController(options.signal, limits.providerTimeoutMs);
    try {
      return await queryProvider(provider, { bounds, requestedCapabilities }, {
        signal: linked.controller.signal,
        maxRecords: limits.maxRecordsPerProvider,
        maxCoordinatesPerGeometry: limits.maxCoordinatesPerGeometry,
        maxPropertiesPerRecord: limits.maxPropertiesPerRecord,
        maxPropertyBytesPerRecord: limits.maxPropertyBytesPerRecord
      });
    } catch (error) {
      if (options.continueOnProviderError === false) throw error;
      return failedProviderResult(provider, error, performance.now() - startedAt);
    } finally {
      linked.release();
    }
  }))).sort((left, right) => left.providerId.localeCompare(right.providerId));
  const reconciliations = [...(options.reconciliations || [])];
  if (options.reconciliation?.enabled === true) {
    for (let leftIndex = 0; leftIndex < providerResults.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < providerResults.length; rightIndex += 1) {
        reconciliations.push(reconcileEntities(providerResults[leftIndex].records, providerResults[rightIndex].records, options.reconciliation));
      }
    }
  }
  const snapshot = synthesizeWorld({ providerResults, reconciliations });
  return deepFreeze({ ...snapshot, request: { bounds, requestedCapabilities, limits } });
}
