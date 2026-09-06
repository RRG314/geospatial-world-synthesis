import { assessTemporalEvidence } from 'geospatial-world-synthesis';

const assessment = assessTemporalEvidence([
  { id: 'survey-2025', lineageId: 'survey:building-17', revision: 1, fingerprint: 'height-12' },
  { id: 'survey-2026', lineageId: 'survey:building-17', revision: 2, fingerprint: 'height-14' },
  { id: 'independent-observation', providerId: 'registry', fingerprint: 'height-12' }
]);

console.log(JSON.stringify(assessment, null, 2));
