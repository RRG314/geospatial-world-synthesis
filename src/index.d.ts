export type Bounds = readonly [number, number, number, number];
export type EntityType = 'building' | 'road' | 'parcel' | 'water' | 'landuse' | 'poi' | 'terrain';
export type EvidenceClass = 'DIRECT_SOURCE' | 'MULTI_SOURCE_SUPPORTED' | 'DERIVED_HIGH_CONFIDENCE' | 'INFERRED' | 'LOW_CONFIDENCE' | 'SYNTHETIC' | 'UNKNOWN';
export type ProviderStatus = 'available' | 'authoritative-empty' | 'partial' | 'rate_limited' | 'timeout' | 'unavailable' | 'invalid_response';
export type Geometry = { type: 'Point' | 'MultiPoint' | 'LineString' | 'MultiLineString' | 'Polygon' | 'MultiPolygon'; coordinates: unknown[] };

export interface SourceRecord {
  sourceId: string;
  entityType: EntityType;
  sourceCrs?: string;
  geometry?: Geometry | null;
  properties?: Record<string, unknown>;
  aliases?: Array<{ namespace: string; id: string }>;
  gersId?: string;
  evidenceClass?: EvidenceClass;
  datasetVersion?: string;
  sourceUrl?: string;
  licenseId?: string;
  attribution?: string;
  retrievedAt?: string;
  observedAt?: string;
  validAt?: string;
  validFrom?: string;
  validTo?: string;
  sourceUpdatedAt?: string;
  warnings?: string[];
  activity?: { id: string; method: string; version?: string; inputIds?: string[] };
}

export interface ProviderDefinition {
  id: string;
  datasetId?: string;
  datasetVersion?: string;
  operator?: string;
  licenseId?: string;
  attribution?: string;
  homepage?: string;
  capabilities: EntityType[];
  queryModes?: string[];
  sourceCrs?: string;
  cacheTtlMs?: number;
  privacy?: string;
  query(request: { bounds: Bounds; bbox: Bounds; requestedCapabilities?: EntityType[] }, options: { signal?: AbortSignal }): Promise<{
    status?: ProviderStatus;
    records: SourceRecord[];
    coverage?: Bounds | null;
    sourceUrl?: string;
    retrievedAt?: string;
    warnings?: string[];
    metrics?: { requestCount?: number; transferredBytes?: number; fromCache?: boolean };
  }>;
}

export interface Provider extends Readonly<Required<Omit<ProviderDefinition, 'query'>> & Pick<ProviderDefinition, 'query'>> {}
export interface Provenance {
  schemaVersion: number; id: string; providerId: string; operator: string; datasetId: string; datasetVersion: string;
  sourceRecordId: string; sourceUrl: string; licenseId: string; attribution: string; sourceCrs: string; outputCrs: string;
  retrievedAt: string; observedAt: string; validAt: string; validFrom: string; validTo: string; sourceUpdatedAt: string;
  activity: null | { id: string; method: string; version: string; inputIds: string[] }; privacy: string; warnings: string[];
}
export interface Claim {
  schemaVersion: number; id: string; entityId: string; property: string; value: unknown; valueType: string;
  evidenceClass: EvidenceClass; provenanceId: string; measuredQuality: unknown; retrievedAt: string; observedAt: string;
  validAt: string; validFrom: string; validTo: string; sourceUpdatedAt: string; status: string; reason: string; method: string;
}
export interface Conflict { property: string; claimIds: string[] }
export interface Relationship { id: string; type: string; targetId: string; evidenceClass: EvidenceClass; method: string; version: number }
export interface CanonicalEntity {
  schemaVersion: number; id: string; type: EntityType; identityScope: 'gers' | 'source' | 'synthesis';
  aliases: Array<{ namespace: string; id: string; providerId: string }>; geometry: Geometry | null; geometrySourceId: string | null;
  claimIds: string[]; resolved: Record<string, unknown>; conflicts: Conflict[]; relationships: Relationship[];
  lifecycle: { revision: number }; evidenceSummary: { sourceCount: number; providerCount: number; strongestClass: EvidenceClass; provenanceComplete: boolean };
}
export interface SynthesisResult {
  schemaVersion: number; synthesisVersion: number; entities: CanonicalEntity[]; claims: Claim[]; provenance: Provenance[];
  providerSummary: Array<{ providerId: string; datasetId: string; operator: string; licenseId: string; attribution: string; homepage: string; status: ProviderStatus; recordCount: number; coverage: Bounds | null; warnings: string[]; error: null | { code: string; message: string }; metrics: Record<string, number | boolean> }>;
  reconciliations: unknown[]; coverage: { directClaims: number; syntheticClaims: number; unresolvedConflicts: number; provenanceCompleteness: number | null; byType: Record<string, unknown>; evidenceClassCounts: Record<EvidenceClass, number> };
  attributions: Array<{ providerId: string; datasetId: string; operator: string; licenseId: string; attribution: string; sourceUrls: string[]; sourceRecordCount: number }>;
  fingerprint: string; canonicalBytes: number;
  request?: { bounds: Bounds; requestedCapabilities: string[]; limits: Record<string, number> };
}

export interface SynthesisOptions {
  bounds: Bounds; providers: Provider[]; requestedCapabilities?: EntityType[]; reconciliations?: unknown[];
  continueOnProviderError?: boolean; signal?: AbortSignal;
  limits?: { maxProviders?: number; maxRecordsPerProvider?: number; maxCoordinatesPerGeometry?: number; maxPropertiesPerRecord?: number; maxPropertyBytesPerRecord?: number; providerTimeoutMs?: number };
}

export class SynthesisError extends Error { code: string; details: unknown; toJSON(): object }
export class ProviderError extends SynthesisError { providerId: string; status: ProviderStatus }
export function defineProvider(definition: ProviderDefinition): Provider;
export function createLocalProvider(config: Omit<ProviderDefinition, 'query'> & { records: SourceRecord[] }): Provider;
export function synthesize(options: SynthesisOptions): Promise<SynthesisResult>;
export function synthesizeWorld(input: { providerResults: unknown[]; reconciliations?: unknown[] }): SynthesisResult;
export function queryProvider(provider: Provider, request: { bounds?: Bounds; bbox?: Bounds; ids?: string[] }, options?: Record<string, unknown>): Promise<unknown>;
export function normalizeSourceRecord(record: SourceRecord, provider: Provider, context?: object, limits?: object): unknown;
export function validateBounds(bounds: Bounds): Bounds;
export function validateGeometry(geometry: Geometry, options?: { maxCoordinates?: number }): { valid: boolean; coordinateCount: number; warnings: string[] };
export function transformGeometry(geometry: Geometry, sourceCrs: string, outputCrs?: string, options?: object): Geometry;
export function registerCrs(name: string, definition: string | object): string;
export function knownCrs(name: string): boolean;
export function crsSnapshot(): object;
export function reconcileBuildings(leftRecords: unknown[], rightRecords: unknown[], policy?: object): unknown;
export function reconcileBuildingRelationship(leftRecords: unknown[], rightRecords: unknown[], policy?: object): unknown;
export function buildingMatchFeatures(left: unknown, right: unknown): unknown;
export function inspectEntity(snapshot: SynthesisResult, entityId: string): null | { entity: CanonicalEntity; claims: Claim[]; provenance: Provenance[]; conflicts: unknown[] };
export function toCanonicalJson(snapshot: SynthesisResult, options?: { pretty?: boolean }): string;
export function toGeoJson(snapshot: SynthesisResult): object;
export function assessTemporalEvidence(observations: unknown[], options?: object): unknown[];
export function resolveRepresentation(entity: CanonicalEntity, candidates?: unknown[], context?: object): unknown;
export function attributionSummary(provenance: Provenance[]): SynthesisResult['attributions'];
export function createClaim(input: object): Claim;
export function createProvenance(input: object): Provenance;
export function resolveClaims(claims: Claim[]): { resolved: Record<string, unknown>; conflicts: Conflict[] };
export function canonicalJson(value: unknown): string;
export function stableHash(value: unknown): string;
export const EVIDENCE_CLASSES: readonly EvidenceClass[];
export const ENTITY_TYPES: readonly EntityType[];
export const PROVIDER_STATUSES: readonly ProviderStatus[];
export const TEMPORAL_STATUSES: readonly string[];
export const SUPPORTED_GEOMETRY_TYPES: readonly Geometry['type'][];
export const DEFAULT_BUILDING_MATCH_POLICY: Readonly<Record<string, number>>;
export const SYNTHESIS_VERSION: number;
export const OUTPUT_SCHEMA_VERSION: number;
