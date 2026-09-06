export class SynthesisError extends Error {
  constructor(message, options = {}) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = 'SynthesisError';
    this.code = String(options.code || 'SYNTHESIS_ERROR');
    this.details = options.details || null;
  }

  toJSON() {
    return { name: this.name, code: this.code, message: this.message, details: this.details };
  }
}

export class ProviderError extends SynthesisError {
  constructor(providerId, status, message, options = {}) {
    super(message, { ...options, code: `PROVIDER_${String(status).toUpperCase()}`, details: { providerId, status, ...(options.details || {}) } });
    this.name = 'ProviderError';
    this.providerId = providerId;
    this.status = status;
  }
}

export function safeErrorMessage(error, maxLength = 500) {
  return String(error?.message || error || 'Provider request failed.')
    .replace(/([?&](?:token|key|api_key|access_token|client_secret|password|auth|signature|sig)=)[^&\s]*/gi, '$1REDACTED')
    .replace(/(https?:\/\/)[^/@\s]+@/gi, '$1')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer REDACTED')
    .slice(0, Math.max(80, maxLength));
}

export function classifyProviderError(error) {
  const message = safeErrorMessage(error);
  if (error?.name === 'AbortError' || /timed?\s*out|timeout/i.test(message)) return 'timeout';
  if (/\b429\b|rate.?limit/i.test(message)) return 'rate_limited';
  if (error instanceof SyntaxError || /invalid (json|response)|malformed/i.test(message)) return 'invalid_response';
  return 'unavailable';
}
