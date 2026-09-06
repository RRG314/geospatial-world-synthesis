# Third-party notices

The MIT License covers this project's original software. It does not change the licenses of source datasets supplied through providers.

## Runtime software

- [`proj4`](https://github.com/proj4js/proj4js) — coordinate transformation, MIT License.
- [`polygon-clipping`](https://github.com/mfogel/polygon-clipping) — polygon intersection/union operations, MIT License. Its implementation is based on the Martinez-Rueda-Feito polygon clipping approach, as described by the upstream project.

Exact dependency versions and transitive packages are recorded in `package-lock.json`. Development tooling is not included in the published package artifact.

## Example data

All coordinates, names, source records, identifiers, and provider identities in `examples/basic-local` and deterministic test fixtures were created for this repository and are dedicated to the public domain under CC0 1.0. They do not describe a real harbor, parcel, building, road, or business.

No captured response from a live government or commercial GIS service is redistributed in this repository. Adapter tests use hand-authored minimal objects.

## Data supplied by users

Users must preserve the license, attribution, share-alike, privacy, and use-policy obligations of every configured source. The synthesis output includes provenance and a deduplicated attribution summary to make those obligations inspectable, but this project cannot determine legal compatibility between datasets.

OpenStreetMap data is available under ODbL and requires attribution; consult <https://www.openstreetmap.org/copyright>. Overture data has theme-specific attribution and licensing; consult <https://docs.overturemaps.org/attribution/>. Neither dataset is bundled in this release.

## Standards and concepts

The project implements GeoJSON output according to [RFC 7946](https://www.rfc-editor.org/rfc/rfc7946) and a bounded subset of [OGC API Features](https://ogcapi.ogc.org/). Provenance structures are informed by [W3C PROV](https://www.w3.org/TR/prov-overview/) concepts but are not a PROV-O serialization. GERS identifiers, when supplied by a provider, are preserved as aliases; see [Overture Maps documentation](https://docs.overturemaps.org/).
