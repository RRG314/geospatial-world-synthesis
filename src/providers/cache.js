import { defineProvider } from '../provider.js';
import { stableHash } from '../stable.js';

export function withProviderCache(provider, cache, options = {}) {
  if (!provider?.id || typeof provider.query !== 'function') throw new TypeError('withProviderCache requires a provider.');
  if (!cache || typeof cache.get !== 'function' || typeof cache.set !== 'function') throw new TypeError('Cache requires async get(key) and set(key, value).');
  const ttlMs = Math.max(0, Number(options.ttlMs ?? provider.cacheTtlMs) || 0);
  return defineProvider({
    ...provider,
    query: async (request, queryOptions) => {
      const key = `gws:${provider.id}:${stableHash({ datasetVersion: provider.datasetVersion, bounds: request.bounds, capabilities: request.requestedCapabilities || [] })}`;
      const cached = await cache.get(key);
      if (cached && (!cached.expiresAt || cached.expiresAt > Date.now())) {
        return { ...cached.value, metrics: { ...(cached.value.metrics || {}), fromCache: true } };
      }
      const value = await provider.query(request, queryOptions);
      await cache.set(key, { expiresAt: ttlMs ? Date.now() + ttlMs : 0, value });
      return value;
    }
  });
}
