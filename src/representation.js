import { deepFreeze } from './stable.js';

const CLASS_RANK = Object.freeze({ observed: 0, curated: 1, procedural: 2, synthetic: 3, none: 4 });

export function resolveRepresentation(entity, candidates = [], context = {}) {
  const evaluated = candidates.map((candidate) => {
    const reasons = [];
    if (candidate.entityId !== entity.id) reasons.push('different-entity');
    if (candidate.authorized === false) reasons.push('not-authorized');
    if (candidate.licensePermitsUse === false) reasons.push('license-does-not-permit-use');
    if (Number(candidate.minimumDeviceTier || 0) > Number(context.deviceTier || 2)) reasons.push('device-budget');
    if (Number(candidate.maxDistanceM || Infinity) < Number(context.distanceM || 0)) reasons.push('outside-lod-distance');
    if (candidate.available === false) reasons.push('unavailable');
    return { ...candidate, eligible: reasons.length === 0, rejectionReasons: reasons.sort() };
  }).sort((left, right) =>
    Number(!left.eligible) - Number(!right.eligible) ||
    (CLASS_RANK[left.class] ?? 99) - (CLASS_RANK[right.class] ?? 99) ||
    String(left.id).localeCompare(String(right.id)));
  const selected = evaluated.find((candidate) => candidate.eligible) || null;
  return deepFreeze({ entityId: entity.id, selectedId: selected?.id || null, selectedClass: selected?.class || 'none', candidates: evaluated });
}
