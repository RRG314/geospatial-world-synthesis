# Third-party notices

The MIT License covers this project's original software. It does not change the licenses of source datasets supplied through providers.

## Runtime software

- [`proj4`](https://github.com/proj4js/proj4js) — coordinate transformation, MIT License.
- [`polygon-clipping`](https://github.com/mfogel/polygon-clipping) — polygon intersection/union operations, MIT License. Its implementation is based on the Martinez-Rueda-Feito polygon clipping approach, as described by the upstream project.
- [`rbush`](https://github.com/mourner/rbush) — spatial candidate index, MIT License.
- [`fast-xml-parser`](https://github.com/NaturalIntelligence/fast-xml-parser) — XML parsing for the small-area OpenStreetMap map API provider, MIT License.
- [`flatgeobuf`](https://github.com/flatgeobuf/flatgeobuf) — FlatGeobuf serialization, BSD 3-Clause License.

Exact dependency versions and transitive packages are recorded in `package-lock.json`. Development tooling is not included in the published package artifact.

## Example data

All coordinates, names, source records, identifiers, and provider identities in `examples/basic-local` and deterministic test fixtures were created for this repository and are dedicated to the public domain under CC0 1.0. They do not describe a real harbor, parcel, building, road, or business.

No captured response from OpenStreetMap, Overture, or a live government/commercial GIS service is redistributed in this repository. Live examples download into ignored `output/` paths. Adapter tests use hand-authored minimal objects.

## Data supplied by users

Users must preserve the license, attribution, share-alike, privacy, and use-policy obligations of every configured source. The synthesis output includes provenance and a deduplicated attribution summary to make those obligations inspectable, but this project cannot determine legal compatibility between datasets.

OpenStreetMap data is available under ODbL and requires attribution; consult <https://www.openstreetmap.org/copyright>. The Overture buildings theme used by the executable example is ODbL and carries source-specific attribution, including OpenStreetMap, Esri Community Maps, Microsoft Global ML Building Footprints, Google Open Buildings, and other listed sources; consult the current theme table at <https://docs.overturemaps.org/attribution/> and retain the downloaded feature `sources` metadata in a real downstream workflow. Neither dataset is bundled in this release.

The Boise ArcGIS example queries the City of Boise Maps and GIS Open Data Portal at runtime. The repository does not redistribute its response or assert a standardized SPDX data license. Users must review the current portal/service terms before retaining or redistributing results: <https://opendata.cityofboise.org/>.

## Standards and concepts

The project implements GeoJSON output according to [RFC 7946](https://www.rfc-editor.org/rfc/rfc7946), FlatGeobuf according to the [published format specification](https://flatgeobuf.org/), and a bounded subset of [OGC API Features](https://ogcapi.ogc.org/). The optional provenance export follows the element/relation shape of the [PROV-JSON Member Submission](https://www.w3.org/submissions/2013/SUBM-prov-json-20130424/); that submission is not a W3C Recommendation or endorsement. The underlying vocabulary is informed by the [PROV-O Recommendation](https://www.w3.org/TR/prov-o/). GERS identifiers, when supplied by a provider, are preserved as aliases; see [Overture Maps documentation](https://docs.overturemaps.org/).
