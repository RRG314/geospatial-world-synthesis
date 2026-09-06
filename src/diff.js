import { deepFreeze, stableHash } from './stable.js';

function withoutVolatile(value) {
  if (Array.isArray(value)) return value.map(withoutVolatile);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !['retrievedAt', 'durationMs'].includes(key))
    .map(([key, nested]) => [key, withoutVolatile(nested)]));
}

function collectionDiff(before = [], after = []) {
  const left = new Map(before.map((item) => [item.id, item]));
  const right = new Map(after.map((item) => [item.id, item]));
  return {
    added: [...right.keys()].filter((id) => !left.has(id)).sort(),
    removed: [...left.keys()].filter((id) => !right.has(id)).sort(),
    changed: [...right.keys()].filter((id) => left.has(id) && stableHash(withoutVolatile(left.get(id))) !== stableHash(withoutVolatile(right.get(id)))).sort()
  };
}

function entityIdsForClaims(snapshot, claimIds) {
  const selected = new Set(claimIds);
  return (snapshot.claims || []).filter((claim) => selected.has(claim.id)).map((claim) => claim.entityId);
}

function entityIdsForSources(snapshot, sourceIds) {
  const selected = new Set(sourceIds);
  return (snapshot.entities || []).filter((entity) => entity.aliases.some((alias) => selected.has(`source:${alias.providerId}:${alias.id}`))).map((entity) => entity.id);
}

export function diffSnapshots(before = {}, after = {}) {
  const entities = collectionDiff(before.entities, after.entities);
  const sourceRecords = collectionDiff(before.sourceRecords, after.sourceRecords);
  const claims = collectionDiff(before.claims, after.claims);
  const provenance = collectionDiff(before.provenance, after.provenance);
  const changedClaimIds = [...claims.added, ...claims.removed, ...claims.changed];
  const changedSourceIds = [...sourceRecords.added, ...sourceRecords.removed, ...sourceRecords.changed];
  const affectedEntityIds = [...new Set([
    ...entities.added, ...entities.removed, ...entities.changed,
    ...entityIdsForClaims(before, changedClaimIds), ...entityIdsForClaims(after, changedClaimIds),
    ...entityIdsForSources(before, changedSourceIds), ...entityIdsForSources(after, changedSourceIds)
  ])].sort();
  return deepFreeze({
    schemaVersion: 1,
    beforeFingerprint: String(before.fingerprint || ''),
    afterFingerprint: String(after.fingerprint || ''),
    changed: before.fingerprint !== after.fingerprint,
    entities,
    sourceRecords,
    claims,
    provenance,
    affectedEntityIds
  });
}
