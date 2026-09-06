import { deepFreeze } from './stable.js';

export function inspectEntity(snapshot, entityId) {
  const entity = snapshot.entities.find((item) => item.id === entityId);
  if (!entity) return null;
  const claims = snapshot.claims.filter((claim) => entity.claimIds.includes(claim.id));
  const provenanceById = new Map(snapshot.provenance.map((record) => [record.id, record]));
  const sourceKeys = new Set(entity.aliases.map((alias) => `${alias.providerId}:${alias.id}`));
  const sourceRecords = (snapshot.sourceRecords || []).filter((record) => sourceKeys.has(`${record.providerId}:${record.sourceId}`));
  const sourceRecordIds = new Set(sourceRecords.map((record) => record.id));
  const reconciliation = (snapshot.reconciliations || []).flatMap((result) => result.decisions || []).filter((decision) =>
    sourceRecordIds.has(decision.sourceId) || sourceRecordIds.has(decision.matchedId) || decision.relatedIds?.some((id) => sourceRecordIds.has(id)));
  return deepFreeze({
    entity,
    sourceRecords,
    claims,
    provenance: [...new Map(claims.map((claim) => [claim.provenanceId, provenanceById.get(claim.provenanceId)]).filter(([, record]) => record)).values()],
    reconciliation,
    propertySelections: entity.resolution || {},
    temporalEvidence: claims.map((claim) => ({
      claimId: claim.id,
      status: claim.status,
      observedAt: claim.observedAt,
      validAt: claim.validAt,
      sourceUpdatedAt: claim.sourceUpdatedAt
    })),
    conflicts: entity.conflicts.map((conflict) => ({
      ...conflict,
      claims: conflict.claimIds.map((claimId) => claims.find((claim) => claim.id === claimId)).filter(Boolean)
    }))
  });
}
