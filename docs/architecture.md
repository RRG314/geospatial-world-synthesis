# Architecture

The core has no renderer, database, web framework, or World Explorer dependency. Providers acquire bounded source data. Normalization converts supported geometry into OGC:CRS84 and creates source provenance. Reconciliation supplies explicit identity decisions; synthesis assembles canonical entities without discarding claims. Inspection and export consume the same frozen snapshot.

![Provider records pass through bounded acquisition, normalization, reconciliation, canonical synthesis, and neutral inspection/export](assets/architecture.svg)

## Invariants

- Source identity and canonical identity remain separate and inspectable.
- A deterministic fingerprint does not depend on provider-result order, retrieval timestamp, or runtime duration.
- Direct disagreement remains in the claims array and appears as an entity conflict.
- A failed provider contributes status and error information, never invented evidence.
- All output geometry is OGC:CRS84; unknown CRS identifiers fail explicitly.
- Matching defaults are conservative. Ambiguous candidates remain separate.
- Representation selection does not rewrite evidence.

The package boundary exports a compact public API from `src/index.js` and built-in adapters from `src/providers/index.js`. The CLI loads a user configuration, calls `synthesize()`, and writes canonical JSON plus GeoJSON. The static viewer build calls that same API against the offline example and publishes only generated neutral output.

Relevant interoperability references are [GeoJSON RFC 7946](https://www.rfc-editor.org/rfc/rfc7946), [OGC API Features](https://ogcapi.ogc.org/), and the [W3C PROV overview](https://www.w3.org/TR/prov-overview/). The project uses PROV-like concepts for source/activity lineage but does not claim full PROV-O serialization.
