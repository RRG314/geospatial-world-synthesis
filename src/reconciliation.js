import { distanceMeters, geometryArea, geometryCentroid, polygonIou } from './geometry.js';
import { deepFreeze } from './stable.js';

function normalizedText(value) {
  return String(value || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim();
}

function textAgreement(left, right, property) {
  const first = normalizedText(left.properties?.[property]);
  const second = normalizedText(right.properties?.[property]);
  if (!first || !second) return null;
  return first === second ? 1 : 0;
}

function asPolygons(geometry) {
  if (geometry?.type === 'Polygon') return [geometry.coordinates];
  if (geometry?.type === 'MultiPolygon') return geometry.coordinates;
  return [];
}

function groupedIou(leftRecords, rightRecords) {
  const left = leftRecords.filter((record) => record.geometry).flatMap((record) => asPolygons(record.geometry));
  const right = rightRecords.filter((record) => record.geometry).flatMap((record) => asPolygons(record.geometry));
  if (!left.length || !right.length) return 0;
  try {
    return polygonIou({ type: 'MultiPolygon', coordinates: left }, { type: 'MultiPolygon', coordinates: right });
  } catch {
    return 0;
  }
}

function isBuildingPart(record) {
  const value = record?.properties?.buildingPart ?? record?.properties?.['building:part'] ?? record?.properties?.role;
  return Boolean(String(value || '').trim()) && String(value).toLowerCase() !== 'no';
}

export const DEFAULT_BUILDING_MATCH_POLICY = Object.freeze({
  matcherVersion: 2,
  matchScore: 0.70,
  probableScore: 0.50,
  ambiguityDelta: 0.06,
  maxCandidateDistanceM: 80,
  minimumAutomaticMatchIou: 0.65,
  cardinalityIou: 0.55,
  partIou: 0.20
});

export function buildingMatchFeatures(left, right) {
  if (left.entityType !== 'building' || right.entityType !== 'building' || !left.geometry || !right.geometry) return null;
  const iou = polygonIou(left.geometry, right.geometry);
  const centroidDistanceM = distanceMeters(geometryCentroid(left.geometry), geometryCentroid(right.geometry));
  const areas = [geometryArea(left.geometry), geometryArea(right.geometry)];
  const areaRatio = Math.max(...areas) > 0 ? Math.min(...areas) / Math.max(...areas) : 0;
  const nameAgreement = textAgreement(left, right, 'name');
  const addressAgreement = textAgreement(left, right, 'address');
  const typeAgreement = textAgreement(left, right, 'type');
  const semanticSignals = [nameAgreement, addressAgreement, typeAgreement].filter((value) => value !== null);
  const semanticAgreement = semanticSignals.length ? semanticSignals.reduce((sum, value) => sum + value, 0) / semanticSignals.length : null;
  const score = Math.max(0, Math.min(1,
    iou * 0.65 + areaRatio * 0.15 + Math.max(0, 1 - centroidDistanceM / 30) * 0.1 + (semanticAgreement ?? 0.5) * 0.1
  ));
  return deepFreeze({ iou, centroidDistanceM, areaRatio, nameAgreement, addressAgreement, typeAgreement, semanticAgreement, score });
}

export function reconcileBuildings(leftRecords = [], rightRecords = [], policy = {}) {
  const activePolicy = { ...DEFAULT_BUILDING_MATCH_POLICY, ...policy, matcherVersion: 2 };
  const decisions = [];
  const rightBuildings = rightRecords.filter((record) => record.entityType === 'building');
  for (const left of leftRecords.filter((record) => record.entityType === 'building')) {
    const exact = rightBuildings.filter((right) => left.gersId && right.gersId && left.gersId === right.gersId);
    if (exact.length === 1) {
      decisions.push({ sourceId: left.id, decision: 'MATCH', matchedId: exact[0].id, relatedIds: [], reason: 'shared-gers-id', candidates: [{ id: exact[0].id, features: null }] });
      continue;
    }
    const candidates = rightBuildings.map((right) => ({ id: right.id, features: buildingMatchFeatures(left, right), part: isBuildingPart(right) }))
      .filter((entry) => entry.features && entry.features.centroidDistanceM <= activePolicy.maxCandidateDistanceM)
      .sort((first, second) => second.features.score - first.features.score || first.id.localeCompare(second.id));
    const outlines = candidates.filter((candidate) => !candidate.part);
    const parts = candidates.filter((candidate) => candidate.part);
    const best = outlines[0];
    const second = outlines[1];
    const bestPart = parts[0];
    let decision = 'NO_MATCH';
    let reason = 'no-candidate-above-probable-threshold';
    if (best?.features.score >= activePolicy.probableScore) {
      if (second?.features.score >= activePolicy.probableScore && best.features.score - second.features.score <= activePolicy.ambiguityDelta) {
        decision = 'AMBIGUOUS';
        reason = 'multiple-similar-candidates';
      } else if (best.features.score >= activePolicy.matchScore && best.features.iou >= activePolicy.minimumAutomaticMatchIou) {
        decision = 'MATCH';
        reason = 'validated-geometry-and-semantic-threshold';
      } else {
        decision = 'PROBABLE';
        reason = 'supporting-evidence-below-auto-merge-threshold';
      }
    } else if (bestPart?.features.iou >= activePolicy.partIou) {
      decision = 'BUILDING_PART';
      reason = 'explicit-building-part-with-spatial-support';
    }
    decisions.push({
      sourceId: left.id,
      decision,
      matchedId: decision === 'MATCH' ? best.id : null,
      relatedIds: decision === 'BUILDING_PART' && bestPart ? [bestPart.id] : [],
      reason,
      candidates: candidates.slice(0, 5).map(({ part, ...candidate }) => candidate)
    });
  }
  return deepFreeze({
    matcherVersion: 2,
    policy: activePolicy,
    decisions: decisions.sort((first, second) => first.sourceId.localeCompare(second.sourceId)),
    counts: Object.fromEntries(['MATCH', 'PROBABLE', 'AMBIGUOUS', 'NO_MATCH', 'BUILDING_PART'].map((value) => [value, decisions.filter((item) => item.decision === value).length]))
  });
}

export function reconcileBuildingRelationship(leftRecords = [], rightRecords = [], policy = {}) {
  const activePolicy = { ...DEFAULT_BUILDING_MATCH_POLICY, ...policy, matcherVersion: 2 };
  if (leftRecords.length === 1 && rightRecords.length <= 1) {
    const pairwise = reconcileBuildings(leftRecords, rightRecords, activePolicy);
    return deepFreeze({
      matcherVersion: 2,
      decision: pairwise.decisions[0]?.decision || 'NO_MATCH',
      reason: pairwise.decisions[0]?.reason || 'no-candidate',
      groupedIou: groupedIou(leftRecords, rightRecords),
      leftIds: leftRecords.map((record) => record.id).sort(),
      rightIds: rightRecords.map((record) => record.id).sort(),
      pairwise
    });
  }
  const overlap = groupedIou(leftRecords, rightRecords);
  let decision = overlap > 0 ? 'AMBIGUOUS' : 'NO_MATCH';
  let reason = overlap > 0 ? 'complex-overlap-below-cardinality-threshold' : 'no-group-overlap';
  if (overlap >= activePolicy.cardinalityIou && leftRecords.length > 1 && rightRecords.length === 1) {
    decision = 'MANY_TO_ONE';
    reason = 'left-group-union-corresponds-to-right-outline';
  } else if (rightRecords.length > 0 && rightRecords.every(isBuildingPart) && overlap >= activePolicy.partIou) {
    decision = 'BUILDING_PART';
    reason = 'explicit-building-part-group-with-spatial-support';
  } else if (overlap >= activePolicy.cardinalityIou && leftRecords.length === 1 && rightRecords.length > 1) {
    decision = 'ONE_TO_MANY';
    reason = 'right-group-union-corresponds-to-left-outline';
  }
  return deepFreeze({
    matcherVersion: 2,
    decision,
    reason,
    groupedIou: overlap,
    leftIds: leftRecords.map((record) => record.id).sort(),
    rightIds: rightRecords.map((record) => record.id).sort(),
    policy: { cardinalityIou: activePolicy.cardinalityIou, partIou: activePolicy.partIou }
  });
}
