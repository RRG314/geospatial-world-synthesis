import assert from 'node:assert/strict';
import { defineProvider, synthesize } from 'geospatial-world-synthesis';

const customProvider = defineProvider({
  id: 'my-local-catalog',
  datasetId: 'example-catalog',
  datasetVersion: '1',
  operator: 'Example author',
  licenseId: 'CC0-1.0',
  attribution: 'Fictional example data — CC0-1.0',
  capabilities: ['poi'],
  sourceCrs: 'OGC:CRS84',
  query: async ({ bounds }) => ({
    status: 'available',
    coverage: bounds,
    records: [{
      sourceId: 'place-1', entityType: 'poi', sourceCrs: 'OGC:CRS84',
      geometry: { type: 'Point', coordinates: [-76.612, 39.2905] },
      properties: { name: 'Example Place', category: 'workshop' }, evidenceClass: 'DIRECT_SOURCE'
    }],
    metrics: { requestCount: 0, transferredBytes: 0, fromCache: true }
  })
});

const snapshot = await synthesize({ bounds: [-76.613, 39.290, -76.611, 39.292], providers: [customProvider] });
assert.equal(snapshot.entities[0].resolved.name, 'Example Place');
console.log(JSON.stringify({ provider: snapshot.providerSummary[0], entity: snapshot.entities[0] }, null, 2));
