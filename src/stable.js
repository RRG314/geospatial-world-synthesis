import { createHash } from 'node:crypto';

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(stableValue(value));
}

export function stableHash(value) {
  const input = typeof value === 'string' ? value : canonicalJson(value);
  return createHash('sha256').update(input).digest('hex');
}

export function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

export function sortedUnique(values = []) {
  return [...new Set(values.filter((value) => value !== '' && value != null).map(String))].sort();
}
