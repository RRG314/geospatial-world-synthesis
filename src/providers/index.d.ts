import type { EntityType, Provider, ProviderDefinition, SourceRecord } from '../index.js';

export interface LocalProviderConfig extends Omit<ProviderDefinition, 'query' | 'capabilities'> {
  records: SourceRecord[];
  capabilities?: EntityType[];
  retrievedAt?: string;
  warnings?: string[];
}

export interface HttpProviderConfig {
  id: string;
  datasetId?: string;
  datasetVersion?: string;
  operator?: string;
  licenseId?: string;
  attribution?: string;
  homepage?: string;
  entityType: EntityType;
  fieldMap: Record<string, string>;
  sourceIdField?: string;
  updatedField?: string;
  headers?: Record<string, string>;
  fetch?: typeof fetch;
  maxResponseBytes?: number;
}

export interface GeoJsonHttpProviderConfig extends HttpProviderConfig {
  endpoint: string;
  sourceCrs?: string;
  buildUrl?: (endpoint: string, request: { bounds: readonly number[] }) => string;
}

export interface OgcApiFeaturesProviderConfig extends HttpProviderConfig {
  root: string;
  collectionId: string;
  pageSize?: number;
  maxRequests?: number;
  gersField?: string;
  featureIdIsGers?: boolean;
  allowCrossOriginNext?: boolean;
}

export interface ArcGisFeatureServiceProviderConfig extends HttpProviderConfig {
  layerUrl: string;
  publicFields: string[];
  where?: string;
  pageSize?: number;
  maxRequests?: number;
}

export interface OpenStreetMapProviderConfig {
  id: string;
  endpoint?: string;
  datasetId?: string;
  datasetVersion?: string;
  operator?: string;
  attribution?: string;
  homepage?: string;
  capabilities?: Array<'address' | 'building' | 'landuse' | 'poi' | 'road' | 'water'>;
  queryTimeoutSeconds?: number;
  queryMaxSizeBytes?: number;
  maxResponseBytes?: number;
  includeGeometryless?: boolean;
  tagMap?: Record<string, string>;
  headers?: Record<string, string>;
  fetch?: typeof fetch;
}

export interface OpenStreetMapMapProviderConfig extends OpenStreetMapProviderConfig {
  maxBboxAreaDegrees2?: number;
}

export interface LocalFileProviderConfig extends Omit<ProviderDefinition, 'query' | 'capabilities'> {
  path: string;
  capabilities?: EntityType[];
  entityType?: EntityType;
  sourceIdField?: string;
  entityTypeField?: string;
  publicFields?: string[];
  fieldMap?: Record<string, string>;
  gersField?: string;
  featureIdIsGers?: boolean;
  aliasesField?: string;
  licenseField?: string;
  attributionField?: string;
  sourceUrlField?: string;
  updatedField?: string;
  maxFileBytes?: number;
  sourceUrl?: string;
}

export interface ProviderCache {
  get(key: string): Promise<unknown> | unknown;
  set(key: string, value: unknown): Promise<void> | void;
}

export function createLocalProvider(config: LocalProviderConfig): Provider;
export function createGeoJsonHttpProvider(config: GeoJsonHttpProviderConfig): Provider;
export function createOgcApiFeaturesProvider(config: OgcApiFeaturesProviderConfig): Provider;
export function createArcGisFeatureServiceProvider(config: ArcGisFeatureServiceProviderConfig): Provider;
export function createOpenStreetMapProvider(config: OpenStreetMapProviderConfig): Provider;
export function createOpenStreetMapMapProvider(config: OpenStreetMapMapProviderConfig): Provider;
export function createLocalFileProvider(config: LocalFileProviderConfig): Provider;
export function withProviderCache(provider: Provider, cache: ProviderCache, options?: { ttlMs?: number }): Provider;
