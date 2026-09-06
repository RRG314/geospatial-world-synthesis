import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { diffSnapshots } from '../diff.js';

function assertSnapshot(snapshot) {
  if (!snapshot?.fingerprint || !/^[a-f0-9]{64}$/.test(snapshot.fingerprint)) throw new TypeError('Store requires a synthesis snapshot with a valid fingerprint.');
}

export function createJsonDirectoryStore(directory) {
  const root = resolve(String(directory || ''));
  if (!directory) throw new TypeError('JSON directory store requires a directory.');
  const pathFor = (fingerprint) => {
    if (!/^[a-f0-9]{64}$/.test(String(fingerprint))) throw new TypeError('Invalid snapshot fingerprint.');
    return resolve(root, `${fingerprint}.json`);
  };
  return Object.freeze({
    kind: 'json-directory',
    directory: root,
    async save(snapshot) {
      assertSnapshot(snapshot);
      await mkdir(root, { recursive: true });
      const target = pathFor(snapshot.fingerprint);
      const temporary = resolve(root, `.${snapshot.fingerprint}.${process.pid}.tmp`);
      await writeFile(temporary, `${JSON.stringify(snapshot)}\n`, { encoding: 'utf8', flag: 'wx' });
      await rename(temporary, target);
      const latestTemporary = resolve(root, `.latest.${process.pid}.tmp`);
      await writeFile(latestTemporary, `${snapshot.fingerprint}\n`, { encoding: 'utf8', flag: 'wx' });
      await rename(latestTemporary, resolve(root, 'latest'));
      return { fingerprint: snapshot.fingerprint, path: target };
    },
    async load(fingerprint) {
      let selected = fingerprint;
      if (!selected) {
        try { selected = (await readFile(resolve(root, 'latest'), 'utf8')).trim(); } catch (error) {
          if (error?.code === 'ENOENT') return null;
          throw error;
        }
      }
      return JSON.parse(await readFile(pathFor(selected), 'utf8'));
    },
    async list() {
      await mkdir(root, { recursive: true });
      return (await readdir(root)).filter((name) => /^[a-f0-9]{64}\.json$/.test(name)).map((name) => name.slice(0, -5)).sort();
    },
    async applyIncremental(before, after) {
      const diff = diffSnapshots(before, after);
      const stored = await this.save(after);
      return { ...stored, diff };
    }
  });
}
