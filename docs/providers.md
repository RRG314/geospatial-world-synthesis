# Provider and workflow guide

A provider retrieves records from one bounded source and declares the dataset's capabilities and obligations. The engine owns limit enforcement, CRS normalization, provenance creation, canonical synthesis, and failure reporting. Adapters do not determine whether combining two datasets is legally or scientifically appropriate.

## Supported adapters

Import factories from `geospatial-world-synthesis/providers`.

| Factory / JSON type | Release status | Acquisition contract | Important limits |
| --- | --- | --- | --- |
| `createLocalProvider` | Supported | In-memory source records | Host supplies bounded records and correct CRS/license metadata |
| `createLocalFileProvider` / `local-file` | Supported | Local GeoJSON FeatureCollection or source-record JSON | Byte limit; public-field allowlist; path is not emitted in provenance |
| `createGeoJsonHttpProvider` / `geojson-http` | Supported bounded subset | One HTTP(S) GeoJSON FeatureCollection | Byte limit; public-field mapping; host may supply bbox URL builder |
| `createOgcApiFeaturesProvider` / `ogc-api-features` | Supported core subset | Collection items with bbox and bounded `next` pagination | ≤1,000/page and ≤32 requests by default; same-origin next links |
| `createArcGisFeatureServiceProvider` / `arcgis-feature-service` | Supported query subset | FeatureServer layer `/query` with bbox and offset pagination | ≤2,000/page and ≤32 requests by default; configured public fields only |
| `createOpenStreetMapProvider` / `openstreetmap` | Supported bounded Overpass subset | POSTed Overpass QL for configured feature capabilities | Explicit query timeout/maxsize, response byte limit, bbox required |
| `createOpenStreetMapMapProvider` / `openstreetmap-map-api` | Supported small-area OSM subset | OSM map API XML for one bbox | Strict bbox area limit; one request; relation geometry not reconstructed |
| `createOvertureMapsProvider` / `overture-maps` | Supported Node-only Overture Buildings path | Pinned, bounded GeoJSON download through the maintained `overturemaps` CLI | Requires `uvx` or configured executable; subprocess timeout and file-size limit |
| `withProviderCache` | Supported wrapper | Host-supplied async/sync key-value cache around any provider | TTL and key include provider/bounds/capabilities; cache storage is the host's responsibility |

All network adapters require HTTP(S), accept an injected `fetch`, honor abort signals, enforce response-byte limits, and return structured request metrics. Headers may carry credentials, but credential values must not appear in records, source URLs, warnings, or errors.

## Minimal custom provider

[`examples/custom-provider/run.mjs`](../examples/custom-provider/run.mjs) is executable:

```js
import { defineProvider, synthesize } from 'geospatial-world-synthesis';

const provider = defineProvider({
  id: 'small-catalog',
  datasetId: 'small-catalog-2026',
  datasetVersion: '2026-09',
  operator: 'Example operator',
  licenseId: 'CC0-1.0',
  attribution: 'Example catalog — CC0-1.0',
  capabilities: ['poi'],
  queryModes: ['bbox'],
  sourceCrs: 'OGC:CRS84',
  async query(request, { signal }) {
    signal?.throwIfAborted();
    return {
      status: 'available',
      records: [],
      coverage: request.bounds,
      metrics: { requestCount: 0, transferredBytes: 0 }
    };
  }
});

const world = await synthesize({ bounds: [-77, 38, -76, 39], providers: [provider] });
```

`query()` receives validated CRS84 `bounds`/`bbox`, requested capabilities, and an abort signal. It returns `{ records, status?, coverage?, sourceUrl?, retrievedAt?, warnings?, metrics? }`.

Each raw record needs `sourceId` and `entityType`; geometry may be null. A record may override provider defaults for `sourceCrs`, `datasetVersion`, source URL, license/attribution, evidence class, observation/validity/update time, warnings, aliases, GERS ID, and transformation activity.

Keep source IDs stable. Return only public, bounded JSON values. Map only fields that may lawfully enter output.

## Declarative JSON workflows

The CLI and `loadWorkflowConfig()` accept JSON shaped like:

```json
{
  "bounds": [-76.62, 39.28, -76.60, 39.30],
  "requestedCapabilities": ["poi"],
  "reconciliation": { "enabled": true },
  "limits": { "providerTimeoutMs": 15000, "maxRecordsPerProvider": 5000 },
  "providers": [
    {
      "type": "local-file",
      "id": "places",
      "path": "./places.geojson",
      "entityType": "poi",
      "sourceCrs": "OGC:CRS84",
      "licenseId": "CC0-1.0",
      "attribution": "Example places",
      "publicFields": ["name", "category"]
    }
  ]
}
```

Local paths resolve relative to the workflow file. Strings such as `${API_TOKEN}` expand from environment variables or fail before acquisition. Do not put secrets directly in committed configuration.

## OpenStreetMap

`createOpenStreetMapProvider()` generates a bounded Overpass QL union from requested capabilities:

- buildings: `building=*` ways/relations;
- POIs: amenity/shop/tourism/leisure nodes, ways, and relations;
- addresses: `addr:housenumber=*`;
- roads: `highway=*` ways;
- water: natural water/waterway features;
- land use: `landuse=*` features.

It preserves selected public tags, OSM element identity, version/update metadata, source URLs, `ODbL-1.0`, and `© OpenStreetMap contributors`. Geometry comes from Overpass `out geom`; incomplete/unsupported geometry is retained only when `includeGeometryless` is enabled and is always warned.

Public Overpass instances can be rate limited or unavailable. A 429 becomes `rate_limited`, never `authoritative-empty`. Applications with meaningful traffic should follow an instance's policy, inject an appropriate endpoint/fetch/cache, and consider operating infrastructure designed for their load.

`createOpenStreetMapMapProvider()` is the reliable tiny-AOI demonstration path. It calls `/api/0.6/map?bbox=...`, parses nodes and ways, and reconstructs closed ways as polygons. It rejects bboxes above its configured degree-area budget. Relations are not reconstructed and produce an explicit warning, so use Overpass or an external OSM processing pipeline for relation-heavy areas.

OpenStreetMap data is ODbL. Preserve attribution and review current requirements at <https://www.openstreetmap.org/copyright>.

## Overture Maps

The Node-only `createOvertureMapsProvider()` uses Overture's maintained Python CLI through `uvx`, requests a bounded building GeoJSON download from an explicitly pinned release, enforces subprocess timeout and downloaded-file size limits, and removes its temporary file after normalization. It retains the GERS ID, upstream `sources`, update time, source attribution, and source aliases (including normalized OSM IDs). It currently supports the Buildings theme only and is not a native Parquet/cloud reader.

```js
import { createOvertureMapsProvider } from 'geospatial-world-synthesis/node';

const overture = createOvertureMapsProvider({
  id: 'overture-buildings',
  release: '2026-08-19.0'
});
```

The executable [`overture-osm`](../examples/overture-osm/) workflow uses this provider with the pinned `2026-08-19.0` release. Set `OVERTURE_RELEASE` to deliberately test another release, or set `OVERTURE_COMMAND` to an installed `overturemaps` executable. Keeping catalog/release handling in the upstream client avoids duplicating Overture's discovery logic.

```bash
npm run example:overture-osm
```

The buildings theme is currently ODbL and has multiple required source attributions. The provider preserves each feature's upstream `sources` list and record-level attribution metadata, but production publishers remain responsible for rendering the complete current attribution described at <https://docs.overturemaps.org/attribution/>.

## ArcGIS Feature Services

The adapter requests JSON with a bbox envelope, explicit output fields, EPSG:4326 output, return geometry, result offset, and page size. It stops on the server's transfer-limit flag, a short page, or configured request budget. It converts ArcGIS points, paths, and rings into GeoJSON-shaped geometry.

ArcGIS ring arrays can encode multipart polygons and holes with orientation/containment conventions. The generic conversion does not fully reconstruct every complex ring set. Use a source-specific preprocessor or GDAL for complex polygon services and validate the result. Curves and multipatches are unsupported.

The provider's portal terms—not ArcGIS software—determine the data license. Supply honest `licenseId`, `attribution`, `operator`, and `homepage`; a public endpoint alone is not proof of an open license.

## OGC API Features and GeoJSON HTTP

The OGC adapter implements the common collection-items flow with bbox/limit and bounded `rel=next` traversal. It does not claim every OGC API Features conformance class, alternate CRS negotiation, filtering language, transaction, or change feed.

Generic GeoJSON endpoints vary in bbox syntax. Provide `buildUrl(endpoint, request)` when needed. Both adapters expose a configured `fieldMap`; unlisted properties do not enter the canonical snapshot.

## Local files and caching

The local-file adapter accepts a GeoJSON FeatureCollection or `{ records: [...] }`. It enforces a file-byte limit before parsing, derives source IDs from configured fields/feature IDs, supports explicit entity-type and field mapping, and never exposes the filesystem path as a public source URL. `licenseField`, `attributionField`, `sourceUrlField`, and `updatedField` can retain record-level upstream metadata; those fields are read for provenance even when they are excluded from public property claims.

`withProviderCache(provider, cache, { ttlMs })` expects host-managed `get(key)` and `set(key, entry)`. Cache entries include creation time and normalized provider results. The core does not choose a disk location, silently retry, or grow a shared cache.

## Failure and coverage semantics

Provider status is `available`, `authoritative-empty`, `partial`, `rate_limited`, `timeout`, `unavailable`, or `invalid_response`.

- `authoritative-empty` means the provider affirmatively covered the requested bounds and returned no records.
- `partial` means a response was usable but a configured limit or source warning prevented complete coverage.
- rate limits, timeout, malformed content, and network failure never imply empty geography.
- failed providers contribute status/error metadata and no fabricated records, claims, or provenance.

Set `continueOnProviderError: false` when every provider must succeed.

## Contribution checklist

A provider contribution needs:

- bounded acquisition and pagination;
- abort/timeout behavior and explicit rate-limit mapping;
- response, record, geometry, and request budgets appropriate to the protocol;
- explicit CRS and defensible geometry conversion;
- stable source identity and public-field allowlisting;
- license, operator, attribution, and privacy metadata;
- cache/retry behavior that remains under host control;
- hand-authored or legally redistributable tests;
- a runnable example when a stable service is available;
- documented unsupported protocol/geometry cases.

Do not commit captured service responses, credentials, personal data, or restricted datasets merely to make an adapter test pass.
