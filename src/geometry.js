import polygonClipping from 'polygon-clipping';
import { deepFreeze } from './stable.js';

export const SUPPORTED_GEOMETRY_TYPES = Object.freeze([
  'Point', 'MultiPoint', 'LineString', 'MultiLineString', 'Polygon', 'MultiPolygon'
]);

function visitCoordinates(value, callback) {
  if (Array.isArray(value) && typeof value[0] === 'number') return callback(value);
  if (!Array.isArray(value)) throw new TypeError('Geometry coordinates must be nested arrays.');
  value.forEach((part) => visitCoordinates(part, callback));
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
      });
    });
  }
  return warnings;
}

export function validateGeometry(geometry, options = {}) {
  const warnings = [];
  const maxCoordinates = Math.max(1, Number(options.maxCoordinates) ||  100000);
  if (!geometry || typeof geometry.type !== 'string' || !Array.isArray(geometry.coordinates)) {
    return deepFreeze({ valid: false, coordinateCount: 0, warnings: ['missing-or-invalid-geometry'] });
  }
  if (!SUPPORTED_GEOMETRY_TYPES.includes(geometry.type)) {
    return deepFreeze({ valid: false, coordinateCount: 0, warnings: [`unsupported-geometry-type:${geometry.type}`] });
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
  if (coordinateCount === 0) warnings.push('empty-geometry');
  return deepFreeze({ valid: warnings.length === 0, coordinateCount, warnings: [...new Set(warnings)].sort() });
}

export function geometryBbox(geometry) {
  const bbox = [Infinity, Infinity, -Infinity, -Infinity];
  visitCoordinates(geometry.coordinates, ([x, y]) => {
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
