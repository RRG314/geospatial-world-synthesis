import { mkdir, writeFile } from 'node:fs/promises';
import { synthesize, toCanonicalJson, toGeoJson } from 'geospatial-world-synthesis';
import exampleConfiguration from '../basic-local/config.mjs';

const output = new URL('../../output/export/', import.meta.url);
const snapshot = await synthesize(exampleConfiguration());
await mkdir(output, { recursive: true });
await writeFile(new URL('world.json', output), `${toCanonicalJson(snapshot)}\n`);
await writeFile(new URL('world.geojson', output), `${JSON.stringify(toGeoJson(snapshot), null, 2)}\n`);
console.log(`Exported canonical JSON and GeoJSON with fingerprint ${snapshot.fingerprint}.`);
