#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { diffSnapshots, inspectEntity, reconcileEntities, synthesize, toCanonicalJson, toFlatGeobuf, toGeoJson, toProvJson } from '../src/index.js';
import { loadWorkflowConfig } from '../src/node/index.js';

const packageMetadata = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

function help() {
  return `Geospatial World Synthesis ${packageMetadata.version}

Usage:
  gws synthesize <config.json|config.mjs> [--output <directory>]
  gws inspect <world.json> [--entity <canonical-id>]
  gws diff <before.json> <after.json> [--output <file>]
  gws reconcile <left-records.json> <right-records.json> [--output <file>]
  gws export <world.json> --format canonical|geojson|flatgeobuf|prov-json --output <file>
  gws --version
  gws --help`;
}

function option(values, name, fallback = '') {
  const index = values.indexOf(name);
  return index >= 0 ? values[index + 1] || fallback : fallback;
}

async function json(path) {
  return JSON.parse(await readFile(resolve(path), 'utf8'));
}

async function output(value, path) {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  if (!path) return console.log(text);
  const target = resolve(path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${text.trimEnd()}\n`);
  console.log(`Wrote ${target}`);
}

async function configuration(path) {
  if (/\.json$/i.test(path)) return loadWorkflowConfig(path);
  const configModule = await import(pathToFileURL(resolve(path)).href);
  const value = typeof configModule.default === 'function' ? await configModule.default() : configModule.default;
  if (!value || typeof value !== 'object') throw new TypeError('Config module must default-export a configuration object or function.');
  return value;
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
try {
  if (args[0] === 'synthesize' && args[1]) {
    const outputDirectory = resolve(option(args, '--output', 'output/cli'));
    const snapshot = await synthesize(await configuration(args[1]));
    await mkdir(outputDirectory, { recursive: true });
    await writeFile(resolve(outputDirectory, 'world.json'), `${toCanonicalJson(snapshot)}\n`);
    await writeFile(resolve(outputDirectory, 'world.geojson'), `${JSON.stringify(toGeoJson(snapshot), null, 2)}\n`);
    console.log(`Wrote ${snapshot.entities.length} entities and ${snapshot.claims.length} claims to ${outputDirectory}`);
  } else if (args[0] === 'inspect' && args[1]) {
    const snapshot = await json(args[1]);
    const entityId = option(args, '--entity');
    await output(entityId ? inspectEntity(snapshot, entityId) : {
      fingerprint: snapshot.fingerprint, entities: snapshot.entities.length, sourceRecords: snapshot.sourceRecords?.length || 0,
      claims: snapshot.claims.length, conflicts: snapshot.coverage?.unresolvedConflicts, providers: snapshot.providerSummary
    });
  } else if (args[0] === 'diff' && args[1] && args[2]) {
    await output(diffSnapshots(await json(args[1]), await json(args[2])), option(args, '--output'));
  } else if (args[0] === 'reconcile' && args[1] && args[2]) {
    const left = await json(args[1]);
    const right = await json(args[2]);
    await output(reconcileEntities(left.records || left, right.records || right), option(args, '--output'));
  } else if (args[0] === 'export' && args[1]) {
    const snapshot = await json(args[1]);
    const format = option(args, '--format');
    const target = option(args, '--output');
    if (!target || !['canonical', 'geojson', 'flatgeobuf', 'prov-json'].includes(format)) throw new TypeError('Export requires --format canonical|geojson|flatgeobuf|prov-json and --output <file>.');
    if (format === 'flatgeobuf') {
      const absoluteTarget = resolve(target);
      await mkdir(dirname(absoluteTarget), { recursive: true });
      await writeFile(absoluteTarget, toFlatGeobuf(snapshot));
      console.log(`Wrote ${absoluteTarget}`);
    } else await output(format === 'canonical' ? toCanonicalJson(snapshot, { pretty: true }) : format === 'prov-json' ? toProvJson(snapshot) : toGeoJson(snapshot), target);
  } else {
    throw new TypeError('Unknown or incomplete command. Run gws --help.');
  }
} catch (error) {
  console.error(error?.message || error);
  process.exit(1);
}
