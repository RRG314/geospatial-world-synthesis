import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { inspectEntity, synthesize, toCanonicalJson, toGeoJson } from 'geospatial-world-synthesis';
import exampleConfiguration from './config.mjs';

const outputDirectory = resolve('output/basic-local');
const snapshot = await synthesize(exampleConfiguration());
const building = snapshot.entities.find((entity) => entity.type === 'building');
const inspection = inspectEntity(snapshot, building.id);

await mkdir(outputDirectory, { recursive: true });
await writeFile(resolve(outputDirectory, 'world.json'), `${toCanonicalJson(snapshot)}\n`);
await writeFile(resolve(outputDirectory, 'world.geojson'), `${JSON.stringify(toGeoJson(snapshot), null, 2)}\n`);

console.log(JSON.stringify({
  fingerprint: snapshot.fingerprint,
  entities: snapshot.entities.length,
  claims: snapshot.claims.length,
  conflicts: snapshot.coverage.unresolvedConflicts,
  providers: snapshot.providerSummary.map(({ providerId, status, recordCount }) => ({ providerId, status, recordCount })),
  inspectedBuilding: {
    id: building.id,
    aliases: building.aliases,
    heightClaims: inspection.claims.filter((claim) => claim.property === 'height').map(({ value, evidenceClass, provenanceId }) => ({ value, evidenceClass, provenanceId }))
  },
  outputs: ['output/basic-local/world.json', 'output/basic-local/world.geojson']
}, null, 2));
