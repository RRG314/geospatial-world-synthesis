import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const { stdout } = await exec('npm', ['pack', '--dry-run', '--json'], { maxBuffer: 10 * 1024 * 1024 });
const manifest = JSON.parse(stdout)[0];
const paths = manifest.files.map((file) => file.path).sort();
const required = ['LICENSE', 'README.md', 'bin/gws.js', 'src/index.d.ts', 'src/index.js', 'src/providers/index.js', 'schemas/source-record.schema.json', 'schemas/synthesis-result.schema.json'];
for (const path of required) if (!paths.includes(path)) throw new Error(`Package is missing ${path}.`);
const forbidden = paths.filter((path) => /^(?:test|examples|viewer|docs|output|\.github)\//.test(path) || /(?:\.env|research|benchmark)/i.test(path));
if (forbidden.length) throw new Error(`Package includes non-runtime files: ${forbidden.join(', ')}`);
const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
if (packageJson.version !== '0.1.0' || packageJson.license !== 'MIT') throw new Error('Unexpected release metadata.');
console.log(`Package boundary valid: ${paths.length} files, ${manifest.size} packed bytes, ${manifest.unpackedSize} unpacked bytes.`);
