#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { synthesize, toCanonicalJson, toGeoJson } from '../src/index.js';

const packageMetadata = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

function help() {
  return `Geospatial World Synthesis ${packageMetadata.version}

Usage:
  gws synthesize <config.mjs> [--output <directory>]
  gws --version
  gws --help

The config module must default-export a function or object accepted by synthesize().
Example: gws synthesize examples/basic-local/config.mjs --output output/cli`;
}

const args = process.argv.slice(2);
if (args.includes('--help') || args.length === 0) {
  console.log(help());
  process.exit(0);
}
if (args.includes('--version')) {
  console.log(packageMetadata.version);
  process.exit(0);
}
if (args[0] !== 'synthesize' || !args[1]) {
  console.error('Expected: gws synthesize <config.mjs> [--output <directory>]');
  process.exit(2);
}

try {
  const outputOption = args.indexOf('--output');
  const outputDirectory = resolve(outputOption >= 0 && args[outputOption + 1] ? args[outputOption + 1] : 'output/cli');
  const configModule = await import(pathToFileURL(resolve(args[1])).href);
  const configuration = typeof configModule.default === 'function' ? await configModule.default() : configModule.default;
  if (!configuration || typeof configuration !== 'object') throw new TypeError('Config module must default-export a configuration object or function.');
  const snapshot = await synthesize(configuration);
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(resolve(outputDirectory, 'world.json'), `${toCanonicalJson(snapshot)}\n`);
  await writeFile(resolve(outputDirectory, 'world.geojson'), `${JSON.stringify(toGeoJson(snapshot), null, 2)}\n`);
  console.log(`Wrote ${snapshot.entities.length} entities and ${snapshot.claims.length} claims to ${outputDirectory}`);
} catch (error) {
  console.error(error?.message || error);
  process.exit(1);
}
