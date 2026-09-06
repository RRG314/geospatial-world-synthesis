import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
  createArcGisFeatureServiceProvider,
  createGeoJsonHttpProvider,
  createLocalFileProvider,
  createOgcApiFeaturesProvider,
  createOpenStreetMapMapProvider,
  createOpenStreetMapProvider
} from '../providers/index.js';
import { createOvertureMapsProvider } from './overture-maps.js';

const FACTORIES = Object.freeze({
  'arcgis-feature-service': createArcGisFeatureServiceProvider,
  'geojson-http': createGeoJsonHttpProvider,
  'local-file': createLocalFileProvider,
  'ogc-api-features': createOgcApiFeaturesProvider,
  'openstreetmap-map-api': createOpenStreetMapMapProvider,
  'overture-maps': createOvertureMapsProvider,
  openstreetmap: createOpenStreetMapProvider
});

function expandEnvironment(value) {
  if (Array.isArray(value)) return value.map(expandEnvironment);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, expandEnvironment(nested)]));
  if (typeof value !== 'string') return value;
  return value.replace(/\$\{([A-Z_][A-Z0-9_]*)\}/g, (_match, name) => {
    if (process.env[name] == null) throw new Error(`Configuration requires environment variable ${name}.`);
    return process.env[name];
  });
}

export async function loadWorkflowConfig(path) {
  const absolutePath = resolve(String(path || ''));
  if (!path) throw new TypeError('Configuration path is required.');
  let document;
  try { document = JSON.parse(await readFile(absolutePath, 'utf8')); } catch (error) { throw new SyntaxError(`Invalid workflow JSON: ${error.message}`); }
  const expanded = expandEnvironment(document);
  if (!Array.isArray(expanded.providers) || !expanded.providers.length) throw new TypeError('Workflow configuration requires a providers array.');
  const providers = expanded.providers.map((entry, index) => {
    const factory = FACTORIES[entry.type];
    if (!factory) throw new TypeError(`Unknown provider type at providers[${index}]: ${entry.type}.`);
    const config = { ...entry };
    delete config.type;
    if (entry.type === 'local-file') config.path = resolve(dirname(absolutePath), config.path);
    return factory(config);
  });
  return { ...expanded, providers };
}

export const WORKFLOW_PROVIDER_TYPES = Object.freeze(Object.keys(FACTORIES));
