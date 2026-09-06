import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { synthesize, toCanonicalJson, toGeoJson } from 'geospatial-world-synthesis';
import { createArcGisFeatureServiceProvider } from 'geospatial-world-synthesis/providers';

const provider = createArcGisFeatureServiceProvider({
  id: 'boise-libraries',
  layerUrl: 'https://services1.arcgis.com/WHM6qC35aMtyAAlN/ArcGIS/rest/services/Boise_Library_Locations/FeatureServer/0',
  entityType: 'poi',
  datasetId: 'boise-library-locations',
  operator: 'City of Boise GIS',
  licenseId: 'LicenseRef-City-of-Boise-Open-Data',
  attribution: 'City of Boise Maps and GIS Open Data Portal',
  homepage: 'https://opendata.cityofboise.org/',
  publicFields: ['BuinsessName', 'Address', 'City', 'Website'],
  fieldMap: { BuinsessName: 'name', Address: 'address', City: 'city', Website: 'website' }
});
const snapshot = await synthesize({
  bounds: [-116.4, 43.45, -116.0, 43.8], providers: [provider],
  limits: { providerTimeoutMs: 30_000, maxRecordsPerProvider: 2_000 }
});
assert.equal(snapshot.providerSummary[0].status, 'available');
assert.ok(snapshot.entities.length > 0);
const directory = resolve('output/arcgis-government');
await mkdir(directory, { recursive: true });
await writeFile(resolve(directory, 'world.json'), `${toCanonicalJson(snapshot)}\n`);
await writeFile(resolve(directory, 'world.geojson'), `${JSON.stringify(toGeoJson(snapshot), null, 2)}\n`);
console.log(JSON.stringify({ entities: snapshot.entities.length, provider: snapshot.providerSummary[0], attribution: snapshot.attributions[0] }, null, 2));
