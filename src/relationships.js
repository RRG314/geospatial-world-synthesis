import { geometryArea, geometryCentroid } from './geometry.js';
import { stableHash } from './stable.js';

function ringContainsPoint(ring, [x, y]) {
  let inside = false;
  for (let index = 0, prior = ring.length - 1; index < ring.length; prior = index, index += 1) {
    const [xi, yi] = ring[index];
    const [xj, yj] = ring[prior];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / ((yj - yi) || Number.EPSILON) + xi) inside = !inside;
  }
  return inside;
}

function polygonContainsPoint(geometry, point) {
  if (geometry?.type !== 'Polygon' || !ringContainsPoint(geometry.coordinates[0] || [], point)) return false;
  return !(geometry.coordinates.slice(1).some((hole) => ringContainsPoint(hole, point)));
}

function relation(sourceId, type, targetId, method) {
  return {
    id: `relationship:${stableHash({ sourceId, type, targetId, method })}`,
    type,
    targetId,
    evidenceClass: 'DERIVED_HIGH_CONFIDENCE',
    method,
    version: 1
  };
}

export function deriveSpatialRelationships(entities = []) {
  const polygons = entities.filter((entity) => entity.geometry?.type === 'Polygon');
  const buildings = polygons.filter((entity) => entity.type === 'building');
  const parcels = polygons.filter((entity) => entity.type === 'parcel');
  return entities.map((entity) => {
    const relationships = [];
    if (entity.geometry) {
      const point = entity.geometry.type === 'Point' ? entity.geometry.coordinates : geometryCentroid(entity.geometry);
      if (entity.type === 'building') {
        const containing = parcels.filter((parcel) => polygonContainsPoint(parcel.geometry, point))
          .sort((first, second) => geometryArea(first.geometry) - geometryArea(second.geometry) || first.id.localeCompare(second.id))[0];
        if (containing) relationships.push(relation(entity.id, 'located_on_parcel', containing.id, 'centroid-in-smallest-containing-polygon'));
      }
      if (entity.type === 'poi') {
        const containing = buildings.filter((building) => polygonContainsPoint(building.geometry, point))
          .sort((first, second) => geometryArea(first.geometry) - geometryArea(second.geometry) || first.id.localeCompare(second.id))[0];
        if (containing) relationships.push(relation(entity.id, 'located_in_building', containing.id, 'point-in-smallest-containing-polygon'));
      }
    }
    return { ...entity, relationships };
  });
}
