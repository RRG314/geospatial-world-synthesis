import { deepFreeze } from './stable.js';

export function attributionSummary(provenance = []) {
  const entries = new Map();
  for (const record of provenance) {
    const key = `${record.providerId}\u0000${record.datasetId}\u0000${record.licenseId}\u0000${record.attribution}`;
    if (!entries.has(key)) {
      entries.set(key, {
        providerId: record.providerId,
        datasetId: record.datasetId,
        operator: record.operator,
        licenseId: record.licenseId,
        attribution: record.attribution,
        sourceUrls: new Set(),
        sourceRecordCount: 0
      });
    }
    const entry = entries.get(key);
    entry.sourceRecordCount += 1;
    if (record.sourceUrl) entry.sourceUrls.add(record.sourceUrl);
  }
  return deepFreeze([...entries.values()].map((entry) => ({
    ...entry,
    sourceUrls: [...entry.sourceUrls].sort()
  })).sort((left, right) => `${left.providerId}:${left.datasetId}`.localeCompare(`${right.providerId}:${right.datasetId}`)));
}
