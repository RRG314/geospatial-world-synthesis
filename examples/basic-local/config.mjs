import { createLocalProvider, transformGeometry } from 'geospatial-world-synthesis';

export const bounds = [-76.6140, 39.2890, -76.6100, 39.2920];

const building = {
  type: 'Polygon',
  coordinates: [[
    [-76.6131, 39.2900], [-76.6119, 39.2900], [-76.6119, 39.2909],
    [-76.6131, 39.2909], [-76.6131, 39.2900]
  ]]
};

const projectedBuilding = transformGeometry(building, 'OGC:CRS84', 'EPSG:3857');

export function createProviders() {
  return [
    createLocalProvider({
      id: 'harbor-registry',
      datasetId: 'fictional-harbor-registry',
      operator: 'Geospatial World Synthesis example authors',
      licenseId: 'CC0-1.0',
      attribution: 'Fictional example data — CC0-1.0',
      sourceCrs: 'OGC:CRS84',
      records: [
        {
          sourceId: 'building-17', entityType: 'building', gersId: 'demo-building-17', geometry: building,
          properties: { name: 'Harbor Workshop', type: 'commercial', height: 12, levels: 3 },
          observedAt: '2026-08-01T00:00:00Z', evidenceClass: 'DIRECT_SOURCE'
        },
        {
          sourceId: 'parcel-4', entityType: 'parcel',
          geometry: { type: 'Polygon', coordinates: [[[-76.6135, 39.2897], [-76.6115, 39.2897], [-76.6115, 39.2912], [-76.6135, 39.2912], [-76.6135, 39.2897]]] },
          properties: { name: 'Parcel 4' }, evidenceClass: 'DIRECT_SOURCE'
        },
        {
          sourceId: 'road-2', entityType: 'road',
          geometry: { type: 'LineString', coordinates: [[-76.6138, 39.2895], [-76.6103, 39.2915]] },
          properties: { name: 'Foundry Lane', class: 'local' }, evidenceClass: 'DIRECT_SOURCE'
        },
        {
          sourceId: 'poi-8', entityType: 'poi',
          geometry: { type: 'Point', coordinates: [-76.6125, 39.29045] },
          properties: { name: 'Workshop Entrance', category: 'entrance' }, evidenceClass: 'DIRECT_SOURCE'
        }
      ]
    }),
    createLocalProvider({
      id: 'height-survey',
      datasetId: 'fictional-height-survey',
      operator: 'Geospatial World Synthesis example authors',
      licenseId: 'CC0-1.0',
      attribution: 'Fictional example data — CC0-1.0',
      sourceCrs: 'EPSG:3857',
      records: [{
        sourceId: 'survey-feature-a', entityType: 'building', gersId: 'demo-building-17',
        sourceCrs: 'EPSG:3857', geometry: projectedBuilding,
        properties: { name: 'Harbor Workshop', height: 14, roofShape: 'flat' },
        observedAt: '2026-08-03T00:00:00Z', evidenceClass: 'DIRECT_SOURCE'
      }]
    })
  ];
}

export default function exampleConfiguration() {
  return {
    bounds,
    providers: createProviders(),
    requestedCapabilities: ['building', 'parcel', 'road', 'poi'],
    limits: { maxRecordsPerProvider: 100, maxCoordinatesPerGeometry: 10000, providerTimeoutMs: 5000 }
  };
}
