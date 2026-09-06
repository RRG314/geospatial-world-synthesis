import {
  inspectEntity,
  reconcileEntities,
  synthesize,
  toFlatGeobuf,
  type ReconciliationResult,
  type SynthesisResult
} from 'geospatial-world-synthesis';
import { createLocalFileProvider, createOpenStreetMapMapProvider } from 'geospatial-world-synthesis/providers';
import { createJsonDirectoryStore, createOvertureMapsProvider, loadWorkflowConfig, type SnapshotDiff } from 'geospatial-world-synthesis/node';

const fileProvider = createLocalFileProvider({
  id: 'typed-file',
  path: './places.geojson',
  entityType: 'poi',
  publicFields: ['name'],
  licenseField: '_license',
  attributionField: '_attribution',
  sourceUrlField: '_sourceUrl'
});
const osmProvider = createOpenStreetMapMapProvider({ id: 'typed-osm', capabilities: ['building', 'poi'] });
const overtureProvider = createOvertureMapsProvider({ id: 'typed-overture', release: '2026-08-19.0' });

async function consume(): Promise<void> {
  const options = await loadWorkflowConfig('./workflow.json');
  const snapshot: SynthesisResult = await synthesize({
    ...options,
    providers: [fileProvider, osmProvider, overtureProvider],
    reconciliation: { enabled: true }
  });
  const decisions: ReconciliationResult = reconcileEntities(snapshot.sourceRecords, snapshot.sourceRecords);
  const inspection = inspectEntity(snapshot, snapshot.entities[0]?.id || '');
  const bytes: Uint8Array = toFlatGeobuf(snapshot);
  const store = createJsonDirectoryStore('./snapshots');
  const prior = await store.load();
  if (prior) {
    const update = await store.applyIncremental(prior, snapshot);
    const diff: SnapshotDiff = update.diff;
    void diff.affectedEntityIds;
  }
  void decisions.counts?.AMBIGUOUS;
  void inspection?.sourceRecords[0]?.provenance.licenseId;
  void bytes.byteLength;
}

void consume;
