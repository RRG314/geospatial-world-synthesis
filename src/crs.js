import proj4 from 'proj4';
import { deepFreeze } from './stable.js';

const definitions = new Map([
  ['OGC:CRS84', '+proj=longlat +datum=WGS84 +no_defs +type=crs'],
  ['EPSG:4326', '+proj=longlat +datum=WGS84 +no_defs +type=crs'],
  ['EPSG:3857', '+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +wktext +no_defs']
]);

definitions.forEach((definition, name) => proj4.defs(name, definition));

export function registerCrs(name, definition) {
  const id = String(name || '').trim().toUpperCase();
  if (!id || !definition) throw new TypeError('CRS registration requires a name and Proj4 definition.');
  definitions.set(id, definition);
  proj4.defs(id, definition);
  return id;
}

export function knownCrs(name) {
  return definitions.has(String(name || '').trim().toUpperCase());
}

function transformCoordinates(value, transformer, state, maxCoordinates) {
  if (!Array.isArray(value)) throw new TypeError('Geometry coordinates must be nested arrays.');
  if (typeof value[0] === 'number') {
    state.count += 1;
    if (state.count > maxCoordinates) throw new RangeError(`Geometry exceeds the ${maxCoordinates}-coordinate limit.`);
    if (value.length < 2 || !Number.isFinite(value[0]) || !Number.isFinite(value[1])) throw new TypeError('Coordinates must contain two finite numbers.');
    const [x, y] = transformer.forward([value[0], value[1]]);
    return value.length > 2 ? [x, y, ...value.slice(2)] : [x, y];
  }
  return value.map((part) => transformCoordinates(part, transformer, state, maxCoordinates));
}

export function transformGeometry(geometry, sourceCrs, outputCrs = 'OGC:CRS84', options = {}) {
  if (!geometry?.type || !Array.isArray(geometry.coordinates)) throw new TypeError('A GeoJSON geometry is required.');
  const source = String(sourceCrs || '').trim().toUpperCase();
  const output = String(outputCrs || '').trim().toUpperCase();
  if (!knownCrs(source)) throw new Error(`Unknown source CRS: ${source || 'missing'}. Register it with registerCrs() before synthesis.`);
  if (!knownCrs(output)) throw new Error(`Unknown output CRS: ${output || 'missing'}.`);
  const maxCoordinates = Math.max(1, Number(options.maxCoordinates) || 100000);
  const transformer = proj4(source, output);
  const transformed = {
    ...geometry,
    coordinates: transformCoordinates(geometry.coordinates, transformer, { count: 0 }, maxCoordinates)
  };
  return deepFreeze(transformed);
}

export function crsSnapshot() {
  return deepFreeze({ outputCrs: 'OGC:CRS84', outputAxisOrder: 'longitude-latitude', registered: [...definitions.keys()].sort() });
}
