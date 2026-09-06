import { mkdir, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
import exampleConfiguration from '../examples/basic-local/config.mjs';
import { queryProvider, synthesize } from 'geospatial-world-synthesis';

const configuration = exampleConfiguration();
const providerResults = await Promise.all(configuration.providers.map((provider) => queryProvider(provider, { bounds: configuration.bounds }, configuration.limits)));
const snapshot = await synthesize(configuration);
await mkdir('viewer/data', { recursive: true });
await mkdir('viewer/dist', { recursive: true });
await writeFile('viewer/data/demo.json', `${JSON.stringify({ bounds: configuration.bounds, sourceRecords: providerResults.flatMap((result) => result.records), snapshot }, null, 2)}\n`);
await build({ entryPoints: ['viewer/app.js'], bundle: true, minify: true, outfile: 'viewer/dist/app.js', platform: 'browser', target: ['es2020'] });
console.log(`Built viewer for ${snapshot.entities.length} canonical entities (${snapshot.fingerprint.slice(0, 16)}).`);
