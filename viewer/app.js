const svg = document.querySelector('#map');
const state = { activeLayers: new Set(['harbor-registry', 'height-survey', 'canonical']), selectedId: '' };

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function projection(bounds) {
  const [west, south, east, north] = bounds;
  const padding = 58;
  return ([x, y]) => [padding + ((x - west) / (east - west)) * (900 - padding * 2), 520 - padding - ((y - south) / (north - south)) * (520 - padding * 2)];
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

function renderMap(data) {
  const project = projection(data.bounds);
  const grid = Array.from({ length: 8 }, (_, index) => {
    const position = 58 + index * 112;
    return `<line class="grid-line" x1="${position}" x2="${position}" y1="35" y2="485"/><line class="grid-line" x1="35" x2="865" y1="${position}" y2="${position}"/>`;
  }).join('');
  const sourceColors = { 'harbor-registry': '#71a7ff', 'height-survey': '#ffb35a' };
  const sources = data.sourceRecords.filter((record) => state.activeLayers.has(record.providerId)).map((record) => geometryElement(record.geometry, project, {
    class: 'feature source-feature', 'data-entity-id': '', fill: record.entityType === 'building' ? `${sourceColors[record.providerId]}22` : 'none',
    stroke: sourceColors[record.providerId], 'stroke-width': record.entityType === 'building' ? 4 : 2.5, 'stroke-dasharray': record.providerId === 'height-survey' ? '8 6' : 'none'
  })).join('');
  const canonical = state.activeLayers.has('canonical') ? data.snapshot.entities.map((entity) => geometryElement(entity.geometry, project, {
    class: `feature canonical-feature${entity.id === state.selectedId ? ' selected' : ''}`, 'data-entity-id': entity.id,
    fill: entity.type === 'building' || entity.type === 'parcel' ? '#55dfc019' : entity.type === 'poi' ? '#55dfc0' : 'none',
    stroke: '#55dfc0', 'stroke-width': entity.type === 'building' ? 2.5 : 1.5
  })).join('') : '';
  svg.innerHTML = `<title>Synthesized fictional harbor features</title><desc>Overlaid source and canonical geometries.</desc>${grid}${sources}${canonical}`;
  svg.querySelectorAll('[data-entity-id]').forEach((node) => node.addEventListener('click', () => {
    if (!node.dataset.entityId) return;
    state.selectedId = node.dataset.entityId;
    document.querySelector('#entity-select').value = state.selectedId;
    renderEntity(data);
    renderMap(data);
  }));
}

function renderEntity(data) {
  const entity = data.snapshot.entities.find((item) => item.id === state.selectedId) || data.snapshot.entities[0];
  state.selectedId = entity.id;
  const claimSet = new Set(entity.claimIds);
  const claims = data.snapshot.claims.filter((claim) => claimSet.has(claim.id));
  const provenanceById = new Map(data.snapshot.provenance.map((record) => [record.id, record]));
  const conflictProperties = new Set(entity.conflicts.map((conflict) => conflict.property));
  const properties = Object.entries(entity.resolved).map(([key, value]) => `<div class="property-row"><span>${escapeHtml(key)}</span><strong>${escapeHtml(value)}</strong></div>`).join('') || '<p>No resolved properties.</p>';
  const claimRows = claims.map((claim) => {
    const provenance = provenanceById.get(claim.provenanceId);
    return `<div class="claim-row ${conflictProperties.has(claim.property) ? 'conflict' : ''}"><span>${escapeHtml(claim.property)} = ${escapeHtml(claim.value)}</span><span>${escapeHtml(claim.evidenceClass)}</span><small>${escapeHtml(provenance?.providerId || 'unknown')} · ${escapeHtml(provenance?.sourceRecordId || '')} · ${escapeHtml(provenance?.licenseId || 'unknown')}</small></div>`;
  }).join('') || '<p>No property claims.</p>';
  document.querySelector('#entity-detail').innerHTML = `<span class="entity-type">${escapeHtml(entity.type)}</span><h3 class="entity-title">${escapeHtml(entity.resolved.name || entity.type)}</h3><p class="entity-id">${escapeHtml(entity.id)}</p><div class="detail-block"><h3>Resolved view</h3>${properties}</div><div class="detail-block"><h3>Evidence trail · ${claims.length} claims</h3>${claimRows}</div>`;
}

function renderProviders(data) {
  document.querySelector('#providers').innerHTML = data.snapshot.providerSummary.map((provider) => `<div class="provider-row"><div><strong>${escapeHtml(provider.providerId)}</strong><br><small>${escapeHtml(provider.datasetId)}</small></div><span>${provider.recordCount} records</span><span class="pill ok">${escapeHtml(provider.status)}</span></div>`).join('');
}

function renderConflicts(data) {
  const building = data.snapshot.entities.find((entity) => entity.type === 'building');
  const heightClaims = data.snapshot.claims.filter((claim) => claim.entityId === building?.id && claim.property === 'height');
  const provenanceById = new Map(data.snapshot.provenance.map((record) => [record.id, record]));
  document.querySelector('#conflict-compare').innerHTML = heightClaims.map((claim) => `<div><small>${escapeHtml(provenanceById.get(claim.provenanceId)?.providerId || '')}</small><strong>${escapeHtml(claim.value)} m</strong><small>${escapeHtml(claim.evidenceClass)}</small></div>`).join('');
}

async function start() {
  const response = await fetch('./data/demo.json');
  if (!response.ok) throw new Error(`Demo data failed to load: ${response.status}`);
  const data = await response.json();
  state.selectedId = data.snapshot.entities.find((entity) => entity.type === 'building')?.id || data.snapshot.entities[0].id;
  document.querySelector('#fingerprint').textContent = data.snapshot.fingerprint.slice(0, 16);
  document.querySelector('#entity-count').textContent = data.snapshot.entities.length;
  document.querySelector('#claim-count').textContent = data.snapshot.claims.length;
  document.querySelector('#source-count').textContent = data.sourceRecords.length;
  document.querySelector('#conflict-count').textContent = data.snapshot.coverage.unresolvedConflicts;
  const select = document.querySelector('#entity-select');
  select.innerHTML = data.snapshot.entities.map((entity) => `<option value="${escapeHtml(entity.id)}">${escapeHtml(entity.resolved.name || entity.type)} · ${escapeHtml(entity.type)}</option>`).join('');
  select.value = state.selectedId;
  select.addEventListener('change', () => { state.selectedId = select.value; renderEntity(data); renderMap(data); });
  document.querySelectorAll('[data-layer]').forEach((button) => button.addEventListener('click', () => {
    const layer = button.dataset.layer;
    if (state.activeLayers.has(layer)) state.activeLayers.delete(layer); else state.activeLayers.add(layer);
    button.setAttribute('aria-pressed', String(state.activeLayers.has(layer)));
    renderMap(data);
  }));
  renderProviders(data); renderConflicts(data); renderEntity(data); renderMap(data);
}

start().catch((error) => {
  document.querySelector('main').innerHTML = `<section class="panel"><h2>Viewer unavailable</h2><p>${escapeHtml(error.message)}</p></section>`;
});
