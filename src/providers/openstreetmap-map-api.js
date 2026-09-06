import { XMLParser } from 'fast-xml-parser';
import { defineProvider } from '../provider.js';
import { httpUrl, readBoundedText } from './http.js';

const CAPABILITIES = ['address', 'building', 'landuse', 'poi', 'road', 'water'];

function values(value) {
  return value == null ? [] : Array.isArray(value) ? value : [value];
}

function tags(element) {
  return Object.fromEntries(values(element.tag).filter((tag) => tag?.k).map((tag) => [tag.k, String(tag.v ?? '')]));
}

function classify(properties) {
  if (properties.building && properties.building !== 'no') return 'building';
  if (properties.highway) return 'road';
  if (properties['addr:housenumber']) return 'address';
  if (properties.amenity || properties.shop || properties.tourism || properties.leisure || properties.office || properties.craft) return 'poi';
  if (properties.landuse) return 'landuse';
  if (properties.natural === 'water' || properties.waterway) return 'water';
  return '';
}

function address(properties) {
  return properties['addr:full'] || [properties['addr:housenumber'], properties['addr:street'], properties['addr:city'], properties['addr:postcode']].filter(Boolean).join(' ');
}

function publicProperties(source, map = {}) {
  const defaults = {
    name: source.name,
    type: source.building || source.amenity || source.shop || source.tourism || source.landuse || source.waterway,
    category: source.amenity || source.shop || source.tourism || source.leisure || source.office || source.craft,
    class: source.highway,
    address: address(source),
    height: source.height,
    levels: source['building:levels'],
    roofShape: source['roof:shape'],
    reference: source.ref
  };
  const mapped = Object.fromEntries(Object.entries(map).flatMap(([tag, property]) => source[tag] == null ? [] : [[property, source[tag]]]));
  return Object.fromEntries(Object.entries({ ...defaults, ...mapped }).filter(([, value]) => value !== undefined && value !== ''));
}

function wayGeometry(way, nodes, entityType, sourceTags) {
  const coordinates = values(way.nd).map((item) => nodes.get(String(item.ref))).filter(Boolean);
  if (coordinates.length < 2) return { geometry: null, warnings: ['incomplete-way-node-references'] };
  const closed = coordinates.length >= 4 && coordinates[0][0] === coordinates.at(-1)[0] && coordinates[0][1] === coordinates.at(-1)[1];
  const polygonal = closed && (['building', 'landuse'].includes(entityType) || entityType === 'water' && sourceTags.natural === 'water');
  if (polygonal) return { geometry: { type: 'Polygon', coordinates: [coordinates] }, warnings: [] };
  if (['poi', 'address'].includes(entityType)) {
    const bbox = coordinates.reduce((box, [x, y]) => [Math.min(box[0], x), Math.min(box[1], y), Math.max(box[2], x), Math.max(box[3], y)], [Infinity, Infinity, -Infinity, -Infinity]);
    return { geometry: { type: 'Point', coordinates: [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2] }, warnings: ['way-bbox-center-used'] };
  }
  return { geometry: { type: 'LineString', coordinates }, warnings: closed ? ['closed-way-retained-as-line'] : [] };
}

export function createOpenStreetMapMapProvider(config = {}) {
  const fetchImpl = config.fetch || globalThis.fetch;
  const endpoint = String(config.endpoint || 'https://api.openstreetmap.org/api/0.6/map');
  const capabilities = [...new Set(config.capabilities || CAPABILITIES)];
  if (!config.id || typeof fetchImpl !== 'function') throw new TypeError('OpenStreetMap map provider requires id and fetch.');
  httpUrl(endpoint, 'OpenStreetMap API endpoint');
  if (!capabilities.length || capabilities.some((type) => !CAPABILITIES.includes(type))) throw new TypeError(`OpenStreetMap capabilities must be selected from: ${CAPABILITIES.join(', ')}.`);
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
      const [west, south, east, north] = request.bounds;
      if ((east - west) * (north - south) > Math.max(0.000001, Number(config.maxBboxAreaDegrees2) || 0.25)) throw new RangeError('OpenStreetMap map API request exceeds the configured bbox area limit.');
      const url = new URL(endpoint);
      url.searchParams.set('bbox', `${west},${south},${east},${north}`);
      const response = await fetchImpl(url, { signal: options.signal, headers: { Accept: 'application/xml', 'User-Agent': 'geospatial-world-synthesis/0.x (+https://github.com/RRG314/geospatial-world-synthesis)', ...(config.headers || {}) } });
      const text = await readBoundedText(response, config.maxResponseBytes || 50 * 1024 * 1024);
      if (!response.ok) throw new Error(`OpenStreetMap API HTTP ${response.status}: ${text.slice(0, 160)}`);
      let document;
      try {
        document = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '', processEntities: false, isArray: (name) => ['node', 'way', 'relation', 'nd', 'tag'].includes(name) }).parse(text);
      } catch (error) { throw new SyntaxError(`Invalid OpenStreetMap XML: ${error.message}`); }
      if (!document?.osm) throw new SyntaxError('Invalid OpenStreetMap XML: osm root is missing.');
      const nodes = new Map(values(document.osm.node).filter((node) => Number.isFinite(Number(node.lon)) && Number.isFinite(Number(node.lat))).map((node) => [String(node.id), [Number(node.lon), Number(node.lat)]]));
      const requested = request.requestedCapabilities?.length ? capabilities.filter((type) => request.requestedCapabilities.includes(type)) : capabilities;
      const records = [];
      for (const [kind, elements] of [['node', values(document.osm.node)], ['way', values(document.osm.way)]]) {
        for (const element of elements) {
          const sourceTags = tags(element);
          const entityType = classify(sourceTags);
          if (!requested.includes(entityType)) continue;
          const converted = kind === 'node'
            ? { geometry: { type: 'Point', coordinates: nodes.get(String(element.id)) }, warnings: [] }
            : wayGeometry(element, nodes, entityType, sourceTags);
          if (!converted.geometry) continue;
          records.push({
            sourceId: `${kind}/${element.id}`,
            entityType,
            sourceCrs: 'OGC:CRS84',
            geometry: converted.geometry,
            properties: publicProperties(sourceTags, config.tagMap),
            aliases: [{ namespace: 'openstreetmap', id: `${kind}/${element.id}` }],
            sourceUrl: `https://www.openstreetmap.org/${kind}/${element.id}`,
            sourceUpdatedAt: element.timestamp,
            evidenceClass: 'DIRECT_SOURCE',
            warnings: converted.warnings
          });
        }
      }
      const relationCount = values(document.osm.relation).length;
      return {
        status: records.length ? 'available' : 'authoritative-empty',
        records,
        coverage: request.bounds,
        sourceUrl: url.toString(),
        warnings: relationCount ? [`relation-geometry-not-reconstructed:${relationCount}`] : [],
        metrics: { requestCount: 1, transferredBytes: new TextEncoder().encode(text).length, fromCache: false }
      };
    }
  });
}
