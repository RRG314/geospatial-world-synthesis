import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { promisify } from 'node:util';
import { defineProvider } from '../provider.js';

const executeFile = promisify(execFile);
const DEFAULT_RELEASE = '2026-08-19.0';

function sourceAliases(sources, enabled) {
  if (!enabled) return [];
  const aliases = sources.flatMap((source) => {
    const recordId = String(source?.record_id || '');
    if (!recordId) return [];
    const osm = source?.dataset === 'OpenStreetMap' && /^([nwr])(\d+)@/.exec(recordId);
    if (osm) {
      const kind = { n: 'node', w: 'way', r: 'relation' }[osm[1]];
      return [{ namespace: 'openstreetmap', id: `${kind}/${osm[2]}` }];
    }
    return source?.dataset ? [{ namespace: `overture-source:${source.dataset}`, id: recordId }] : [];
  });
  return [...new Map(aliases.map((alias) => [`${alias.namespace}:${alias.id}`, alias])).values()];
}

function sourceUrl(sources) {
  for (const source of sources) {
    const osm = source?.dataset === 'OpenStreetMap' && /^([nwr])(\d+)@/.exec(String(source.record_id || ''));
    if (osm) return `https://www.openstreetmap.org/${{ n: 'node', w: 'way', r: 'relation' }[osm[1]]}/${osm[2]}`;
  }
  return 'https://docs.overturemaps.org/attribution/';
}

function featureRecord(feature, includeSourceAliases) {
  if (!feature || feature.type !== 'Feature' || feature.id == null) throw new SyntaxError('Overture building feature has no stable GERS ID.');
  const source = feature.properties || {};
  const sources = Array.isArray(source.sources) ? source.sources : [];
  const attributions = [...new Set([
    ...sources.map((item) => item?.dataset).filter(Boolean),
    'Overture Maps Foundation'
  ])];
  const sourceLicenses = [...new Set(sources.map((item) => item?.license).filter(Boolean))];
  const updated = sources.map((item) => item?.update_time).filter(Boolean).sort().at(-1);
  return {
    sourceId: String(feature.id),
    entityType: 'building',
    sourceCrs: 'OGC:CRS84',
    geometry: feature.geometry,
    properties: Object.fromEntries(Object.entries({
      name: source.names?.primary,
      height: source.height,
      levels: source.num_floors,
      type: source.subtype,
      class: source.class,
      upstreamSources: sources
    }).filter(([, value]) => value != null)),
    aliases: sourceAliases(sources, includeSourceAliases),
    gersId: String(feature.id),
    licenseId: sourceLicenses.length === 1 ? sourceLicenses[0] : 'ODbL-1.0',
    attribution: attributions.join('; '),
    sourceUrl: sourceUrl(sources),
    sourceUpdatedAt: updated,
    evidenceClass: 'DIRECT_SOURCE'
  };
}

async function defaultDownload(config, context) {
  const command = String(config.command || 'uvx');
  const prefix = config.commandArgs || (basename(command) === 'uvx' ? ['overturemaps'] : []);
  const args = [
    ...prefix,
    'download',
    `--bbox=${context.bounds.join(',')}`,
    '-f', 'geojson',
    '--type=building',
    '--release', context.release,
    '-o', context.outputPath
  ];
  await executeFile(command, args, {
    signal: context.signal,
    timeout: context.timeoutMs,
    maxBuffer: Math.max(1024 * 1024, Number(config.maxProcessOutputBytes) || 10 * 1024 * 1024)
  });
}

export function createOvertureMapsProvider(config = {}) {
  if (!config.id) throw new TypeError('Overture Maps provider requires id.');
  const release = String(config.release || DEFAULT_RELEASE);
  if (!/^\d{4}-\d{2}-\d{2}\.\d+$/.test(release)) throw new TypeError('Overture Maps release must be a pinned release identifier such as 2026-08-19.0.');
  const maxDownloadBytes = Math.max(1024, Number(config.maxDownloadBytes) || 500 * 1024 * 1024);
  const timeoutMs = Math.max(1000, Number(config.downloadTimeoutMs) || 120_000);
  const download = typeof config.download === 'function' ? config.download : (context) => defaultDownload(config, context);
  return defineProvider({
    id: config.id,
    datasetId: config.datasetId || 'overture-buildings',
    datasetVersion: release,
    operator: config.operator || 'Overture Maps Foundation',
    licenseId: 'ODbL-1.0',
    attribution: config.attribution || 'Overture Maps Foundation; see record-level upstream attribution',
    homepage: config.homepage || 'https://docs.overturemaps.org/attribution/',
    capabilities: ['building'],
    queryModes: ['bbox'],
    sourceCrs: 'OGC:CRS84',
    query: async (request, options = {}) => {
      const directory = await mkdtemp(join(tmpdir(), 'gws-overture-'));
      const outputPath = join(directory, 'buildings.geojson');
      try {
        await download({ bounds: request.bounds, release, type: 'building', outputPath, signal: options.signal, timeoutMs });
        const file = await stat(outputPath);
        if (file.size > maxDownloadBytes) throw new RangeError(`Overture download exceeds ${maxDownloadBytes} bytes.`);
        let document;
        try { document = JSON.parse(await readFile(outputPath, 'utf8')); } catch (error) {
          throw new SyntaxError(`Invalid Overture GeoJSON response: ${error.message}`);
        }
        if (document?.type !== 'FeatureCollection' || !Array.isArray(document.features)) throw new SyntaxError('Invalid Overture GeoJSON response: FeatureCollection is missing.');
        return {
          status: document.features.length ? 'available' : 'authoritative-empty',
          records: document.features.map((feature) => featureRecord(feature, config.includeSourceAliases !== false)),
          coverage: request.bounds,
          sourceUrl: `https://docs.overturemaps.org/getting-data/`,
          warnings: [],
          metrics: { requestCount: 1, transferredBytes: file.size, fromCache: false }
        };
      } catch (error) {
        if (String(error?.message || '').includes(directory)) error.message = String(error.message).replaceAll(directory, '[temporary-directory]');
        throw error;
      } finally {
        await rm(directory, { recursive: true, force: true }).catch(() => {});
      }
    }
  });
}
