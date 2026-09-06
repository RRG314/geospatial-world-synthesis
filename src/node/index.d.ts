import type { Bounds, Provider, SynthesisOptions, SynthesisResult } from '../index.js';

export interface SnapshotDiff {
  schemaVersion: number;
  beforeFingerprint: string;
  afterFingerprint: string;
  changed: boolean;
  affectedEntityIds: string[];
  entities: { added: string[]; removed: string[]; changed: string[] };
  sourceRecords: { added: string[]; removed: string[]; changed: string[] };
  claims: { added: string[]; removed: string[]; changed: string[] };
  provenance: { added: string[]; removed: string[]; changed: string[] };
}

export interface SnapshotStore {
  kind: string;
  save(snapshot: SynthesisResult): Promise<{ fingerprint: string; diff?: SnapshotDiff }>;
  load(fingerprint?: string): Promise<SynthesisResult | null>;
  applyIncremental(before: SynthesisResult, after: SynthesisResult): Promise<{ fingerprint: string; diff: SnapshotDiff }>;
}

export function createJsonDirectoryStore(directory: string): SnapshotStore & { directory: string; list(): Promise<string[]> };
export function createPostgisStore(client: { query(text: string, values?: unknown[]): Promise<{ rows?: unknown[] }> }, options?: { schema?: string; worldId?: string }): SnapshotStore & { worldId: string; initialize(): Promise<void>; history(limit?: number): Promise<unknown[]> };
export interface OvertureMapsProviderConfig {
  id: string;
  release?: string;
  datasetId?: string;
  operator?: string;
  attribution?: string;
  homepage?: string;
  command?: string;
  commandArgs?: string[];
  maxDownloadBytes?: number;
  maxProcessOutputBytes?: number;
  downloadTimeoutMs?: number;
  includeSourceAliases?: boolean;
  download?: (context: { bounds: Bounds; release: string; type: 'building'; outputPath: string; signal?: AbortSignal; timeoutMs: number }) => Promise<void>;
}
export function createOvertureMapsProvider(config: OvertureMapsProviderConfig): Provider;
export function loadWorkflowConfig(path: string): Promise<SynthesisOptions>;
export const WORKFLOW_PROVIDER_TYPES: readonly string[];
