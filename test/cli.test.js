import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
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
