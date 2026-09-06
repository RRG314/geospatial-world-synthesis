import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);

test('CLI version matches package metadata', async () => {
  const [{ stdout }, packageText] = await Promise.all([
    exec(process.execPath, ['bin/gws.js', '--version']),
    readFile('package.json', 'utf8')
  ]);
  assert.equal(stdout.trim(), JSON.parse(packageText).version);
});

test('CLI synthesizes canonical JSON and GeoJSON', async () => {
  const output = await mkdtemp(resolve(tmpdir(), 'gws-cli-'));
  const { stdout } = await exec(process.execPath, ['bin/gws.js', 'synthesize', 'examples/basic-local/config.mjs', '--output', output]);
  assert.match(stdout, /Wrote 4 entities and 12 claims/);
  assert.equal(JSON.parse(await readFile(resolve(output, 'world.json'), 'utf8')).schemaVersion, 1);
  assert.equal(JSON.parse(await readFile(resolve(output, 'world.geojson'), 'utf8')).type, 'FeatureCollection');
});

test('CLI loads declarative JSON workflows and supports inspect, diff, reconcile, and export', async () => {
  const output = await mkdtemp(resolve(tmpdir(), 'gws-cli-workflow-'));
  await exec(process.execPath, ['bin/gws.js', 'synthesize', 'examples/config-workflow/workflow.json', '--output', output]);
  const worldPath = resolve(output, 'world.json');
  const { stdout: inspection } = await exec(process.execPath, ['bin/gws.js', 'inspect', worldPath]);
  assert.equal(JSON.parse(inspection).sourceRecords, 2);
  const diffPath = resolve(output, 'diff.json');
  await exec(process.execPath, ['bin/gws.js', 'diff', worldPath, worldPath, '--output', diffPath]);
  assert.equal(JSON.parse(await readFile(diffPath, 'utf8')).changed, false);
  const exported = resolve(output, 'export.geojson');
  await exec(process.execPath, ['bin/gws.js', 'export', worldPath, '--format', 'geojson', '--output', exported]);
  assert.equal(JSON.parse(await readFile(exported, 'utf8')).features.length, 2);
  const flatgeobuf = resolve(output, 'export.fgb');
  await exec(process.execPath, ['bin/gws.js', 'export', worldPath, '--format', 'flatgeobuf', '--output', flatgeobuf]);
  assert.ok((await readFile(flatgeobuf)).byteLength > 100);
  const prov = resolve(output, 'provenance.json');
  await exec(process.execPath, ['bin/gws.js', 'export', worldPath, '--format', 'prov-json', '--output', prov]);
  assert.ok(Object.keys(JSON.parse(await readFile(prov, 'utf8')).wasDerivedFrom).length > 0);
  const records = JSON.parse(await readFile(worldPath, 'utf8')).sourceRecords;
  const recordsPath = resolve(output, 'records.json');
  await writeFile(recordsPath, JSON.stringify(records));
  const { stdout: reconciliation } = await exec(process.execPath, ['bin/gws.js', 'reconcile', recordsPath, recordsPath]);
  assert.equal(JSON.parse(reconciliation).counts.MATCH, 2);
});
