# Validation and limitations

## Release behavior

The release gate executes public API tests, adapter fixtures, CLI tests, the browser viewer, an external package consumer, every bundled example, deterministic exports, a synthetic benchmark, package-content inspection, JavaScript syntax checks, and dependency/secret scans. Tests exercise:

- bounded local synthesis and capability selection;
- source normalization, CRS transformation, malformed geometry, and resource limits;
- canonical identity, provenance, claims, attribution, relationships, and conflicts;
- ambiguous building candidates and complex building relationships;
- provider rate-limit degradation and timeouts without false provenance;
- temporal lineage semantics;
- provider-result order and retrieval-time fingerprint invariance;
- GeoJSON HTTP, OGC API Features, and ArcGIS adapter contracts with small hand-authored responses;
- canonical JSON and GeoJSON parsing;
- CLI and browser interactions;
- installation and import from the packed artifact in a separate temporary project.

The guaranteed first run uses five fictional CC0 source records from two providers. It produces four canonical entities, twelve claims, and one unresolved height conflict. No network result is needed for this validation.

Run the complete local gate with:

```bash
npm run validate:release
```

## Reconciliation research context

The conservative building thresholds originated in a World Explorer research validation set containing 455 reviewed relationships. A held-out v2 evaluation reported precision 0.987 (Wilson 95% interval 0.931–0.998), recall 0.828, and F1 0.901. This is limited evidence, not a universal accuracy claim: one reviewer performed the labels, and the reviewed geography was primarily New York City plus rural United States cases. The source review corpus is not redistributed here, so these aggregate figures are historical context rather than a benchmark reproducible from this repository.

The earlier research exercised nine live configurations spanning ArcGIS, Socrata GeoJSON, OGC API Features, and OpenStreetMap-oriented acquisition in United States and Netherlands areas; eight were usable and one public OpenStreetMap endpoint was rate-limited. v0.1.0 intentionally ships only the narrower adapters listed in the README and does not claim that third-party endpoints remain compatible or available.

## Performance measurement

`npm run benchmark` runs five in-memory syntheses of 2,000 generated point records and reports median/minimum/maximum elapsed time for that machine. The fixture measures local engine throughput only. It is not a provider-network benchmark, memory certification, or real-world reconciliation-accuracy result.

## Known limitations

- Canonical identity is only as reliable as stable shared IDs or explicit reconciliation decisions. Without either, records remain separate.
- The matcher is tuned for conservative building decisions and does not establish a general conflation solution for all feature types or geographies.
- CRS metadata must be correct. Axis-order differences outside the documented CRS contract can produce incorrect geometry.
- Geometry support is limited to GeoJSON point, line, polygon, and multi-geometry families. GeometryCollection, curves, solids, multipatches, topology repair, antimeridian splitting, and global-scale geodesic polygon operations are not implemented.
- ArcGIS polygon rings are accepted as GeoJSON polygon rings; complex multipart or hole topology may require a provider-specific preprocessor.
- Temporal assessment requires explicit lineage and revision evidence. Missing records are not interpreted as deletions.
- Provider coverage and authoritative-empty semantics depend on the adapter and service response.
- Provider schemas, licenses, rate limits, authentication, and availability can change independently of this project.
- The static viewer is an inspection aid, not a full GIS client.
- The output is not certified for surveying, cadastral boundaries, routing, emergency response, navigation, structural decisions, or other safety-critical use.

Any application must independently validate source suitability, privacy, accuracy, terms, and licensing for its use case.
