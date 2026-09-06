# Provider guide

A provider retrieves records from one bounded source and describes the dataset's capabilities and obligations. The synthesis engine owns normalization, CRS conversion, limits, provenance creation, and failure reporting.

## Minimal provider

[`examples/custom-provider/run.mjs`](../examples/custom-provider/run.mjs) is the complete executable example:

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
    return { status: 'available', records: [] , coverage: request.bounds };
  }
});
```

`query()` receives validated CRS84 bounds, requested capabilities, and an abort signal. It returns `{ records, status?, coverage?, sourceUrl?, retrievedAt?, warnings?, metrics? }`. Each record requires `sourceId`, `entityType`, a declared `sourceCrs`, and optionally `geometry`, public `properties`, aliases, `gersId`, evidence class, source/license overrides, and temporal metadata.

Keep source IDs stable. Map only fields that may lawfully enter public output. Do not attach secrets to records or URLs. A header may carry a credential for a request, but the adapter must never echo it into output or error text.

## Built-in adapters

Import these from `geospatial-world-synthesis/providers`.

| Adapter | Status in v0.1.0 | Geometry/CRS contract | Bounds and safety |
| --- | --- | --- | --- |
| `createLocalProvider` | Supported | Supported GeoJSON geometry; declared CRS | In-memory, bbox/id query; fully offline |
| `createGeoJsonHttpProvider` | Supported for bounded FeatureCollections | GeoJSON geometry; configured CRS | One request; field allowlist; injectable `fetch` |
| `createOgcApiFeaturesProvider` | Supported core paging subset | GeoJSON in CRS84 | Bbox, page size ≤1,000, at most 32 same-origin requests |
| `createArcGisFeatureServiceProvider` | Supported query subset | Point, polyline, polygon in EPSG:4326 | Bbox, field allowlist, page size ≤2,000, at most 32 requests |

The ArcGIS adapter does not support curves, multipatches, or fully reconstruct arbitrary multipart ring topology. The OGC adapter implements collection-items paging, not every conformance class. Generic GeoJSON endpoints vary; use `buildUrl` when their bbox syntax differs.

Adapters accept only HTTP(S) URLs and an injected `fetch` implementation so authentication, retries, logging, and network policy can remain with the host application. Responses default to a 10 MiB byte limit, configurable up to 50 MiB. OGC next links are same-origin unless explicitly allowed. The core does not retry automatically or create a persistent cache. This avoids accidental request multiplication and hidden disk growth.

## Failure and health semantics

Provider status is one of `available`, `authoritative-empty`, `partial`, `rate_limited`, `timeout`, `unavailable`, or `invalid_response`. Empty coverage means the provider authoritatively returned no records for the request; it is not the same as unavailable coverage.

HTTP failures, rate limits, timeout, and invalid payloads become a structured provider summary during normal synthesis. No claim or provenance is fabricated for a failed provider. Set `continueOnProviderError: false` when a consumer requires all sources.

## Contribution checklist

A provider contribution needs bounded acquisition, explicit CRS, field allowlisting, injectable fetch where applicable, source/license metadata, fixture-only tests, documented geometry gaps, and no redistributed live response unless its license clearly permits that use. Users remain responsible for each service's terms, rate limits, privacy rules, and attribution requirements.

OpenStreetMap and Overture are not built-in providers in this release. If an application supplies their data through the provider contract, it must follow [OpenStreetMap's ODbL attribution requirements](https://www.openstreetmap.org/copyright) or [Overture's per-theme attribution guidance](https://docs.overturemaps.org/attribution/), as applicable.
