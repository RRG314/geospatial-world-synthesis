import { access, readFile } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { parse } from 'yaml';
import Ajv2020 from 'ajv/dist/2020.js';
import * as api from 'geospatial-world-synthesis';
import * as providers from 'geospatial-world-synthesis/providers';
import exampleConfiguration from '../examples/basic-local/config.mjs';

const markdownFiles = ['README.md', 'ACKNOWLEDGEMENTS.md', 'CHANGELOG.md', 'CODE_OF_CONDUCT.md', 'CONTRIBUTING.md', 'ROADMAP.md', 'SECURITY.md', 'THIRD_PARTY_NOTICES.md', 'VALIDATION.md', 'docs/api.md', 'docs/architecture.md', 'docs/providers.md'];
const failures = [];
for (const file of markdownFiles) {
  const text = await readFile(file, 'utf8');
  const links = [...text.matchAll(/!??\[[^\]]*\]\(([^)]+)\)/g)].map((match) => match[1].split(/\s+['"]/)[0]);
  for (const link of links) {
    if (/^(?:https?:|mailto:|#)/.test(link)) continue;
    const [path] = decodeURIComponent(link).split('#');
    if (!path) continue;
    try { await access(resolve(dirname(file), path)); } catch { failures.push(`${file}: missing ${link}`); }
  }
}

const requiredApi = [
  'synthesize', 'synthesizeWorld', 'defineProvider', 'createLocalProvider', 'queryProvider', 'inspectEntity',
  'reconcileBuildings', 'reconcileBuildingRelationship', 'assessTemporalEvidence', 'resolveRepresentation',
  'validateGeometry', 'transformGeometry', 'toCanonicalJson', 'toGeoJson', 'SynthesisError', 'ProviderError'
];
const requiredProviders = ['createLocalProvider', 'createGeoJsonHttpProvider', 'createOgcApiFeaturesProvider', 'createArcGisFeatureServiceProvider'];
for (const name of requiredApi) if (!(name in api)) failures.push(`Missing public API export: ${name}`);
for (const name of requiredProviders) if (!(name in providers)) failures.push(`Missing provider export: ${name}`);

const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
const cff = parse(await readFile('CITATION.cff', 'utf8'));
if (cff['cff-version'] !== '1.2.0') failures.push('CITATION.cff must use CFF 1.2.0.');
if (cff.type !== 'software' || cff.version !== packageJson.version || cff.license !== packageJson.license) failures.push('Citation metadata does not match package metadata.');
if (!Array.isArray(cff.authors) || !cff.authors.length || !cff['repository-code']) failures.push('Citation author or repository is missing.');

const ajv = new Ajv2020({ strict: false });
const outputSchema = JSON.parse(await readFile('schemas/synthesis-result.schema.json', 'utf8'));
const sourceSchema = JSON.parse(await readFile('schemas/source-record.schema.json', 'utf8'));
const snapshot = await api.synthesize(exampleConfiguration());
if (!ajv.validate(outputSchema, snapshot)) failures.push(`Example output failed JSON Schema: ${ajv.errorsText()}`);
if (!ajv.validate(sourceSchema, { sourceId: 'example', entityType: 'poi', sourceCrs: 'OGC:CRS84', geometry: { type: 'Point', coordinates: [0, 0] }, properties: {} })) failures.push(`Source record failed JSON Schema: ${ajv.errorsText()}`);

const images = [...(await readFile('README.md', 'utf8')).matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map((match) => match[1]);
if (!images.length) failures.push('README has no project visual.');
for (const path of images) if (!['.png', '.svg', '.jpg', '.jpeg', '.webp'].includes(extname(path).toLowerCase())) failures.push(`Unsupported README image format: ${path}`);

if (failures.length) throw new Error(failures.join('\n'));
console.log(`Validated ${markdownFiles.length} documents, ${requiredApi.length + requiredProviders.length} public exports, ${images.length} README visual, CFF metadata, and both JSON Schemas.`);
