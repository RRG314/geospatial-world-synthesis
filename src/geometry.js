import polygonClipping from 'polygon-clipping';
import { deepFreeze } from './stable.js';

export const SUPPORTED_GEOMETRY_TYPES = Object.freeze([
  'Point', 'MultiPoint', 'LineString', 'MultiLineString', 'Polygon', 'MultiPolygon', 'GeometryCollection'
]);

function visitCoordinates(value, callback) {
  if (Array.isArray(value) && typeof value[0] === 'number') return callback(value);
  if (!Array.isArray(value)) throw new TypeError('Geometry coordinates must be nested arrays.');
  value.forEach((part) => visitCoordinates(part, callback));
}

function visitGeometryCoordinates(geometry, callback) {
  if (geometry?.type === 'GeometryCollection') return (geometry.geometries || []).forEach((part) => visitGeometryCoordinates(part, callback));
  return visitCoordinates(geometry?.coordinates, callback);
}

function orientation(a, b, c) {
  const value = (b[1] - a[1]) * (c[0] - b[0]) - (b[0] - a[0]) * (c[1] - b[1]);
  return Math.abs(value) < 1e-12 ? 0 : Math.sign(value);
}

function onSegment(a, b, c) {
  return b[0] <= Math.max(a[0], c[0]) && b[0] >= Math.min(a[0], c[0]) && b[1] <= Math.max(a[1], c[1]) && b[1] >= Math.min(a[1], c[1]);
}

function segmentsIntersect(a, b, c, d) {
  const values = [orientation(a, b, c), orientation(a, b, d), orientation(c, d, a), orientation(c, d, b)];
  if (values[0] !== values[1] && values[2] !== values[3]) return true;
  return (values[0] === 0 && onSegment(a, c, b)) || (values[1] === 0 && onSegment(a, d, b)) ||
    (values[2] === 0 && onSegment(c, a, d)) || (values[3] === 0 && onSegment(c, b, d));
}

function ringSelfIntersects(ring) {
  for (let first = 0; first < ring.length - 1; first += 1) {
    for (let second = first + 1; second < ring.length - 1; second += 1) {
      if (Math.abs(first - second) <= 1 || first === 0 && second === ring.length - 2) continue;
      if (segmentsIntersect(ring[first], ring[first + 1], ring[second], ring[second + 1])) return true;
    }
  }
  return false;
}

function pointInRing(point, ring) {
  let inside = false;
  for (let current = 0, previous = ring.length - 1; current < ring.length; previous = current++) {
    const [x1, y1] = ring[current];
    const [x2, y2] = ring[previous];
    if ((y1 > point[1]) !== (y2 > point[1]) && point[0] < (x2 - x1) * (point[1] - y1) / (y2 - y1) + x1) inside = !inside;
  }
  return inside;
}

function geometryShapeWarnings(geometry) {
  const warnings = [];
  if (geometry.type === 'Point' && typeof geometry.coordinates[0] !== 'number') warnings.push('invalid-point-shape');
  if (geometry.type === 'MultiPoint' && geometry.coordinates.some((position) => typeof position?.[0] !== 'number')) warnings.push('invalid-multipoint-shape');
  if (geometry.type === 'LineString' && geometry.coordinates.length < 2) warnings.push('linestring-too-short');
  if (geometry.type === 'MultiLineString' && geometry.coordinates.some((line) => !Array.isArray(line) || line.length < 2)) warnings.push('multilinestring-part-too-short');
  if (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon') {
    const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    if (!polygons.length) warnings.push('empty-polygon');
    polygons.forEach((polygon) => {
      if (!Array.isArray(polygon) || !polygon.length) warnings.push('polygon-without-rings');
      (polygon || []).forEach((ring) => {
        if (!Array.isArray(ring) || ring.length < 4) warnings.push('polygon-ring-too-short');
        else if (ring[0][0] !== ring.at(-1)[0] || ring[0][1] !== ring.at(-1)[1]) warnings.push('polygon-ring-not-closed');
        else if (ringSelfIntersects(ring)) warnings.push('polygon-ring-self-intersection');
      });
      if (polygon?.[0]?.length >= 4) polygon.slice(1).forEach((hole) => {
        if (hole?.[0] && !pointInRing(hole[0], polygon[0])) warnings.push('polygon-hole-outside-shell');
      });
    });
  }
  if (geometry.type === 'GeometryCollection' && (!Array.isArray(geometry.geometries) || !geometry.geometries.length)) warnings.push('empty-geometry-collection');
  return warnings;
}

export function validateGeometry(geometry, options = {}) {
  const warnings = [];
  const maxCoordinates = Math.max(1, Number(options.maxCoordinates) ||  100000);
  if (!geometry || typeof geometry.type !== 'string' || geometry.type !== 'GeometryCollection' && !Array.isArray(geometry.coordinates)) {
    return deepFreeze({ valid: false, coordinateCount: 0, warnings: ['missing-or-invalid-geometry'] });
  }
  if (!SUPPORTED_GEOMETRY_TYPES.includes(geometry.type)) {
    return deepFreeze({ valid: false, coordinateCount: 0, warnings: [`unsupported-geometry-type:${geometry.type}`] });
  }
  if (geometry.type === 'GeometryCollection') {
    if (!Array.isArray(geometry.geometries)) return deepFreeze({ valid: false, coordinateCount: 0, warnings: ['invalid-geometry-collection'] });
    const parts = geometry.geometries.map((part) => validateGeometry(part, { maxCoordinates }));
    const coordinateCount = parts.reduce((sum, part) => sum + part.coordinateCount, 0);
    const partWarnings = parts.flatMap((part) => part.warnings);
    const errors = [...geometryShapeWarnings(geometry), ...(parts.some((part) => !part.valid) ? ['invalid-geometry-collection-member'] : []), ...(coordinateCount > maxCoordinates ? ['geometry-coordinate-limit-exceeded'] : [])];
    return deepFreeze({ valid: errors.length === 0, coordinateCount, warnings: [...new Set([...partWarnings, ...errors])].sort() });
  }
  warnings.push(...geometryShapeWarnings(geometry));
  let coordinateCount = 0;
  try {
    visitCoordinates(geometry.coordinates, (position) => {
      coordinateCount += 1;
      if (coordinateCount > maxCoordinates) throw new Error('geometry-coordinate-limit-exceeded');
      if (position.length < 2 || !Number.isFinite(position[0]) || !Number.isFinite(position[1])) throw new Error('non-finite-coordinate');
      if (position[0] < -180 || position[0] > 180 || position[1] < -90 || position[1] > 90) throw new Error('coordinate-outside-crs84');
    });
  } catch (error) {
    warnings.push(error.message);
  }
  let antimeridian = false;
  try {
    const check = (value) => {
      if (!Array.isArray(value) || typeof value[0] === 'number') return;
      if (value.length >= 2 && value.every((position) => Array.isArray(position) && typeof position[0] === 'number')) {
        for (let index = 1; index < value.length; index += 1) if (Math.abs(value[index][0] - value[index - 1][0]) > 180) antimeridian = true;
      } else value.forEach(check);
    };
    check(geometry.coordinates);
  } catch {}
  const nonFatalWarnings = antimeridian ? ['antimeridian-crossing-not-cut'] : [];
  if (coordinateCount === 0) warnings.push('empty-geometry');
  return deepFreeze({ valid: warnings.length === 0, coordinateCount, warnings: [...new Set([...warnings, ...nonFatalWarnings])].sort() });
}

export function geometryBbox(geometry) {
  const bbox = [Infinity, Infinity, -Infinity, -Infinity];
  visitGeometryCoordinates(geometry, ([x, y]) => {
    bbox[0] = Math.min(bbox[0], x);
    bbox[1] = Math.min(bbox[1], y);
    bbox[2] = Math.max(bbox[2], x);
    bbox[3] = Math.max(bbox[3], y);
  });
  return bbox;
}

function ringArea(ring) {
  let total = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    total += ring[index][0] * ring[index + 1][1] - ring[index + 1][0] * ring[index][1];
  }
  return Math.abs(total / 2);
}

function polygonArea(polygon) {
  return Math.max(0, ringArea(polygon[0] || []) - polygon.slice(1).reduce((sum, ring) => sum + ringArea(ring), 0));
}

export function geometryArea(geometry) {
  if (geometry.type === 'Polygon') return polygonArea(geometry.coordinates);
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.reduce((sum, polygon) => sum + polygonArea(polygon), 0);
  if (geometry.type === 'GeometryCollection') return geometry.geometries.reduce((sum, part) => sum + geometryArea(part), 0);
  return 0;
}

function geodesicRingArea(ring) {
  if (ring.length < 4) return 0;
  const radians = Math.PI / 180;
  let total = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const current = ring[index];
    const next = ring[index + 1];
    let longitudeDelta = (next[0] - current[0]) * radians;
    if (longitudeDelta > Math.PI) longitudeDelta -= Math.PI * 2;
    if (longitudeDelta < -Math.PI) longitudeDelta += Math.PI * 2;
    total += longitudeDelta * (2 + Math.sin(current[1] * radians) + Math.sin(next[1] * radians));
  }
  return Math.abs(total * 6371008.8 ** 2 / 2);
}

function geodesicPolygonArea(polygon) {
  return Math.max(0, geodesicRingArea(polygon[0] || []) - polygon.slice(1).reduce((sum, ring) => sum + geodesicRingArea(ring), 0));
}

export function geodesicAreaSquareMeters(geometry) {
  if (geometry.type === 'Polygon') return geodesicPolygonArea(geometry.coordinates);
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.reduce((sum, polygon) => sum + geodesicPolygonArea(polygon), 0);
  if (geometry.type === 'GeometryCollection') return geometry.geometries.reduce((sum, part) => sum + geodesicAreaSquareMeters(part), 0);
  return 0;
}

function asMultiPolygon(geometry) {
  if (geometry.type === 'Polygon') return [geometry.coordinates];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates;
  throw new TypeError('Polygon overlap requires Polygon or MultiPolygon geometry.');
}

export function polygonIou(left, right) {
  const leftMulti = asMultiPolygon(left);
  const rightMulti = asMultiPolygon(right);
  const intersection = polygonClipping.intersection(leftMulti, rightMulti);
  const union = polygonClipping.union(leftMulti, rightMulti);
  const intersectionArea = (intersection || []).reduce((sum, polygon) => sum + polygonArea(polygon), 0);
  const unionArea = (union || []).reduce((sum, polygon) => sum + polygonArea(polygon), 0);
  return unionArea > 0 ? intersectionArea / unionArea : 0;
}

export function geometryCentroid(geometry) {
  const bbox = geometryBbox(geometry);
  return [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2];
}

export function distanceMeters(left, right) {
  const radians = Math.PI / 180;
  const lat1 = left[1] * radians;
  const lat2 = right[1] * radians;
  const deltaLat = (right[1] - left[1]) * radians;
  const deltaLon = (right[0] - left[0]) * radians;
  const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return 6371008.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function intersectsBbox(geometry, bounds) {
  if (!geometry) return true;
  const bbox = geometryBbox(geometry);
  return bbox[0] <= bounds[2] && bbox[2] >= bounds[0] && bbox[1] <= bounds[3] && bbox[3] >= bounds[1];
}
