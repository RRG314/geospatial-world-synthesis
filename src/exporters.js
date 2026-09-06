import { canonicalJson, deepFreeze, stableHash } from './stable.js';
import { serialize as serializeFlatGeobuf } from 'flatgeobuf/lib/mjs/geojson.js';

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

export function toFlatGeobuf(snapshot) {
  return serializeFlatGeobuf(toGeoJson(snapshot), 4326);
}

export function toProvJson(snapshot) {
  const activityId = `gws:synthesis_${snapshot.fingerprint}`;
  const canonicalId = (id) => `gws:canonical_${stableHash(id)}`;
  const sourceId = (id) => `gws:source_${stableHash(id)}`;
  const providerId = (id) => `gws:provider_${stableHash(id)}`;
  const sourceByKey = new Map((snapshot.sourceRecords || []).map((record) => [`${record.providerId}:${record.sourceId}`, record]));
  const entity = {};
  for (const record of snapshot.sourceRecords || []) entity[sourceId(record.id)] = {
    'prov:label': record.sourceId,
    'prov:type': 'gws:SourceRecord',
    'gws:providerId': record.providerId,
    'gws:licenseId': record.provenance?.licenseId || 'unknown'
  };
  for (const canonical of snapshot.entities || []) entity[canonicalId(canonical.id)] = {
    'prov:label': String(canonical.resolved?.name || canonical.id),
    'prov:type': 'gws:CanonicalEntity',
    'gws:entityType': canonical.type,
    'gws:canonicalId': canonical.id
  };
  const agent = Object.fromEntries((snapshot.providerSummary || []).map((provider) => [providerId(provider.providerId), {
    'prov:label': provider.operator || provider.providerId,
    'prov:type': 'prov:Organization',
    'gws:providerId': provider.providerId
  }]));
  const wasDerivedFrom = {};
  const wasAttributedTo = {};
  for (const canonical of snapshot.entities || []) {
    for (const alias of canonical.aliases || []) {
      const source = sourceByKey.get(`${alias.providerId}:${alias.id}`);
      if (!source) continue;
      const key = stableHash([canonical.id, source.id]);
      wasDerivedFrom[`gws:derivation_${key}`] = { 'prov:generatedEntity': canonicalId(canonical.id), 'prov:usedEntity': sourceId(source.id), 'prov:activity': activityId };
      wasAttributedTo[`gws:attribution_${stableHash([source.id, source.providerId])}`] = { 'prov:entity': sourceId(source.id), 'prov:agent': providerId(source.providerId) };
    }
  }
  return deepFreeze({
    prefix: { prov: 'http://www.w3.org/ns/prov#', gws: 'https://rrg314.github.io/geospatial-world-synthesis/ns#' },
    entity,
    activity: { [activityId]: { 'prov:label': 'Geospatial World Synthesis', 'prov:type': 'gws:Synthesis' } },
    agent,
    wasDerivedFrom,
    wasAttributedTo
  });
}
