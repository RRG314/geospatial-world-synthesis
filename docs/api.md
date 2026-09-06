# Public API

The package is ESM-only and requires Node.js 20 or newer. Import supported API from `geospatial-world-synthesis`; built-in network adapters live at `geospatial-world-synthesis/providers`. Other source modules are internal implementation details.

## Synthesis

### `synthesize(options): Promise<SynthesisResult>`

Acquires bounded records from configured providers, normalizes their CRS and shape, degrades recoverable provider failures, and returns a frozen synthesis snapshot. `options.bounds` is a required CRS84 `[west, south, east, north]` tuple. `options.providers` must contain at least one provider. Optional `requestedCapabilities`, `reconciliations`, `signal`, `continueOnProviderError`, and `limits` constrain the run.

Default limits are eight providers, 5,000 records per provider, 100,000 coordinates per geometry, 256 JSON properties and 100,000 property bytes per record, and 15 seconds per provider. Provider errors are represented in `providerSummary` unless `continueOnProviderError` is `false`.

### `synthesizeWorld({ providerResults, reconciliations }): SynthesisResult`

Pure synchronous assembly for already-normalized provider results. It creates canonical entities, claims, provenance, spatial relationships, coverage, attribution, and a fingerprint. Prefer `synthesize()` for normal application use.

### Result shape

`SynthesisResult` contains:

| Field | Meaning |
| --- | --- |
| `schemaVersion`, `synthesisVersion` | Output and engine contract versions. |
| `entities` | Canonical entities with geometry, aliases, resolved view, conflicts, relationships, and evidence summary. |
| `claims` | Individual property assertions with evidence class and provenance ID. |
| `provenance` | Source record, dataset, operator, license, CRS, timestamps, transformation activity, and warnings. |
| `providerSummary` | Availability, record count, coverage, warnings, structured error, and bounded run metrics. |
| `reconciliations` | Supplied matcher decisions, including ambiguity. |
| `coverage` | Counts by entity/evidence type, unresolved conflicts, and provenance completeness. |
| `attributions` | Deduplicated source/license attribution summary. |
| `fingerprint` | SHA-256 identity of canonical content; retrieval times and runtime metrics are excluded. |
| `request` | Bounds, requested capabilities, and effective limits for orchestrated runs. |

## Providers and normalization

- `defineProvider(definition): Provider` validates and freezes a provider implementation.
- `createLocalProvider(config): Provider` adapts in-memory source records; useful for files, databases, tests, and offline runs.
- `queryProvider(provider, request, options): Promise<ProviderResult>` runs and normalizes one provider.
- `normalizeSourceRecord(record, provider, context?, limits?)` converts a provider record to the internal source-record contract.
- `validateBounds(bounds): Bounds` validates an ordered CRS84 bounding box.
- `ENTITY_TYPES` and `PROVIDER_STATUSES` expose accepted enum values.

See [providers.md](providers.md) for the full provider contract and built-in adapters.

## Evidence and inspection

- `createProvenance(input): Provenance` creates stable, credential-redacted source lineage.
- `createClaim(input): Claim` creates a property assertion linked to provenance.
- `resolveClaims(claims)` returns a resolved application view and explicit conflicts. A resolved value never deletes competing claims.
- `inspectEntity(snapshot, entityId)` returns one canonical entity with its claims, referenced provenance, and conflicts.
- `attributionSummary(provenance)` deduplicates dataset/source attribution.
- `EVIDENCE_CLASSES` lists the accepted evidence classes from direct source through synthetic and unknown.

## Geometry and CRS

- `validateGeometry(geometry, options?)` checks supported GeoJSON geometry structure, finite coordinates, ring closure, and coordinate budget.
- `geometryBbox(geometry)`, `geometryCentroid(geometry)`, `polygonIou(left, right)`, and `distanceMeters(left, right)` provide bounded matching utilities.
- `transformGeometry(geometry, sourceCrs, outputCrs?, options?)` converts coordinates with Proj4; output defaults to `OGC:CRS84`.
- `registerCrs(name, definition)`, `knownCrs(name)`, and `crsSnapshot()` manage explicit CRS definitions.
- `SUPPORTED_GEOMETRY_TYPES` lists accepted Point, line, and polygon families. GeometryCollection, curves, solids, and multipatches are rejected.

## Reconciliation and relationships

- `reconcileBuildings(leftRecords, rightRecords, policy?)` produces `MATCH`, `AMBIGUOUS`, or `NO_MATCH` decisions from geometry/name features.
- `reconcileBuildingRelationship(leftRecords, rightRecords, policy?)` classifies one-to-one, one-to-many, many-to-one, and building-part overlap.
- `buildingMatchFeatures(left, right)` exposes the measured features used by the matcher.
- `DEFAULT_BUILDING_MATCH_POLICY` is the conservative v2 threshold policy.

Canonical IDs do not replace source IDs. Records only merge automatically through a shared non-empty GERS identifier or an explicit `MATCH` decision. Proximity alone does not establish identity.

## Temporal and representation policy

- `assessTemporalEvidence(observations, options?)` marks explicit same-lineage revisions as superseded while retaining independent disagreement as an unresolved temporal conflict.
- `TEMPORAL_STATUSES` lists returned statuses.
- `resolveRepresentation(entity, candidates?, context?)` chooses a display candidate without mutating canonical evidence. Authorization is supplied by the consumer; the core has no application-specific user model.

Deletion semantics are intentionally not inferred. Absence from a current response is not proof of deletion.

## Exports and stability

- `toCanonicalJson(snapshot, { pretty? })` serializes the complete renderer-neutral snapshot.
- `toGeoJson(snapshot)` returns a GeoJSON FeatureCollection. Entity evidence pointers and attribution remain in `_gws:*` feature properties and `gws:*` collection members.
- `canonicalJson(value)` and `stableHash(value)` provide stable key ordering and SHA-256 identity.
- `OUTPUT_SCHEMA_VERSION` and `SYNTHESIS_VERSION` expose current versions.

`SynthesisError` has `code`, `details`, and `toJSON()`. `ProviderError` additionally has `providerId` and `status`. Library code throws; it never terminates the host process.

Machine-readable JSON Schemas for [source records](../schemas/source-record.schema.json) and [synthesis results](../schemas/synthesis-result.schema.json) ship with the repository and package. They track `schemaVersion: 1` and are checked against the executable example during release validation.
