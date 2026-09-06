# Changelog

All notable public changes are documented here. The project follows Semantic Versioning; during 0.x development, a minor release may contain breaking API changes.

## 0.2.0 — 2026-09-06

- Added bounded OpenStreetMap Overpass, small-area OpenStreetMap map API, and local-file providers plus a provider cache wrapper and repeatable JSON workflow configuration.
- Generalized indexed reconciliation across buildings, POIs, addresses, parcels, and roads while preserving ambiguity and specialized building relationship handling.
- Retained normalized source records in snapshots and added property-resolution explanations, snapshot diffs, atomic JSON persistence, and a PostGIS reference store validated against PostGIS 3.5.
- Added GeometryCollection handling, polygon topology diagnostics, antimeridian warnings, and geodesic area measurement without silent topology repair.
- Added FlatGeobuf and PROV-JSON exports and expanded the CLI with inspect, reconcile, diff, and export commands.
- Added live OSM, Overture+OSM, and government ArcGIS examples, a Node-only bounded Overture Buildings provider, an incremental-update example, a deterministic baseline evaluation, and 10k/100k scale measurements.
- Expanded the viewer to expose actual reconciliation signals, source records, property selection reasons, and temporal evidence.
- Added `rbush`, `fast-xml-parser`, and `flatgeobuf` runtime dependencies and updated notices and validation boundaries.

## 0.1.1 — 2026-09-06

- Rebuilt the GitHub Pages demo around a guided source-to-canonical walkthrough.
- Added entity summary, evidence, reconciliation reasoning, and raw JSON inspection tabs.
- Added keyboard-selectable map features, clearer layer comparison, evidence-class guidance, and responsive mobile layouts.
- Added direct downloads of the demo's canonical JSON and GeoJSON output.
- Expanded browser checks to cover the walkthrough, inspector tabs, public assets, exports, and mobile overflow.
- Replaced repository screenshots with images from the current software.

## 0.1.0 — 2026-09-06

- Initial standalone release.
- Added bounded provider orchestration, normalization, CRS conversion, canonical synthesis, evidence claims, provenance, conflicts, relationships, attribution, coverage, and deterministic fingerprints.
- Added local, GeoJSON HTTP, OGC API Features, and ArcGIS Feature Service adapters.
- Added canonical JSON and GeoJSON exports, CLI, examples, and static inspection viewer.
- Added release validation across public API, package consumer, browser, CLI, examples, adapters, package boundary, dependencies, and clean clones.
