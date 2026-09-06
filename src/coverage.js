import { deepFreeze } from './stable.js';
import { EVIDENCE_CLASSES } from './evidence.js';

const CATEGORIES = Object.freeze({
  geometry: ['geometry'],
  identity: ['identity'],
  semantic: ['type', 'category', 'class'],
  naming: ['name', 'address'],
  vertical: ['height', 'levels', 'elevation'],
  relationship: ['relationships']
});

export function measureCoverage(snapshot) {
  const entities = snapshot.entities || [];
  const claimsById = new Map((snapshot.claims || []).map((claim) => [claim.id, claim]));
  const byType = {};
  for (const type of ['building', 'road', 'parcel', 'water', 'landuse', 'poi', 'terrain']) {
    const selected = entities.filter((entity) => entity.type === type);
    const measures = {};
    for (const [category, properties] of Object.entries(CATEGORIES)) {
      const covered = selected.filter((entity) => {
        if (category === 'geometry') return Boolean(entity.geometry);
        if (category === 'identity') return entity.aliases.length > 0;
        if (category === 'relationship') return entity.relationships.length > 0;
        return entity.claimIds.some((id) => properties.includes(claimsById.get(id)?.property));
      }).length;
      measures[category] = { covered, total: selected.length, ratio: selected.length ? covered / selected.length : null };
    }
    byType[type] = measures;
  }
  const requiredProvenance = ['providerId', 'datasetId', 'sourceRecordId', 'licenseId', 'sourceCrs', 'outputCrs'];
  const provenanceFields = (snapshot.provenance || []).flatMap((record) => requiredProvenance.map((field) => Boolean(record[field])));
  const evidenceClassCounts = Object.fromEntries(EVIDENCE_CLASSES.map((evidenceClass) => [
    evidenceClass,
    (snapshot.claims || []).filter((claim) => claim.evidenceClass === evidenceClass).length
  ]));
  return deepFreeze({
    byType,
    directClaims: (snapshot.claims || []).filter((claim) => claim.evidenceClass === 'DIRECT_SOURCE').length,
    syntheticClaims: (snapshot.claims || []).filter((claim) => claim.evidenceClass === 'SYNTHETIC').length,
    evidenceClassCounts,
    unresolvedConflicts: entities.reduce((sum, entity) => sum + entity.conflicts.length, 0),
    provenanceCompleteness: provenanceFields.length ? provenanceFields.filter(Boolean).length / provenanceFields.length : null
  });
}
