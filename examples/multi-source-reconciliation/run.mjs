import assert from 'node:assert/strict';
import { createLocalProvider, queryProvider, reconcileBuildings, synthesizeWorld } from 'geospatial-world-synthesis';

const rectangle = (west, south, east, north) => ({
  type: 'Polygon', coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]]
});
const bounds = [-76.62, 39.28, -76.60, 39.30];
const leftProvider = createLocalProvider({
  id: 'provider-a', sourceCrs: 'OGC:CRS84', licenseId: 'CC0-1.0', attribution: 'Fictional example data — CC0-1.0',
  records: [{ sourceId: 'a-1', entityType: 'building', geometry: rectangle(-76.6110, 39.2900, -76.6100, 39.2910), properties: { name: 'Depot' }, evidenceClass: 'DIRECT_SOURCE' }]
});
const rightProvider = createLocalProvider({
  id: 'provider-b', sourceCrs: 'OGC:CRS84', licenseId: 'CC0-1.0', attribution: 'Fictional example data — CC0-1.0',
  records: [
    { sourceId: 'b-1', entityType: 'building', geometry: rectangle(-76.6110, 39.2900, -76.6100, 39.2910), properties: { name: 'Depot' }, evidenceClass: 'DIRECT_SOURCE' },
    { sourceId: 'b-2', entityType: 'building', geometry: rectangle(-76.6110, 39.2900, -76.6100, 39.2910), properties: { name: 'Depot' }, evidenceClass: 'DIRECT_SOURCE' }
  ]
});
const [left, right] = await Promise.all([
  queryProvider(leftProvider, { bounds }),
  queryProvider(rightProvider, { bounds })
]);
const reconciliation = reconcileBuildings(left.records, right.records);
const snapshot = synthesizeWorld({ providerResults: [left, right], reconciliations: [reconciliation] });
assert.equal(reconciliation.decisions[0].decision, 'AMBIGUOUS');
assert.equal(snapshot.entities.length, 3);
console.log(JSON.stringify({ reconciliation: reconciliation.decisions[0], canonicalEntityCount: snapshot.entities.length }, null, 2));
