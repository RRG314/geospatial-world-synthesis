import { execFile } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const { stdout } = await exec('npm', ['pack', '--json'], { maxBuffer: 10 * 1024 * 1024 });
const packed = JSON.parse(stdout)[0];
const archive = resolve(packed.filename);
const consumer = await mkdtemp(resolve(tmpdir(), 'gws-consumer-'));
await writeFile(resolve(consumer, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
await exec('npm', ['install', '--ignore-scripts', archive], { cwd: consumer, maxBuffer: 10 * 1024 * 1024 });
await writeFile(resolve(consumer, 'run.mjs'), `
import { createLocalProvider, synthesize, toGeoJson } from 'geospatial-world-synthesis';
import { createGeoJsonHttpProvider } from 'geospatial-world-synthesis/providers';
if (typeof createGeoJsonHttpProvider !== 'function') throw new Error('Provider subpath unavailable');
const provider = createLocalProvider({ id: 'outside', sourceCrs: 'OGC:CRS84', licenseId: 'CC0-1.0', records: [{ sourceId: '1', entityType: 'poi', geometry: { type: 'Point', coordinates: [0, 0] }, properties: { name: 'Outside consumer' } }] });
const result = await synthesize({ bounds: [-1, -1, 1, 1], providers: [provider] });
if (result.entities[0].resolved.name !== 'Outside consumer') throw new Error('Unexpected result');
if (toGeoJson(result).features.length !== 1) throw new Error('Unexpected export');
console.log(result.fingerprint);
`);
const result = await exec(process.execPath, ['run.mjs'], { cwd: consumer });
if (!/^[a-f0-9]{64}\n?$/.test(result.stdout)) throw new Error(`Unexpected consumer output: ${result.stdout}`);
const installed = JSON.parse(await readFile(resolve(consumer, 'node_modules/geospatial-world-synthesis/package.json'), 'utf8'));
console.log(`Installed ${installed.name}@${installed.version} into an external temporary project and used both export paths.`);
