# Validation and limitations

This document separates reproducible release checks from live-service observations and historical research. Numbers are evidence for the named fixture and machine only; they are not universal accuracy or capacity claims.

## Release gate

Run the offline gate with:

```bash
npm ci
npm run validate:release
```

The gate checks JavaScript syntax/source hygiene, strict public TypeScript declarations, unit and adapter tests, machine-readable schemas, the CLI, every offline example, the generated GitHub Pages viewer in Chromium, installation from `npm pack` in a separate temporary consumer, deterministic output, package contents, documentation links, CFF metadata, a 10k-record matcher benchmark, and the designed reconciliation evaluation. Production dependencies are separately checked with `npm audit --omit=dev`.

`uvx cffconvert --validate` also validates `CITATION.cff` against the Citation File Format 1.2.0 schema.

The test suite currently contains 37 tests covering:

- provider bounding, capability selection, pagination, response size, timeouts, rate-limit degradation, malformed responses, caching, credential redaction, and duplicate IDs;
- local, local-file, GeoJSON HTTP, OGC API Features, ArcGIS Feature Service, OSM Overpass, OSM map API, and Node-only Overture Buildings adapters using hand-authored protocol fixtures;
- CRS conversion, coordinate/property limits, GeometryCollection, polygon holes, self-intersection rejection, antimeridian diagnostics, and geodesic area;
- stable canonical identity, automatic and explicit reconciliation, ambiguity retention, automatic many-to-one collision refusal, building part/one-to-many/many-to-one relationships, claims, resolution explanations, provenance, conflicts, attribution, and temporal status;
- deterministic fingerprints under provider reordering and retrieval-time changes;
- canonical JSON, GeoJSON, FlatGeobuf, and PROV-JSON output paths;
- snapshot diffs, JSON directory persistence, generated PostGIS SQL/transactions through a recording client, CLI workflows, and browser interactions.

## Reproducible reconciliation evaluation

`npm run evaluate:reconciliation` builds a deterministic CC0 fixture with 1,000 left records and 1,150 right records across buildings, POIs, addresses, parcels, and roads. It intentionally contains 700 matches, 150 two-candidate ambiguities, and 150 non-matches. The full matcher evaluates 1,000 indexed candidates rather than 1,150,000 all-pairs combinations.

| Method | Precision | Recall | F1 | False merges | Ambiguity retention |
| --- | ---: | ---: | ---: | ---: | ---: |
| Entity-specific evidence policies | 1.000 | 1.000 | 1.000 | 0 | 1.000 |
| Shared ID only | 1.000 | 0.143 | 0.250 | 0 | 0.000 |
| Nearest centroid | 0.824 | 1.000 | 0.903 | 150 | 0.000 |
| Exact name/address only | 0.824 | 1.000 | 0.903 | 150 | 0.000 |
| Polygon IoU only | 0.824 | 0.400 | 0.538 | 60 | 0.000 |

These perfect full-matcher results are expected on a designed regression fixture. They show that the implemented rules preserve the fixture's known ambiguity cases and outperform the included simple baselines on those cases. They do **not** estimate performance on independent real-world data. The fixture has no useful temporal ablation, and provenance is deliberately not used as an identity shortcut: removing provenance leaves these identity numbers unchanged but removes auditability.

## Scale measurement

`npm run benchmark:scale` generates paired POI grids and measures the complete in-memory `reconcileEntities()` result, including materialized decision objects. Measurements below were produced on an 8 GB Apple Silicon machine with Node.js; reruns vary with runtime and system load.

| Records/source | Total input | Reconciliation | Throughput | Candidates evaluated | All-pairs alternative | Max RSS | Decision JSON |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 10,000 | 20,000 | 133 ms | 75,184 left records/s | 10,000 | 100,000,000 | 101 MB | 3.28 MB |
| 100,000 | 200,000 | 771 ms | 129,674 left records/s | 100,000 | 10,000,000,000 | 218 MB | 33.14 MB |

The RBush bounding-box candidate index reduced comparisons by 99.99% at 10k and 99.999% at 100k for this separated grid. This benchmark excludes network I/O, polygon clipping, messy labels, synthesis of claims, persistence, and export. Its known-correspondence precision/recall is not a real-world accuracy result. A 1-million-record run was not attempted on the 8 GB validation host because materializing approximately a million detailed decisions plus two million input objects was not considered a safe or representative release-gate workload. There is not yet a streaming/chunked matcher, so 100k records per source is the largest demonstrated release workload.

## Live-source observations

The live examples are reproducible commands but are not release-gate dependencies because third-party availability and schemas can change.

| Command | Observation on 2026-09-06 | Scope |
| --- | --- | --- |
| `npm run example:osm` | 18 records/entities, one bounded OSM map API request, ODbL attribution retained | Tiny Empire State Building block; relation geometry skipped with an explicit warning |
| `npm run example:overture-osm` | 3 Overture buildings + 2 OSM ways; 2 matches; both match Overture's embedded OSM source IDs | Tiny Empire State Building block; pinned Overture `2026-08-19.0` download through `uvx`; not independent ground truth |
| `npm run example:arcgis` | 5 Boise library points, 2 bounded ArcGIS requests, attribution retained | One public point layer; service terms and availability remain external |

The Overture observation is useful integration evidence: it validates current download/schema normalization and the two source-linked decisions. It does not validate unmatched buildings or general Overture/OSM accuracy. The Overpass adapter is fixture-tested, but public Overpass instances were too inconsistent for a guaranteed live example; the small-area OSM map API adapter is used for the reproducible live path.

`npm run evaluate:live` repeats that source-link check across five small areas and writes its timestamped report to `output/live-overture-osm-evaluation/report.json`. On 2026-09-06, using pinned Overture release `2026-08-19.0`, it produced:

| Area | Context | Comparable OSM-linked pairs | Accepted matches | Positive-pair recall |
| --- | --- | ---: | ---: | ---: |
| London, United Kingdom | Dense urban | 23 | 20 | 0.870 |
| Paris, France | Dense urban | 7 | 6 | 0.857 |
| Sydney, Australia | Waterfront landmark | 4 | 4 | 1.000 |
| Boulder, United States | Low-rise neighbourhood | 114 | 114 | 1.000 |
| North Yorkshire, United Kingdom | Rural | 1 | 1 | 1.000 |
| **Total** | Five-area, four-country integration check | **149** | **145** | **0.973** |

This is a live schema-and-integration check, not an independent accuracy benchmark. Overture's own source linkage supplies only positive correspondences, so the check cannot measure precision, false merges, ambiguity quality, or buildings without a comparable OSM way. The four rejected linked pairs demonstrate that the matcher can remain conservative even when upstream lineage suggests correspondence; they have not been independently adjudicated.

## Historical research context

The original conservative building thresholds came from a World Explorer research validation set containing 455 reviewed relationships. A held-out v2 evaluation reported precision 0.987 (Wilson 95% interval 0.931–0.998), recall 0.828, and F1 0.901. One reviewer produced the labels, the geography was primarily New York City plus rural United States cases, and the corpus is not redistributed here. These figures are historical context, not a benchmark reproduced by this standalone repository and not evidence for POIs, addresses, parcels, or roads.

## Evidence-preservation checks

The executable fixtures assert the following behaviors directly:

- normalized source records remain in `snapshot.sourceRecords`;
- canonical aliases retain provider/source identity;
- each property claim references provenance and an evidence class;
- competing direct values remain as claims and produce an unresolved conflict;
- each selected effective value has a selected claim ID, evidence class, reason, and alternatives;
- ambiguous identity candidates remain separate canonical entities;
- provider failure creates health/error metadata but no claims or provenance;
- explicit same-lineage revision can become `SUPERSEDED`, while independent temporal disagreement remains unresolved;
- canonical output fingerprints exclude retrieval time, provider order, and runtime duration;
- entity inspection returns contributing source records, claims, provenance, reconciliation decisions, property selections, temporal evidence, and conflicts.

This demonstrates an evidence-preserving output contract. It does not establish that the contract is novel or that every downstream use will find it sufficient.

## Persistence status

The atomic JSON directory store is exercised end-to-end. It saves immutable fingerprinted snapshots, tracks the latest pointer, lists versions, loads a selected version, and reports affected entities through `diffSnapshots()`.

The PostGIS reference store creates snapshot and normalized current-state tables, uses `geometry(Geometry, 4326)` columns with GiST indexes, acquires a per-world advisory transaction lock, and upserts/deletes only changed source records, entities, claims, and provenance. Unit tests validate its SQL sequence, rollback behavior, diff application, and PostGIS capability probe through a recording client. The release workflow also completed `npm run example:postgis` against PostgreSQL 17 with PostGIS 3.5 on 2026-09-06. This validates installation, schema creation, save/load, and transactional updates; it is not a long-duration, concurrent-load, backup/restore, or migration benchmark.

## Independent export checks

- Canonical JSON is parsed back and compared with the snapshot fingerprint.
- GeoJSON is parsed as a FeatureCollection and checked for entity and attribution metadata.
- FlatGeobuf is generated with EPSG:4326 metadata, decoded again through the upstream parser, and checked for feature/property equivalence. Cross-tool/GDAL conformance is not yet in the gate.
- PROV-JSON includes source/canonical entities, provider agents, the synthesis activity, derivations, and attributions. It follows the [W3C PROV-JSON Member Submission](https://www.w3.org/submissions/2013/SUBM-prov-json-20130424/), which is not a W3C Recommendation; the project does not claim full PROV constraint validation.

## Closest tools and non-novel work

[Hootenanny](https://github.com/ngageoint/hootenanny) is a mature vector conflation system with specialized algorithms for areas, buildings, POIs, roads, and other classes, manual review, provenance behavior, and large operational workflows. It is broader and more sophisticated than this project. [GDAL/OGR](https://gdal.org/en/latest/programs/ogr2ogr.html) is the appropriate general-purpose conversion/ETL tool for far more formats. [PostGIS](https://postgis.net/docs/using_postgis_dbmanagement.html) provides durable spatial storage, query, indexing, and topology capabilities far beyond the optional GWS store.

Provider adapters, HTTP pagination, CRS conversion, R-tree candidate indexing, FlatGeobuf serialization, and PostGIS tables are conventional integration engineering. GWS's narrower design emphasis is keeping source records, per-property claims, decision explanations, unresolved conflicts, temporal status, and provenance together in one renderer-neutral snapshot instead of producing only a fused feature layer. Hootenanny and related systems also address provenance and review, so no novelty claim is made. An independent comparative study would be required to establish a material technical distinction.

## Known limitations

- Automatic identity quality depends on local data quality and policy calibration. Default thresholds have not been independently validated across countries or source combinations.
- Automatic reconciliation is pairwise between provider results. Multi-provider transitivity and many-to-many identity groups need domain review.
- Building complex relationships are represented, but generic one-to-many/many-to-one handling for roads, parcels, addresses, and POIs is not implemented.
- Road matching uses endpoints, name, and semantic type; it is not topology-preserving network conflation and must not be used to produce routing networks without a specialized tool and review.
- Parcel matching uses overlap and optional labels; GWS does not determine cadastral authority or legal boundary truth.
- Geometry validation rejects known self-intersections and misplaced holes but is not a complete OGC validity engine. No topology repair occurs.
- Antimeridian crossings are reported but not split; bounding boxes and polygon operations are unsuitable across the date line. Polar and global-scale polygon workflows are not validated.
- ArcGIS ring conversion does not fully reconstruct arbitrary multipart/hole topology. Curves, solids, multipatches, raster, terrain, and true 3D semantics are unsupported.
- CRS metadata must be correct. Custom projected systems require an explicit Proj4 definition; axis-order mistakes cannot be inferred reliably.
- Missing records are not deletions. Temporal supersession needs explicit lineage/revision evidence.
- Provider caches are host-supplied; no shared persistent HTTP cache, retry scheduler, or distributed rate limiter is included.
- Synthesis and decision output are materialized in memory. There is no streaming/chunked world assembly.
- The workflow loader is JSON-only. The Python interface, GeoParquet, GeoPackage, CityJSON, and direct Overture cloud adapter are not included.
- The static viewer is an evidence inspector, not a full GIS editor or manual conflict-resolution system.
- Data licenses may be incompatible even when each source is individually open. Output metadata does not determine legal compatibility or relicense data.
- The software is not certified for surveying, cadastral title, navigation, routing, emergency response, structural decisions, or other safety-critical use.

Every application must independently validate data suitability, privacy, accuracy, terms, licensing, and policy calibration for its geography and use case.
