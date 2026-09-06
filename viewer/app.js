const svg = document.querySelector('#map');
const state = {
  activeLayers: new Set(['harbor-registry', 'height-survey', 'canonical']),
  selectedId: '',
  activeTab: 'decision'
};

const evidenceLabels = {
  DIRECT_SOURCE: 'Direct source',
  MULTI_SOURCE_SUPPORTED: 'Multi-source supported',
  DERIVED_HIGH_CONFIDENCE: 'Derived',
  INFERRED: 'Inferred',
  LOW_CONFIDENCE: 'Low confidence',
  SYNTHETIC: 'Synthetic',
  UNKNOWN: 'Unknown'
};

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function displayName(entity) {
  return entity.resolved.name || entity.type.replaceAll('_', ' ');
}

function shortId(value, length = 16) {
  const text = String(value);
  return text.length > length ? `${text.slice(0, length)}…` : text;
}

function formatDate(value) {
  if (!value) return 'Not supplied';
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function projection(bounds) {
  const [west, south, east, north] = bounds;
  const padding = 58;
  return ([x, y]) => [
    padding + ((x - west) / (east - west)) * (900 - padding * 2),
    520 - padding - ((y - south) / (north - south)) * (520 - padding * 2)
  ];
}

function geometryElement(geometry, project, attributes) {
  if (!geometry) return '';
  const attrs = Object.entries(attributes).map(([key, value]) => `${key}="${escapeHtml(value)}"`).join(' ');
  const line = (coordinates) => coordinates.map((point) => project(point).join(',')).join(' ');
  if (geometry.type === 'Point') {
    const [cx, cy] = project(geometry.coordinates);
    return `<circle cx="${cx}" cy="${cy}" r="8" ${attrs}/>`;
  }
  if (geometry.type === 'LineString') return `<polyline points="${line(geometry.coordinates)}" ${attrs}/>`;
  if (geometry.type === 'Polygon') return geometry.coordinates.map((ring) => `<polygon points="${line(ring)}" ${attrs}/>`).join('');
  if (geometry.type === 'MultiPoint') return geometry.coordinates.map((point) => geometryElement({ type: 'Point', coordinates: point }, project, attributes)).join('');
  if (geometry.type === 'MultiLineString') return geometry.coordinates.map((part) => geometryElement({ type: 'LineString', coordinates: part }, project, attributes)).join('');
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.map((part) => geometryElement({ type: 'Polygon', coordinates: part }, project, attributes)).join('');
  return '';
}

function geometryAnchor(geometry, project) {
  if (!geometry) return null;
  if (geometry.type === 'Point') return project(geometry.coordinates);
  if (geometry.type === 'LineString') return project(geometry.coordinates[Math.floor(geometry.coordinates.length / 2)]);
  if (geometry.type === 'Polygon') {
    const ring = geometry.coordinates[0];
    const sum = ring.reduce(([x, y], [nextX, nextY]) => [x + nextX, y + nextY], [0, 0]);
    return project([sum[0] / ring.length, sum[1] / ring.length]);
  }
  const nested = geometry.type === 'MultiPoint' ? { type: 'Point', coordinates: geometry.coordinates[0] }
    : geometry.type === 'MultiLineString' ? { type: 'LineString', coordinates: geometry.coordinates[0] }
      : geometry.type === 'MultiPolygon' ? { type: 'Polygon', coordinates: geometry.coordinates[0] } : null;
  return nested ? geometryAnchor(nested, project) : null;
}

function entityRecords(data, entity) {
  const claimSet = new Set(entity.claimIds);
  const provenanceIds = new Set(data.snapshot.claims.filter((claim) => claimSet.has(claim.id)).map((claim) => claim.provenanceId));
  const sourceKeys = new Set(data.snapshot.provenance.filter((record) => provenanceIds.has(record.id)).map((record) => `${record.providerId}:${record.sourceRecordId}`));
  return data.sourceRecords.filter((record) => sourceKeys.has(`${record.providerId}:${record.sourceId}`));
}

function sourceEntityId(data, record) {
  return data.snapshot.entities.find((entity) => entity.aliases.some((alias) => alias.providerId === record.providerId && alias.id === record.sourceId))?.id || '';
}

function selectEntity(data, entityId, tab = state.activeTab) {
  if (!data.snapshot.entities.some((entity) => entity.id === entityId)) return;
  state.selectedId = entityId;
  state.activeTab = tab;
  document.querySelector('#entity-select').value = entityId;
  renderEntity(data);
  renderDecisionStory(data);
  renderMap(data);
}

function renderMap(data) {
  const project = projection(data.bounds);
  const grid = Array.from({ length: 8 }, (_, index) => {
    const position = 58 + index * 112;
    return `<line class="grid-line" x1="${position}" x2="${position}" y1="35" y2="485"/><line class="grid-line" x1="35" x2="865" y1="${position}" y2="${position}"/>`;
  }).join('');
  const sourceColors = { 'harbor-registry': '#2f6fbd', 'height-survey': '#b86226' };
  const sources = data.sourceRecords.filter((record) => state.activeLayers.has(record.providerId)).map((record) => {
    const entityId = sourceEntityId(data, record);
    const selected = entityId === state.selectedId;
    return geometryElement(record.geometry, project, {
      class: `feature source-feature${selected ? ' selected' : ''}`,
      'data-entity-id': entityId,
      tabindex: entityId ? '0' : '-1',
      role: entityId ? 'button' : 'img',
      'aria-label': `${record.providerId} source record ${record.sourceId}`,
      fill: record.entityType === 'building' || record.entityType === 'parcel' ? `${sourceColors[record.providerId]}20` : 'none',
      stroke: sourceColors[record.providerId],
      'stroke-width': record.entityType === 'building' ? 4 : 2.5,
      'stroke-dasharray': record.providerId === 'height-survey' ? '8 6' : 'none'
    });
  }).join('');
  const canonicalEntities = state.activeLayers.has('canonical') ? data.snapshot.entities : [];
  const canonical = canonicalEntities.map((entity) => geometryElement(entity.geometry, project, {
    class: `feature canonical-feature${entity.id === state.selectedId ? ' selected' : ''}`,
    'data-entity-id': entity.id,
    tabindex: '0',
    role: 'button',
    'aria-label': `Canonical ${entity.type}: ${displayName(entity)}`,
    fill: entity.type === 'building' || entity.type === 'parcel' ? '#168d701a' : entity.type === 'poi' ? '#168d70' : 'none',
    stroke: '#168d70',
    'stroke-width': entity.type === 'building' ? 2.8 : 1.8
  })).join('');
  const labels = canonicalEntities.map((entity) => {
    if (entity.id !== state.selectedId) return '';
    const anchor = geometryAnchor(entity.geometry, project);
    return anchor ? `<text class="map-label" x="${anchor[0] + 13}" y="${anchor[1] - 13}">${escapeHtml(displayName(entity))}</text>` : '';
  }).join('');
  svg.innerHTML = `<title>Synthesized fictional harbor features</title><desc>Overlaid source and canonical geometries. Select any feature to inspect its evidence.</desc>${grid}${sources}${canonical}${labels}`;
  svg.querySelectorAll('[data-entity-id]').forEach((node) => {
    const activate = () => node.dataset.entityId && selectEntity(data, node.dataset.entityId);
    node.addEventListener('click', activate);
    node.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        activate();
      }
    });
  });
}

function entityHeader(entity) {
  return `<div class="entity-summary-head"><div><span class="entity-type">${escapeHtml(entity.type)}</span><h3 class="entity-title">${escapeHtml(displayName(entity))}</h3></div><span class="status-chip">${entity.conflicts.length ? `${entity.conflicts.length} conflict` : 'no conflicts'}</span></div><p class="entity-id" title="${escapeHtml(entity.id)}">${escapeHtml(entity.id)}</p>`;
}

function renderSummary(entity) {
  const properties = Object.entries(entity.resolved).map(([key, value]) => `<div class="property-row"><span>${escapeHtml(key)}</span><strong>${escapeHtml(value)}</strong></div>`).join('') || '<p class="empty-note">No effective properties.</p>';
  const aliases = entity.aliases.map((alias) => `<div class="alias-row"><span>${escapeHtml(alias.namespace)}</span><strong title="${escapeHtml(alias.id)}">${escapeHtml(shortId(alias.id, 24))}</strong></div>`).join('') || '<p class="empty-note">No source aliases.</p>';
  return `${entityHeader(entity)}<p class="summary-note">A canonical entity is the neutral grouping. It does not erase the records or claims that produced it.</p><div class="detail-block"><h3>Effective properties</h3>${properties}</div><div class="detail-block"><h3>Original source aliases</h3>${aliases}</div>`;
}

function renderEvidence(data, entity) {
  const claimSet = new Set(entity.claimIds);
  const claims = data.snapshot.claims.filter((claim) => claimSet.has(claim.id));
  const provenanceById = new Map(data.snapshot.provenance.map((record) => [record.id, record]));
  const conflictProperties = new Set(entity.conflicts.map((conflict) => conflict.property));
  const cards = claims.map((claim) => {
    const provenance = provenanceById.get(claim.provenanceId);
    return `<article class="claim-card ${conflictProperties.has(claim.property) ? 'conflict' : ''}"><div class="claim-top"><strong>${escapeHtml(claim.property)} = ${escapeHtml(claim.value)}</strong><span>${escapeHtml(evidenceLabels[claim.evidenceClass] || claim.evidenceClass)}</span></div><dl><div><dt>Provider</dt><dd title="${escapeHtml(provenance?.providerId || '')}">${escapeHtml(provenance?.providerId || 'unknown')}</dd></div><div><dt>Source record</dt><dd title="${escapeHtml(provenance?.sourceRecordId || '')}">${escapeHtml(provenance?.sourceRecordId || 'unknown')}</dd></div><div><dt>Observed</dt><dd>${escapeHtml(formatDate(claim.observedAt))}</dd></div><div><dt>License</dt><dd>${escapeHtml(provenance?.licenseId || 'unknown')}</dd></div></dl></article>`;
  }).join('');
  return `${entityHeader(entity)}<p class="summary-note">${claims.length} property claims remain independently traceable to ${entity.evidenceSummary.sourceCount} source record${entity.evidenceSummary.sourceCount === 1 ? '' : 's'}.</p><div class="claim-list">${cards || '<p class="empty-note">No property claims.</p>'}</div>`;
}

function renderDecision(data, entity) {
  const records = entityRecords(data, entity);
  const sharedGers = records.length > 1 && records.every((record) => record.gersId) && new Set(records.map((record) => record.gersId)).size === 1;
  const verdict = records.length > 1 ? 'MATCH' : 'NO MERGE NEEDED';
  const explanation = sharedGers
    ? `The ${records.length} source records share the stable GERS identifier “${escapeHtml(records[0].gersId)}”. That explicit identity is sufficient to group them while keeping both records.`
    : 'This entity comes from one source record. No cross-source identity decision was required.';
  const reasons = sharedGers
    ? '<li>Entity type agrees: building</li><li>Stable cross-source identifier agrees</li><li>Normalized footprints coincide</li><li>Conflicting height does not negate identity</li>'
    : '<li>Source identity remains available as an alias</li><li>No unrelated nearby record was forced into this entity</li>';
  const relationships = entity.relationships.map((relationship) => {
    const target = data.snapshot.entities.find((candidate) => candidate.id === relationship.targetId);
    return `<div class="relationship-row"><strong>${escapeHtml(relationship.type.replaceAll('_', ' '))}</strong><small>${escapeHtml(relationship.method)} · ${escapeHtml(evidenceLabels[relationship.evidenceClass] || relationship.evidenceClass)}</small>${target ? `<button type="button" data-related-id="${escapeHtml(target.id)}">Inspect ${escapeHtml(displayName(target))} →</button>` : ''}</div>`;
  }).join('') || '<p class="empty-note">No derived relationships for this entity.</p>';
  return `${entityHeader(entity)}<div class="decision-box"><strong>${verdict}</strong><p>${explanation}</p><ul class="reason-list">${reasons}</ul></div><div class="detail-block"><h3>Relationships</h3>${relationships}</div><div class="detail-block"><h3>Temporal status</h3><p class="summary-note">Revision ${entity.lifecycle.revision}. Evidence dates are shown claim by claim; absence is never treated as deletion.</p></div>`;
}

function renderJson(data, entity) {
  const claimSet = new Set(entity.claimIds);
  const claims = data.snapshot.claims.filter((claim) => claimSet.has(claim.id));
  const provenanceIds = new Set(claims.map((claim) => claim.provenanceId));
  const provenance = data.snapshot.provenance.filter((record) => provenanceIds.has(record.id));
  return `${entityHeader(entity)}<p class="summary-note">This is the real neutral structure used by the demo, trimmed to the selected entity and its evidence.</p><pre class="json-view"><code>${escapeHtml(JSON.stringify({ entity, claims, provenance }, null, 2))}</code></pre>`;
}

function renderEntity(data) {
  const entity = data.snapshot.entities.find((item) => item.id === state.selectedId) || data.snapshot.entities[0];
  state.selectedId = entity.id;
  document.querySelector('#entity-position').textContent = `${data.snapshot.entities.indexOf(entity) + 1} / ${data.snapshot.entities.length}`;
  document.querySelector('#selected-map-label').textContent = `Selected: ${displayName(entity)}`;
  document.querySelectorAll('[data-tab]').forEach((button) => button.setAttribute('aria-selected', String(button.dataset.tab === state.activeTab)));
  const content = state.activeTab === 'summary' ? renderSummary(entity)
    : state.activeTab === 'evidence' ? renderEvidence(data, entity)
      : state.activeTab === 'json' ? renderJson(data, entity) : renderDecision(data, entity);
  document.querySelector('#entity-detail').innerHTML = content;
  document.querySelectorAll('[data-related-id]').forEach((button) => button.addEventListener('click', () => selectEntity(data, button.dataset.relatedId, 'decision')));
}

function renderDecisionStory(data) {
  const entity = data.snapshot.entities.find((item) => item.id === state.selectedId);
  const records = entityRecords(data, entity);
  const marker = document.querySelector('.decision-marker');
  const path = document.querySelector('.decision-path');
  if (records.length > 1) {
    marker.textContent = 'MATCH';
    document.querySelector('#decision-title').textContent = `${records.length} source records, one defensible identity.`;
    document.querySelector('#decision-copy').textContent = 'The records share a stable GERS identifier. The engine groups their identity but keeps every source claim—including the height disagreement.';
    path.innerHTML = `<span>${escapeHtml(records[0].sourceId)}</span><i>+</i><span>${escapeHtml(records[1].sourceId)}</span><b>→</b><strong>${escapeHtml(displayName(entity))}</strong>`;
  } else {
    marker.textContent = 'KEEP';
    document.querySelector('#decision-title').textContent = 'One source record remains one canonical identity.';
    document.querySelector('#decision-copy').textContent = 'No matching record was supplied, so the engine preserves the original source alias and does not invent a cross-source merge.';
    path.innerHTML = `<span>${escapeHtml(records[0]?.sourceId || 'source record')}</span><i>→</i><span>canonical</span><b>→</b><strong>${escapeHtml(displayName(entity))}</strong>`;
  }
}

function renderProviders(data) {
  document.querySelector('#providers').innerHTML = data.snapshot.providerSummary.map((provider) => `<div class="provider-row"><div><strong>${escapeHtml(provider.providerId)}</strong><br><small class="provider-meta">${escapeHtml(provider.datasetId)} · ${escapeHtml(provider.licenseId)}</small></div><span>${provider.recordCount} record${provider.recordCount === 1 ? '' : 's'}</span><span class="pill ok">${escapeHtml(provider.status)}</span></div>`).join('');
}

function renderConflicts(data) {
  const building = data.snapshot.entities.find((entity) => entity.type === 'building');
  const heightClaims = data.snapshot.claims.filter((claim) => claim.entityId === building?.id && claim.property === 'height');
  const provenanceById = new Map(data.snapshot.provenance.map((record) => [record.id, record]));
  document.querySelector('#conflict-compare').innerHTML = heightClaims.map((claim) => {
    const provenance = provenanceById.get(claim.provenanceId);
    const effective = claim.value === building.resolved.height;
    return `<div><small>${escapeHtml(provenance?.providerId || '')}</small><strong>${escapeHtml(claim.value)} m</strong><small>observed ${escapeHtml(formatDate(claim.observedAt))}</small>${effective ? '<small class="effective-badge">effective value</small>' : ''}</div>`;
  }).join('');
}

function setLayers(layers) {
  state.activeLayers = new Set(layers);
  document.querySelectorAll('[data-layer]').forEach((button) => button.setAttribute('aria-pressed', String(state.activeLayers.has(button.dataset.layer))));
}

function activateGuide(data, guide) {
  const building = data.snapshot.entities.find((entity) => entity.type === 'building');
  document.querySelectorAll('[data-guide]').forEach((button) => {
    const active = button.dataset.guide === guide;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  if (guide === 'sources') {
    setLayers(['harbor-registry', 'height-survey']);
    document.querySelector('#map-help').textContent = 'Blue is the registry record in CRS84; orange is the survey record transformed from EPSG:3857. They describe the same footprint.';
    selectEntity(data, building.id, 'evidence');
  } else if (guide === 'decision') {
    setLayers(['harbor-registry', 'height-survey', 'canonical']);
    document.querySelector('#map-help').textContent = 'Both source footprints and the green canonical geometry are visible. Identity is shared; the evidence remains separate.';
    selectEntity(data, building.id, 'decision');
  } else {
    setLayers(['canonical']);
    document.querySelector('#map-help').textContent = 'The green layer is renderer-neutral output. Open Summary, Evidence, Decision, or JSON to inspect what it contains.';
    selectEntity(data, building.id, 'summary');
  }
  renderMap(data);
}

async function start() {
  const response = await fetch('./data/demo.json');
  if (!response.ok) throw new Error(`Demo data failed to load: ${response.status}`);
  const data = await response.json();
  state.selectedId = data.snapshot.entities.find((entity) => entity.type === 'building')?.id || data.snapshot.entities[0].id;
  const fingerprint = data.snapshot.fingerprint.slice(0, 16);
  document.querySelector('#fingerprint').textContent = fingerprint;
  document.querySelector('#hero-entity-count').textContent = data.snapshot.entities.length;
  document.querySelector('#hero-claim-count').textContent = data.snapshot.claims.length;
  document.querySelector('#entity-count').textContent = data.snapshot.entities.length;
  document.querySelector('#claim-count').textContent = data.snapshot.claims.length;
  document.querySelector('#source-count').textContent = data.sourceRecords.length;
  document.querySelector('#conflict-count').textContent = data.snapshot.coverage.unresolvedConflicts;

  const select = document.querySelector('#entity-select');
  select.innerHTML = data.snapshot.entities.map((entity) => `<option value="${escapeHtml(entity.id)}">${escapeHtml(displayName(entity))} · ${escapeHtml(entity.type)}</option>`).join('');
  select.value = state.selectedId;
  select.addEventListener('change', () => selectEntity(data, select.value));
  document.querySelectorAll('[data-layer]').forEach((button) => button.addEventListener('click', () => {
    const layer = button.dataset.layer;
    if (state.activeLayers.has(layer)) state.activeLayers.delete(layer); else state.activeLayers.add(layer);
    button.setAttribute('aria-pressed', String(state.activeLayers.has(layer)));
    renderMap(data);
  }));
  document.querySelectorAll('[data-tab]').forEach((button) => button.addEventListener('click', () => {
    state.activeTab = button.dataset.tab;
    renderEntity(data);
  }));
  document.querySelectorAll('[data-guide]').forEach((button) => button.addEventListener('click', () => activateGuide(data, button.dataset.guide)));
  document.querySelector('#copy-command').addEventListener('click', async (event) => {
    const command = document.querySelector('#install-command').textContent;
    try {
      await navigator.clipboard.writeText(command);
      event.currentTarget.textContent = 'Copied';
      window.setTimeout(() => { event.currentTarget.textContent = 'Copy'; }, 1600);
    } catch {
      event.currentTarget.textContent = 'Select text';
    }
  });

  renderProviders(data);
  renderConflicts(data);
  renderEntity(data);
  renderDecisionStory(data);
  renderMap(data);
}

start().catch((error) => {
  document.querySelector('main').innerHTML = `<section class="panel"><h2>Viewer unavailable</h2><p>${escapeHtml(error.message)}</p></section>`;
});
