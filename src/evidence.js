import { deepFreeze, stableHash } from './stable.js';

export const EVIDENCE_CLASSES = Object.freeze([
  'DIRECT_SOURCE',
  'MULTI_SOURCE_SUPPORTED',
  'DERIVED_HIGH_CONFIDENCE',
  'INFERRED',
  'LOW_CONFIDENCE',
  'SYNTHETIC',
  'UNKNOWN'
]);

const EVIDENCE_RANK = Object.freeze(Object.fromEntries(EVIDENCE_CLASSES.map((value, index) => [value, index])));

export function evidenceRank(value) {
  return EVIDENCE_RANK[value] ?? EVIDENCE_RANK.UNKNOWN;
}

function redactUrl(value) {
  try {
    const url = new URL(String(value || ''));
    url.username = '';
    url.password = '';
    for (const name of [...url.searchParams.keys()]) {
      if (/^(token|key|api_key|access_token|client_secret|password|auth|signature|sig)$/i.test(name)) url.searchParams.set(name, 'REDACTED');
    }
    return url.toString();
  } catch {
    return String(value || '').replace(/([?&])(token|key|api_key|access_token|client_secret|password|auth|signature|sig)=[^&]*/gi, '$1$2=REDACTED');
  }
}

export function createProvenance(input = {}) {
  const providerId = String(input.providerId || '').trim();
  const datasetId = String(input.datasetId || '').trim();
  const sourceRecordId = String(input.sourceRecordId || '').trim();
  if (!providerId || !datasetId || !sourceRecordId) {
    throw new TypeError('Provenance requires providerId, datasetId, and sourceRecordId.');
  }
  const activity = input.activity ? {
    id: String(input.activity.id || ''),
    method: String(input.activity.method || ''),
    version: String(input.activity.version || ''),
    inputIds: [...new Set((input.activity.inputIds || []).map(String))].sort()
  } : null;
  return deepFreeze({
    schemaVersion: 1,
    id: `provenance:${stableHash({ providerId, datasetId, sourceRecordId, activity })}`,
    providerId,
    operator: String(input.operator || ''),
    datasetId,
    datasetVersion: String(input.datasetVersion || 'unknown'),
    sourceRecordId,
    sourceUrl: redactUrl(input.sourceUrl),
    licenseId: String(input.licenseId || 'unknown'),
    attribution: String(input.attribution || ''),
    sourceCrs: String(input.sourceCrs || 'unknown'),
    outputCrs: String(input.outputCrs || 'OGC:CRS84'),
    retrievedAt: String(input.retrievedAt || ''),
    observedAt: String(input.observedAt || ''),
    validAt: String(input.validAt || ''),
    validFrom: String(input.validFrom || ''),
    validTo: String(input.validTo || ''),
    sourceUpdatedAt: String(input.sourceUpdatedAt || ''),
    activity,
    privacy: String(input.privacy || 'public'),
    warnings: [...new Set((input.warnings || []).map(String))].sort()
  });
}

export function createClaim(input = {}) {
  const property = String(input.property || '').trim();
  const provenanceId = String(input.provenanceId || '').trim();
  if (!property || !provenanceId) throw new TypeError('Claims require property and provenanceId.');
  const evidenceClass = EVIDENCE_CLASSES.includes(input.evidenceClass) ? input.evidenceClass : 'UNKNOWN';
  const identity = { property, value: input.value, provenanceId, evidenceClass, method: input.method || '' };
  return deepFreeze({
    schemaVersion: 1,
    id: `claim:${stableHash(identity)}`,
    entityId: String(input.entityId || ''),
    property,
    value: input.value,
    valueType: Array.isArray(input.value) ? 'array' : input.value === null ? 'null' : typeof input.value,
    evidenceClass,
    provenanceId,
    measuredQuality: input.measuredQuality || null,
    retrievedAt: String(input.retrievedAt || ''),
    observedAt: String(input.observedAt || ''),
    validAt: String(input.validAt || ''),
    validFrom: String(input.validFrom || ''),
    validTo: String(input.validTo || ''),
    sourceUpdatedAt: String(input.sourceUpdatedAt || ''),
    status: String(input.status || 'accepted'),
    reason: String(input.reason || ''),
    method: String(input.method || '')
  });
}

export function resolveClaims(claims = []) {
  const grouped = new Map();
  for (const claim of claims) grouped.set(claim.property, [...(grouped.get(claim.property) || []), claim]);
  const resolved = {};
  const resolutions = {};
  const conflicts = [];
  for (const [property, propertyClaims] of [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const ordered = propertyClaims.slice().sort((left, right) =>
      evidenceRank(left.evidenceClass) - evidenceRank(right.evidenceClass) ||
      String(right.sourceUpdatedAt || right.validAt || right.observedAt).localeCompare(String(left.sourceUpdatedAt || left.validAt || left.observedAt)) ||
      left.id.localeCompare(right.id));
    resolved[property] = ordered[0]?.value;
    resolutions[property] = {
      selectedClaimId: ordered[0]?.id || null,
      evidenceClass: ordered[0]?.evidenceClass || 'UNKNOWN',
      reason: ordered.length === 1
        ? 'only-available-claim'
        : 'strongest-evidence-then-newest-explicit-source-time-then-stable-id',
      alternativeClaimIds: ordered.slice(1).map((claim) => claim.id)
    };
    const directValues = new Map();
    for (const claim of ordered.filter((item) => item.evidenceClass === 'DIRECT_SOURCE')) {
      const key = JSON.stringify(claim.value);
      directValues.set(key, [...(directValues.get(key) || []), claim.id]);
    }
    if (directValues.size > 1) conflicts.push(deepFreeze({ property, claimIds: [...directValues.values()].flat().sort() }));
  }
  return deepFreeze({ resolved, resolutions, conflicts });
}
