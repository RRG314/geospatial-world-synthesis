import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
import exampleConfiguration from '../examples/basic-local/config.mjs';
import { synthesize, toCanonicalJson, toFlatGeobuf, toGeoJson, toProvJson } from 'geospatial-world-synthesis';

const configuration = exampleConfiguration();
const snapshot = await synthesize(configuration);
await mkdir('viewer/data', { recursive: true });
await mkdir('viewer/dist', { recursive: true });
await mkdir('viewer/assets', { recursive: true });
await writeFile('viewer/data/demo.json', `${JSON.stringify({ bounds: configuration.bounds, sourceRecords: snapshot.sourceRecords, snapshot }, null, 2)}\n`);
await writeFile('viewer/data/world.json', `${toCanonicalJson(snapshot)}\n`);
await writeFile('viewer/data/world.geojson', `${JSON.stringify(toGeoJson(snapshot), null, 2)}\n`);
await writeFile('viewer/data/world.fgb', toFlatGeobuf(snapshot));
await writeFile('viewer/data/world.prov.json', `${JSON.stringify(toProvJson(snapshot), null, 2)}\n`);
await copyFile('docs/assets/social-preview.png', 'viewer/assets/social-preview.png');
await build({ entryPoints: ['viewer/app.js'], bundle: true, minify: true, outfile: 'viewer/dist/app.js', platform: 'browser', target: ['es2020'] });
console.log(`Built viewer for ${snapshot.entities.length} canonical entities (${snapshot.fingerprint.slice(0, 16)}).`);
