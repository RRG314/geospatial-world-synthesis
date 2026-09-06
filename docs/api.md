# Public API

The package is ESM-only and requires Node.js 20 or newer. Import the portable core from `geospatial-world-synthesis`, provider adapters from `geospatial-world-synthesis/providers`, and filesystem/configuration/persistence helpers from `geospatial-world-synthesis/node`. Other source paths are internal.

## Synthesis

### `synthesize(options): Promise<SynthesisResult>`

Acquires bounded records, normalizes them into OGC:CRS84, optionally reconciles pairs of provider results, degrades recoverable provider failures, and returns a frozen snapshot.

Required options:

- `bounds`: `[west, south, east, north]` in OGC:CRS84.
- `providers`: at least one provider.

Useful optional fields:

- `requestedCapabilities`: restricts acquisition to named entity types.
- `reconciliation: { enabled, policies?, maxReportedCandidates? }`: enables automatic pairwise reconciliation in deterministic provider order.
- `reconciliations`: explicit decisions supplied by an application.
- `continueOnProviderError`: defaults to `true`; set false for all-or-nothing acquisition.
- `signal`: host abort signal.
- `limits`: provider, record, geometry-coordinate, property-count, property-byte, and timeout budgets.

Default limits are eight providers, 5,000 records/provider, 100,000 coordinates/geometry, 256 properties and 100,000 property bytes/record, and 15 seconds/provider.

### `synthesizeWorld({ providerResults, reconciliations? }): SynthesisResult`

Pure synchronous assembly for already-normalized provider results. Prefer `synthesize()` for normal use because it applies orchestration limits and can generate automatic reconciliations.

### Result shape

| Field | Meaning |
| --- | --- |
| `schemaVersion`, `synthesisVersion` | Machine contract and engine algorithm versions. |
| `sourceRecords` | Every accepted normalized input record, including source identity, geometry, properties, and provenance pointer. |
| `entities` | Canonical identities with aliases, selected geometry, resolved property view, per-property selection reasons, conflicts, relationships, and evidence summary. |
| `claims` | Individual property assertions with value type, evidence class, provenance ID, and temporal fields. |
| `provenance` | Provider/dataset/record lineage, source URL, license, attribution, CRS transformation, timestamps, activity, privacy, and warnings. |
| `providerSummary` | Availability, record count, coverage, warnings, sanitized error, attribution metadata, and bounded-run metrics. |
| `reconciliations` | Matcher version, policies, `MATCH`/`AMBIGUOUS`/`NO_MATCH` decisions, signal values, reasons, and candidate metrics. |
| `coverage` | Counts by type/evidence, direct/synthetic claims, conflicts, and provenance completeness. |
| `attributions` | Deduplicated provider/dataset/license/source URL summary. |
| `fingerprint` | SHA-256 identity of canonical content; retrieval time and runtime duration are excluded. |
| `request` | Effective bounds, capability selection, and limits for orchestrated runs. |

## Evidence and inspection

- `inspectEntity(snapshot, entityId)` returns the canonical entity plus contributing source records, claims, provenance, relevant reconciliation decisions, property selections, temporal evidence, and conflicts. It returns `null` for an unknown ID.
- `createProvenance(input)` creates stable, credential-redacted source lineage.
- `createClaim(input)` creates a property assertion linked to provenance.
- `resolveClaims(claims)` returns `{ resolved, resolutions, conflicts }`. Each resolution names the selected claim, evidence class, selection reason, and alternative claims; competing claims are never deleted.
- `attributionSummary(provenance)` deduplicates provider/dataset licensing metadata.
- `EVIDENCE_CLASSES` contains `DIRECT_SOURCE`, `MULTI_SOURCE_SUPPORTED`, `DERIVED_HIGH_CONFIDENCE`, `INFERRED`, `LOW_CONFIDENCE`, `SYNTHETIC`, and `UNKNOWN`.

Evidence class is not identity confidence. Reconciliation decisions, temporal status, and representation policy remain separate objects.

## Reconciliation

### `reconcileEntities(leftRecords, rightRecords, options?)`

Returns an object containing `matcherVersion`, entity-specific policies, sorted decisions, decision counts, and index metrics. Supported types are exposed by `RECONCILABLE_ENTITY_TYPES`: building, POI, address, parcel, and road.

The matcher first searches shared GERS/alias identifiers, then uses an RBush bounding-box candidate index. Entity-specific scores combine:

- buildings: specialized footprint/name features and polygon IoU;
- POIs: name, distance, semantic type, and address;
- addresses: normalized address and distance;
- parcels: polygon IoU plus optional name/type;
- roads: endpoint agreement, name, and type.

Every left record receives `MATCH`, `AMBIGUOUS`, or `NO_MATCH` plus a reason and bounded candidate list. Only `MATCH` decisions merge identity during synthesis. Default policies are intentionally conservative and can be overridden per entity type.

Related functions:

- `entityMatchFeatures(left, right, policy?)` exposes the measured signal vector and composite score.
- `DEFAULT_ENTITY_MATCH_POLICIES` exposes frozen defaults.
- `reconcileBuildings()` and `buildingMatchFeatures()` retain the specialized building matcher.
- `reconcileBuildingRelationship()` classifies one-to-one, one-to-many, many-to-one, and building-part relationships.

Canonical IDs never replace source IDs. Proximity alone does not establish identity.

## Geometry and CRS

- `validateGeometry(geometry, options?)` validates supported GeoJSON structure, finite coordinates, coordinate budgets, ring closure, basic ring self-intersection, hole containment, and GeometryCollection members. It returns `{ valid, coordinateCount, warnings }` and reports unsplit antimeridian crossings.
- `geometryBbox()`, `geometryCentroid()`, `geometryArea()`, `geodesicAreaSquareMeters()`, `polygonIou()`, and `distanceMeters()` provide matching/measurement utilities.
- `transformGeometry(geometry, sourceCrs, outputCrs?, options?)` converts through Proj4; output defaults to OGC:CRS84.
- `registerCrs(name, definition)`, `knownCrs(name)`, and `crsSnapshot()` manage explicit definitions.
- `SUPPORTED_GEOMETRY_TYPES` includes Point, MultiPoint, LineString, MultiLineString, Polygon, MultiPolygon, and GeometryCollection.

Validation is diagnostic rather than repair. See [VALIDATION.md](../VALIDATION.md) before using polygons near the antimeridian or complex ArcGIS ring sets.

## Providers and normalization

- `defineProvider(definition)` validates and freezes a provider implementation.
- `createLocalProvider(config)` adapts in-memory records.
- `queryProvider(provider, request, options?)` runs and normalizes one provider.
- `normalizeSourceRecord(record, provider, context?, limits?)` validates, transforms, and bounds a source record.
- `validateBounds(bounds)` validates an ordered CRS84 bounding box.
- `ENTITY_TYPES` and `PROVIDER_STATUSES` expose accepted enum values.

See [providers.md](providers.md) for built-in adapters, configuration fields, and failure semantics.

## Temporal and representation policy

- `assessTemporalEvidence(observations, options?)` marks explicit same-lineage revisions as superseded while retaining independent disagreement as unresolved.
- `TEMPORAL_STATUSES` exposes accepted statuses.
- `resolveRepresentation(entity, candidates?, context?)` chooses an application display candidate without mutating canonical evidence. The core has no user or authorization model.

Absence from a response is not treated as deletion.

## Exports and snapshot changes

- `toCanonicalJson(snapshot, { pretty? })` serializes the complete snapshot.
- `toGeoJson(snapshot)` returns an RFC 7946 FeatureCollection with `_gws:*` feature evidence pointers and `gws:*` collection metadata.
- `toFlatGeobuf(snapshot)` returns a `Uint8Array` encoded with EPSG:4326 metadata.
- `toProvJson(snapshot)` maps source/canonical entities, provider agents, synthesis activity, derivations, and attributions into the PROV-JSON element/relation shape. PROV-JSON is a W3C Member Submission, not a Recommendation; this is not a full constraints validator.
- `diffSnapshots(before, after)` returns added/removed/changed IDs for entities, source records, claims, and provenance plus `affectedEntityIds`.
- `canonicalJson(value)` and `stableHash(value)` provide stable ordering and SHA-256 identity.

## Node-only helpers

```js
import { createJsonDirectoryStore, loadWorkflowConfig } from 'geospatial-world-synthesis/node';

const options = await loadWorkflowConfig('./workflow.json');
const world = await synthesize(options);
const store = createJsonDirectoryStore('./output/snapshots');
await store.save(world);
```

- `loadWorkflowConfig(path)` loads declarative JSON, expands `${UPPER_CASE_ENVIRONMENT_VARIABLES}`, resolves local-file paths relative to the config, and creates supported built-in providers.
- `WORKFLOW_PROVIDER_TYPES` lists accepted `type` values.
- `createJsonDirectoryStore(directory)` provides atomic fingerprinted snapshots, latest/load/list, and diff-aware incremental saves.
- `createPostgisStore(client, { schema?, worldId? })` accepts a connected node-postgres-compatible client, validates `PostGIS_Version()`, creates snapshot/current-state tables with EPSG:4326 geometry and GiST indexes, and applies collection diffs in a transaction. The release workflow validates it against PostgreSQL 17 with PostGIS 3.5.
- `createOvertureMapsProvider({ id, release, ... })` creates the Node-only bounded Overture Buildings provider. It shells out without a command shell to `uvx overturemaps` by default; configure `command`/`commandArgs`, timeout, and download-size limits when embedding it.

## CLI

```text
gws synthesize <config.json|config.mjs> [--output <directory>]
gws inspect <world.json> [--entity <canonical-id>]
gws diff <before.json> <after.json> [--output <file>]
gws reconcile <left-records.json> <right-records.json> [--output <file>]
gws export <world.json> --format canonical|geojson|flatgeobuf|prov-json --output <file>
```

The CLI exits nonzero on invalid input and prints only sanitized provider errors.

## Stability and errors

`OUTPUT_SCHEMA_VERSION` and `SYNTHESIS_VERSION` expose numeric contract versions. Public top-level exports are supported within the 0.x line, but a minor 0.x release may document breaking changes.

`SynthesisError` exposes `code`, `details`, and `toJSON()`. `ProviderError` additionally exposes `providerId` and provider status. Library functions throw and never terminate the host process.

Machine-readable [source-record](../schemas/source-record.schema.json) and [synthesis-result](../schemas/synthesis-result.schema.json) JSON Schemas ship with the package and are checked against executable fixtures.
