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
  allowCrossOriginNext?: boolean;
}

export interface ArcGisFeatureServiceProviderConfig extends HttpProviderConfig {
  layerUrl: string;
  publicFields: string[];
  where?: string;
  pageSize?: number;
  maxRequests?: number;
}

export function createLocalProvider(config: LocalProviderConfig): Provider;
export function createGeoJsonHttpProvider(config: GeoJsonHttpProviderConfig): Provider;
export function createOgcApiFeaturesProvider(config: OgcApiFeaturesProviderConfig): Provider;
export function createArcGisFeatureServiceProvider(config: ArcGisFeatureServiceProviderConfig): Provider;
