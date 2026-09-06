import { defineProvider } from '../provider.js';
import { httpUrl, readBoundedText } from './http.js';

const DEFAULT_CAPABILITIES = ['address', 'building', 'landuse', 'poi', 'road', 'water'];
const QUERY_CLAUSES = {
  building: ['nwr["building"]'],
  poi: ['nwr["amenity"]', 'nwr["shop"]', 'nwr["tourism"]', 'nwr["leisure"]', 'nwr["office"]', 'nwr["craft"]'],
  address: ['nwr["addr:housenumber"]'],
  road: ['way["highway"]'],
  landuse: ['nwr["landuse"]'],
  water: ['nwr["natural"="water"]', 'way["waterway"]']
};

function classify(tags = {}) {
  if (tags.building && tags.building !== 'no') return 'building';
  if (tags.highway) return 'road';
  if (tags['addr:housenumber']) return 'address';
  if (tags.amenity || tags.shop || tags.tourism || tags.leisure || tags.office || tags.craft) return 'poi';
  if (tags.landuse) return 'landuse';
  if (tags.natural === 'water' || tags.waterway) return 'water';
  return '';
}

function geometryFor(element, entityType) {
  if (element.type === 'node' && Number.isFinite(element.lon) && Number.isFinite(element.lat)) {
    return { geometry: { type: 'Point', coordinates: [element.lon, element.lat] }, warnings: [] };
  }
  const coordinates = (element.geometry || []).map((point) => [point.lon, point.lat]).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  if (element.type === 'way' && coordinates.length >= 2) {
    const closed = coordinates.length >= 4 && coordinates[0][0] === coordinates.at(-1)[0] && coordinates[0][1] === coordinates.at(-1)[1];
    const polygonalWater = entityType === 'water' && element.tags?.natural === 'water';
    if (closed && (polygonalWater || entityType !== 'road' && entityType !== 'water')) return { geometry: { type: 'Polygon', coordinates: [coordinates] }, warnings: [] };
    return { geometry: { type: 'LineString', coordinates }, warnings: closed ? ['closed-way-retained-as-line'] : [] };
  }
  if (['poi', 'address'].includes(entityType) && Number.isFinite(element.center?.lon) && Number.isFinite(element.center?.lat)) {
    return { geometry: { type: 'Point', coordinates: [element.center.lon, element.center.lat] }, warnings: ['relation-or-way-center-used'] };
  }
  return { geometry: null, warnings: element.type === 'relation' ? ['relation-geometry-not-reconstructed'] : ['missing-element-geometry'] };
}

function address(tags) {
  if (tags['addr:full']) return tags['addr:full'];
  return [tags['addr:housenumber'], tags['addr:street'], tags['addr:city'], tags['addr:postcode']].filter(Boolean).join(' ');
}

function propertiesFor(tags = {}, entityType, tagMap = {}) {
  const defaults = {
    name: tags.name,
    type: tags.building || tags.amenity || tags.shop || tags.tourism || tags.landuse || tags.waterway,
    category: tags.amenity || tags.shop || tags.tourism || tags.leisure || tags.office || tags.craft,
    class: tags.highway,
    address: address(tags),
    height: tags.height,
    levels: tags['building:levels'],
    roofShape: tags['roof:shape'],
    reference: tags.ref
  };
  const mapped = Object.fromEntries(Object.entries(tagMap).flatMap(([tag, property]) => tags[tag] == null ? [] : [[property, tags[tag]]]));
  return Object.fromEntries(Object.entries({ ...defaults, ...mapped }).filter(([, value]) => value !== undefined && value !== ''));
}

function buildQuery(bounds, capabilities, timeoutSeconds, maxSizeBytes) {
  const [west, south, east, north] = bounds;
  const bbox = `(${south},${west},${north},${east})`;
  const clauses = [...new Set(capabilities.flatMap((type) => QUERY_CLAUSES[type] || []))].map((clause) => `  ${clause}${bbox};`).join('\n');
  return `[out:json][timeout:${timeoutSeconds}][maxsize:${maxSizeBytes}];\n(\n${clauses}\n);\nout tags center geom qt;`;
}

export function createOpenStreetMapProvider(config = {}) {
  const fetchImpl = config.fetch || globalThis.fetch;
  const endpoint = String(config.endpoint || 'https://overpass-api.de/api/interpreter');
  const capabilities = [...new Set(config.capabilities || DEFAULT_CAPABILITIES)];
  if (!config.id || typeof fetchImpl !== 'function') throw new TypeError('OpenStreetMap provider requires id and fetch.');
  httpUrl(endpoint, 'Overpass endpoint');
  if (!capabilities.length || capabilities.some((type) => !DEFAULT_CAPABILITIES.includes(type))) {
    throw new TypeError(`OpenStreetMap capabilities must be selected from: ${DEFAULT_CAPABILITIES.join(', ')}.`);
  }
  const timeoutSeconds = Math.min(180, Math.max(5, Number(config.queryTimeoutSeconds) || 25));
  const maxSizeBytes = Math.min(256 * 1024 * 1024, Math.max(1024 * 1024, Number(config.queryMaxSizeBytes) || 64 * 1024 * 1024));
  return defineProvider({
    id: config.id,
    datasetId: config.datasetId || 'openstreetmap',
    datasetVersion: config.datasetVersion || 'live',
    operator: config.operator || 'OpenStreetMap contributors',
    licenseId: 'ODbL-1.0',
    attribution: config.attribution || '© OpenStreetMap contributors',
    homepage: config.homepage || 'https://www.openstreetmap.org/copyright',
    capabilities,
    queryModes: ['bbox'],
    sourceCrs: 'OGC:CRS84',
    query: async (request, options = {}) => {
      const requested = request.requestedCapabilities?.length
        ? capabilities.filter((type) => request.requestedCapabilities.includes(type))
        : capabilities;
      const query = buildQuery(request.bounds, requested, timeoutSeconds, maxSizeBytes);
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        signal: options.signal,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
          'User-Agent': 'geospatial-world-synthesis/0.x (+https://github.com/RRG314/geospatial-world-synthesis)',
          ...(config.headers || {})
        },
        body: new URLSearchParams({ data: query })
      });
      const text = await readBoundedText(response, config.maxResponseBytes);
      if (!response.ok) throw new Error(`Overpass HTTP ${response.status}: ${text.slice(0, 160)}`);
      let payload;
      try { payload = JSON.parse(text); } catch (error) { throw new SyntaxError(`Invalid JSON response: ${error.message}`); }
      if (payload.remark && /runtime error|timed? out|rate.?limit|too many requests/i.test(payload.remark)) throw new Error(`Overpass runtime error: ${payload.remark}`);
      if (!Array.isArray(payload.elements)) throw new SyntaxError('Invalid Overpass response: elements array is missing.');
      const seen = new Set();
      let skipped = 0;
      const records = [];
      for (const element of payload.elements) {
        const sourceId = `${element.type}/${element.id}`;
        if (seen.has(sourceId)) continue;
        seen.add(sourceId);
        const entityType = classify(element.tags);
        if (!requested.includes(entityType)) continue;
        const converted = geometryFor(element, entityType);
        if (!converted.geometry && config.includeGeometryless !== true) { skipped += 1; continue; }
        records.push({
          sourceId,
          entityType,
          sourceCrs: 'OGC:CRS84',
          geometry: converted.geometry,
          properties: propertiesFor(element.tags, entityType, config.tagMap),
          aliases: [{ namespace: 'openstreetmap', id: sourceId }],
          sourceUrl: `https://www.openstreetmap.org/${element.type}/${element.id}`,
          sourceUpdatedAt: element.timestamp,
          evidenceClass: 'DIRECT_SOURCE',
          warnings: converted.warnings
        });
      }
      return {
        status: records.length ? 'available' : 'authoritative-empty',
        records,
        coverage: request.bounds,
        sourceUrl: endpoint,
        warnings: skipped ? [`unsupported-or-missing-geometry:${skipped}`] : [],
        metrics: { requestCount: 1, transferredBytes: new TextEncoder().encode(text).length, fromCache: false }
      };
    }
  });
}
