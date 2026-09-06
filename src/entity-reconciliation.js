import RBush from 'rbush';
import { buildingMatchFeatures } from './reconciliation.js';
import { distanceMeters, geometryBbox, geometryCentroid, polygonIou } from './geometry.js';
import { deepFreeze } from './stable.js';

export const RECONCILABLE_ENTITY_TYPES = Object.freeze(['building', 'poi', 'address', 'parcel', 'road']);

export const DEFAULT_ENTITY_MATCH_POLICIES = deepFreeze({
  building: { maxCandidateDistanceM: 80, matchScore: 0.70, ambiguityDelta: 0.06, minimumIou: 0.65 },
  poi: { maxCandidateDistanceM: 60, matchScore: 0.76, ambiguityDelta: 0.07, maximumMatchDistanceM: 35 },
  address: { maxCandidateDistanceM: 40, matchScore: 0.82, ambiguityDelta: 0.06, maximumMatchDistanceM: 25 },
  parcel: { maxCandidateDistanceM: 100, matchScore: 0.78, ambiguityDelta: 0.05, minimumIou: 0.72 },
  road: { maxCandidateDistanceM: 140, matchScore: 0.78, ambiguityDelta: 0.06, maximumMatchDistanceM: 70 }
});

function normalizedText(value) {
  return String(value || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim();
}

function tokenAgreement(left, right) {
  const first = new Set(normalizedText(left).split(' ').filter(Boolean));
  const second = new Set(normalizedText(right).split(' ').filter(Boolean));
  if (!first.size || !second.size) return null;
  const intersection = [...first].filter((token) => second.has(token)).length;
  return intersection / new Set([...first, ...second]).size;
}

function propertyAgreement(left, right, names) {
  for (const name of names) {
    const first = left.properties?.[name];
    const second = right.properties?.[name];
    if (first != null && second != null) return tokenAgreement(first, second);
  }
  return null;
}

function stableIdentifiers(record) {
  const values = new Set();
  if (record.gersId) values.add(`gers:${record.gersId}`);
  for (const alias of record.aliases || []) {
    if (alias?.namespace && alias?.id) values.add(`${alias.namespace}:${alias.id}`);
  }
  return values;
}

function sharedStableId(left, right) {
  const rightIds = stableIdentifiers(right);
  return [...stableIdentifiers(left)].find((id) => rightIds.has(id)) || '';
}

function geometryKind(record) {
  return record.geometry?.type || '';
}

function safeIou(left, right) {
  if (!['Polygon', 'MultiPolygon'].includes(geometryKind(left)) || !['Polygon', 'MultiPolygon'].includes(geometryKind(right))) return 0;
  try { return polygonIou(left.geometry, right.geometry); } catch { return 0; }
}

function centroidDistance(left, right) {
  if (!left.geometry || !right.geometry) return Infinity;
  try { return distanceMeters(geometryCentroid(left.geometry), geometryCentroid(right.geometry)); } catch { return Infinity; }
}

function lineEndpoints(record) {
  const geometry = record.geometry;
  if (geometry?.type === 'LineString') return [geometry.coordinates[0], geometry.coordinates.at(-1)];
  if (geometry?.type === 'MultiLineString') {
    const lines = geometry.coordinates.filter((line) => line.length);
    return lines.length ? [lines[0][0], lines.at(-1).at(-1)] : [];
  }
  return [];
}

function endpointAgreement(left, right, maxDistanceM) {
  const first = lineEndpoints(left);
  const second = lineEndpoints(right);
  if (first.length !== 2 || second.length !== 2) return 0;
  const direct = distanceMeters(first[0], second[0]) + distanceMeters(first[1], second[1]);
  const reverse = distanceMeters(first[0], second[1]) + distanceMeters(first[1], second[0]);
  return Math.max(0, 1 - Math.min(direct, reverse) / (maxDistanceM * 2));
}

function weighted(signals) {
  let total = 0;
  let weights = 0;
  for (const [value, weight] of signals) {
    if (value == null || !Number.isFinite(value)) continue;
    total += value * weight;
    weights += weight;
  }
  return weights ? Math.max(0, Math.min(1, total / weights)) : 0;
}

export function entityMatchFeatures(left, right, policyOverrides = {}) {
  if (!left || !right || left.entityType !== right.entityType || !RECONCILABLE_ENTITY_TYPES.includes(left.entityType)) return null;
  const policy = { ...DEFAULT_ENTITY_MATCH_POLICIES[left.entityType], ...policyOverrides };
  const stableId = sharedStableId(left, right);
  const measuredDistanceM = centroidDistance(left, right);
  const nameAgreement = propertyAgreement(left, right, ['name', 'ref']);
  const addressAgreement = propertyAgreement(left, right, ['address', 'formattedAddress', 'addr:full']);
  const typeAgreement = propertyAgreement(left, right, ['type', 'category', 'class', 'subtype']);
  const iou = safeIou(left, right);
  let score = 0;
  if (stableId) score = 1;
  else if (left.entityType === 'building') score = buildingMatchFeatures(left, right)?.score || 0;
  else if (left.entityType === 'parcel') score = weighted([[iou, 0.85], [nameAgreement, 0.10], [typeAgreement, 0.05]]);
  else if (left.entityType === 'address') score = weighted([
    [addressAgreement, 0.65],
    [Number.isFinite(measuredDistanceM) ? Math.max(0, 1 - measuredDistanceM / policy.maxCandidateDistanceM) : null, 0.35]
  ]);
  else if (left.entityType === 'road') score = weighted([
    [endpointAgreement(left, right, policy.maxCandidateDistanceM), 0.45],
    [nameAgreement, 0.40],
    [typeAgreement, 0.15]
  ]);
  else score = weighted([
    [nameAgreement, 0.40],
    [Number.isFinite(measuredDistanceM) ? Math.max(0, 1 - measuredDistanceM / policy.maxCandidateDistanceM) : null, 0.35],
    [typeAgreement, 0.15],
    [addressAgreement, 0.10]
  ]);
  return deepFreeze({ stableId: stableId || null, distanceM: Number.isFinite(measuredDistanceM) ? measuredDistanceM : null, iou, nameAgreement, addressAgreement, typeAgreement, score });
}

function expandedBbox(record, distanceM) {
  if (!record.geometry) return null;
  const [minX, minY, maxX, maxY] = geometryBbox(record.geometry);
  const latitude = (minY + maxY) / 2;
  const latitudeDelta = distanceM / 111_320;
  const longitudeDelta = distanceM / Math.max(1, 111_320 * Math.cos(latitude * Math.PI / 180));
  return { minX: minX - longitudeDelta, minY: minY - latitudeDelta, maxX: maxX + longitudeDelta, maxY: maxY + latitudeDelta };
}

function indexRecords(records) {
  const tree = new RBush();
  const byStableId = new Map();
  tree.load(records.flatMap((record) => {
    if (!record.geometry) return [];
    const [minX, minY, maxX, maxY] = geometryBbox(record.geometry);
    return [{ minX, minY, maxX, maxY, record }];
  }));
  for (const record of records) {
    for (const identifier of stableIdentifiers(record)) {
      byStableId.set(identifier, [...(byStableId.get(identifier) || []), record]);
    }
  }
  return { tree, byStableId };
}

export function reconcileEntities(leftRecords = [], rightRecords = [], options = {}) {
  const startedAt = performance.now();
  const rightByType = new Map();
  for (const type of RECONCILABLE_ENTITY_TYPES) {
    const records = rightRecords.filter((record) => record.entityType === type);
    rightByType.set(type, { records, ...indexRecords(records) });
  }
  const decisions = [];
  let candidateCount = 0;
  for (const left of leftRecords.filter((record) => RECONCILABLE_ENTITY_TYPES.includes(record.entityType))) {
    const policy = { ...DEFAULT_ENTITY_MATCH_POLICIES[left.entityType], ...(options.policies?.[left.entityType] || {}) };
    const pool = rightByType.get(left.entityType);
    const exact = [...new Map([...stableIdentifiers(left)].flatMap((identifier) => pool.byStableId.get(identifier) || []).map((record) => [record.id, record])).values()];
    let candidates;
    if (exact.length) candidates = exact;
    else {
      const bounds = expandedBbox(left, policy.maxCandidateDistanceM);
      candidates = bounds ? pool.tree.search(bounds).map((item) => item.record) : [];
    }
    const evaluated = candidates.map((right) => ({ id: right.id, features: entityMatchFeatures(left, right, policy) }))
      .filter((candidate) => candidate.features)
      .sort((a, b) => b.features.score - a.features.score || a.id.localeCompare(b.id));
    candidateCount += evaluated.length;
    const best = evaluated[0];
    const second = evaluated[1];
    let decision = 'NO_MATCH';
    let reason = evaluated.length ? 'candidate-below-policy-threshold' : 'no-spatial-candidate';
    if (best?.features.stableId) {
      if (second?.features.stableId) {
        decision = 'AMBIGUOUS';
        reason = 'stable-identifier-maps-to-multiple-records';
      } else {
        decision = 'MATCH';
        reason = 'shared-stable-identifier';
      }
    } else if (best?.features.score >= policy.matchScore) {
      const geometryAllowed = left.entityType === 'building' || left.entityType === 'parcel'
        ? best.features.iou >= policy.minimumIou
        : Number.isFinite(best.features.distanceM) && best.features.distanceM <= policy.maximumMatchDistanceM;
      if (!geometryAllowed) reason = 'geometry-below-automatic-match-policy';
      else if (second?.features.score >= policy.matchScore && best.features.score - second.features.score <= policy.ambiguityDelta) {
        decision = 'AMBIGUOUS';
        reason = 'multiple-similar-candidates';
      } else {
        decision = 'MATCH';
        reason = 'entity-policy-threshold';
      }
    }
    decisions.push({
      sourceId: left.id,
      entityType: left.entityType,
      decision,
      matchedId: decision === 'MATCH' ? best.id : null,
      relatedIds: [],
      reason,
      candidates: evaluated.slice(0, Math.max(1, Number(options.maxReportedCandidates) || 5))
    });
  }
  const automaticByTarget = new Map();
  for (const decision of decisions.filter((item) => item.decision === 'MATCH' && item.matchedId && !item.candidates[0]?.features?.stableId)) {
    automaticByTarget.set(decision.matchedId, [...(automaticByTarget.get(decision.matchedId) || []), decision]);
  }
  const collisions = new Set([...automaticByTarget.values()].filter((items) => items.length > 1).flat());
  const conservativeDecisions = decisions.map((decision) => collisions.has(decision) ? {
    ...decision,
    decision: 'AMBIGUOUS',
    matchedId: null,
    relatedIds: [decision.candidates[0].id],
    reason: 'many-to-one-candidate-requires-review'
  } : decision);
  return deepFreeze({
    matcherVersion: 3,
    policies: { ...DEFAULT_ENTITY_MATCH_POLICIES, ...(options.policies || {}) },
    decisions: conservativeDecisions.sort((a, b) => a.sourceId.localeCompare(b.sourceId)),
    counts: Object.fromEntries(['MATCH', 'AMBIGUOUS', 'NO_MATCH'].map((value) => [value, conservativeDecisions.filter((item) => item.decision === value).length])),
    metrics: { leftRecordCount: leftRecords.length, rightRecordCount: rightRecords.length, candidateCount, durationMs: performance.now() - startedAt, index: 'rbush-4' }
  });
}
