import { canonicalJson, deepFreeze } from './stable.js';

export function toCanonicalJson(snapshot, options = {}) {
  return options.pretty === false ? canonicalJson(snapshot) : JSON.stringify(snapshot, null, 2);
}

export function toGeoJson(snapshot) {
  return deepFreeze({
    type: 'FeatureCollection',
    name: 'Geospatial World Synthesis output',
    features: snapshot.entities.filter((entity) => entity.geometry).map((entity) => ({
      type: 'Feature',
      id: entity.id,
      geometry: entity.geometry,
      properties: {
        ...entity.resolved,
        '_gws:entityType': entity.type,
        '_gws:identityScope': entity.identityScope,
        '_gws:aliases': entity.aliases.map((alias) => `${alias.namespace}:${alias.id}`),
        '_gws:claimIds': entity.claimIds,
        '_gws:relationshipCount': entity.relationships.length,
        '_gws:unresolvedConflictCount': entity.conflicts.length,
        '_gws:evidenceSourceCount': entity.evidenceSummary.sourceCount
      }
    })),
    'gws:schemaVersion': snapshot.schemaVersion,
    'gws:fingerprint': snapshot.fingerprint,
    'gws:attributions': snapshot.attributions
  });
}
