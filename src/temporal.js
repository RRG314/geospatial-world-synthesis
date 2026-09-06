import { deepFreeze } from './stable.js';

export const TEMPORAL_STATUSES = Object.freeze([
  'CURRENT', 'STALE', 'SUPERSEDED', 'POSSIBLE_CHANGE', 'DELETED_SOURCE_RECORD', 'UNRESOLVED_TEMPORAL_CONFLICT'
]);

function instant(value) {
  const timestamp = Date.parse(value || '');
  return Number.isFinite(timestamp) ? timestamp : null;
}

function materialConflict(left, right) {
  if (left.deleted !== right.deleted) return true;
  if (left.fingerprint && right.fingerprint) return left.fingerprint !== right.fingerprint;
  return JSON.stringify(left.value) !== JSON.stringify(right.value);
}

export function assessTemporalEvidence(observations = [], options = {}) {
  const now = instant(options.now) ?? Date.now();
  const staleAfterMs = Math.max(0, Number(options.staleAfterMs) || 0);
  const normalized = observations.map((observation, index) => ({
    ...observation,
    id: String(observation.id || `observation-${index + 1}`),
    lineageId: String(observation.lineageId || ''),
    providerId: String(observation.providerId || ''),
    revision: Number.isFinite(Number(observation.revision)) ? Number(observation.revision) : null,
    observedAtMs: instant(observation.observedAt || observation.sourceUpdatedAt || observation.validFrom),
    deleted: observation.deleted === true
  }));
  const statusById = new Map(normalized.map((observation) => [observation.id, 'CURRENT']));
  const lineages = new Map();
  for (const observation of normalized.filter((item) => item.lineageId)) {
    lineages.set(observation.lineageId, [...(lineages.get(observation.lineageId) || []), observation]);
  }
  for (const lineage of lineages.values()) {
    const ordered = lineage.slice().sort((left, right) =>
      (left.revision ?? -1) - (right.revision ?? -1) ||
      (left.observedAtMs ?? -1) - (right.observedAtMs ?? -1) ||
      left.id.localeCompare(right.id));
    const latest = ordered.at(-1);
    ordered.slice(0, -1).forEach((item) => statusById.set(item.id, 'SUPERSEDED'));
    statusById.set(latest.id, latest.deleted ? 'DELETED_SOURCE_RECORD' : 'CURRENT');
  }
  const active = normalized.filter((item) => !['SUPERSEDED', 'DELETED_SOURCE_RECORD'].includes(statusById.get(item.id)));
  for (let leftIndex = 0; leftIndex < active.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < active.length; rightIndex += 1) {
      const left = active[leftIndex];
      const right = active[rightIndex];
      const sameExplicitLineage = Boolean(left.lineageId && right.lineageId && left.lineageId === right.lineageId);
      if (!sameExplicitLineage && materialConflict(left, right)) {
        statusById.set(left.id, 'UNRESOLVED_TEMPORAL_CONFLICT');
        statusById.set(right.id, 'UNRESOLVED_TEMPORAL_CONFLICT');
      }
    }
  }
  for (const observation of normalized) {
    if (statusById.get(observation.id) !== 'CURRENT') continue;
    if (observation.possibleChange === true) statusById.set(observation.id, 'POSSIBLE_CHANGE');
    else if (staleAfterMs && observation.observedAtMs != null && now - observation.observedAtMs > staleAfterMs) statusById.set(observation.id, 'STALE');
  }
  return deepFreeze(normalized.map(({ observedAtMs, ...observation }) => ({
    ...observation,
    status: statusById.get(observation.id),
    reason: statusById.get(observation.id) === 'SUPERSEDED'
      ? 'A later revision exists in the same explicit source lineage.'
      : statusById.get(observation.id) === 'DELETED_SOURCE_RECORD'
        ? 'The latest explicit source revision is marked deleted; physical demolition is not asserted.'
        : statusById.get(observation.id) === 'UNRESOLVED_TEMPORAL_CONFLICT'
          ? 'Independent active evidence conflicts; retrieval order is not used to pick a winner.'
          : statusById.get(observation.id) === 'STALE'
            ? 'The observation exceeds the caller-supplied age policy; it is not asserted false.'
            : statusById.get(observation.id) === 'POSSIBLE_CHANGE'
              ? 'A change signal exists but does not prove construction, demolition, or replacement.'
              : 'Latest known non-deleted revision in its explicit source lineage.'
  })));
}
