import { deepFreeze } from './stable.js';

export function inspectEntity(snapshot, entityId) {
  const entity = snapshot.entities.find((item) => item.id === entityId);
  if (!entity) return null;
  const claims = snapshot.claims.filter((claim) => entity.claimIds.includes(claim.id));
  const provenanceById = new Map(snapshot.provenance.map((record) => [record.id, record]));
  return deepFreeze({
    entity,
    claims,
    provenance: [...new Map(claims.map((claim) => [claim.provenanceId, provenanceById.get(claim.provenanceId)]).filter(([, record]) => record)).values()],
    conflicts: entity.conflicts.map((conflict) => ({
      ...conflict,
      claims: conflict.claimIds.map((claimId) => claims.find((claim) => claim.id === claimId)).filter(Boolean)
    }))
  });
}
