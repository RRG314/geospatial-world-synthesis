import { distanceMeters, geometryCentroid, polygonIou, reconcileEntities } from 'geospatial-world-synthesis';

const TYPES = ['building', 'poi', 'address', 'parcel', 'road'];
const rectangle = (x, y, size = 0.0002) => ({ type: 'Polygon', coordinates: [[[x, y], [x + size, y], [x + size, y + size], [x, y + size], [x, y]]] });
const geometry = (type, x, y, offset = 0) => type === 'building' || type === 'parcel'
  ? rectangle(x + offset, y)
  : type === 'road'
    ? { type: 'LineString', coordinates: [[x + offset, y], [x + 0.0004 + offset, y]] }
    : { type: 'Point', coordinates: [x + offset, y] };
const properties = (type, index, altered = false) => type === 'address'
  ? { address: altered ? `${index + 9000} Other Road` : `${index} Main Street` }
  : type === 'road'
    ? { name: altered ? `Other Road ${index}` : `Road ${index}`, class: altered ? 'motorway' : 'residential' }
    : { name: altered ? `Different ${index}` : `${type} ${index}`, type: altered ? 'other' : type };

const left = [];
const right = [];
const truth = new Map();
for (let typeIndex = 0; typeIndex < TYPES.length; typeIndex += 1) {
  const type = TYPES[typeIndex];
  for (let index = 0; index < 200; index += 1) {
    const x = -120 + typeIndex * 2 + index % 20 * 0.01;
    const y = 30 + Math.floor(index / 20) * 0.01;
    const leftRecord = { id: `left-${type}-${index}`, entityType: type, geometry: geometry(type, x, y), properties: properties(type, index) };
    if (index < 140) {
      const rightRecord = { id: `right-${type}-${index}`, entityType: type, geometry: geometry(type, x, y, 0.00001), properties: properties(type, index) };
      if (index < 20) {
        leftRecord.aliases = [{ namespace: 'ground-truth', id: `${type}-${index}` }];
        rightRecord.aliases = [{ namespace: 'ground-truth', id: `${type}-${index}` }];
      }
      right.push(rightRecord);
      truth.set(leftRecord.id, { decision: 'MATCH', ids: new Set([rightRecord.id]) });
    } else if (index < 170) {
      const candidates = ['a', 'b'].map((suffix) => ({ id: `right-${type}-${index}-${suffix}`, entityType: type, geometry: geometry(type, x, y), properties: properties(type, index) }));
      right.push(...candidates);
      truth.set(leftRecord.id, { decision: 'AMBIGUOUS', ids: new Set(candidates.map((record) => record.id)) });
    } else {
      right.push({ id: `right-${type}-${index}`, entityType: type, geometry: geometry(type, x + 0.002, y), properties: properties(type, index, true) });
      truth.set(leftRecord.id, { decision: 'NO_MATCH', ids: new Set() });
    }
    left.push(leftRecord);
  }
}

function metrics(name, decisions) {
  let correctMatches = 0;
  let falseMerges = 0;
  let ambiguityRetained = 0;
  let correctNoMatch = 0;
  for (const decision of decisions) {
    const expected = truth.get(decision.sourceId);
    if (decision.decision === 'MATCH') {
      if (expected.decision === 'MATCH' && expected.ids.has(decision.matchedId)) correctMatches += 1;
      else falseMerges += 1;
    }
    if (expected.decision === 'AMBIGUOUS' && decision.decision === 'AMBIGUOUS') ambiguityRetained += 1;
    if (expected.decision === 'NO_MATCH' && decision.decision === 'NO_MATCH') correctNoMatch += 1;
  }
  const expectedMatches = [...truth.values()].filter((item) => item.decision === 'MATCH').length;
  const predictedMatches = decisions.filter((item) => item.decision === 'MATCH').length;
  const precision = predictedMatches ? correctMatches / predictedMatches : 0;
  const recall = correctMatches / expectedMatches;
  return {
    name, expectedCases: truth.size, correctMatches, falseMerges,
    missedMatches: expectedMatches - correctMatches,
    ambiguityRetention: ambiguityRetained / [...truth.values()].filter((item) => item.decision === 'AMBIGUOUS').length,
    noMatchAccuracy: correctNoMatch / [...truth.values()].filter((item) => item.decision === 'NO_MATCH').length,
    precision, recall, f1: precision + recall ? 2 * precision * recall / (precision + recall) : 0
  };
}

function baseline(kind) {
  return left.map((record) => {
    let candidates = right.filter((candidate) => candidate.entityType === record.entityType);
    if (kind === 'shared-id') candidates = candidates.filter((candidate) => record.aliases?.some((alias) => candidate.aliases?.some((other) => alias.namespace === other.namespace && alias.id === other.id)));
    else if (kind === 'name-address') candidates = candidates.filter((candidate) => JSON.stringify(candidate.properties) === JSON.stringify(record.properties));
    else if (kind === 'iou') candidates = candidates.filter((candidate) => ['building', 'parcel'].includes(record.entityType) && polygonIou(record.geometry, candidate.geometry) >= 0.65);
    else candidates = candidates.map((candidate) => ({ candidate, distance: distanceMeters(geometryCentroid(record.geometry), geometryCentroid(candidate.geometry)) })).filter((item) => item.distance <= 80).sort((a, b) => a.distance - b.distance).map((item) => item.candidate);
    return { sourceId: record.id, decision: candidates.length ? 'MATCH' : 'NO_MATCH', matchedId: candidates[0]?.id || null };
  });
}

const full = reconcileEntities(left, right);
const evaluations = [
  metrics('evidence-preserving-specialized', full.decisions),
  metrics('shared-id-only', baseline('shared-id')),
  metrics('nearest-centroid', baseline('nearest')),
  metrics('name-or-address-only', baseline('name-address')),
  metrics('iou-only', baseline('iou'))
].map((evaluation) => Object.fromEntries(Object.entries(evaluation).map(([key, value]) => [key, typeof value === 'number' ? Number(value.toFixed(6)) : value])));

console.log(JSON.stringify({
  fixture: 'CC0 deterministic designed ground truth',
  geographies: 'Five separated synthetic regions; not a claim of geographic representativeness.',
  entityTypes: TYPES,
  leftRecords: left.length,
  rightRecords: right.length,
  fullMatcherCandidates: full.metrics.candidateCount,
  evaluations,
  ablationNotes: {
    provenance: 'Identity matching intentionally does not use provenance completeness; removing it does not change identity metrics but removes auditability.',
    temporal: 'No temporal signal is present in this fixture; no measured effect is claimed.',
    spatialIndex: `The indexed matcher evaluated ${full.metrics.candidateCount} candidates instead of ${left.length * right.length} all-pairs comparisons.`,
    specializedPolicies: 'The full matcher uses entity-specific building, POI, address, parcel, and road evidence policies.'
  },
  limitations: 'Designed fixture results test known edge cases and baselines; they are not independent real-world accuracy estimates.'
}, null, 2));
