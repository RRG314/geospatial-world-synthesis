# Geospatial World Synthesis

[![CI](https://github.com/RRG314/geospatial-world-synthesis/actions/workflows/ci.yml/badge.svg)](https://github.com/RRG314/geospatial-world-synthesis/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-55dfc0.svg)](LICENSE)

Geospatial World Synthesis combines bounded records from multiple geospatial providers into a renderer-neutral model of canonical entities, relationships, claims, provenance, conflicts, and evidence status. It provides conservative entity reconciliation, explicit coordinate normalization, deterministic synthesis, and neutral exports for applications that must combine heterogeneous spatial evidence without treating every source or inferred value as equally authoritative.

![The bundled synthesis viewer showing source geometries, canonical output, provider health, and an unresolved conflict](docs/assets/screenshots/synthesis-viewer.png)

## Quick start

Requires Node.js 20 or newer. The package is not published to npm in this release.

```bash
git clone https://github.com/RRG314/geospatial-world-synthesis.git
cd geospatial-world-synthesis
npm ci
npm run example
```

The example is offline and requires no API key. It writes `output/basic-local/world.json` and `world.geojson`, then reports four canonical entities, twelve claims, one preserved conflict, provider status, and the deterministic content fingerprint.

To open the same result in the inspection viewer:

```bash
npm run build
npm run viewer
```

Open <http://127.0.0.1:4173>. The hosted build is also available through [GitHub Pages](https://rrg314.github.io/geospatial-world-synthesis/) after deployment.

## The core idea

A source record says what one provider supplied. A canonical entity groups records only when identity evidence is strong enough. Each property remains a separate evidence claim linked to provenance. If two direct sources disagree—12 m versus 14 m for the same building—the output retains both claims and marks the conflict. Rendering or application policy can choose a representation without rewriting the evidence.

```js
import { createLocalProvider, synthesize, toGeoJson } from 'geospatial-world-synthesis';

const provider = createLocalProvider({
  id: 'my-catalog',
  sourceCrs: 'OGC:CRS84',
  licenseId: 'CC0-1.0',
  attribution: 'My example catalog',
  records: [{
    sourceId: 'place-1',
    entityType: 'poi',
    geometry: { type: 'Point', coordinates: [-76.61, 39.29] },
    properties: { name: 'Sample place' },
    evidenceClass: 'DIRECT_SOURCE'
  }]
});

const world = await synthesize({
  bounds: [-76.62, 39.28, -76.60, 39.30],
  providers: [provider]
});

console.log(world.entities[0]);
console.log(toGeoJson(world));
```

`synthesize()` is the primary entry point. It returns a versioned snapshot containing canonical `entities`, property `claims`, source `provenance`, provider health, coverage, attribution summaries, reconciliation decisions, and a deterministic `fingerprint`.

## Included capabilities

- Bounded acquisition through a documented provider contract, with timeouts and record/geometry/request budgets.
- Local, generic GeoJSON HTTP, OGC API Features, and ArcGIS Feature Service adapters.
- CRS normalization from OGC:CRS84, EPSG:4326, and EPSG:3857, plus explicitly registered Proj4 definitions.
- Conservative building reconciliation, including ambiguous and complex one-to-many relationships.
- Canonical entity IDs distinct from provider record IDs, with optional GERS aliases.
- Inspectable claims, provenance, evidence classes, conflicts, spatial relationships, attribution, and provider degradation.
- Deterministic canonical JSON and standard GeoJSON FeatureCollection exports.
- Node.js API and CLI, plus a static browser inspection demo suitable for GitHub Pages.

The guaranteed example uses small fictional CC0 data. Network adapters are secondary: service availability, terms, limits, schemas, and data quality remain the user's responsibility. OpenStreetMap, Overture ingestion, CityJSON export, terrain processing, deletion feeds, and a universal conflation model are not included in v0.1.0.

## Working examples

- [`examples/basic-local`](examples/basic-local/) — complete offline synthesis and exports.
- [`examples/multi-source-reconciliation`](examples/multi-source-reconciliation/) — an ambiguous match the engine refuses to force.
- [`examples/custom-provider`](examples/custom-provider/) — a provider implemented only with the public contract.
- [`examples/temporal-evidence`](examples/temporal-evidence/) — explicit lineage and unresolved temporal disagreement.
- [`examples/export`](examples/export/) — canonical JSON and GeoJSON files.

The [API reference](docs/api.md), [provider guide](docs/providers.md), and [architecture](docs/architecture.md) cover integration in more detail. Machine-readable [source-record](schemas/source-record.schema.json) and [synthesis-result](schemas/synthesis-result.schema.json) JSON Schemas are validated against the bundled example. See [VALIDATION.md](VALIDATION.md) for tested behavior and limitations, and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) before combining source datasets.

## Project status

v0.1.0 is a usable, deliberately narrow first release. Public top-level exports are supported within the 0.x line, but breaking changes may occur between minor versions and will be documented in the [changelog](CHANGELOG.md). This is evidence-management infrastructure, not a cadastral, navigation, emergency-response, or safety-certification system.

## License and citation

The software is available under the [MIT License](LICENSE). Data retains its own license and attribution obligations; output metadata does not relicense input data. Citation metadata is provided in [`CITATION.cff`](CITATION.cff).

Contributions are welcome under the [contribution guide](CONTRIBUTING.md). Please report security concerns using [SECURITY.md](SECURITY.md).
